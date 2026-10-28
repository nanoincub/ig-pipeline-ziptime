import type { SlideComponentProps } from "../shared/types.js";
import { resolveTheme, coverTitleSize, em, fioColor } from "../shared/types.js";
import { Page, Kicker } from "../shared/components.js";

/**
 * quote-card — imagem única com uma frase em destaque.
 * Variantes: centered-light, left-ink-on-blue, big-quote-marks, split-color-block.
 * A frase vem de slide.highlight (preferido) ou slide.title.
 */
export function QuoteCard({ slide, ctx }: SlideComponentProps): JSX.Element {
  const theme = resolveTheme(ctx.post, ctx.tokens);
  const quote = slide.highlight ?? slide.title ?? "";
  const size = Math.min(coverTitleSize(quote), 88);

  const quoteStyle = {
    display: "flex",
    fontFamily: ctx.tokens.fonts.display,
    fontWeight: 700,
    fontSize: size,
    lineHeight: 1.1,
    letterSpacing: em(-0.02, size),
    color: theme.text,
  } as const;

  if (slide.variant === "left-ink-on-blue") {
    return (
      <Page ctx={ctx} theme={theme} role={slide.role} contentStyle={{ justifyContent: "center", alignItems: "flex-start" }}>
        <div style={{ display: "flex", width: 120, height: 10, backgroundColor: fioColor(theme.onDark, ctx.accent), borderRadius: 6, marginBottom: 40 }} />
        {slide.kicker ? <Kicker theme={theme} text={slide.kicker} color={theme.onDark ? "#FFFFFF" : ctx.accentTextLight} style={{ marginBottom: 28 }} /> : null}
        <div style={{ ...quoteStyle, textAlign: "left" }}>{quote}</div>
        {slide.source ? <SourceLine font={ctx.tokens.fonts.body} text={slide.source} color={theme.textSoft} marginTop={40} /> : null}
      </Page>
    );
  }

  if (slide.variant === "big-quote-marks") {
    return (
      <Page ctx={ctx} theme={theme} role={slide.role} contentStyle={{ justifyContent: "center", alignItems: "flex-start" }}>
        <div
          style={{
            display: "flex",
            fontFamily: ctx.tokens.fonts.display,
            fontWeight: 700,
            fontSize: 220,
            lineHeight: 0.7,
            color: fioColor(theme.onDark, ctx.accent),
            marginBottom: 8,
          }}
        >
          “
        </div>
        {slide.kicker ? <Kicker theme={theme} text={slide.kicker} color={theme.onDark ? "#FFFFFF" : ctx.accentTextLight} style={{ marginBottom: 20 }} /> : null}
        <div style={{ ...quoteStyle, textAlign: "left" }}>{quote}</div>
        {slide.source ? <SourceLine font={ctx.tokens.fonts.body} text={slide.source} color={theme.textSoft} marginTop={40} /> : null}
      </Page>
    );
  }

  if (slide.variant === "split-color-block") {
    return (
      <Page ctx={ctx} theme={theme} role={slide.role} contentStyle={{ padding: 0, paddingBottom: 0, flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            height: Math.round(ctx.height * 0.42),
            backgroundColor: ctx.accent,
            paddingLeft: ctx.tokens.safeArea,
            paddingRight: ctx.tokens.safeArea,
            paddingBottom: 48,
            paddingTop: ctx.tokens.safeArea,
          }}
        >
          {slide.kicker ? <Kicker theme={theme} text={slide.kicker} color="#FFFFFF" /> : null}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
            paddingLeft: ctx.tokens.safeArea,
            paddingRight: ctx.tokens.safeArea,
            paddingBottom: ctx.tokens.safeArea + 56,
          }}
        >
          <div style={{ ...quoteStyle, color: ctx.tokens.colors.ink, textAlign: "left" }}>{quote}</div>
          {slide.source ? <SourceLine font={ctx.tokens.fonts.body} text={slide.source} color={ctx.tokens.colors.neutral600} marginTop={40} /> : null}
        </div>
      </Page>
    );
  }

  // centered-light (default)
  return (
    <Page ctx={ctx} theme={theme} role={slide.role} contentStyle={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      {slide.kicker ? <Kicker theme={theme} text={slide.kicker} color={theme.onDark ? "#FFFFFF" : ctx.accentTextLight} style={{ marginBottom: 32, justifyContent: "center" }} /> : null}
      <div style={{ ...quoteStyle, textAlign: "center" }}>{quote}</div>
      {slide.source ? <SourceLine font={ctx.tokens.fonts.body} text={slide.source} color={theme.textSoft} marginTop={40} center /> : null}
    </Page>
  );
}

function SourceLine(props: { text: string; color: string; font: string; marginTop?: number; center?: boolean }): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: props.font,
        fontWeight: 400,
        fontSize: 28,
        color: props.color,
        marginTop: props.marginTop ?? 0,
        ...(props.center ? { justifyContent: "center" } : {}),
      }}
    >
      {props.text}
    </div>
  );
}
