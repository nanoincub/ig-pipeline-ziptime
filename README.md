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
pnpm build         # compila src/ -> dist/ e regenera SCHEMA.md
```

> **Build scripts (pnpm 10+):** por padrão o pnpm 10 bloqueia postinstall de
> dependências. `sharp` (binários de imagem) e `esbuild` (usado pelo `tsx`)
> precisam rodar o seu script de instalação, então estão declarados em
> `pnpm.onlyBuiltDependencies` no `package.json`. Isso faz o `pnpm install` rodar
> limpo e sem passo interativo em qualquer ambiente (inclusive containers), sem
> warning de build ignorado. `@resvg/resvg-js` usa binários pré-compilados e não
> precisa de build.

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

### Upload e chave versionada por hash

`upload <slug>` e `pipeline` sobem os PNGs para o Worker `ig-assets` e imprimem as
URLs públicas (uma por linha, só no stdout). Cada arquivo sobe como
`<slug>-<nn>-<hash8>.png`, onde `hash8` são os 8 primeiros caracteres do SHA256 do
PNG:

- conteúdo idêntico → **mesma chave** (idempotente);
- qualquer mudança no slide → **chave nova**.

O Worker serve com `Cache-Control: public, max-age=31536000, immutable`, então a
URL nunca precisa ser invalidada: re-renderizar um post com o mesmo slug gera URLs
novas apenas para os slides que mudaram. Versões antigas permanecem no bucket (sem
remoção; custo irrelevante). As URLs com hash ficam em `manifest.urls[]`.

Config via `.env` (veja `.env.example`): `IG_UPLOAD_ENDPOINT` e `IG_UPLOAD_TOKEN`.

```bash
node dist/cli.js upload lista-5-indicadores-semanais --brand ziptime
node dist/cli.js pipeline posts/lista-5-indicadores-semanais.json   # validate+render+upload
node dist/cli.js pipeline posts/lista-5-indicadores-semanais.json --no-upload
```

> O binário também é exposto como `ig-render` (campo `bin`), então
> `npx ig-render render ...` funciona quando o pacote está linkado/instalado.

### Publicação no Instagram (Graph API)

`publish <slug>` publica um post já renderizado **e com upload feito** (lê as
`manifest.urls[]`) no Instagram via Graph API. A versão da API fica em uma
constante única (`GRAPH_API_VERSION` em `src/publish.ts`), hoje **`v21.0`**.

A conta usa **"Instagram API with Instagram Login"**, cujo host é
**`graph.instagram.com`** (default). O host é configurável via `IG_GRAPH_HOST`
no `.env` (use `graph.facebook.com` para o caminho *Instagram API with Facebook
Login*).

- **Imagem única:** cria o container (`POST /{IG_USER_ID}/media` com `image_url`
  + `caption`), faz polling em `GET /{container}?fields=status_code` até
  `FINISHED` (até 60s, a cada 3s; `ERROR` aborta) e publica
  (`POST /{IG_USER_ID}/media_publish`).
- **Carrossel:** um container por imagem (`is_carousel_item=true`) com polling em
  cada um, depois o container pai (`media_type=CAROUSEL`, `children`), polling e
  `media_publish`. Máximo de 10 imagens (acima disso falha antes de qualquer chamada).
- A legenda vem de `--caption-file <path>` ou, por padrão, de
  `posts/<slug>.caption.txt` (texto puro, hashtags inclusas; até 2.200 caracteres
  e 30 hashtags).
- Saída no stdout em JSON de uma linha:
  `{"media_id":...,"permalink":...,"container_ids":[...]}`.
- `--dry-run` valida manifest, legenda e credenciais e imprime o plano de chamadas
  **sem publicar** (funciona sem token real).
- Em erro da Graph API, imprime `error.message` e `error.code` da Meta e sai com
  código 1, sem marcar nada como publicado.

Config via `.env` (veja `.env.example`): `IG_USER_ID`, `IG_ACCESS_TOKEN` e,
opcionalmente, `IG_GRAPH_HOST`.

**Renovação do token** (Instagram Login, tokens de longa duração expiram em ~60
dias): renove com
`GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=<token-atual>`
(o token precisa ter ao menos 24h de vida). A resposta traz um novo
`access_token` para gravar em `IG_ACCESS_TOKEN`.

```bash
node dist/cli.js publish carrossel-follow-up-whatsapp --dry-run
node dist/cli.js publish carrossel-follow-up-whatsapp --caption-file posts/minha-legenda.txt
```

### Token do Instagram por marca (cofre no worker)

O token de longa duração do Instagram **não fica mais em arquivo nem no Notion**:
mora no **KV do worker `ig-assets`** (namespace `IG_TOKENS`), uma entrada por
marca (`chave = {brand}`). O próprio worker **renova o token toda semana** por
Cron Trigger — **`0 9 * * 1`** (segunda, 06:00 BRT) — e as skills leem o token
direto pelo endpoint, sem nunca exibi-lo.

Cada entrada guarda `{access_token, user_id, username, expires_at, refreshed_at,
last_error}`. A renovação chama
`GET /refresh_access_token?grant_type=ig_refresh_token` em `graph.instagram.com`,
valida o token novo com `?fields=username` e grava `expires_at = agora +
expires_in`. Em qualquer falha, **mantém o token anterior** e registra `last_error`
(código + mensagem, sem o token).

**Endpoints** (no worker; **não** aparecem no `/openapi.json`):

| Método + rota | Auth | Devolve |
|---|---|---|
| `PUT /token/{brand}` | Bearer `ADMIN_TOKEN` | cadastra/atualiza (corpo `{access_token, user_id}`), valida e já renova |
| `POST /token/{brand}/refresh` | Bearer `ADMIN_TOKEN` | força a renovação |
| `GET /token/{brand}` | Bearer `UPLOAD_TOKEN` ou `ADMIN_TOKEN` | `{access_token, user_id, expires_at}` |
| `GET /token/{brand}/status` | Bearer `UPLOAD_TOKEN` ou `ADMIN_TOKEN` | status **sem token** (`username`, `expires_at`, `days_left`, `last_error`…) |

Sem Bearer → `401`. Bearer errado para a rota → `403`. Marca inexistente → `404`.

**CLI:**

```bash
# cadastra/renova o token da marca (lê IG_ACCESS_TOKEN, IG_USER_ID, IG_ADMIN_TOKEN do .env)
node dist/cli.js token:set ziptime

