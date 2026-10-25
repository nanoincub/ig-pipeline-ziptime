import type { CSSProperties } from "react";
import type { SlideComponentProps, RenderContext, ThemeResolved } from "../shared/types.js";
import { resolveTheme, coverTitleSize, em, paragraphs, lines, fioColor } from "../shared/types.js";
import { Page, Kicker, CtaButton } from "../shared/components.js";

/**
 * carousel-edu — carrossel explicativo.
 * cover:  title-big-left | title-center-blue-bg | title-with-number
 * body:   text-only | text-with-highlight | text-with-bar | quote | big-number
 * close:  cta-simple | cta-save | summary-list
 */
export function CarouselEdu({ slide, ctx }: SlideComponentProps): JSX.Element {
  const theme = resolveTheme(ctx.post, ctx.tokens);
  if (slide.role === "cover") return renderCover(slide, ctx, theme);
  if (slide.role === "close") return renderClose(slide, ctx, theme);
  return renderBody(slide, ctx, theme);
}

// ---------- cover ----------

function renderCover(slide: SlideComponentProps["slide"], ctx: RenderContext, theme: ThemeResolved): JSX.Element {
  const title = slide.title ?? "";
  const size = coverTitleSize(title);
  const titleStyle: CSSProperties = {
    display: "flex",
    fontFamily: ctx.tokens.fonts.display,
    fontWeight: 700,
    fontSize: size,
    lineHeight: 1.05,
    letterSpacing: em(-0.02, size),
    color: theme.text,
  };

  if (slide.variant === "title-center-blue-bg") {
    // Bloco sempre com contraste contra o fundo: em tema claro usa primary
    // (texto branco); em tema gradiente usa branco (texto ink).
    const blockColor = theme.onDark ? ctx.tokens.colors.bg : ctx.tokens.colors.primary;
    const onBlockText = theme.onDark ? ctx.tokens.colors.ink : "#FFFFFF";
    const onBlockKicker = theme.onDark ? ctx.tokens.colors.primary : "rgba(255,255,255,0.85)";
    return (
      <Page ctx={ctx} theme={theme} role={slide.role} contentStyle={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: ctx.width - ctx.tokens.safeArea * 2,
            backgroundColor: blockColor,
            borderRadius: ctx.tokens.radius,
            paddingTop: 72,
            paddingBottom: 72,
            paddingLeft: 56,
            paddingRight: 56,
          }}
        >
          {slide.kicker ? <Kicker text={slide.kicker} color={onBlockKicker} style={{ marginBottom: 28, justifyContent: "center" }} /> : null}
          <div style={{ ...titleStyle, color: onBlockText, textAlign: "center" }}>{title}</div>
        </div>
      </Page>
    );
  }

  if (slide.variant === "title-with-number") {
    return (
      <Page ctx={ctx} theme={theme} role={slide.role} contentStyle={{ justifyContent: "center", alignItems: "flex-start" }}>
        <div
          style={{
            display: "flex",
            fontFamily: ctx.tokens.fonts.display,
            fontWeight: 700,
            fontSize: 160,
            lineHeight: 1,
            color: ctx.accent,
            marginBottom: 12,
          }}
        >
          {slide.number != null ? String(slide.number) : "01"}
        </div>
        {slide.kicker ? <Kicker text={slide.kicker} color={theme.onDark ? "#FFFFFF" : ctx.accent} style={{ marginBottom: 20 }} /> : null}
        <div style={{ ...titleStyle, textAlign: "left" }}>{title}</div>
      </Page>
    );
  }

  // title-big-left (default)
  return (
    <Page ctx={ctx} theme={theme} role={slide.role} contentStyle={{ justifyContent: "flex-start", alignItems: "flex-start" }}>
      {slide.kicker ? <Kicker text={slide.kicker} color={theme.onDark ? "#FFFFFF" : ctx.accent} style={{ marginBottom: 28, marginTop: 24 }} /> : null}
      <div style={{ ...titleStyle, textAlign: "left" }}>{title}</div>
      <div style={{ display: "flex", width: 160, height: 10, backgroundColor: fioColor(theme.onDark, ctx.accent), borderRadius: 6, marginTop: 44 }} />
    </Page>
  );
}

// ---------- body ----------

function bodyTitleStyle(ctx: RenderContext, theme: ThemeResolved): CSSProperties {
  return {
    display: "flex",
    fontFamily: ctx.tokens.fonts.display,
    fontWeight: 600,
    fontSize: 56,
    lineHeight: 1.1,
    letterSpacing: em(-0.01, 56),
    color: theme.text,
    marginBottom: 32,
  };
}

function Paragraphs(props: { body?: string; theme: ThemeResolved; ctx: RenderContext }): JSX.Element | null {
  if (!props.body) return null;
  const ps = paragraphs(props.body);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
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
            marginBottom: i < ps.length - 1 ? 24 : 0,
          }}
        >
          {p}
        </div>
      ))}
    </div>
  );
}

