import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import type { Post, Slide } from "./schema.js";
import type { BrandTokens } from "./tokens.js";
import { getTemplate } from "./templates/index.js";
import type { RenderContext } from "./templates/shared/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONTS_DIR = join(__dirname, "..", "fonts");

export interface SatoriFont {
  name: string;
  data: Buffer;
  weight: 400 | 600 | 700;
  style: "normal";
}

const FONT_FILES: { file: string; name: string; weight: 400 | 600 | 700 }[] = [
  { file: "Sora-600.ttf", name: "Sora", weight: 600 },
  { file: "Sora-700.ttf", name: "Sora", weight: 700 },
  { file: "Inter-400.ttf", name: "Inter", weight: 400 },
  { file: "Inter-600.ttf", name: "Inter", weight: 600 },
];

/** Carrega as 4 fontes ttf. Erro claro se faltar alguma. */
export function loadFonts(): SatoriFont[] {
  const missing = FONT_FILES.filter((f) => !existsSync(join(FONTS_DIR, f.file))).map((f) => f.file);
  if (missing.length) {
    throw new Error(
      `fontes ausentes em ${FONTS_DIR}: ${missing.join(", ")}.\n` +
        `Rode "pnpm fetch-fonts" (ou bash scripts/fetch-fonts.sh) primeiro.`
    );
  }
  return FONT_FILES.map((f) => ({
    name: f.name,
    data: readFileSync(join(FONTS_DIR, f.file)),
    weight: f.weight,
    style: "normal" as const,
  }));
}

export function resolveSize(size: Post["size"]): { width: number; height: number } {
  const [w, h] = size.split("x").map((n) => parseInt(n, 10));
  return { width: w, height: h };
}

/** Accents cuja cor tem contraste insuficiente para texto pequeno sobre branco. */
const RESTRICTED_ACCENTS = new Set<Post["accent"]>(["cyan", "red"]);

/** Cor de accent exigida por tema que não é garantida em toda marca (chave em colors). */
const THEME_REQUIRED_COLOR: Partial<Record<Post["theme"], "yellow">> = { yellow: "yellow" };
/** Cor de accent exigida que não é garantida em toda marca. */
const ACCENT_REQUIRED_COLOR: Partial<Record<Post["accent"], "cyan" | "red" | "purple">> = {
  cyan: "cyan",
  red: "red",
  purple: "purple",
};

/**
 * Garante que a marca define as cores exigidas pelo tema/accent do post. Falha
 * com mensagem clara em vez de cair em fallback silencioso (regra do pipeline).
 */
export function assertThemeAccentTokens(post: Post, tokens: BrandTokens): void {
  const missing: string[] = [];
  const themeColor = THEME_REQUIRED_COLOR[post.theme];
  if (themeColor && !tokens.colors[themeColor]) {
    missing.push(`theme "${post.theme}" exige colors.${themeColor} na marca "${tokens.slug}"`);
  }
  const accentColorKey = ACCENT_REQUIRED_COLOR[post.accent];
  if (accentColorKey && !tokens.colors[accentColorKey]) {
    missing.push(`accent "${post.accent}" exige colors.${accentColorKey} na marca "${tokens.slug}"`);
  }
  if (missing.length) {
    throw new Error(`cores da marca ausentes:\n${missing.map((m) => `  • ${m}`).join("\n")}`);
  }
}

