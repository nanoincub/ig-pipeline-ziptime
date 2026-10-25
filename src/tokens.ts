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
  };
  safeArea: number;
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
  return JSON.parse(raw) as BrandTokens;
}

/** Resolve a cor de accent escolhida no post para um hex dos tokens. */
export function accentColor(tokens: BrandTokens, accent: "primary" | "zipagent" | "zipzap"): string {
  return tokens.colors[accent];
}
