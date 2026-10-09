/**
 * Cliente mínimo da Google Ads API (REST). Autentica com um service account:
 * GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY (ou o JSON inteiro em GOOGLE_SA_JSON)
 * e o GOOGLE_ADS_DEVELOPER_TOKEN da MCC. Nada disso vai para o banco nem para
 * o navegador.
 *
 * Opcionais:
 *  - GOOGLE_ADS_LOGIN_CUSTOMER_ID: ID da MCC por onde as contas são acessadas.
 *  - GOOGLE_ADS_IMPERSONATE: e-mail do usuário do Workspace a ser representado
 *    (delegação de domínio) — o Google Ads não deixa service account comum
 *    entrar numa conta sem isso ou sem acesso concedido.
 *  - GOOGLE_ADS_API_VERSION: padrão v23.
 */
import { createSign } from "node:crypto";
import { weekRange } from "../meta/metrics";
import { bucketDaily, dailySpend, normalizePrivateKey, parseClientAccounts, type DailyRow, type GoogleAccount } from "./metrics";
import type { MetaWeek } from "../meta/metrics";

const VERSION = process.env.GOOGLE_ADS_API_VERSION || "v23";
const BASE = `https://googleads.googleapis.com/${VERSION}`;
const SCOPE = "https://www.googleapis.com/auth/adwords";

export class GoogleAdsError extends Error {}

type ServiceAccount = { email: string; key: string };

function serviceAccount(): ServiceAccount | null {
  const json = process.env.GOOGLE_SA_JSON;
  if (json) {
    try {
      const j = JSON.parse(json) as { client_email?: string; private_key?: string };
      const pem = j.private_key ? normalizePrivateKey(j.private_key) : null;
      if (j.client_email && pem) return { email: j.client_email, key: pem };
    } catch {
      /* JSON inválido: cai para o par de variáveis */
    }
  }
  const email = process.env.GOOGLE_SA_EMAIL;
  const key = process.env.GOOGLE_SA_PRIVATE_KEY;
  // Colada na Vercel a chave chega de formas diferentes (\n literal, aspas,
  // espaços no lugar das quebras): normalizePrivateKey remonta o PEM.
  const pem = key ? normalizePrivateKey(key) : null;
  return email && pem ? { email: email.trim(), key: pem } : null;
}

export const googleAdsConfigured = () => Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN && serviceAccount());

/**
 * Nomes das variáveis que ainda faltam (só os nomes, nunca os valores) — o
 * painel mostra isso em vez de um "não configurado" genérico.
 */
export function googleAdsMissing(): string[] {
  const missing: string[] = [];
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) missing.push("GOOGLE_ADS_DEVELOPER_TOKEN");
  if (!serviceAccount()) {
    if (process.env.GOOGLE_SA_JSON) missing.push("GOOGLE_SA_JSON (JSON inválido ou sem client_email/private_key)");
    else {
      if (!process.env.GOOGLE_SA_EMAIL) missing.push("GOOGLE_SA_EMAIL");
      if (!process.env.GOOGLE_SA_PRIVATE_KEY) missing.push("GOOGLE_SA_PRIVATE_KEY");
      else missing.push("GOOGLE_SA_PRIVATE_KEY (valor sem o bloco -----BEGIN PRIVATE KEY----- … -----END PRIVATE KEY-----)");
    }
  }
  return missing;
}

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const sa = serviceAccount();
  if (!sa) throw new GoogleAdsError("Credencial do Google não configurada (GOOGLE_SA_EMAIL e GOOGLE_SA_PRIVATE_KEY).");
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    iss: sa.email,
    scope: SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  if (process.env.GOOGLE_ADS_IMPERSONATE) claims.sub = process.env.GOOGLE_ADS_IMPERSONATE;
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64(claims)}`;
  let signature: string;
  try {
    signature = createSign("RSA-SHA256").update(unsigned).sign(sa.key, "base64url");
  } catch {
    throw new GoogleAdsError("Chave privada do service account inválida (GOOGLE_SA_PRIVATE_KEY).");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    const why = body.error_description ?? body.error ?? `HTTP ${res.status}`;
    throw new GoogleAdsError(
      body.error === "unauthorized_client"
        ? "O Workspace não liberou a delegação de domínio para esse service account (GOOGLE_ADS_IMPERSONATE)."
        : `Falha ao autenticar no Google: ${why}`,
    );
  }
  cached = { token: body.access_token, exp: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cached.token;
}

/** Códigos do Google Ads que a equipe precisa entender sem abrir o log. */
const FRIENDLY: Record<string, string> = {
  DEVELOPER_TOKEN_NOT_APPROVED: "O developer token ainda está em nível de teste: só acessa contas de teste. Peça o acesso básico na Central de API da MCC.",
  DEVELOPER_TOKEN_INVALID: "Developer token inválido (GOOGLE_ADS_DEVELOPER_TOKEN).",
  DEVELOPER_TOKEN_PARAMETER_MISSING: "Developer token não configurado (GOOGLE_ADS_DEVELOPER_TOKEN).",
  USER_PERMISSION_DENIED: "O service account (ou o usuário representado) não tem acesso a essa conta. Dê acesso à conta no Google Ads ou informe a MCC em GOOGLE_ADS_LOGIN_CUSTOMER_ID.",
  CUSTOMER_NOT_FOUND: "Conta não encontrada — confira o ID.",
  CUSTOMER_NOT_ENABLED: "Essa conta do Google Ads está desativada.",
  OAUTH_TOKEN_INVALID: "Credencial do Google recusada pelo Google Ads.",
  NOT_ADS_USER: "A credencial não é de um usuário do Google Ads.",
  PERMISSION_DENIED: "Sem permissão no Google Ads para essa conta.",
};

type ErrorBody = { error?: { message?: string; details?: { errors?: { errorCode?: Record<string, string>; message?: string }[] }[] } };

export function explainError(status: number, body: ErrorBody): string {
  const first = body.error?.details?.flatMap((d) => d.errors ?? [])[0];
  const code = first?.errorCode ? Object.values(first.errorCode)[0] : undefined;
  if (code && FRIENDLY[code]) return FRIENDLY[code];
  return first?.message ?? body.error?.message ?? `Google Ads respondeu ${status}`;
}

async function search<T>(customerId: string, query: string, pageToken?: string): Promise<{ results?: T[]; nextPageToken?: string }> {
  const token = await accessToken();
  const dev = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!dev) throw new GoogleAdsError(FRIENDLY.DEVELOPER_TOKEN_PARAMETER_MISSING);
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "developer-token": dev,
    "content-type": "application/json",
  };
  const login = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/\D/g, "");
  if (login) headers["login-customer-id"] = login;
  const res = await fetch(`${BASE}/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }),
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const body = (await res.json().catch(() => ({}))) as ErrorBody & { results?: T[]; nextPageToken?: string };
  if (!res.ok) throw new GoogleAdsError(explainError(res.status, body));
  return body;
}