/** hex "#RRGGBB" -> rgba(...) com alpha, para derivar um fundo-tinta do accent. */
function tint(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Resolve o accent do post nas três cores que o template consome. Pressupõe que
 * `assertThemeAccentTokens` já rodou (cores opcionais garantidas). `accentLight`
 * de accents sem token *Light dedicado é uma tinta translúcida da própria cor.
 * `accentTextLight` é ink para accents restritos (cyan/red), senão o próprio accent.
 */
function accentTriple(
  tokens: BrandTokens,
  accent: Post["accent"]
): { accent: string; accentLight: string; accentTextLight: string } {
  const restricted = RESTRICTED_ACCENTS.has(accent);
  const textLight = (hex: string) => (restricted ? tokens.colors.ink : hex);
  switch (accent) {
    case "zipagent":
      return { accent: tokens.colors.zipagent, accentLight: tokens.colors.zipagentLight, accentTextLight: textLight(tokens.colors.zipagent) };
    case "zipzap":
      return { accent: tokens.colors.zipzap, accentLight: tokens.colors.zipzapLight, accentTextLight: textLight(tokens.colors.zipzap) };
    case "cyan":
      return { accent: tokens.colors.cyan!, accentLight: tint(tokens.colors.cyan!, 0.14), accentTextLight: textLight(tokens.colors.cyan!) };
    case "red":
      return { accent: tokens.colors.red!, accentLight: tint(tokens.colors.red!, 0.12), accentTextLight: textLight(tokens.colors.red!) };
    case "purple":
      return { accent: tokens.colors.purple!, accentLight: tint(tokens.colors.purple!, 0.12), accentTextLight: textLight(tokens.colors.purple!) };
    case "primary":
    default:
      return { accent: tokens.colors.primary, accentLight: tokens.colors.light, accentTextLight: textLight(tokens.colors.primary) };
  }
}

function bgImageDataUri(slide: Slide, postDir: string): string | undefined {
  if (!slide.background || slide.background.type !== "image") return undefined;
  const path = resolve(postDir, slide.background.src);
  if (!existsSync(path)) {
    throw new Error(`imagem de fundo não encontrada: ${slide.background.src} (resolvido para ${path})`);
  }
  const ext = extname(path).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  const data = readFileSync(path).toString("base64");
  return `data:${mime};base64,${data}`;
}

export interface SlideRenderResult {
  png: Buffer;
  ms: number;
}

/** Renderiza um único slide para PNG. */
export async function renderSlide(
  post: Post,
  tokens: BrandTokens,
  fonts: SatoriFont[],
  index: number,
  opts: { debug?: boolean; postDir: string }
): Promise<SlideRenderResult> {
  const slide = post.slides[index];
  const { width, height } = resolveSize(post.size);
  assertThemeAccentTokens(post, tokens);
  const { accent, accentLight, accentTextLight } = accentTriple(tokens, post.accent);

  const ctx: RenderContext = {
    post,
    tokens,
    accent,
    accentLight,
    accentTextLight,
    index,
    total: post.slides.length,
    isLast: index === post.slides.length - 1,
    width,
    height,
    debug: !!opts.debug,
    bgImageDataUri: bgImageDataUri(slide, opts.postDir),
  };

  const element = getTemplate(post.template)({ slide, ctx });

  const t0 = performance.now();
  const svg = await satori(element, { width, height, fonts });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  const png = resvg.render().asPng();
  const ms = performance.now() - t0;

  return { png, ms };
}

export interface Manifest {
  slug: string;
  brand: string;
  template: string;
  size: string;
  theme: string;
  accent: string;
  files: string[];
  /** URLs públicas após o upload (preenchido por `ig-render upload`). */
  urls?: string[];
  variants: { index: number; role: string; variant: string }[];
  dimensions: { width: number; height: number };
  generatedAt: string;
}

export interface RenderPostResult {
  manifest: Manifest;
  outDir: string;
  timings: number[];
}

/** Renderiza todos os slides de um post e grava PNGs + manifest. */
export async function renderPost(
  post: Post,
  tokens: BrandTokens,
  fonts: SatoriFont[],
  outRoot: string,
  opts: { debug?: boolean; postDir: string }
): Promise<RenderPostResult> {
  const { width, height } = resolveSize(post.size);
  const outDir = join(outRoot, post.slug);
  mkdirSync(outDir, { recursive: true });

  const files: string[] = [];
  const timings: number[] = [];

  for (let i = 0; i < post.slides.length; i++) {
    const { png, ms } = await renderSlide(post, tokens, fonts, i, opts);
    const nn = String(i + 1).padStart(2, "0");
    const name = `${post.slug}-${nn}.png`;
    writeFileSync(join(outDir, name), png);
    files.push(name);
    timings.push(ms);
  }

  const manifest: Manifest = {
    slug: post.slug,
    brand: post.brand,
    template: post.template,
    size: post.size,
    theme: post.theme,
    accent: post.accent,
    files,
    variants: post.slides.map((s, i) => ({ index: i, role: s.role, variant: s.variant })),
    dimensions: { width, height },
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  return { manifest, outDir, timings };
}

/** Lista arquivos .json em posts/ (para --all). */
export function listPosts(postsDir: string): string[] {
  if (!existsSync(postsDir)) return [];
  return readdirSync(postsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => join(postsDir, f))
    .sort();
}
