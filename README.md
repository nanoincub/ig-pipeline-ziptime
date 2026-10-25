# ig-pipeline

Renderizador de criativos de Instagram (imagem única e carrossel) a partir de um
JSON produzido por agente de IA, usando componentes React e tokens de marca.

Hoje a marca é a **Ziptime**; o repo suporta N marcas trocando só o arquivo de
tokens em `brands/<slug>.json`. Os mesmos componentes viram composições Remotion
mais tarde, por isso o render usa apenas o subconjunto de CSS que o **Satori**
entende (flexbox, sem grid, sem `position: sticky`, sem pseudo-elementos).

## Stack

- Node 20+, TypeScript, pnpm
- [`satori`](https://github.com/vercel/satori) (React → SVG) +
  [`@resvg/resvg-js`](https://github.com/yisibl/resvg-js) (SVG → PNG). Sem
  Playwright, Puppeteer ou Chromium.
- `sharp` para a contact sheet
- CLI com `commander`, validação com `zod`
- Fontes **Sora** (600, 700) e **Inter** (400, 600) como `.ttf` em `fonts/`
  (gitignored), baixadas do Google Fonts via `scripts/fetch-fonts.sh`.

## Setup

```bash
pnpm install
pnpm fetch-fonts   # baixa as .ttf para fonts/
pnpm build         # compila src/ -> dist/
```

## Uso

```bash
# valida um JSON sem renderizar
node dist/cli.js validate posts/frase-crm-que-o-time-usa.json

# renderiza um post (ou vários arquivos / glob)
node dist/cli.js render posts/frase-crm-que-o-time-usa.json --brand ziptime --out out/

# renderiza todos os posts de posts/
node dist/cli.js render --all --brand ziptime --out out/

# modo debug: desenha a zona segura, grava em out/debug/
node dist/cli.js render --all --brand ziptime --out out/ --debug

# monta out/contact-sheet.png com todos os slides em grade
node dist/cli.js contact-sheet --out out/
```

Saída: `out/<slug>/<slug>-<nn>.png` (1080x1350 por padrão) e
`out/<slug>/manifest.json` com arquivos, dimensões, template e variantes.

> O binário também é exposto como `ig-render` (campo `bin`), então
> `npx ig-render render ...` funciona quando o pacote está linkado/instalado.

## Formato do Post JSON

```jsonc
{
  "slug": "minha-pauta",              // kebab-case, nome base dos arquivos
  "brand": "ziptime",
  "template": "quote-card",           // quote-card | carousel-edu | carousel-list
  "size": "1080x1350",                // default; também 1080x1080, 1080x1920
  "theme": "light",                   // light | light-blue | gradient-hero | gradient-zipagent
  "accent": "primary",                // primary | zipagent | zipzap
  "signature": { "enabled": true, "onlyLastSlide": true },
  "slides": [
    {
      "role": "cover",                // cover | body | close
      "variant": "title-big-left",
      "kicker": "FOLLOW-UP",
      "title": "...",
      "body": "parágrafo 1\n\nparágrafo 2",
      "highlight": "frase ou número",
      "number": 1,
      "source": "fonte do dado",
      "cta": "chamada final",
      "background": { "type": "image", "src": "./bg.jpg", "overlay": 0.45 }
    }
  ]
}
```

### Variantes por template

| template        | cover                                                   | body                                                       | close                               |
| --------------- | ------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------- |
| `quote-card`    | `centered-light`, `left-ink-on-blue`, `big-quote-marks`, `split-color-block` (slide único) | — | — |
| `carousel-edu`  | `title-big-left`, `title-center-blue-bg`, `title-with-number` | `text-only`, `text-with-highlight`, `text-with-bar`, `quote`, `big-number` | `cta-simple`, `cta-save`, `summary-list` |
| `carousel-list` | `list-title-left`, `list-title-stack`                   | `number-huge`, `number-badge`, `number-side`               | `cta-simple`, `cta-save`            |

`summary-list` usa `body` como itens separados por quebra de linha.

## Regras de render

- Zona segura de `safeArea` px (80 no Ziptime) em todos os lados.
- Título de capa: Sora 700, auto-shrink por nº de caracteres (≤40 → 96px, ≤70 →
  84px, senão 72px), tracking -0.02em, line-height 1.05.
- Título de corpo: Sora 600 56px. Corpo: Inter 400 36px, line-height 1.35.
- Número gigante: Sora 700 180px na cor de accent.
- Kicker: Inter 600 24px uppercase, tracking 0.08em, na cor de accent.
- Assinatura no canto inferior direito; contador `n/total` no inferior esquerdo
  dos carrosséis (exceto na capa).
- `body` acima de 60 palavras gera **aviso** (não erro).

## Estrutura

```
brands/ziptime.json          tokens da marca
fonts/                        .ttf (gitignored, ver scripts/fetch-fonts.sh)
posts/                        JSONs de exemplo
examples/invalid-variant.json caso inválido para testar a validação
src/
  schema.ts                  zod schema do Post + variantes válidas
  tokens.ts                  carrega brands/<slug>.json
  render.ts                  satori + resvg, loop de slides, manifest
  contact-sheet.ts           grade de inspeção + inspeção de PNG
  cli.ts                     comandos validate / render / contact-sheet
  templates/
    index.ts                 registry slug -> componente
    shared/                  Page, Signature, SlideCounter, Kicker, tipografia
    quote-card/  carousel-edu/  carousel-list/
out/                          saída (gitignored)
```

## Adicionar uma marca

Crie `brands/<slug>.json` com a mesma forma de `brands/ziptime.json` e passe
`--brand <slug>`. Nenhum código muda.
