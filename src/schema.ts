import { z } from "zod";

/**
 * Schema do Post JSON consumido pelo renderizador.
 * A validação roda antes de qualquer render; erros reportam o caminho do campo.
 */

export const TEMPLATES = ["quote-card", "carousel-edu", "carousel-list"] as const;
export const SIZES = ["1080x1350", "1080x1080", "1080x1920"] as const;
export const THEMES = ["light", "light-blue", "gradient-hero", "gradient-zipagent", "solid-blue", "yellow"] as const;
export const ACCENTS = ["primary", "zipagent", "zipzap", "cyan", "red", "purple"] as const;
export const ROLES = ["cover", "body", "close"] as const;

/**
 * Variantes válidas por template, separadas por papel do slide.
 * Fonte única de verdade: usada tanto na validação quanto no registry de templates.
 */
export const VARIANTS: Record<
  (typeof TEMPLATES)[number],
  Partial<Record<(typeof ROLES)[number], string[]>>
> = {
  "quote-card": {
    // quote-card usa um único slide; papel livre, variantes abaixo.
    cover: ["centered-light", "left-ink-on-blue", "big-quote-marks", "split-color-block"],
    body: ["centered-light", "left-ink-on-blue", "big-quote-marks", "split-color-block"],
    close: ["centered-light", "left-ink-on-blue", "big-quote-marks", "split-color-block"],
  },
  "carousel-edu": {
    cover: ["title-big-left", "title-center-blue-bg", "title-with-number"],
    body: ["text-only", "text-with-highlight", "text-with-bar", "quote", "big-number"],
    close: ["cta-simple", "cta-save", "summary-list"],
  },
  "carousel-list": {
    cover: ["list-title-left", "list-title-stack"],
    body: ["number-huge", "number-badge", "number-side"],
    close: ["cta-simple", "cta-save"],
  },
};

const backgroundSchema = z.object({
  type: z.literal("image"),
  src: z.string().min(1),
  overlay: z.number().min(0).max(1).optional(),
});

export const slideSchema = z.object({
  role: z.enum(ROLES),
  variant: z.string().min(1),
  kicker: z.string().optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  highlight: z.string().optional(),
  number: z.number().optional(),
  source: z.string().optional(),
  cta: z.string().optional(),
  background: backgroundSchema.optional(),
});

export const postSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug deve ser kebab-case (ex: minha-frase-01)"),
    brand: z.string().min(1),
    template: z.enum(TEMPLATES),
    size: z.enum(SIZES).default("1080x1350"),
    theme: z.enum(THEMES).default("light"),
    accent: z.enum(ACCENTS).default("primary"),
    /** Sobrescreve o motivo visual padrão da marca no carousel-edu. */
    watermark: z.enum(["symbol", "none"]).optional(),
    signature: z
      .object({
        enabled: z.boolean().default(true),
        onlyLastSlide: z.boolean().default(true),
      })
      .default({ enabled: true, onlyLastSlide: true }),
    slides: z.array(slideSchema).min(1, "o post precisa de ao menos 1 slide"),
  })
  .superRefine((post, ctx) => {
    // Valida a variante de cada slide contra o template + papel.
    const allowedByRole = VARIANTS[post.template];
    post.slides.forEach((slide, i) => {
      const allowed = allowedByRole[slide.role] ?? [];
      if (!allowed.includes(slide.variant)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides", i, "variant"],
          message:
            `variante "${slide.variant}" inválida para ${post.template}/${slide.role}. ` +
            `Válidas: ${allowed.join(", ") || "(nenhuma para este papel)"}`,
        });
      }
    });
  });

export type Post = z.infer<typeof postSchema>;
export type Slide = z.infer<typeof slideSchema>;
export type PostInput = z.input<typeof postSchema>;

/** Conta palavras de um texto (para o aviso de body > 60 palavras). */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Valida e normaliza um Post. Lança erro com caminho legível em caso de falha.
 * Retorna também avisos (não-erros), como body com mais de 60 palavras.
 */
export function parsePost(raw: unknown): { post: Post; warnings: string[] } {
  const result = postSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "(raiz)";
      return `  • ${path}: ${issue.message}`;
    });
    throw new Error(`JSON do post inválido:\n${lines.join("\n")}`);
  }

  const post = result.data;
  const warnings: string[] = [];
  post.slides.forEach((slide, i) => {
    if (slide.body && wordCount(slide.body) > 60) {
      warnings.push(
        `slide ${i + 1} (${slide.role}/${slide.variant}): body com ${wordCount(slide.body)} palavras (> 60 recomendado).`
      );
    }
  });

  return { post, warnings };
}
