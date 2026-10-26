/**
 * ig-assets — Worker de upload/entrega de criativos em R2.
 *
 * Rotas:
 *   PUT  /upload/{brand}/{slug}/{file}  (Bearer UPLOAD_TOKEN) -> grava binário no bucket
 *   POST /upload-json                   (Bearer UPLOAD_TOKEN) -> grava arquivo em JSON base64
 *   GET  /openapi.json                  -> spec OpenAPI 3.1 (pública) para GPT Action
 *   GET  /{brand}/{slug}/{file}         -> serve o arquivo, cache imutável, CORS *
 *   GET  /health                        -> 200
 *   OPTIONS *                           -> preflight CORS
 *   resto                               -> 404 / 405
 */

export interface Env {
  BUCKET: R2Bucket;
  UPLOAD_TOKEN: string;
  PUBLIC_BASE: string;
}

const SEGMENT = /^[a-z0-9][a-z0-9-]*$/;
const FILE = /^[a-z0-9][a-z0-9-]*\.(png|jpg|mp4)$/;

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "video/mp4": ".mp4",
};

const EXT_TYPE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  mp4: "video/mp4",
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
  // espera exatamente [brand, slug, file]; rejeita segmentos extras, vazios ou ".."
  if (parts.length !== 3) return null;
  const [brand, slug, file] = parts;
  if (parts.some((p) => p === "" || p.includes(".."))) return null;
  if (!SEGMENT.test(brand) || !SEGMENT.test(slug) || !FILE.test(file)) return null;
  return { brand, slug, file };
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
                    file: { type: "string", description: "Nome do arquivo com extensão (.png, .jpg ou .mp4)." },
                    content_type: {
                      type: "string",
                      enum: ["image/png", "image/jpeg", "video/mp4"],
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

    // GET /openapi.json (público, sem token) — cole na GPT Action
    if (url.pathname === "/openapi.json") {
      if (request.method !== "GET") {
        return json({ error: "method not allowed" }, 405, { allow: "GET", ...CORS });
      }
      return json(openApiSpec(url.origin), 200, CORS);
    }

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
        "cache-control": "public, max-age=31536000, immutable",
        "access-control-allow-origin": "*",
        etag: obj.httpEtag,
      });
      const bodyData = request.method === "HEAD" ? null : obj.body;
      return new Response(bodyData, { status: 200, headers });
    }

    return json({ error: "not found" }, 404);
  },
};
