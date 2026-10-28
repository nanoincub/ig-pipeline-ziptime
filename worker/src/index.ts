/**
 * ig-assets — Worker de upload/entrega de criativos em R2 + cofre de tokens do Instagram.
 *
 * Rotas de assets:
 *   PUT  /upload/{brand}/{slug}/{file}  (Bearer UPLOAD_TOKEN) -> grava binário no bucket
 *   POST /upload-json                   (Bearer UPLOAD_TOKEN) -> grava arquivo em JSON base64
 *   GET  /openapi.json                  -> spec OpenAPI 3.1 (pública) para GPT Action
 *   GET  /{brand}/{slug}/{file}         -> serve o arquivo, cache imutável, CORS *
 *   GET  /health                        -> 200
 *   OPTIONS *                           -> preflight CORS
 *
 * Rotas de token do Instagram por marca (NUNCA expostas no /openapi.json):
 *   PUT  /token/{brand}          (Bearer ADMIN_TOKEN)              -> cadastra/atualiza token
 *   POST /token/{brand}/refresh  (Bearer ADMIN_TOKEN)              -> força renovação
 *   GET  /token/{brand}          (Bearer UPLOAD_TOKEN ou ADMIN)    -> {access_token, user_id, expires_at}
 *   GET  /token/{brand}/status   (Bearer UPLOAD_TOKEN ou ADMIN)    -> status sem token
 *
 * scheduled(): renova o token de cada marca do KV (cron em wrangler.toml).
 *
 *   resto                               -> 404 / 405
 */

export interface Env {
  BUCKET: R2Bucket;
  IG_TOKENS: KVNamespace;
  UPLOAD_TOKEN: string;
  ADMIN_TOKEN: string;
  PUBLIC_BASE: string;
}

const SEGMENT = /^[a-z0-9][a-z0-9-]*$/;
const FILE = /^[a-z0-9][a-z0-9-]*\.(png|jpg|mp4|svg|json)$/;

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "video/mp4": ".mp4",
  "image/svg+xml": ".svg",
  "application/json": ".json",
};

const EXT_TYPE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  mp4: "video/mp4",
  svg: "image/svg+xml",
  json: "application/json",
};

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "PUT, POST, GET, OPTIONS",
  "access-control-allow-headers": "Authorization, Content-Type",
  "access-control-max-age": "86400",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

function parseAssetPath(parts: string[]): { brand: string; slug: string; file: string } | null {
  // espera [brand, ...slug, file] com >= 3 segmentos: o slug pode ter mais de um
  // nível para versionar (ex.: ziptime/brand/v1/logo.svg). Cada segmento é
  // validado por SEGMENT (sem "/", sem ponto) e nenhum pode conter "..".
  if (parts.length < 3) return null;
  if (parts.some((p) => p === "" || p.includes(".."))) return null;
  const brand = parts[0];
  const file = parts[parts.length - 1];
  const slugParts = parts.slice(1, -1);
  if (!SEGMENT.test(brand) || !FILE.test(file)) return null;
  if (!slugParts.every((p) => SEGMENT.test(p))) return null;
  return { brand, slug: slugParts.join("/"), file };
}

