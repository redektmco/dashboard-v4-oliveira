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
  /**
   * O usuário de sistema tem a conta atribuída (dá para ler os números).
   * `false` = a conta existe numa BM que o token enxerga, mas ainda não foi
   * atribuída a ele — aparece na lista para alguém atribuir na BM.
   */
  access: boolean;
};

type RawAccount = {
  id: string;
  name: string;
  currency: string;
  account_status: number;
  business?: { name?: string };
};

const ACCOUNT_FIELDS = "name,currency,account_status,business{name}";

/** Todas as páginas de uma aresta da Graph API. */
async function allPages<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  let page = await get<Page<T>>(path, { ...params, limit: "200" });
  for (let guard = 0; guard < 20; guard++) {
    out.push(...page.data);
    if (!page.paging?.next) break;
    page = await get<Page<T>>(page.paging.next);
  }
  return out;
}

export type AdAccountList = {
  accounts: AdAccount[];
  /** A busca nas BMs falhou (ex.: token sem `business_management`); a lista traz só as atribuídas. */
  warning: string | null;
};

/**
 * Contas de anúncio da unidade. `me/adaccounts` do usuário de sistema só
 * devolve as contas ATRIBUÍDAS a ele — conta da BM (própria ou de cliente)
 * que ninguém atribuiu não aparecia e parecia "sumida". Por isso a lista
 * junta também as contas próprias e de clientes de cada BM, marcando as
 * que ainda não têm acesso.
 */
export async function listAdAccounts(): Promise<AdAccountList> {
  const toAccount = (r: RawAccount, access: boolean, bm?: string): AdAccount => ({
    id: r.id,
    name: r.name,
    currency: r.currency,
    status: r.account_status,
    business: r.business?.name ?? bm ?? null,
    access,
  });

  const assigned = await allPages<RawAccount>("me/adaccounts", { fields: ACCOUNT_FIELDS });
  const byId = new Map(assigned.map((r) => [r.id, toAccount(r, true)]));

  let warning: string | null = null;
  try {
    const businesses = await allPages<{ id: string; name: string }>("me/businesses", { fields: "name" });
    const edges = await Promise.all(
      businesses.flatMap((b) =>
        ["owned_ad_accounts", "client_ad_accounts"].map((edge) =>
          allPages<RawAccount>(`${b.id}/${edge}`, { fields: ACCOUNT_FIELDS }).then((rows) => rows.map((r) => toAccount(r, false, b.name))),
        ),
      ),
    );
    for (const a of edges.flat()) if (!byId.has(a.id)) byId.set(a.id, a);
  } catch (e) {
    warning = `Não deu para listar as contas das BMs (${e instanceof Error ? e.message : "erro na Meta"}). Aparecem só as contas já atribuídas ao usuário de sistema.`;
  }

  const accounts = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { accounts, warning };
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
