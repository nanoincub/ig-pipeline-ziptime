import type { CSSProperties } from "react";
import type { SlideComponentProps, RenderContext, ThemeResolved } from "../shared/types.js";
import { resolveTheme, coverTitleSize, em, paragraphs, fioColor } from "../shared/types.js";
import { Page, Kicker, CtaButton } from "../shared/components.js";

/**
 * carousel-list — lista numerada.
 * cover: list-title-left | list-title-stack
 * body:  number-huge | number-badge | number-side
 * close: cta-simple | cta-save
 */
export function CarouselList({ slide, ctx }: SlideComponentProps): JSX.Element {
  const theme = resolveTheme(ctx.post, ctx.tokens);
  if (slide.role === "cover") return renderCover(slide, ctx, theme);
  if (slide.role === "close") return renderClose(slide, ctx, theme);
  return renderBody(slide, ctx, theme);
}

function titleStyle(ctx: RenderContext, theme: ThemeResolved, size: number): CSSProperties {
  return {
    display: "flex",
    fontFamily: ctx.tokens.fonts.display,
    fontWeight: 700,
    fontSize: size,
    lineHeight: 1.05,
    letterSpacing: em(-0.02, size),
    color: theme.text,
  };
}

function Body(props: { body?: string; theme: ThemeResolved; ctx: RenderContext }): JSX.Element | null {
  if (!props.body) return null;
  const ps = paragraphs(props.body);
  return (
    <div style={{ display: "flex", flexDirection: "column", marginTop: 24 }}>
      {ps.map((p, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            fontFamily: "Inter",
            fontWeight: 400,
            fontSize: 36,
            lineHeight: 1.35,
            color: props.theme.text,
            marginBottom: i < ps.length - 1 ? 20 : 0,
          }}
        >
          {p}
        </div>
      ))}
    </div>
  );
}

// ---------- cover ----------

function renderCover(slide: SlideComponentProps["slide"], ctx: RenderContext, theme: ThemeResolved): JSX.Element {
  const title = slide.title ?? "";
  const size = coverTitleSize(title);

  if (slide.variant === "list-title-stack") {
    // kicker grande empilhado + título, com a "contagem" em destaque
    return (
      <Page ctx={ctx} theme={theme} role={slide.role} contentStyle={{ justifyContent: "flex-start", alignItems: "flex-start" }}>
        {slide.kicker ? <Kicker text={slide.kicker} color={theme.onDark ? "#FFFFFF" : ctx.accent} style={{ marginTop: 20, marginBottom: 24 }} /> : null}
        {slide.highlight ? (
          <div style={{ display: "flex", fontFamily: ctx.tokens.fonts.display, fontWeight: 700, fontSize: 200, lineHeight: 0.95, color: ctx.accent, marginBottom: 8 }}>
            {slide.highlight}
          </div>
        ) : null}
        <div style={{ ...titleStyle(ctx, theme, size), textAlign: "left" }}>{title}</div>
      </Page>
    );
  }

  // list-title-left (default)
  return (
    <Page ctx={ctx} theme={theme} role={slide.role} contentStyle={{ justifyContent: "center", alignItems: "flex-start" }}>
      {slide.kicker ? <Kicker text={slide.kicker} color={theme.onDark ? "#FFFFFF" : ctx.accent} style={{ marginBottom: 28 }} /> : null}
      <div style={{ ...titleStyle(ctx, theme, size), textAlign: "left" }}>{title}</div>
      <div style={{ display: "flex", width: 160, height: 10, backgroundColor: fioColor(theme.onDark, ctx.accent), borderRadius: 6, marginTop: 44 }} />
    </Page>
  );
}

// ---------- body ----------