function isBearerAuthorized(request: Request, env: Env): boolean {
  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.UPLOAD_TOKEN}`;
  return Boolean(env.UPLOAD_TOKEN) && auth === expected;
}

// Decodifica base64 (tolera prefixo data: URI). Lança se o conteúdo for inválido.
function decodeBase64(input: string): Uint8Array {
  const comma = input.indexOf("base64,");
  const b64 = comma >= 0 ? input.slice(comma + "base64,".length) : input;
  const bin = atob(b64); // atob segue forgiving-base64 (ignora espaços); lança em caractere inválido
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------------------
// Tokens do Instagram por marca
// ---------------------------------------------------------------------------

// Host da Graph API para o caminho "Instagram API with Instagram Login".
const IG_GRAPH_HOST = "graph.instagram.com";

interface TokenError {
  code: string;
  message: string;
}

interface TokenRecord {
  access_token: string;
  user_id: string;
  username: string | null;
  expires_at: string | null; // ISO 8601
  refreshed_at: string | null; // ISO 8601
  last_error: TokenError | null;
}

// Erro de operação de token carregando code + message (nunca o token em si).
class TokenOpError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "TokenOpError";
    this.code = code;
  }
}

function bearerOf(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? "";
  const m = /^Bearer (.+)$/.exec(auth);
  return m ? m[1] : null;
}

// Autoriza por Bearer contra uma lista de tokens aceitos (ignora vazios/undefined).
// Sem Bearer -> 401. Bearer fora da lista -> 403. Autorizado -> null.
function requireBearer(request: Request, accepted: (string | undefined)[]): Response | null {
  const tok = bearerOf(request);
  if (!tok) return json({ error: "unauthorized" }, 401, CORS);
  if (!accepted.some((a) => Boolean(a) && tok === a)) return json({ error: "forbidden" }, 403, CORS);
  return null;
}

// ADMIN_TOKEN apenas (administração do cofre).
function requireAdmin(request: Request, env: Env): Response | null {
  return requireBearer(request, [env.ADMIN_TOKEN]);
}

// UPLOAD_TOKEN ou ADMIN_TOKEN (leitura de token/status).
function requireReader(request: Request, env: Env): Response | null {
  return requireBearer(request, [env.ADMIN_TOKEN, env.UPLOAD_TOKEN]);
}

function daysLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt) - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 86_400_000);
}

// Visão de status (sem token) devolvida pelas rotas de leitura.
function statusView(brand: string, rec: TokenRecord): Record<string, unknown> {
  return {
    brand,
    username: rec.username,
    expires_at: rec.expires_at,
    refreshed_at: rec.refreshed_at,
    days_left: daysLeft(rec.expires_at),
    last_error: rec.last_error,
  };
}

async function readRecord(env: Env, brand: string): Promise<TokenRecord | null> {
  const raw = await env.IG_TOKENS.get(brand);
  return raw === null ? null : (JSON.parse(raw) as TokenRecord);
}

// GET à Graph API do Instagram: fetch + parse + TokenOpError (code/message da
// Meta, sem token) em erro de rede ou da API. Devolve o corpo JSON em sucesso.
async function igGet(url: string): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new TokenOpError("network", `falha de rede: ${(err as Error).message}`);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const apiErr = data.error as { message?: string; code?: number | string } | undefined;
  if (!res.ok || apiErr) {
    throw new TokenOpError(String(apiErr?.code ?? res.status), apiErr?.message ?? `HTTP ${res.status}`);
  }
  return data;
}

// Valida um token com GET /{user_id}?fields=username. Devolve o username ou lança.
async function igValidate(userId: string, accessToken: string): Promise<string> {
  const data = await igGet(
    `https://${IG_GRAPH_HOST}/${encodeURIComponent(userId)}?fields=username&access_token=${encodeURIComponent(accessToken)}`
  );
  return String(data.username ?? "");
}

/**
 * Renova o token de uma marca:
 *   GET /refresh_access_token?grant_type=ig_refresh_token&access_token=... -> novo token + expires_in
 *   valida o novo token com ?fields=username
 *   grava access_token, expires_at = now + expires_in, refreshed_at e zera last_error.
 * Em qualquer falha: mantém o token anterior e grava last_error (code + message, sem token), e lança.
 * Marca inexistente -> TokenOpError("not_found", ...) (nada é gravado).
 * `seed` permite passar o registro já em memória (usado pelo PUT) para evitar
 * uma leitura extra do KV.
 */
