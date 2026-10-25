import type { TemplateComponent } from "./shared/types.js";
import { QuoteCard } from "./quote-card/index.js";
import { CarouselEdu } from "./carousel-edu/index.js";
import { CarouselList } from "./carousel-list/index.js";

/** slug do template -> componente que renderiza um slide. */
export const TEMPLATE_REGISTRY: Record<string, TemplateComponent> = {
  "quote-card": QuoteCard,
  "carousel-edu": CarouselEdu,
  "carousel-list": CarouselList,
};

export function getTemplate(slug: string): TemplateComponent {
  const tpl = TEMPLATE_REGISTRY[slug];
  if (!tpl) throw new Error(`template "${slug}" não registrado`);
  return tpl;
}
