import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRANDS_DIR = join(__dirname, "..", "brands");

export interface BrandTokens {
  slug: string;
  name: string;
  colors: {
    primary: string;
    hover: string;
    light: string;
    secondary: string;
    deep: string;
    ink: string;
    bg: string;
    neutral600: string;
    neutral400: string;
    neutral100: string;
    success: string;
    warning: string;
    danger: string;
    zipagent: string;
    zipagentLight: string;
    zipzap: string;
    zipzapLight: string;
    // Tokens adicionais espelhados do Guia de marca. Opcionais para não exigir
    // paleta completa de marcas futuras.
    logo?: string;
    info?: string;
    zipcal?: string;
    zipcalLight?: string;
    yellow?: string;
    cyan?: string;
    purple?: string;
    red?: string;
  };
  gradients: {
    hero: string;
    zipagent: string;
  };
  fonts: {
    display: string;
    body: string;
  };
  radius: number;
  signature: {
    text: string;
    handle: string;
    /** caminho do SVG do logo completo para fundo claro, relativo a brands/. */
    logo?: string;
    /** logo completo para fundo escuro/gradiente. */
    logoOnDark?: string;
    /** símbolo (sem wordmark) para fundo claro. */
    symbol?: string;
    /** símbolo para fundo escuro/gradiente. */
    symbolOnDark?: string;
    /** logos já parseados (viewBox + paths com paint nativo), resolvidos em loadBrand. */
    logoData?: LogoData;
    logoOnDarkData?: LogoData;
    symbolData?: LogoData;
    symbolOnDarkData?: LogoData;
  };
  assets?: {
    /** URL fixa do manifest de logos publicado no R2. */
    manifest?: string;
  };
  /** Preferências visuais por template; o Post pode sobrescrevê-las. */
  templateDefaults?: {
    carouselEdu?: {
      symbolWatermark?: boolean;
    };
  };
  safeArea: number;
}

/** Paint nativo de um <path> do SVG (preservado tal como no arquivo oficial). */
export interface LogoPath {
  d: string;
  /** cor de preenchimento; "none" quando o path é só contorno. */
  fill: string;
  /** cor de traço, quando o path é desenhado como contorno. */
  stroke?: string;
  /** espessura do traço (atributo stroke-width). */
  strokeWidth?: number;
}

/** Logo vetorial pronto para inlinar em um <svg> do Satori. */
export interface LogoData {
  viewBox: string;
  /** cada <path> do SVG com seu paint nativo, na ordem do arquivo. */
  paths: LogoPath[];
}

/**
 * Lê um SVG e extrai viewBox + cada <path> com seu paint nativo (fill/stroke/
 * stroke-width). Preserva as cores oficiais do arquivo (logos bicolores: wordmark
 * + símbolo) em vez de recolorir, e desenha contornos como contorno, não como
 * área preenchida. `fill` default é "none" (o <svg> raiz usa fill="none", que é
 * herdado), para que paths só-de-traço não virem blocos sólidos.
 */
export function parseLogoSvg(svg: string): LogoData {
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 24 24";
  const paths = [...svg.matchAll(/<path\b([^>]*)>/g)].map((m) => {
    const attrs = m[1];
    const d = attrs.match(/\bd="([^"]+)"/)?.[1] ?? "";
    const fill = attrs.match(/\bfill="([^"]+)"/)?.[1] ?? "none";
    const stroke = attrs.match(/\bstroke="([^"]+)"/)?.[1];
    const strokeWidthRaw = attrs.match(/\bstroke-width="([^"]+)"/)?.[1];
    const path: LogoPath = { d, fill };
    if (stroke) path.stroke = stroke;
    if (strokeWidthRaw) path.strokeWidth = Number(strokeWidthRaw);
    return path;
  });
  return { viewBox, paths };
}

/** Carrega e tipa os tokens de uma marca a partir de brands/<slug>.json. */
export function loadBrand(slug: string): BrandTokens {
  const path = join(BRANDS_DIR, `${slug}.json`);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`marca "${slug}" não encontrada (esperado em ${path})`);
  }
  const tokens = JSON.parse(raw) as BrandTokens;

  // Resolve cada variante de logo referenciada na assinatura (SVG inline, sem
  // <img>). Cada uma é opcional; só resolve as que a marca declarar.
  const resolveLogo = (ref: string | undefined): LogoData | undefined => {
    if (!ref) return undefined;
    const logoPath = join(BRANDS_DIR, ref);
    try {
      return parseLogoSvg(readFileSync(logoPath, "utf8"));
    } catch {
      throw new Error(`logo da marca "${slug}" não encontrado (esperado em ${logoPath})`);
    }
  };

  tokens.signature.logoData = resolveLogo(tokens.signature.logo);
  tokens.signature.logoOnDarkData = resolveLogo(tokens.signature.logoOnDark);
  tokens.signature.symbolData = resolveLogo(tokens.signature.symbol);
  tokens.signature.symbolOnDarkData = resolveLogo(tokens.signature.symbolOnDark);

  return tokens;
}