async function refreshBrand(env: Env, brand: string, seed?: TokenRecord): Promise<TokenRecord> {
  const rec = seed ?? (await readRecord(env, brand));
  if (rec === null) throw new TokenOpError("not_found", `marca "${brand}" não encontrada`);

  try {
    const data = await igGet(
      `https://${IG_GRAPH_HOST}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(rec.access_token)}`
    );
    const newToken = typeof data.access_token === "string" ? data.access_token : "";
    if (!newToken) throw new TokenOpError("refresh_failed", "refresh não retornou access_token");
    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 0;
    const username = await igValidate(rec.user_id, newToken);

    const now = Date.now();
    const updated: TokenRecord = {
      access_token: newToken,
      user_id: rec.user_id,
      username: username || rec.username,
      expires_at: new Date(now + expiresIn * 1000).toISOString(),
      refreshed_at: new Date(now).toISOString(),
      last_error: null,
    };
    await env.IG_TOKENS.put(brand, JSON.stringify(updated));
    return updated;
  } catch (err) {
    // Mantém o token anterior; registra last_error sem expor o token.
    const e = err instanceof TokenOpError ? err : new TokenOpError("refresh_failed", (err as Error).message);
    const kept: TokenRecord = { ...rec, last_error: { code: e.code, message: e.message } };
    await env.IG_TOKENS.put(brand, JSON.stringify(kept));
    throw e;
  }
}

// Roteia /token/{brand}[/refresh|/status]. Devolve null se não for rota de token.
async function handleToken(request: Request, env: Env, parts: string[]): Promise<Response | null> {
  if (parts[0] !== "token") return null;

  const brand = parts[1] ?? "";
  const sub = parts[2];
  if (!brand || !SEGMENT.test(brand)) return json({ error: "invalid brand" }, 400, CORS);

  // GET /token/{brand}/status — leitura (UPLOAD ou ADMIN), sem token no corpo.
  if (sub === "status" && parts.length === 3) {
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405, { allow: "GET", ...CORS });
    const authErr = requireReader(request, env);
    if (authErr) return authErr;
    const rec = await readRecord(env, brand);
    if (!rec) return json({ error: "not found" }, 404, CORS);
    return json(statusView(brand, rec), 200, CORS);
  }

  // POST /token/{brand}/refresh — força renovação (ADMIN).
  if (sub === "refresh" && parts.length === 3) {
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405, { allow: "POST", ...CORS });
    const authErr = requireAdmin(request, env);
    if (authErr) return authErr;
    try {
      const rec = await refreshBrand(env, brand);
      return json(statusView(brand, rec), 200, CORS);
    } catch (err) {
      const e = err as TokenOpError;
      if (e.code === "not_found") return json({ error: "not found" }, 404, CORS);
      return json({ error: e.message, code: e.code }, 502, CORS);
    }
  }

  // /token/{brand}
  if (parts.length === 2) {
    // PUT — cadastra/atualiza o token (ADMIN).
    if (request.method === "PUT") {
      const authErr = requireAdmin(request, env);
      if (authErr) return authErr;

      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return json({ error: "invalid json body" }, 400, CORS);
      }
      const accessToken = typeof body.access_token === "string" ? body.access_token.trim() : "";
      const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
      if (!accessToken || !userId) return json({ error: "missing access_token or user_id" }, 400, CORS);

      let username: string;
      try {
        username = await igValidate(userId, accessToken);
      } catch (err) {
        const e = err as TokenOpError;
        return json({ error: `token inválido: ${e.message}`, code: e.code }, 400, CORS);
      }

      const now = new Date().toISOString();
      const rec: TokenRecord = {
        access_token: accessToken,
        user_id: userId,
        username,
        expires_at: null,
        refreshed_at: now,
        last_error: null,
      };
      // Renova já para obter o expires_at real; refreshBrand grava o registro (1 put)
      // no sucesso e na falha. Se o refresh falhar (ex.: token com <24h), o token fica
      // gravado com expires_at = null e last_error explicando.
      try {
        return json(statusView(brand, await refreshBrand(env, brand, rec)), 200, CORS);
      } catch (err) {
        const e = err as TokenOpError;
        return json(statusView(brand, { ...rec, last_error: { code: e.code, message: e.message } }), 200, CORS);
      }
    }

    // GET — token para uso interno (UPLOAD ou ADMIN).
    if (request.method === "GET") {
      const authErr = requireReader(request, env);
      if (authErr) return authErr;
      const rec = await readRecord(env, brand);
      if (!rec) return json({ error: "not found" }, 404, CORS);
      return json({ access_token: rec.access_token, user_id: rec.user_id, expires_at: rec.expires_at }, 200, CORS);
    }

    return json({ error: "method not allowed" }, 405, { allow: "GET, PUT", ...CORS });
  }

  return json({ error: "not found" }, 404, CORS);
}

