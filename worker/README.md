# ig-assets — Worker Cloudflare

Upload autenticado e entrega pública de criativos em um bucket R2.

## Rotas

| Método + rota | Auth | Descrição |
|---|---|---|
| `PUT /upload/{brand}/{slug}/{file}` | Bearer | Grava o corpo **binário** no bucket. |
| `POST /upload-json` | Bearer | Grava um arquivo enviado em **JSON base64** (para GPT Actions). |
| `GET /openapi.json` | pública | Spec OpenAPI 3.1 para importar na GPT Action. |
| `GET /{brand}/{slug}/{file}` | pública | Serve o arquivo (cache imutável, CORS `*`). |
| `GET /health` | pública | `200 ok`. |
| `OPTIONS *` | pública | Preflight CORS (`*`, métodos PUT/POST/GET, headers `Authorization`/`Content-Type`). |

### Cofre de tokens do Instagram por marca

Tokens de longa duração do Instagram guardados no KV `IG_TOKENS` (chave = `{brand}`),
renovados automaticamente pelo `scheduled()` via Cron **`0 9 * * 1`** (segunda, 06:00 BRT).
Estas rotas **nunca** aparecem no `/openapi.json`.

| Método + rota | Auth | Descrição |
|---|---|---|
| `PUT /token/{brand}` | Bearer `ADMIN_TOKEN` | Cadastra/atualiza (`{access_token, user_id}`), valida com `?fields=username` e já renova. |
| `POST /token/{brand}/refresh` | Bearer `ADMIN_TOKEN` | Força a renovação. |
| `GET /token/{brand}` | Bearer `UPLOAD_TOKEN` ou `ADMIN_TOKEN` | `{access_token, user_id, expires_at}`. |
| `GET /token/{brand}/status` | Bearer `UPLOAD_TOKEN` ou `ADMIN_TOKEN` | Status **sem token** (`username`, `expires_at`, `days_left`, `refreshed_at`, `last_error`). |

Sem Bearer → `401`. Bearer errado para a rota → `403`. Marca inexistente → `404`.
Em falha de renovação, o token anterior é mantido e `last_error` (código + mensagem,
sem token) é gravado. Fluxo de uso e CLI (`token:set` / `token:status`) no README raiz.

`brand` e `slug` seguem `^[a-z0-9][a-z0-9-]*$`; `file` deve terminar em `.png`, `.jpg` ou `.mp4`.
Tipos aceitos: `image/png`, `image/jpeg`, `video/mp4`. Limite de **25 MB** (binário no PUT, já decodificado no `/upload-json`).

## Deploy

```bash
cd worker
pnpm install
pnpm run deploy        # wrangler deploy
```

Segredos necessários (não versionados):

```bash
wrangler secret put UPLOAD_TOKEN          # upload e leitura de token/status
openssl rand -hex 32 | wrangler secret put ADMIN_TOKEN   # administração do cofre de tokens
```

O binding KV `IG_TOKENS` e o Cron `0 9 * * 1` já estão no `wrangler.toml`. Para uma
conta nova, crie o namespace com `wrangler kv namespace create IG_TOKENS` e ajuste o `id`.

## `POST /upload-json`

Body JSON:

```json
{
  "brand": "ziptime",
  "slug": "meu-post",
  "file": "capa.png",
  "content_type": "image/png",
  "data_base64": "iVBORw0KGgoAAAANSUhEUgAA..."
}
```

Resposta `200`:

```json
{ "url": "https://.../ziptime/meu-post/capa.png", "key": "ziptime/meu-post/capa.png", "size": 12345 }
```

Erros (JSON `{ "error": ... }`): `400` (campos inválidos ou base64 malformado), `401` (token ausente/errado),
`413` (> 25 MB), `415` (`content_type` não suportado).

### Exemplo de curl

```bash
BASE="https://ig-assets.desenvolvimento-2bb.workers.dev"
TOKEN="seu-upload-token"

# gera o base64 de um PNG local e monta o JSON
B64=$(base64 -i capa.png)
curl -sS -X POST "$BASE/upload-json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"brand\":\"ziptime\",\"slug\":\"meu-post\",\"file\":\"capa.png\",\"content_type\":\"image/png\",\"data_base64\":\"$B64\"}"

# confere o tipo servido
curl -I "$BASE/ziptime/meu-post/capa.png"
```

## Configurar a GPT Action (ChatGPT)

1. No builder do GPT, abra **Actions → Create new action**.
2. Em **Schema**, clique em **Import from URL** e cole `https://<seu-host>/openapi.json`
   (ou copie o JSON retornado por essa rota e cole no editor de schema).
3. Em **Authentication**, escolha **API Key** → **Auth Type: Bearer** e informe o valor do `UPLOAD_TOKEN`.
   O ChatGPT envia o header `Authorization: Bearer <token>` automaticamente.
4. Salve. A action expõe a operação `uploadJson`; peça ao GPT para enviar o arquivo em base64
   com `brand`, `slug`, `file` e `content_type`, e ele recebe de volta a `url` pública.

> As Actions do ChatGPT não transmitem binário puro de forma confiável — por isso o upload é feito
> via `/upload-json` (base64), e não pelo `PUT /upload/...`.