function renderBody(slide: SlideComponentProps["slide"], ctx: RenderContext, theme: ThemeResolved): JSX.Element {
  const num = slide.number != null ? String(slide.number) : "";
  // Topo fixo: o número/conteúdo começa na mesma altura em todos os body slides.
  const common = { justifyContent: "flex-start", alignItems: "flex-start", paddingTop: ctx.tokens.safeArea + 40 } as CSSProperties;
  const bodyTitle = (
    <div style={{ display: "flex", fontFamily: ctx.tokens.fonts.display, fontWeight: 600, fontSize: 56, lineHeight: 1.1, letterSpacing: em(-0.01, 56), color: theme.text }}>
      {slide.title ?? ""}
    </div>
  );

  if (slide.variant === "number-badge") {
    return (
      <Page ctx={ctx} theme={theme} role={slide.role} contentStyle={common}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            width: 128,
            height: 128,
            borderRadius: 64,
            backgroundColor: ctx.accent,
            color: "#FFFFFF",
            fontFamily: ctx.tokens.fonts.display,
            fontWeight: 700,
            fontSize: 64,
            marginBottom: 36,
          }}
        >
          {num}
        </div>
        {slide.kicker ? <Kicker text={slide.kicker} color={theme.onDark ? "#FFFFFF" : ctx.accent} style={{ marginBottom: 16 }} /> : null}
        {bodyTitle}
        <Body body={slide.body} theme={theme} ctx={ctx} />
      </Page>
    );
  }

  if (slide.variant === "number-side") {
    const rowWidth = ctx.width - ctx.tokens.safeArea * 2;
    return (
      <Page ctx={ctx} theme={theme} role={slide.role} contentStyle={common}>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", width: rowWidth }}>
          <div style={{ display: "flex", flexShrink: 0, fontFamily: ctx.tokens.fonts.display, fontWeight: 700, fontSize: 150, lineHeight: 0.9, color: ctx.accent, marginRight: 40 }}>
            {num}
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingTop: 12 }}>
            {slide.kicker ? <Kicker text={slide.kicker} color={theme.onDark ? "#FFFFFF" : ctx.accent} style={{ marginBottom: 16 }} /> : null}
            {bodyTitle}
            <Body body={slide.body} theme={theme} ctx={ctx} />
          </div>
        </div>
      </Page>
    );
  }

  // number-huge (default)
  return (
    <Page ctx={ctx} theme={theme} role={slide.role} contentStyle={common}>
      <div style={{ display: "flex", fontFamily: ctx.tokens.fonts.display, fontWeight: 700, fontSize: 180, lineHeight: 1, color: ctx.accent, marginBottom: 12 }}>
        {num}
      </div>
      {slide.kicker ? <Kicker text={slide.kicker} color={theme.onDark ? "#FFFFFF" : ctx.accent} style={{ marginBottom: 16 }} /> : null}
      {bodyTitle}
      <Body body={slide.body} theme={theme} ctx={ctx} />
    </Page>
  );
}

// ---------- close ----------

function renderClose(slide: SlideComponentProps["slide"], ctx: RenderContext, theme: ThemeResolved): JSX.Element {
  if (slide.variant === "cta-save") {
    return (
      <Page ctx={ctx} theme={theme} role={slide.role} contentStyle={{ justifyContent: "center", alignItems: "flex-start" }}>
        {slide.kicker ? <Kicker text={slide.kicker} color={theme.onDark ? "#FFFFFF" : ctx.accent} style={{ marginBottom: 24 }} /> : null}
        {slide.title ? (
          <div style={{ display: "flex", fontFamily: ctx.tokens.fonts.display, fontWeight: 700, fontSize: 68, lineHeight: 1.08, letterSpacing: em(-0.02, 68), color: theme.text, marginBottom: 40 }}>
            {slide.title}
          </div>
        ) : null}
        <CtaButton ctx={ctx} label={slide.cta ?? "Salve este post"} bookmark />
      </Page>
    );
  }

  // cta-simple (default)
  return (
    <Page ctx={ctx} theme={theme} role={slide.role} contentStyle={{ justifyContent: "center", alignItems: "flex-start" }}>
      {slide.kicker ? <Kicker text={slide.kicker} color={theme.onDark ? "#FFFFFF" : ctx.accent} style={{ marginBottom: 24 }} /> : null}
      {slide.title ? (
        <div style={{ display: "flex", fontFamily: ctx.tokens.fonts.display, fontWeight: 700, fontSize: 72, lineHeight: 1.06, letterSpacing: em(-0.02, 72), color: theme.text, marginBottom: 36 }}>
          {slide.title}
        </div>
      ) : null}
      {slide.cta ? (
        <div style={{ display: "flex", fontFamily: ctx.tokens.fonts.body, fontWeight: 600, fontSize: 40, color: theme.onDark ? "#FFFFFF" : ctx.accent }}>{slide.cta}</div>
      ) : null}
    </Page>
  );
}
