# CLAUDE.md — ig-pipeline-ziptime

Repositório **público**. Leia a regra de segredos antes de rodar qualquer comando.

## O que é

Pipeline multi-marca de criativos de Instagram: renderiza imagem única e carrossel a partir de JSON (Satori + resvg), com tokens de marca em `brands/<slug>.json`. Um Worker Cloudflare (`ig-assets`) serve N marcas pelo segmento `{brand}` — upload/entrega em R2 e guarda/renovação do token do Instagram por marca.

## Mapa

| Pasta/arquivo | Papel |
|---|---|
| `brands/<slug>.json` | Tokens da marca (cores, fontes, safeArea). `brands/<slug>/logo.svg` é a logo. |
| `src/schema.ts` | Zod schema do Post + variantes válidas. Gera o `SCHEMA.md`. |
| `src/render.ts` | Satori + resvg, loop de slides, grava `manifest.json`. |
| `src/tokens.ts` | Carrega `brands/<slug>.json`. |
| `src/upload.ts` · `src/publish.ts` · `src/token.ts` | Cliente do Worker: upload R2, publicação Graph API, cofre de token. |
| `src/templates/index.ts` | Registry `template -> componente`. |
| `src/templates/shared/` | `Page`, `Signature`, `SlideCounter`, `Kicker`, tipografia. |
| `src/templates/{quote-card,carousel-edu,carousel-list}/` | Os 3 templates. |
| `src/cli.ts` | CLI `ig-render` (ver Comandos). |
| `worker/` | Worker Cloudflare `ig-assets` (`src/index.ts`, `wrangler.toml`). |
| `posts/` | JSONs de exemplo + `.caption.txt`. `examples/invalid-variant.json` testa a validação. |
| `fonts/` | `.ttf` (gitignored; `pnpm fetch-fonts`). `out/`, `dist/` gitignored. |

## Comandos

CLI compilado: `node dist/cli.js <cmd>` (ou `pnpm ig-render <cmd>`; em dev, `pnpm dev <cmd>` via tsx).

| Comando | O que faz |
|---|---|
| `validate <post.json>` | Valida o JSON do post sem renderizar. |
| `render [files...] [-b marca] [-o out] [--all] [--debug]` | Renderiza post(s) para `out/<slug>/`. |
| `upload <slug> [-b marca] [-o out]` | Sobe os PNGs de `out/<slug>/` para o Worker; grava `manifest.urls[]`. |
| `pipeline <post.json> [--no-upload]` | validate + render + upload num comando (URLs no stdout). |
| `publish <slug> [--caption-file p] [--dry-run]` | Publica no Instagram via Graph API (imagem única ou carrossel). |
| `contact-sheet [-o out]` | Monta `out/contact-sheet.png` com todos os slides em grade. |
| `schema` | Regenera `SCHEMA.md` a partir do zod. |
| `token:set <brand>` | Cadastra/renova o token da marca no Worker (lê `.env`). |
| `token:status <brand>` | Status do token da marca (sem exibir o token). |

Outros: `pnpm fetch-fonts` (baixa as `.ttf`), `pnpm build` (`tsc` + `schema` + check-no-emoji; **quebra se faltar variante no SCHEMA.md**), `pnpm -C worker run deploy` (deploy do Worker via wrangler).

## Contratos

`SCHEMA.md` é o **contrato do Post JSON**, gerado de `src/schema.ts` e lido pelas skills `ig-*` via raw do GitHub. Forma do JSON, variantes por template e regras de render estão no `README.md`/`SCHEMA.md` — não duplicar aqui. **Mudou `src/schema.ts` → rode `pnpm build` e commite o `SCHEMA.md` junto.**

## Worker `ig-assets`

Endpoints (`worker/src/index.ts`):

| Método + rota | Auth |
|---|---|
| `PUT /upload/{brand}/{slug}/{file}` | Bearer `UPLOAD_TOKEN` |
| `POST /upload-json` | Bearer `UPLOAD_TOKEN` |
| `GET /{brand}/{slug}/{file}` | pública (cache imutável, CORS `*`) |
| `GET /health` · `GET /openapi.json` · `OPTIONS *` | pública |
| `PUT /token/{brand}` | Bearer `ADMIN_TOKEN` |
| `POST /token/{brand}/refresh` | Bearer `ADMIN_TOKEN` |
| `GET /token/{brand}` | Bearer `UPLOAD_TOKEN` ou `ADMIN_TOKEN` |
| `GET /token/{brand}/status` | Bearer `UPLOAD_TOKEN` ou `ADMIN_TOKEN` |

Cofre de token: sem Bearer → `401`; Bearer errado para a rota → `403`; marca inexistente → `404`. As rotas `/token` **nunca** entram no `/openapi.json` (a GPT Action não pode vê-las).

- **Bindings:** `BUCKET` (R2 `ig-assets`), `IG_TOKENS` (KV, chave = `{brand}`), var `PUBLIC_BASE`.
- **Secrets:** `UPLOAD_TOKEN`, `ADMIN_TOKEN` (`wrangler secret put`).
- **Cron:** `0 9 * * 1` (segunda, 06:00 BRT) → `scheduled()` renova o token de cada marca do KV.

## Segredos (regra dura)

Repo público. **O token do Instagram mora só no KV do Worker.** O `.env` (gitignored, nunca commitar `.env*`) serve só para **cadastrar marca** (`token:set`) e é limpo depois — `IG_ACCESS_TOKEN` não deve ficar lá parado. `ADMIN_TOKEN` vive apenas no `.env` local e no secret do Worker. **Nunca** `cat`/`echo` de segredo em log, stdout ou relatório; em teste, carregue em variável e mostre só o resultado (username, status HTTP, datas).

## Adicionar / cadastrar uma marca

1. Crie `brands/<slug>.json` (mesma forma de `brands/ziptime.json`) e `brands/<slug>/logo.svg`. Nenhum código muda; use `--brand <slug>`.
2. No `.env`: `IG_UPLOAD_ENDPOINT`, `IG_UPLOAD_TOKEN`, `IG_ADMIN_TOKEN` e, só para o cadastro, `IG_ACCESS_TOKEN` (token de longa duração) + `IG_USER_ID`.
3. `node dist/cli.js token:set <slug>` → grava no KV e já renova.
4. `node dist/cli.js token:status <slug>` → confira `username` e `expires_at`.
5. **Remova `IG_ACCESS_TOKEN` do `.env`** — a partir daí o Cron renova sozinho.

## Pegadinhas

- **Fontes gitignored:** rode `pnpm fetch-fonts` antes do primeiro render, senão `render` falha pedindo as `.ttf`.
- **Satori + `flex:1` exige largura explícita** no container (ver `templates/shared/components.tsx` e o fix "layout vertical fixo") — sem isso o layout vertical colapsa.
- **Primeiro slide é mais lento** (warm-up do Satori/resvg); a média por slide no CLI reflete isso.
- **`pnpm.onlyBuiltDependencies`** (`sharp`, `esbuild`) no `package.json` — sem isso o install não compila os binários.
- **Chave de upload leva hash de conteúdo** (`nome-<hash8>.png`) para furar o cache imutável do Worker; conteúdo igual → mesma chave.
- **wrangler não é global:** use `pnpm -C worker run deploy`/`dev` (ou `npx wrangler`).

## Fora do repo

O Notion do pipeline ([Guia para agentes](https://app.notion.com/p/404c88994aaa817bb868f3db67f8dc59)) é a fonte editorial e de configuração; as skills `ig-*` operam o pipeline. Regra de marca e conteúdo vivem lá — não duplicar aqui.
