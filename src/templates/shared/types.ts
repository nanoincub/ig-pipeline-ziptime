import type { Post, Slide } from "../../schema.js";
import type { BrandTokens } from "../../tokens.js";

export interface RenderContext {
  post: Post;
  tokens: BrandTokens;
  /** cor de accent já resolvida em hex */
  accent: string;
  /** versão clara da cor de accent (para caixas/realces) */
  accentLight: string;
  /**
   * cor de accent segura para TEXTO pequeno (kicker, CTA, rótulos < 56px) em tema
   * claro. Igual ao accent para cores de contraste suficiente; para accents
   * restritos (cyan/red) cai para ink. Em tema escuro o template usa branco.
   */
  accentTextLight: string;
  /** índice 0-based do slide */
  index: number;
  total: number;
  isLast: boolean;
  width: number;
  height: number;
  debug: boolean;
  /** data URI da imagem de fundo, se o slide tiver background.type=image */
  bgImageDataUri?: string;
}

export interface SlideComponentProps {
  slide: Slide;
  ctx: RenderContext;
}

export type TemplateComponent = (props: SlideComponentProps) => JSX.Element;

export interface ThemeResolved {
  /** cor sólida de fundo (quando não for gradiente) */
  background: string;
  /** css de background-image (gradiente), quando aplicável */
  backgroundImage?: string;
  /** cor base de texto */
  text: string;
  /** cor de texto secundário/suave */
  textSoft: string;
  /** true em fundos gradiente (texto claro) */
  onDark: boolean;
  /** fonte de corpo da marca (tokens.fonts.body), para não hardcodar nos templates */
  fontBody: string;
}

/** em -> px, relativo a um tamanho de fonte (Satori é mais previsível com px). */
export function em(value: number, fontSize: number): number {
  return Math.round(value * fontSize * 100) / 100;
}

/**
 * Cor de um fio/barra de accent que precisa ter contraste com o fundo.
 * Em temas gradiente (fundo azul/roxo), o accent primário some, então usa
 * branco a 70%. Em temas claros, usa a própria cor de accent.
 */
export function fioColor(onDark: boolean, accent: string): string {
  return onDark ? "rgba(255,255,255,0.7)" : accent;
}

/** Resolve o tema do post em cores concretas de fundo e texto. */
export function resolveTheme(post: Post, tokens: BrandTokens): ThemeResolved {
  const fonts = { fontBody: tokens.fonts.body };
  switch (post.theme) {
    case "light-blue":
      return {
        ...fonts,
        background: tokens.colors.light,
        text: tokens.colors.ink,
        textSoft: tokens.colors.neutral600,
        onDark: false,
      };
    case "gradient-hero":
      return {
        ...fonts,
        background: tokens.colors.secondary,
        backgroundImage: tokens.gradients.hero,
        text: "#FFFFFF",
        textSoft: "rgba(255,255,255,0.8)",
        onDark: true,
      };
    case "gradient-zipagent":
      return {
        ...fonts,
        background: tokens.colors.zipagent,
        backgroundImage: tokens.gradients.zipagent,
        text: "#FFFFFF",
        textSoft: "rgba(255,255,255,0.8)",
        onDark: true,
      };
    case "solid-blue":
      // Fundo azul sólido (primary): texto branco, símbolo da versão p/ fundo escuro.
      return {
        ...fonts,
        background: tokens.colors.primary,
        text: "#FFFFFF",
        textSoft: "rgba(255,255,255,0.8)",
        onDark: true,
      };
    case "yellow":
      // Fundo amarelo (só fundo): texto ink, símbolo azul da versão p/ fundo claro.
      // O amarelo nunca é cor de texto nem de accent — só o fundo do slide.
      return {
        ...fonts,
        background: tokens.colors.yellow!,
        text: tokens.colors.ink,
        textSoft: tokens.colors.neutral600,
        onDark: false,
      };
    case "light":
    default:
      return {
        ...fonts,
        background: tokens.colors.bg,
        text: tokens.colors.ink,
        textSoft: tokens.colors.neutral600,
        onDark: false,
      };
  }
}

/** Tamanho do título de capa por contagem de caracteres. */
export function coverTitleSize(title: string): number {
  const len = title.length;
  if (len <= 40) return 96;
  if (len <= 70) return 84;
  return 72;
}

/** Quebra body em parágrafos (separador \n\n). */
export function paragraphs(body: string): string[] {
  return body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Quebra body em itens de lista (um por linha), para summary-list. */
export function lines(body: string): string[] {
  return body
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
}
