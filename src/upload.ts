import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { Manifest } from "./render.js";

export interface UploadConfig {
  endpoint: string;
  token: string;
}

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  mp4: "video/mp4",
};

/** Lê IG_UPLOAD_ENDPOINT e IG_UPLOAD_TOKEN do ambiente (dotenv já carregado). */
export function loadUploadConfig(): UploadConfig {
  const endpoint = (process.env.IG_UPLOAD_ENDPOINT ?? "").trim().replace(/\/+$/, "");
  const token = (process.env.IG_UPLOAD_TOKEN ?? "").trim();
  if (!endpoint || !token) {
    throw new Error(
      "configuração de upload ausente. Defina IG_UPLOAD_ENDPOINT e IG_UPLOAD_TOKEN em .env " +
        "(veja .env.example)."
    );
  }
  return { endpoint, token };
}

function contentTypeFor(file: string): string {
  const ext = file.split(".").pop()?.toLowerCase() ?? "";
  const ct = CONTENT_TYPES[ext];
  if (!ct) throw new Error(`extensão não suportada para upload: ${file}`);
  return ct;
}

/**
 * Insere um hash de conteúdo no nome: `slug-01.png` -> `slug-01-<hash8>.png`.
 * hash8 = 8 primeiros caracteres do SHA256 do arquivo. Conteúdo idêntico
 * produz a mesma chave; qualquer mudança gera uma chave nova (contorna o
 * cache imutável do Worker).
 */
function hashedName(file: string, body: Buffer): string {
  const hash8 = createHash("sha256").update(body).digest("hex").slice(0, 8);
  const dot = file.lastIndexOf(".");
  const base = dot === -1 ? file : file.slice(0, dot);
  const ext = dot === -1 ? "" : file.slice(dot);
  return `${base}-${hash8}${ext}`;
}

/**
 * Sobe todos os PNGs de out/<slug>/ (na ordem do manifest) para o Worker,
 * grava urls[] de volta no manifest e retorna as URLs.
 * `log` recebe mensagens de progresso (vão para stderr, nunca stdout).
 */
export async function uploadSlug(
  slug: string,
  brand: string,
  outRoot: string,
  cfg: UploadConfig,
  log: (msg: string) => void = () => {}
): Promise<string[]> {
  const dir = join(outRoot, slug);
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`manifest não encontrado: ${manifestPath}. Rode o render antes do upload.`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

  const urls: string[] = [];
  for (const file of manifest.files) {
    const filePath = join(dir, file);
    if (!existsSync(filePath)) {
      throw new Error(`arquivo do manifest ausente em disco: ${filePath}`);
    }
    const body = readFileSync(filePath);
    const remoteName = hashedName(file, body);
    const url = `${cfg.endpoint}/upload/${brand}/${slug}/${remoteName}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${cfg.token}`,
          "content-type": contentTypeFor(file),
        },
        body,
      });
    } catch (err) {
      throw new Error(`falha de rede ao subir ${file}: ${(err as Error).message}`);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`falha ao subir ${file}: HTTP ${res.status} ${text}`);
    }
    const data = (await res.json()) as { url: string };
    log(`  ↑ ${remoteName} (${body.byteLength} bytes)`);
    urls.push(data.url);
  }

  manifest.urls = urls;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return urls;
}
