import type { ReactNode, CSSProperties } from "react";
import type { RenderContext, ThemeResolved } from "./types.js";
import type { LogoData } from "../../tokens.js";
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
  const sig = ctx.tokens.signature;
  // Assinatura usa o símbolo (compacto): branco no fundo escuro/gradiente, azul no
  // claro. logo/logoOnDark seguem resolvidos no contexto para uso futuro em layout.
  const mark = theme.onDark ? sig.symbolOnDarkData ?? sig.symbolData : sig.symbolData;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        position: "absolute",
        bottom: sa,
        right: sa,
        fontFamily: ctx.tokens.fonts.display,
        fontWeight: 600,
        fontSize: 26,
        color: theme.onDark ? "rgba(255,255,255,0.8)" : theme.textSoft,
      }}
    >
      {mark ? <LogoMark logo={mark} height={28} /> : null}
      <div style={{ display: "flex" }}>{sig.text}</div>
    </div>
  );
}

/** Logo da marca como SVG inline, preservando o paint nativo (fill/stroke) do arquivo. */
function LogoMark(props: { logo: LogoData; height: number }): JSX.Element {
  const [, , vbW, vbH] = props.logo.viewBox.split(/\s+/).map(Number);
  const ratio = vbW && vbH ? vbW / vbH : 1;
  const width = Math.round(props.height * ratio);
  return (
    <svg
      width={width}
      height={props.height}
      viewBox={props.logo.viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ marginRight: 12 }}
    >
      {props.logo.paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill} stroke={p.stroke} strokeWidth={p.strokeWidth} />
      ))}
    </svg>
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
        color: theme.onDark ? "rgba(255,255,255,0.8)" : theme.textSoft,
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
export function Kicker(props: { theme: ThemeResolved; text: string; color: string; style?: CSSProperties }): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: props.theme.fontBody,
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

/**
 * Número grande de display. A cor vem de `ctx.numberColor` (ink quando o accent é
 * superfície ou no tema yellow; senão o accent). Para accents-superfície (ciano)
 * pinta uma marca-texto `ctx.numberSurface` atrás da metade inferior do glifo, com
 * o radius da marca. Sem superfície, renderiza um único <div> idêntico ao anterior
 * (mantém o render dos posts existentes byte-a-byte). `style` leva margens/flexShrink.
 */
export function BigNumber(props: {
  ctx: RenderContext;
  value: string;
  fontSize: number;
  lineHeight: number;
  style?: CSSProperties;
}): JSX.Element {
  const { ctx } = props;
  const numStyle: CSSProperties = {
    display: "flex",
    fontFamily: ctx.tokens.fonts.display,
    fontWeight: 700,
    fontSize: props.fontSize,
    lineHeight: props.lineHeight,
    color: ctx.numberColor,
  };
  if (!ctx.numberSurface) {
    return <div style={{ ...numStyle, ...props.style }}>{props.value}</div>;
  }
  return (
    <div style={{ display: "flex", position: "relative", ...props.style }}>
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          right: 0,
          bottom: Math.round(props.fontSize * 0.08),
          height: Math.round(props.fontSize * 0.42),
          backgroundColor: ctx.numberSurface,
          borderRadius: Math.min(ctx.tokens.radius, 16),
        }}
      />
      <div style={{ ...numStyle, position: "relative" }}>{props.value}</div>
    </div>
  );
}

/**
 * Ícone de bookmark como SVG inline (Satori renderiza <svg>/<path> nativamente;
 * sem emoji, sem <img> aninhado). Traço 2px na cor informada.
 */
export function BookmarkIcon(props: { color: string; size?: number }): JSX.Element {
  const size = props.size ?? 36;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6 3h12a1 1 0 0 1 1 1v17l-7-5-7 5V4a1 1 0 0 1 1-1z"
        stroke={props.color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Botão de CTA no estilo cta-save: pílula na cor de accent, texto branco. */
export function CtaButton(props: { ctx: RenderContext; label: string; bookmark?: boolean; style?: CSSProperties }): JSX.Element {
  const { ctx, label, bookmark, style } = props;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        maxWidth: ctx.width - ctx.tokens.safeArea * 2,
        backgroundColor: ctx.accent,
        color: ctx.onAccentText,
        borderRadius: ctx.tokens.radius,
        paddingTop: 28,
        paddingBottom: 28,
        paddingLeft: 40,
        paddingRight: 40,
        ...style,
      }}
    >
      {bookmark ? (
        <div style={{ display: "flex", flexShrink: 0, marginRight: 18 }}>
          {/* mesma cor do rótulo (branco na pílula de accent; ink quando o accent é superfície). */}
          <BookmarkIcon color={ctx.onAccentText} size={38} />
        </div>
      ) : null}
      <div style={{ display: "flex", fontFamily: ctx.tokens.fonts.display, fontWeight: 600, fontSize: 38 }}>{label}</div>
    </div>
  );
}
