/**
 * Monta a aba Performance de um cliente: lê ao vivo todas as contas ativas
 * de Meta e Google no período e junta por canal. Uma conta com erro (token
 * sem acesso, conta desativada) não derruba as demais — o erro vai junto
 * para a tela dizer qual conta ficou de fora.
 */
import { getClient, getTargets, listGoogleLinks, listMetaLinks } from "../repo";
import { metaConfigured } from "../meta/graph";
import { googleAdsConfigured } from "../google/ads";
import type { FichaPeriod } from "../ficha-period";
import { googlePerformance } from "./google-live";
import { metaPerformance } from "./meta-live";
import {
  EMPTY_TOTALS,
  budgetFor,
  sumTotals,
  type Channel,
  type ChannelData,
  type DayPoint,
  type PerformanceData,
  type Totals,
} from "./model";

type AccountResult = {
  id: string;
  name: string;
  lastSync: string | null;
  error: string | null;
  data: { totals: Totals; previous: Totals; daily: DayPoint[]; campaigns: ChannelData["campaigns"] } | null;
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function channelOf(channel: Channel, accounts: AccountResult[]): ChannelData {
  const ok = accounts.filter((a) => a.data);
  const daily = new Map<string, DayPoint>();
  for (const a of ok)
    for (const p of a.data!.daily) {
      const cur = daily.get(p.day) ?? { day: p.day, spend: 0, results: 0 };
      const add = (k: "resultSpend" | "impressions" | "clicks" | "revenue") => (cur[k] ?? 0) + (p[k] ?? 0);
      daily.set(p.day, {
        day: p.day,
        spend: cur.spend + p.spend,
        results: cur.results + p.results,
        resultSpend: add("resultSpend"),
        impressions: add("impressions"),
        clicks: add("clicks"),
        revenue: add("revenue"),
      });
    }
  return {
    channel,
    linked: accounts.length > 0,
    accounts: accounts.map(({ id, name, error, lastSync }) => ({ id, name, error, lastSync })),
    totals: ok.length ? sumTotals(ok.map((a) => a.data!.totals)) : { ...EMPTY_TOTALS },
    previous: ok.length ? sumTotals(ok.map((a) => a.data!.previous)) : null,
    daily: [...daily.values()].sort((a, b) => (a.day < b.day ? -1 : 1)),
    campaigns: ok.flatMap((a) => a.data!.campaigns),
  };
}

export async function performanceFor(clientId: number, period: FichaPeriod): Promise<PerformanceData | null> {
  const [client, metaLinks, googleLinks, targets] = await Promise.all([
    getClient(clientId),
    listMetaLinks(),
    listGoogleLinks(),
    getTargets(clientId),
  ]);
  if (!client) return null;
  const type = client.account_type;
  const cur = { since: period.since, until: period.until };
  const prev = period.previous;

  const meta = metaLinks.filter((l) => l.client_id === clientId && l.active === 1);
  const google = googleLinks.filter((l) => l.client_id === clientId && l.active === 1);

  const [metaResults, googleResults] = await Promise.all([
    Promise.all(
      meta.map(async (l): Promise<AccountResult> => {
        const base = { id: l.ad_account_id, name: l.name || l.ad_account_id, lastSync: l.last_sync_at };
        if (!metaConfigured()) return { ...base, error: "META_ACCESS_TOKEN não configurado.", data: null };
        try {
          return { ...base, error: null, data: await metaPerformance(l.ad_account_id, l.lead_metric, type, cur, prev) };
        } catch (e) {
          return { ...base, error: message(e), data: null };
        }
      }),
    ),
    Promise.all(
      google.map(async (l): Promise<AccountResult> => {
        const base = { id: l.customer_id, name: l.name || l.customer_id, lastSync: l.last_sync_at };
        if (!googleAdsConfigured()) return { ...base, error: "Credenciais do Google Ads não configuradas.", data: null };
        try {
          return { ...base, error: null, data: await googlePerformance(l.customer_id, type, cur, prev) };
        } catch (e) {
          return { ...base, error: message(e), data: null };
        }
      }),
    ),
  ]);

  return {
    since: cur.since,
    until: cur.until,
    previous: prev,
    accountType: type,
    budgetTarget: budgetFor(targets.budget_meta, period.days),
    channels: { meta: channelOf("meta", metaResults), google: channelOf("google", googleResults) },
    fetchedAt: new Date().toISOString(),
  };
}