export type GoogleCustomer = { id: string; name: string; currency: string | null; manager: boolean };

/** Dados da conta — também prova que a credencial enxerga esse ID. */
export async function getCustomer(customerId: string): Promise<GoogleCustomer> {
  type Raw = { customer?: { id?: string; descriptiveName?: string; currencyCode?: string; manager?: boolean } };
  const r = await search<Raw>(customerId, "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager FROM customer LIMIT 1");
  const c = r.results?.[0]?.customer;
  if (!c) throw new GoogleAdsError("Conta não encontrada — confira o ID.");
  return { id: customerId, name: c.descriptiveName || `Conta ${customerId}`, currency: c.currencyCode ?? null, manager: Boolean(c.manager) };
}

/**
 * Semanas-ritual (chave = sexta que fecha a semana) e verba por dia (os dias
 * fechados de `days`) de uma conta, numa consulta diária só cobrindo tudo.
 */
export async function fetchInsights(
  customerId: string,
  refs: string[],
  days: { since: string; until: string },
): Promise<{ weeks: Map<string, MetaWeek>; days: Map<string, number> }> {
  const since = [days.since, ...refs.map((r) => weekRange(r).since)].sort()[0];
  const until = [days.until, ...refs].sort().pop()!;
  const query =
    "SELECT segments.date, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.clicks, metrics.impressions " +
    `FROM customer WHERE segments.date BETWEEN '${since}' AND '${until}'`;
  const rows: DailyRow[] = [];
  let pageToken: string | undefined;
  for (let guard = 0; guard < 20; guard++) {
    const page = await search<DailyRow>(customerId, query, pageToken);
    rows.push(...(page.results ?? []));
    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }
  return { weeks: bucketDaily(rows, refs), days: dailySpend(rows, days.since, days.until) };
}

/**
 * Contas de anúncio dos clientes que a MCC enxerga (GOOGLE_ADS_LOGIN_CUSTOMER_ID).
 * É o equivalente do "todas as contas das BMs" do Meta: o painel lista e a
 * pessoa só escolhe qual conta é de qual cliente.
 */
export async function listClientAccounts(): Promise<GoogleAccount[]> {
  const mcc = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/\D/g, "");
  if (!mcc) {
    throw new GoogleAdsError("Informe o ID da MCC em GOOGLE_ADS_LOGIN_CUSTOMER_ID (só dígitos, ex.: 1244443600) para listar as contas dos clientes.");
  }
  const query =
    "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.status, customer_client.manager " +
    "FROM customer_client WHERE customer_client.status = 'ENABLED'";
  const rows: unknown[] = [];
  let pageToken: string | undefined;
  for (let guard = 0; guard < 20; guard++) {
    const page = await search<unknown>(mcc, query, pageToken);
    rows.push(...(page.results ?? []));
    pageToken = page.nextPageToken;
    if (!pageToken) break;
  }
  return parseClientAccounts(rows as Parameters<typeof parseClientAccounts>[0]);
}