# status do token (expiração, dias restantes, última renovação) — nunca mostra o token
node dist/cli.js token:status ziptime
```

**Clonar para uma marca nova:**

1. Copie `.env.example` para `.env` e preencha `IG_UPLOAD_ENDPOINT`,
   `IG_UPLOAD_TOKEN`, `IG_ADMIN_TOKEN` (= secret `ADMIN_TOKEN` do worker) e, para a
   marca a cadastrar, `IG_USER_ID` + `IG_ACCESS_TOKEN` (token de longa duração,
   obtido via Instagram Login).
2. Rode `node dist/cli.js token:set <brand>`. A partir daí o Cron renova sozinho;
   acompanhe com `token:status <brand>`.

> O `ADMIN_TOKEN` do worker é gerado com `openssl rand -hex 32` e gravado com
> `wrangler secret put ADMIN_TOKEN` (nunca versionado). Detalhes do worker em
> [`worker/README.md`](worker/README.md).

## Formato do Post JSON

```jsonc
{
  "slug": "minha-pauta",              // kebab-case, nome base dos arquivos
  "brand": "ziptime",
  "template": "quote-card",           // quote-card | carousel-edu | carousel-list
  "size": "1080x1350",                // default; também 1080x1080, 1080x1920
  "theme": "light",                   // light | light-blue | gradient-hero | gradient-zipagent
  "accent": "primary",                // primary | zipagent | zipzap
  "watermark": "symbol",              // symbol | none; sobrescreve o padrão da marca no carousel-edu
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
- No `carousel-edu`, marcas com `templateDefaults.carouselEdu.symbolWatermark=true`
  exibem o símbolo oficial ampliado e recortado nos temas claros. O Post pode
  definir `watermark: "none"` para desligar ou `watermark: "symbol"` para ligar.
  A marca d'água fica atrás do texto e não aparece sobre imagem de fundo.
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
  publish.ts                 publicação no Instagram via Graph API
  cli.ts                     comandos validate / render / upload / pipeline / publish / contact-sheet / schema
  templates/
    index.ts                 registry slug -> componente
    shared/                  Page, Signature, SlideCounter, Kicker, tipografia
    quote-card/  carousel-edu/  carousel-list/
out/                          saída (gitignored)
```

## Adicionar uma marca

Crie `brands/<slug>.json` com a mesma forma de `brands/ziptime.json` e passe
`--brand <slug>`. Nenhum código muda.