function renderBody(slide: SlideComponentProps["slide"], ctx: RenderContext, theme: ThemeResolved): JSX.Element {
  // Alinhamento ao topo com padding fixo: kicker/título/corpo na mesma
  // coordenada Y em todos os slides de body, sem "pular" entre um e outro.
  const common = { justifyContent: "flex-start", alignItems: "flex-start", paddingTop: ctx.tokens.safeArea + 40 } as CSSProperties;

  if (slide.variant === "big-number") {
    const big = slide.highlight ?? (slide.number != null ? String(slide.number) : "");
    return (
      <Page ctx={ctx} theme={theme} role={slide.role} contentStyle={common}>
        {slide.kicker ? <Kicker text={slide.kicker} color={theme.onDark ? "#FFFFFF" : ctx.accent} style={{ marginBottom: 20 }} /> : null}
        <div style={{ display: "flex", fontFamily: ctx.tokens.fonts.display, fontWeight: 700, fontSize: 180, lineHeight: 1, color: ctx.accent, marginBottom: 24 }}>
          {big}
        </div>
        {slide.title ? <div style={bodyTitleStyle(ctx, theme)}>{slide.title}</div> : null}
        <Paragraphs body={slide.body} theme={theme} ctx={ctx} />
      </Page>
    );
  }

  if (slide.variant === "quote") {
    const q = slide.highlight ?? slide.body ?? "";
    return (
      <Page ctx={ctx} theme={theme} role={slide.role} contentStyle={common}>
        <div style={{ display: "flex", fontFamily: ctx.tokens.fonts.display, fontWeight: 700, fontSize: 140, lineHeight: 0.6, color: fioColor(theme.onDark, ctx.accent), marginBottom: 24 }}>“</div>
        <div
          style={{
            display: "flex",
            fontFamily: ctx.tokens.fonts.display,
            fontWeight: 600,
            fontSize: 60,
            lineHeight: 1.15,
            letterSpacing: em(-0.015, 60),
            color: theme.text,
          }}
        >
          {q}
        </div>
        {slide.source ? <div style={{ display: "flex", fontFamily: "Inter", fontWeight: 400, fontSize: 28, color: theme.textSoft, marginTop: 36 }}>{slide.source}</div> : null}
      </Page>
    );
  }

  if (slide.variant === "text-with-bar") {
    return (
      <Page ctx={ctx} theme={theme} role={slide.role} contentStyle={common}>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "stretch", width: ctx.width - ctx.tokens.safeArea * 2 }}>
          <div style={{ display: "flex", flexShrink: 0, width: 10, backgroundColor: ctx.accent, borderRadius: 6, marginRight: 36 }} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            {slide.kicker ? <Kicker text={slide.kicker} color={theme.onDark ? "#FFFFFF" : ctx.accent} style={{ marginBottom: 20 }} /> : null}
            {slide.title ? <div style={bodyTitleStyle(ctx, theme)}>{slide.title}</div> : null}
            <Paragraphs body={slide.body} theme={theme} ctx={ctx} />
          </div>
        </div>
      </Page>
    );
  }

  if (slide.variant === "text-with-highlight") {
    return (
      <Page ctx={ctx} theme={theme} role={slide.role} contentStyle={common}>
        {slide.kicker ? <Kicker text={slide.kicker} color={theme.onDark ? "#FFFFFF" : ctx.accent} style={{ marginBottom: 20 }} /> : null}
        {slide.title ? <div style={bodyTitleStyle(ctx, theme)}>{slide.title}</div> : null}
        {slide.highlight ? (
          <div
            style={{
              display: "flex",
              backgroundColor: theme.onDark ? "rgba(255,255,255,0.14)" : ctx.accentLight,
              color: theme.onDark ? "#FFFFFF" : ctx.accent,
              borderRadius: ctx.tokens.radius,
              paddingTop: 24,
              paddingBottom: 24,
              paddingLeft: 32,
              paddingRight: 32,
              fontFamily: ctx.tokens.fonts.display,
              fontWeight: 600,
              fontSize: 40,
              lineHeight: 1.2,
              marginBottom: 32,
            }}
          >
            {slide.highlight}
          </div>
        ) : null}
        <Paragraphs body={slide.body} theme={theme} ctx={ctx} />
      </Page>
    );
  }

  // text-only (default)
  return (
    <Page ctx={ctx} theme={theme} role={slide.role} contentStyle={common}>
      {slide.kicker ? <Kicker text={slide.kicker} color={theme.onDark ? "#FFFFFF" : ctx.accent} style={{ marginBottom: 20 }} /> : null}
      {slide.title ? <div style={bodyTitleStyle(ctx, theme)}>{slide.title}</div> : null}
      <Paragraphs body={slide.body} theme={theme} ctx={ctx} />
    </Page>
  );
}

// ---------- close ----------

function renderClose(slide: SlideComponentProps["slide"], ctx: RenderContext, theme: ThemeResolved): JSX.Element {
  if (slide.variant === "summary-list") {
    const items = slide.body ? lines(slide.body) : [];
    const rowWidth = ctx.width - ctx.tokens.safeArea * 2;
    return (
      <Page ctx={ctx} theme={theme} role={slide.role} contentStyle={{ justifyContent: "center", alignItems: "flex-start" }}>
        {slide.kicker ? <Kicker text={slide.kicker} color={theme.onDark ? "#FFFFFF" : ctx.accent} style={{ marginBottom: 20 }} /> : null}
        {slide.title ? <div style={bodyTitleStyle(ctx, theme)}>{slide.title}</div> : null}
        <div style={{ display: "flex", flexDirection: "column", width: rowWidth }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", width: rowWidth, marginBottom: 22 }}>
              <div style={{ display: "flex", flexShrink: 0, width: 14, height: 14, borderRadius: 7, backgroundColor: ctx.accent, marginTop: 16, marginRight: 24 }} />
              <div style={{ display: "flex", flex: 1, fontFamily: "Inter", fontWeight: 400, fontSize: 36, lineHeight: 1.3, color: theme.text }}>{it}</div>
            </div>
          ))}
        </div>
        {slide.cta ? <CtaButton ctx={ctx} label={slide.cta} bookmark style={{ marginTop: 40 }} /> : null}
      </Page>
    );
  }

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
