import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Manifest } from "./render.js";

/**
 * Publicação no Instagram via Graph API (Content Publishing).
 * Imagem única: cria container -> poll até FINISHED -> media_publish.
 * Carrossel: um container por imagem (is_carousel_item) -> poll cada ->
 * container pai CAROUSEL -> poll -> media_publish.
 */

/** Versão única da Graph API usada por todas as chamadas (documentada no README). */
export const GRAPH_API_VERSION = "v21.0";

/**
 * Host da Graph API. A conta usa "Instagram API with Instagram Login", cujo
 * host é graph.instagram.com (default). Configurável via IG_GRAPH_HOST para
 * permitir o caminho graph.facebook.com (Instagram API with Facebook Login).
 */
export function graphHost(): string {
  return (process.env.IG_GRAPH_HOST ?? "graph.instagram.com")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

/** URL base das chamadas: https://<host>/<versão>. */
export function graphBase(): string {
  return `https://${graphHost()}/${GRAPH_API_VERSION}`;
}

export const MAX_CAROUSEL = 10;
export const CAPTION_MAX_CHARS = 2200;
export const CAPTION_MAX_HASHTAGS = 30;
const POLL_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 3_000;

export interface PublishConfig {
  userId: string;
  accessToken: string;
}

/** Erro vindo da Graph API da Meta, com message + code para reportar. */
export class GraphApiError extends Error {
  code?: number | string;
  constructor(message: string, code?: number | string) {
    super(message);
    this.name = "GraphApiError";
    this.code = code;
  }
}

/** Lê IG_USER_ID e IG_ACCESS_TOKEN do ambiente. Retorna o que faltar. */
export function loadPublishConfig(): { config?: PublishConfig; missing: string[] } {
  const userId = (process.env.IG_USER_ID ?? "").trim();
  const accessToken = (process.env.IG_ACCESS_TOKEN ?? "").trim();
  const missing: string[] = [];
  if (!userId) missing.push("IG_USER_ID");
  if (!accessToken) missing.push("IG_ACCESS_TOKEN");
  if (missing.length) return { missing };
  return { config: { userId, accessToken }, missing: [] };
}

/** Carrega o manifest e exige urls[] (preenchidas pelo upload). */
export function loadManifestUrls(slug: string, outRoot: string): { manifest: Manifest; urls: string[] } {
  const manifestPath = join(outRoot, slug, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`manifest não encontrado: ${manifestPath}. Rode o render antes de publicar.`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
  const urls = manifest.urls ?? [];
  if (!urls.length) {
    throw new Error(
      `manifest sem urls públicas (${manifestPath}). Rode "ig-render upload ${slug}" (ou pipeline) antes de publicar.`
    );
  }
  if (urls.length > MAX_CAROUSEL) {
    throw new Error(`carrossel com ${urls.length} imagens excede o máximo de ${MAX_CAROUSEL} do Instagram.`);
  }
  return { manifest, urls };
}

export interface CaptionStats {
  chars: number;
  hashtags: number;
}

/** Valida tamanho e número de hashtags da legenda. Lança em violação. */
export function validateCaption(caption: string): CaptionStats {
  const chars = [...caption].length;
  const hashtags = (caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
  if (chars > CAPTION_MAX_CHARS) {
    throw new Error(`legenda com ${chars} caracteres (máx ${CAPTION_MAX_CHARS}).`);
  }
  if (hashtags > CAPTION_MAX_HASHTAGS) {
    throw new Error(`legenda com ${hashtags} hashtags (máx ${CAPTION_MAX_HASHTAGS}).`);
  }
  return { chars, hashtags };
}

export interface PlanStep {
  method: "POST" | "GET";
  url: string;
  note?: string;
}

/** Plano de chamadas (para --dry-run), sem executar nada. */
export function buildPlan(userId: string, urls: string[]): PlanStep[] {
  const gb = graphBase();
  const base = `${gb}/${userId}`;
  const steps: PlanStep[] = [];
  if (urls.length === 1) {
    steps.push({ method: "POST", url: `${base}/media`, note: `image_url + caption` });
    steps.push({ method: "GET", url: `${gb}/{container-id}?fields=status_code`, note: "polling até FINISHED" });
    steps.push({ method: "POST", url: `${base}/media_publish`, note: "creation_id={container-id}" });
    steps.push({ method: "GET", url: `${gb}/{media-id}?fields=permalink` });
    return steps;
  }
  urls.forEach((_, i) => {
    steps.push({ method: "POST", url: `${base}/media`, note: `[filho ${i + 1}/${urls.length}] is_carousel_item=true + image_url` });
    steps.push({ method: "GET", url: `${gb}/{child-${i + 1}}?fields=status_code`, note: "polling até FINISHED" });
  });
  steps.push({ method: "POST", url: `${base}/media`, note: `[pai] media_type=CAROUSEL children=<${urls.length} ids> + caption` });
  steps.push({ method: "GET", url: `${gb}/{parent-id}?fields=status_code`, note: "polling até FINISHED" });
  steps.push({ method: "POST", url: `${base}/media_publish`, note: "creation_id={parent-id}" });
  steps.push({ method: "GET", url: `${gb}/{media-id}?fields=permalink` });
  return steps;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Chamada à Graph API; lança GraphApiError com message/code da Meta. */
async function graphCall(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new GraphApiError(`falha de rede: ${(err as Error).message}`);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const apiErr = json.error as { message?: string; code?: number | string } | undefined;
  if (!res.ok || apiErr) {
    throw new GraphApiError(apiErr?.message ?? `HTTP ${res.status}`, apiErr?.code);
  }
  return json;
}

/** Cria um container de mídia e retorna seu id. */
async function createMedia(cfg: PublishConfig, params: Record<string, string>): Promise<string> {
  const body = new URLSearchParams({ ...params, access_token: cfg.accessToken });
  const json = await graphCall(`${graphBase()}/${cfg.userId}/media`, { method: "POST", body });
  return String(json.id);
}

/** Faz polling em GET /{id}?fields=status_code até FINISHED (ERROR/timeout abortam). */
async function pollContainer(cfg: PublishConfig, containerId: string, log: (m: string) => void): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const url = `${graphBase()}/${containerId}?fields=status_code&access_token=${encodeURIComponent(cfg.accessToken)}`;
    const json = await graphCall(url, { method: "GET" });
    const status = String(json.status_code ?? "");
    if (status === "FINISHED") return;
    if (status === "ERROR") throw new GraphApiError(`container ${containerId} retornou status ERROR`);
    log(`  … ${containerId}: ${status || "IN_PROGRESS"}`);
    await sleep(POLL_INTERVAL_MS);
  }
  throw new GraphApiError(`timeout aguardando container ${containerId} (>${POLL_TIMEOUT_MS / 1000}s)`);
}

/** Publica um container já FINISHED e retorna o media_id. */
async function mediaPublish(cfg: PublishConfig, creationId: string): Promise<string> {
  const body = new URLSearchParams({ creation_id: creationId, access_token: cfg.accessToken });
  const json = await graphCall(`${graphBase()}/${cfg.userId}/media_publish`, { method: "POST", body });
  return String(json.id);
}

/** Busca o permalink de uma mídia publicada. */
async function getPermalink(cfg: PublishConfig, mediaId: string): Promise<string | null> {
  const url = `${graphBase()}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(cfg.accessToken)}`;
  const json = await graphCall(url, { method: "GET" });
  return (json.permalink as string) ?? null;
}

export interface PublishResult {
  media_id: string;
  permalink: string | null;
  container_ids: string[];
}

/** Executa a publicação (imagem única ou carrossel) e retorna ids + permalink. */
export async function publishPost(
  cfg: PublishConfig,
  urls: string[],
  caption: string,
  log: (m: string) => void = () => {}
): Promise<PublishResult> {
  const containerIds: string[] = [];
  let creationId: string;

  if (urls.length === 1) {
    log(`→ criando container de imagem única`);
    const id = await createMedia(cfg, { image_url: urls[0], caption });
    containerIds.push(id);
    await pollContainer(cfg, id, log);
    creationId = id;
  } else {
    for (let i = 0; i < urls.length; i++) {
      log(`→ criando container filho ${i + 1}/${urls.length}`);
      const id = await createMedia(cfg, { image_url: urls[i], is_carousel_item: "true" });
      containerIds.push(id);
      await pollContainer(cfg, id, log);
    }
    log(`→ criando container pai (CAROUSEL)`);
    creationId = await createMedia(cfg, {
      media_type: "CAROUSEL",
      children: containerIds.join(","),
      caption,
    });
    await pollContainer(cfg, creationId, log);
  }

  log(`→ publicando (media_publish)`);
  const mediaId = await mediaPublish(cfg, creationId);
  const permalink = await getPermalink(cfg, mediaId).catch(() => null);
  return { media_id: mediaId, permalink, container_ids: containerIds };
}
