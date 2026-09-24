/**
 * Cliente mínimo da Graph API da Meta (Marketing API). Usa o token do usuário
 * de sistema da unidade — com acesso a todas as BMs — em META_ACCESS_TOKEN.
 * O token nunca vai para o banco nem para o navegador.
 */
import { EMPTY_WEEK, parseInsight, weekRange, type InsightRow, type MetaWeek } from "./metrics";

const VERSION = process.env.META_GRAPH_VERSION || "v23.0";
const BASE = `https://graph.facebook.com/${VERSION}`;

export const metaConfigured = () => Boolean(process.env.META_ACCESS_TOKEN);

export class MetaError extends Error {}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new MetaError("META_ACCESS_TOKEN não configurado.");
  const url = path.startsWith("http") ? new URL(path) : new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (!url.searchParams.has("access_token")) url.searchParams.set("access_token", token);
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok || body.error) {
    throw new MetaError(body.error?.message ?? `Graph API respondeu ${res.status}`);
  }
  return body;
}

type Page<T> = { data: T[]; paging?: { next?: string } };

export type AdAccount = {
  id: string; // act_…
  name: string;
  currency: string;
  status: number;
  business: string | null;
};

/** Todas as contas de anúncio que o token enxerga, em todas as BMs. */
export async function listAdAccounts(): Promise<AdAccount[]> {
  type Raw = {
    id: string;
    name: string;
    currency: string;
    account_status: number;
    business?: { name?: string };
  };
  const out: AdAccount[] = [];
  let page = await get<Page<Raw>>("me/adaccounts", {
    fields: "name,currency,account_status,business{name}",
    limit: "200",
  });
  for (let guard = 0; guard < 20; guard++) {
    for (const r of page.data) {
      out.push({
        id: r.id,
        name: r.name,
        currency: r.currency,
        status: r.account_status,
        business: r.business?.name ?? null,
      });
    }
    if (!page.paging?.next) break;
    page = await get<Page<Raw>>(page.paging.next);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/**
 * Insights de uma conta por semana-ritual (chave = sexta que fecha a semana),
 * numa chamada só via `time_ranges`. Semana sem entrega não volta na resposta
 * da Meta — aqui ela vira zero de propósito: verba parada é sinal, não lacuna.
 */
export async function fetchWeeklyInsights(adAccountId: string, refs: string[]): Promise<Map<string, MetaWeek>> {
  const ranges = refs.map(weekRange);
  const page = await get<Page<InsightRow>>(`${adAccountId}/insights`, {
    level: "account",
    fields: "spend,reach,impressions,actions,action_values",
    time_ranges: JSON.stringify(ranges),
    limit: "100",
  });
  const byUntil = new Map(page.data.map((r) => [r.date_stop, r]));
  const out = new Map<string, MetaWeek>();
  for (const ref of refs) {
    const row = byUntil.get(ref);
    out.set(ref, row ? parseInsight(row) : { ...EMPTY_WEEK });
  }
  return out;
}
