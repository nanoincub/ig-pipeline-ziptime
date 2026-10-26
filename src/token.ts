/**
 * Cliente do cofre de tokens do worker ig-assets.
 *
 * token:set   -> PUT  /token/{brand}         (Bearer IG_ADMIN_TOKEN), corpo {access_token, user_id}
 * token:status-> GET  /token/{brand}/status  (Bearer IG_UPLOAD_TOKEN ou IG_ADMIN_TOKEN)
 *
 * O token nunca é impresso: a tabela de status só mostra username, datas e last_error.
 */

export interface TokenStatus {
  brand: string;
  username: string | null;
  expires_at: string | null;
  refreshed_at: string | null;
  days_left: number | null;
  last_error: { code: string; message: string } | null;
}

/** Endpoint do worker (IG_UPLOAD_ENDPOINT), sem barra final. */
function endpointBase(): string {
  const e = (process.env.IG_UPLOAD_ENDPOINT ?? "").trim().replace(/\/+$/, "");
  if (!e) throw new Error("IG_UPLOAD_ENDPOINT ausente no .env (veja .env.example).");
  return e;
}

/**
 * Cadastra/atualiza o token da marca no worker. Lê IG_ACCESS_TOKEN, IG_USER_ID e
 * IG_ADMIN_TOKEN do ambiente (dotenv já carregado). Se algum faltar, lança listando quais.
 */
export async function setBrandToken(brand: string): Promise<TokenStatus> {
  const base = endpointBase();
  const admin = (process.env.IG_ADMIN_TOKEN ?? "").trim();
  const accessToken = (process.env.IG_ACCESS_TOKEN ?? "").trim();
  const userId = (process.env.IG_USER_ID ?? "").trim();

  const missing: string[] = [];
  if (!admin) missing.push("IG_ADMIN_TOKEN");
  if (!accessToken) missing.push("IG_ACCESS_TOKEN");
  if (!userId) missing.push("IG_USER_ID");
  if (missing.length) {
    throw new Error(`faltam variáveis no .env: ${missing.join(", ")} (veja .env.example).`);
  }

  let res: Response;
  try {
    res = await fetch(`${base}/token/${brand}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${admin}`, "content-type": "application/json" },
      body: JSON.stringify({ access_token: accessToken, user_id: userId }),
    });
  } catch (err) {
    throw new Error(`falha de rede em PUT /token/${brand}: ${(err as Error).message}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PUT /token/${brand} falhou: HTTP ${res.status} ${text}`);
  }
  return (await res.json()) as TokenStatus;
}

/** Lê o status do token da marca (sem o token). Aceita IG_UPLOAD_TOKEN ou IG_ADMIN_TOKEN. */
export async function getBrandStatus(brand: string): Promise<TokenStatus> {
  const base = endpointBase();
  const reader = (process.env.IG_UPLOAD_TOKEN ?? "").trim() || (process.env.IG_ADMIN_TOKEN ?? "").trim();
  if (!reader) throw new Error("IG_UPLOAD_TOKEN (ou IG_ADMIN_TOKEN) ausente no .env.");

  let res: Response;
  try {
    res = await fetch(`${base}/token/${brand}/status`, { headers: { authorization: `Bearer ${reader}` } });
  } catch (err) {
    throw new Error(`falha de rede em GET /token/${brand}/status: ${(err as Error).message}`);
  }
  if (res.status === 404) throw new Error(`marca "${brand}" não cadastrada no worker.`);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET /token/${brand}/status falhou: HTTP ${res.status} ${text}`);
  }
  return (await res.json()) as TokenStatus;
}

/** Formata o status como tabela de duas colunas. Nunca inclui o token. */
export function formatStatusTable(s: TokenStatus): string {
  const rows: [string, string][] = [
    ["brand", s.brand],
    ["username", s.username ?? "—"],
    ["expires_at", s.expires_at ?? "—"],
    ["days_left", s.days_left === null ? "—" : String(s.days_left)],
    ["refreshed_at", s.refreshed_at ?? "—"],
    ["last_error", s.last_error ? `${s.last_error.code}: ${s.last_error.message}` : "—"],
  ];
  const w = Math.max(...rows.map(([k]) => k.length));
  return rows.map(([k, v]) => `  ${k.padEnd(w)}  ${v}`).join("\n");
}
