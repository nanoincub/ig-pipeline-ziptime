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
    /** caminho do SVG do logo, relativo a brands/ (ex: "ziptime/logo.svg"). */
    logo?: string;
    /** logo já parseado (viewBox + paths), resolvido em loadBrand. */
    logoData?: LogoData;
  };
  safeArea: number;
}

/** Logo vetorial pronto para inlinar em um <svg> do Satori. */
export interface LogoData {
  viewBox: string;
  /** atributos `d` de cada <path> do SVG, na ordem do arquivo. */
  paths: string[];
}

/**
 * Lê um SVG monocromático e extrai viewBox + os `d` dos <path>. A cor é
 * aplicada no render (não a do arquivo), para versão clara/branca por tema.
 */
export function parseLogoSvg(svg: string): LogoData {
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 24 24";
  const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((m) => m[1]);
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

  // Resolve o logo referenciado em signature.logo (SVG inline, sem <img>).
  if (tokens.signature.logo) {
    const logoPath = join(BRANDS_DIR, tokens.signature.logo);
    try {
      tokens.signature.logoData = parseLogoSvg(readFileSync(logoPath, "utf8"));
    } catch {
      throw new Error(`logo da marca "${slug}" não encontrado (esperado em ${logoPath})`);
    }
  }

  return tokens;
}

/** Resolve a cor de accent escolhida no post para um hex dos tokens. */
export function accentColor(tokens: BrandTokens, accent: "primary" | "zipagent" | "zipzap"): string {
  return tokens.colors[accent];
}
