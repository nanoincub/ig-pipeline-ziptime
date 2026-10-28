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

/**
 * Accents-superfície: a cor nunca é usada em texto/número. Ela entra como
 * superfície (fundo de badge, pílula, marca-texto atrás do número); o texto/
 * número por cima sai em ink. Hoje: ciano.
 */
const SURFACE_ACCENTS = new Set<Post["accent"]>(["cyan"]);
/** Accents cuja cor tem contraste baixo para TEXTO pequeno; nesses, texto → ink. */
const SMALL_TEXT_INK_ACCENTS = new Set<Post["accent"]>(["cyan", "red"]);

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

/** Cores de accent/superfície já resolvidas que o template consome por campo. */
export interface AccentResolved {
  /** cor cheia do accent — preenchimentos: barras, linhas, blocos, badge, pílula. */
  accent: string;
  /** versão clara do accent (caixa de realce). */
  accentLight: string;
  /** texto pequeno de accent (kicker/CTA/rótulo) em tema claro; ink quando restrito. */
  accentTextLight: string;
  /** cor do número grande; ink quando o accent é superfície (ou tema yellow). */
  numberColor: string;
  /** superfície (marca-texto) atrás do número; definida só para accents-superfície. */
  numberSurface?: string;
  /** cor de texto/número POR CIMA de um preenchimento de accent (badge, pílula). */
  onAccentText: string;
}

/** accent + accentLight brutos por nome (cores opcionais garantidas pelo assert). */
function accentBase(tokens: BrandTokens, accent: Post["accent"]): { accent: string; accentLight: string } {
  switch (accent) {
    case "zipagent":
      return { accent: tokens.colors.zipagent, accentLight: tokens.colors.zipagentLight };
    case "zipzap":
      return { accent: tokens.colors.zipzap, accentLight: tokens.colors.zipzapLight };
    case "cyan":
      return { accent: tokens.colors.cyan!, accentLight: tint(tokens.colors.cyan!, 0.14) };
    case "red":
      return { accent: tokens.colors.red!, accentLight: tint(tokens.colors.red!, 0.12) };
    case "purple":
      return { accent: tokens.colors.purple!, accentLight: tint(tokens.colors.purple!, 0.12) };
    case "primary":
    default:
      return { accent: tokens.colors.primary, accentLight: tokens.colors.light };
  }
}

/**
 * Resolve o accent do post nas cores por campo que o template consome, ciente do
 * tema. Ciano e amarelo são superfície, nunca texto: por isso texto/número sobre
 * eles sai em ink e o número ganha uma marca-texto da cor. Toda a condicional de
 * contraste vive aqui (mesma camada do accentTextLight); o template só lê campos.
 * Pressupõe que `assertThemeAccentTokens` já rodou.
 */
function resolveAccent(tokens: BrandTokens, theme: Post["theme"], accent: Post["accent"]): AccentResolved {
  const ink = tokens.colors.ink;
  const onYellow = theme === "yellow";
  const surface = SURFACE_ACCENTS.has(accent);
  const base = accentBase(tokens, accent);
  return {
    accent: base.accent,
    accentLight: base.accentLight,
    // tema yellow é superfície: todo texto de accent cai para ink.
    accentTextLight: onYellow || SMALL_TEXT_INK_ACCENTS.has(accent) ? ink : base.accent,
    numberColor: onYellow || surface ? ink : base.accent,
    numberSurface: surface ? base.accent : undefined,
    onAccentText: surface ? ink : "#FFFFFF",
  };
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
  const a = resolveAccent(tokens, post.theme, post.accent);

  const ctx: RenderContext = {
    post,
    tokens,
    accent: a.accent,
    accentLight: a.accentLight,
    accentTextLight: a.accentTextLight,
    numberColor: a.numberColor,
    numberSurface: a.numberSurface,
    onAccentText: a.onAccentText,
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
