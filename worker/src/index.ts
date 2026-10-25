/**
 * ig-assets — Worker de upload/entrega de criativos em R2.
 *
 * Rotas:
 *   PUT /upload/{brand}/{slug}/{file}   (Bearer UPLOAD_TOKEN) -> grava no bucket
 *   GET /{brand}/{slug}/{file}          -> serve o arquivo, cache imutável, CORS *
 *   GET /health                         -> 200
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter((p) => p.length > 0);

    // GET /health
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
    }

    // PUT /upload/{brand}/{slug}/{file}
    if (parts[0] === "upload") {
      if (request.method !== "PUT") {
        return json({ error: "method not allowed" }, 405, { allow: "PUT" });
      }

      const auth = request.headers.get("authorization") ?? "";
      const expected = `Bearer ${env.UPLOAD_TOKEN}`;
      if (!env.UPLOAD_TOKEN || auth !== expected) {
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
