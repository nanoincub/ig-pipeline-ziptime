import type { ReactNode, CSSProperties } from "react";
import type { RenderContext, ThemeResolved } from "./types.js";
import { em } from "./types.js";

/**
 * Moldura de todo slide: fundo (cor ou gradiente), zona segura, assinatura,
 * contador de slide e, em modo debug, o retângulo da zona segura.
 */
export function Page(props: {
  ctx: RenderContext;
  theme: ThemeResolved;
  role: string;
  contentStyle?: CSSProperties;
  children: ReactNode;
}): JSX.Element {
  const { ctx, theme, role, contentStyle, children } = props;
  const { tokens, post } = ctx;
  const sa = tokens.safeArea;

  const showSignature =
    post.signature.enabled && (!post.signature.onlyLastSlide || ctx.isLast);
  const showCounter = ctx.total > 1 && role !== "cover";
  const bottomReserve = showSignature || showCounter ? sa + 56 : sa;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        position: "relative",
        width: ctx.width,
        height: ctx.height,
        backgroundColor: theme.background,
        ...(theme.backgroundImage ? { backgroundImage: theme.backgroundImage } : {}),
        color: theme.text,
        fontFamily: tokens.fonts.body,
      }}
    >
      {ctx.bgImageDataUri ? (
        <img
          src={ctx.bgImageDataUri}
          width={ctx.width}
          height={ctx.height}
          style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }}
        />
      ) : null}
      {ctx.bgImageDataUri && ctx.width ? (
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            width: ctx.width,
            height: ctx.height,
            backgroundColor: `rgba(6,46,96,${bgOverlay(ctx)})`,
          }}
        />
      ) : null}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          paddingTop: sa,
          paddingLeft: sa,
          paddingRight: sa,
          paddingBottom: bottomReserve,
          ...contentStyle,
        }}
      >
        {children}
      </div>

      {showSignature ? <Signature ctx={ctx} theme={theme} /> : null}
      {showCounter ? <SlideCounter ctx={ctx} theme={theme} /> : null}
      {ctx.debug ? <DebugSafeArea sa={sa} ctx={ctx} /> : null}
    </div>
  );
}

function bgOverlay(ctx: RenderContext): number {
  const bg = ctx.post.slides[ctx.index]?.background;
  return bg?.overlay ?? 0.45;
}

export function Signature(props: { ctx: RenderContext; theme: ThemeResolved }): JSX.Element {
  const { ctx, theme } = props;
  const sa = ctx.tokens.safeArea;
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        bottom: sa,
        right: sa,
        fontFamily: ctx.tokens.fonts.display,
        fontWeight: 600,
        fontSize: 26,
        color: theme.onDark ? "rgba(255,255,255,0.8)" : ctx.tokens.colors.neutral600,
      }}
    >
      {ctx.tokens.signature.text}
    </div>
  );
}

export function SlideCounter(props: { ctx: RenderContext; theme: ThemeResolved }): JSX.Element {
  const { ctx, theme } = props;
  const sa = ctx.tokens.safeArea;
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        bottom: sa,
        left: sa,
        fontFamily: ctx.tokens.fonts.body,
        fontWeight: 400,
        fontSize: 24,
        color: theme.onDark ? "rgba(255,255,255,0.8)" : ctx.tokens.colors.neutral600,
      }}
    >
      {ctx.index + 1}/{ctx.total}
    </div>
  );
}

function DebugSafeArea(props: { sa: number; ctx: RenderContext }): JSX.Element {
  const { sa, ctx } = props;
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        top: sa,
        left: sa,
        width: ctx.width - sa * 2,
        height: ctx.height - sa * 2,
        border: "3px solid #EF4444",
      }}
    />
  );
}

/** Rótulo pequeno acima do título. */
export function Kicker(props: { text: string; color: string; style?: CSSProperties }): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: "Inter",
        fontWeight: 600,
        fontSize: 24,
        letterSpacing: em(0.08, 24),
        textTransform: "uppercase",
        color: props.color,
        ...props.style,
      }}
    >
      {props.text}
    </div>
  );
}