function openApiSpec(origin: string): unknown {
  return {
    openapi: "3.1.0",
    info: {
      title: "ig-assets — upload de criativos",
      version: "1.0.0",
      description: "Envia imagens/vídeos para o R2 em JSON base64 e devolve a URL pública.",
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer" },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/upload-json": {
        post: {
          operationId: "uploadJson",
          summary: "Envia um arquivo em base64 para o R2",
          description:
            "Grava o arquivo na chave {brand}/{slug}/{file} e devolve a URL pública. Limite de 25 MB já decodificados.",
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["brand", "slug", "file", "content_type", "data_base64"],
                  properties: {
                    brand: { type: "string", description: "Marca em kebab-case, ex.: ziptime." },
                    slug: { type: "string", description: "Pasta do post em kebab-case." },
                    file: { type: "string", description: "Nome do arquivo com extensão (.png, .jpg, .mp4, .svg ou .json)." },
                    content_type: {
                      type: "string",
                      enum: ["image/png", "image/jpeg", "video/mp4", "image/svg+xml", "application/json"],
                      description: "Tipo MIME do arquivo.",
                    },
                    data_base64: { type: "string", description: "Conteúdo do arquivo em base64." },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Arquivo gravado.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      url: { type: "string" },
                      key: { type: "string" },
                      size: { type: "integer" },
                    },
                  },
                },
              },
            },
            "400": { description: "Campos inválidos ou base64 malformado." },
            "401": { description: "Bearer token ausente ou inválido." },
            "413": { description: "Arquivo maior que 25 MB." },
            "415": { description: "content_type não suportado." },
          },
        },
      },
    },
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter((p) => p.length > 0);

    // OPTIONS * -> preflight CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // GET /health
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
    }

    // GET /openapi.json (público, sem token) — cole na GPT Action.
    // Importante: as rotas /token NÃO entram aqui de propósito.
    if (url.pathname === "/openapi.json") {
      if (request.method !== "GET") {
        return json({ error: "method not allowed" }, 405, { allow: "GET", ...CORS });
      }
      return json(openApiSpec(url.origin), 200, CORS);
    }

    // /token/{brand}[/refresh|/status] -> cofre de tokens do Instagram
    const tokenResponse = await handleToken(request, env, parts);
    if (tokenResponse) return tokenResponse;

    // POST /upload-json -> grava arquivo enviado em JSON base64
    if (url.pathname === "/upload-json") {
      if (request.method !== "POST") {
        return json({ error: "method not allowed" }, 405, { allow: "POST", ...CORS });
      }

      if (!isBearerAuthorized(request, env)) {
        return json({ error: "unauthorized" }, 401, CORS);
      }

      let payload: Record<string, unknown>;
      try {
        payload = (await request.json()) as Record<string, unknown>;
      } catch {
        return json({ error: "invalid json body" }, 400, CORS);
      }

      const str = (v: unknown): string => (typeof v === "string" ? v : "");
      const brand = str(payload.brand);
      const slug = str(payload.slug);
      const file = str(payload.file);
      const contentType = str(payload.content_type).trim().toLowerCase();
      const dataBase64 = str(payload.data_base64);

      const asset = parseAssetPath([brand, slug, file]);
      if (!asset) return json({ error: "invalid path" }, 400, CORS);

      if (!ALLOWED_TYPES[contentType]) {
        return json({ error: `unsupported content-type: ${contentType || "(none)"}` }, 415, CORS);
      }

      if (!dataBase64) return json({ error: "missing data_base64" }, 400, CORS);

      let bytes: Uint8Array;
      try {
        bytes = decodeBase64(dataBase64);
      } catch {
        return json({ error: "invalid base64" }, 400, CORS);
      }

      if (bytes.byteLength === 0) return json({ error: "empty body" }, 400, CORS);
      if (bytes.byteLength > MAX_BYTES) {
        return json({ error: `too large: ${bytes.byteLength} bytes (max ${MAX_BYTES})` }, 413, CORS);
      }

      const key = `${asset.brand}/${asset.slug}/${asset.file}`;
      await env.BUCKET.put(key, bytes, { httpMetadata: { contentType } });

      return json({ url: `${env.PUBLIC_BASE}/${key}`, key, size: bytes.byteLength }, 200, CORS);
    }

    // PUT /upload/{brand}/{slug}/{file}
    if (parts[0] === "upload") {
      if (request.method !== "PUT") {
        return json({ error: "method not allowed" }, 405, { allow: "PUT" });
      }

      if (!isBearerAuthorized(request, env)) {
        return json({ error: "unauthorized" }, 401);
      }

      const asset = parseAssetPath(parts.slice(1));
      if (!asset) return json({ error: "invalid path" }, 400);

      const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      if (!ALLOWED_TYPES[contentType]) {
        return json({ error: `unsupported content-type: ${contentType || "(none)"}` }, 415);
      }

      const body = await request.arrayBuffer();
      if (body.byteLength === 0) return json({ error: "empty body" }, 400);
      if (body.byteLength > MAX_BYTES) {
        return json({ error: `too large: ${body.byteLength} bytes (max ${MAX_BYTES})` }, 413);
      }

      const key = `${asset.brand}/${asset.slug}/${asset.file}`;
      await env.BUCKET.put(key, body, { httpMetadata: { contentType } });

      return json({ url: `${env.PUBLIC_BASE}/${key}`, key, size: body.byteLength }, 201);
    }

    // GET /{brand}/{slug}/{file}
    const asset = parseAssetPath(parts);
    if (asset) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return json({ error: "method not allowed" }, 405, { allow: "GET, HEAD" });
      }
      const key = `${asset.brand}/${asset.slug}/${asset.file}`;
      const obj = await env.BUCKET.get(key);
      if (!obj) return json({ error: "not found" }, 404);

      const ext = asset.file.split(".").pop() as string;
      const contentType = obj.httpMetadata?.contentType ?? EXT_TYPE[ext] ?? "application/octet-stream";
      const headers = new Headers({
        "content-type": contentType,
        "access-control-allow-origin": "*",
        etag: obj.httpEtag,
      });
      // Manifest muda no lugar (chave fixa): cache curto. Demais assets usam chave
      // versionada/com hash, então cache imutável de 1 ano.
      if (asset.file.endsWith("manifest.json")) {
        headers.set("cache-control", "public, max-age=300");
      } else {
        headers.set("cache-control", "public, max-age=31536000, immutable");
      }
      // SVG é servido como dado inerte: sem scripts, sem sniffing.
      if (ext === "svg") {
        headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'");
        headers.set("x-content-type-options", "nosniff");
      }
      const bodyData = request.method === "HEAD" ? null : obj.body;
      return new Response(bodyData, { status: 200, headers });
    }

    return json({ error: "not found" }, 404);
  },

  // Cron: renova o token de cada marca cadastrada no KV. Falha em uma marca
  // não interrompe as demais (o erro fica registrado em last_error).
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    let cursor: string | undefined;
    do {
      const list = await env.IG_TOKENS.list({ cursor });
      for (const key of list.keys) {
        try {
          await refreshBrand(env, key.name);
        } catch {
          // last_error já foi gravado em refreshBrand; segue para a próxima marca.
        }
      }
      cursor = list.list_complete ? undefined : list.cursor;
    } while (cursor);
  },
};
