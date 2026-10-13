/**
 * Meta Ads ao vivo para a aba Performance: totais da conta (período e o
 * anterior numa chamada só, via `time_ranges`), campanha a campanha, dia a
 * dia e o cadastro das campanhas (status, objetivo, orçamento).
 */
import { allPages, get, type Page } from "../meta/graph";
import { EVENT_FIELDS, leadsOf, parseInsight, type InsightRow, type LeadMetric } from "../meta/metrics";
import type { AccountType } from "../model/types";
import {
  EMPTY_TOTALS,
  metaObjective,
  metaStatus,
  resultOf,
  type Campaign,
  type DayPoint,
  type Totals,
} from "./model";

type Range = { since: string; until: string };

export type MetaRow = InsightRow & {
  campaign_id?: string;
  campaign_name?: string;
  objective?: string;
  clicks?: string;
  inline_link_clicks?: string;
};

type MetaCampaign = {
  id: string;
  name: string;
  effective_status?: string;
  objective?: string;
  daily_budget?: string;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Uma linha de insights (conta, campanha ou dia) no formato da aba. */
export function metaTotals(row: MetaRow, metric: LeadMetric, type: AccountType): Totals {
  const w = parseInsight(row);
  const reach = row.reach === undefined ? null : num(row.reach);
  const results = resultOf(type, { leadResults: leadsOf(w, metric), purchases: w.purchases, reach });
  return {
    spend: w.spend,
    impressions: w.impressions,
    reach,
    clicks: num(row.clicks),
    linkClicks: row.inline_link_clicks === undefined ? null : num(row.inline_link_clicks),
    leads: w.leads,
    conversations: w.conversations,
    purchases: w.purchases,
    revenue: w.revenue,
    results,
    resultSpend: results > 0 ? w.spend : 0,
  };
}

/**
 * Totais do canal: verba, impressões, alcance e cliques da conta (alcance não
 * soma entre campanhas); leads, conversas, compras e a verba que os gerou
 * somados campanha a campanha — o mesmo critério do CPL do score.
 */
export function accountTotals(account: MetaRow | undefined, campaigns: Totals[], type: AccountType): Totals {
  if (!account) return { ...EMPTY_TOTALS };
  const base = metaTotalsLoose(account);
  const sum = campaigns.reduce(
    (a, c) => ({
      leads: a.leads + c.leads,
      conversations: a.conversations + c.conversations,
      purchases: a.purchases + c.purchases,
      revenue: a.revenue + c.revenue,
      results: a.results + c.results,
      resultSpend: a.resultSpend + c.resultSpend,
    }),
    { leads: 0, conversations: 0, purchases: 0, revenue: 0, results: 0, resultSpend: 0 },
  );
  // Marca não soma alcance de campanha: vale o da conta, sem pessoa repetida.
  if (type === "branding") sum.results = base.reach ?? 0;
  return { ...base, ...sum };
}

const metaTotalsLoose = (row: MetaRow): Totals => ({
  ...EMPTY_TOTALS,
  spend: num(row.spend),
  impressions: num(row.impressions),
  reach: row.reach === undefined ? null : num(row.reach),
  clicks: num(row.clicks),
  linkClicks: row.inline_link_clicks === undefined ? null : num(row.inline_link_clicks),
});

const FIELDS = `spend,impressions,reach,clicks,inline_link_clicks,${EVENT_FIELDS}`;

export async function metaPerformance(
  adAccountId: string,
  metric: LeadMetric,
  type: AccountType,
  cur: Range,
  prev: Range,
): Promise<{ totals: Totals; previous: Totals; daily: DayPoint[]; campaigns: Campaign[] }> {
  const time_ranges = JSON.stringify([cur, prev]);
  const [account, byCampaign, days, registry] = await Promise.all([
    get<Page<MetaRow>>(`${adAccountId}/insights`, { level: "account", fields: FIELDS, time_ranges }),
    allPages<MetaRow>(`${adAccountId}/insights`, {
      level: "campaign",
      fields: `campaign_id,campaign_name,objective,${FIELDS}`,
      time_ranges,
    }),
    allPages<MetaRow>(`${adAccountId}/insights`, {
      level: "account",
      fields: "spend,actions,conversions",
      time_range: JSON.stringify(cur),
      time_increment: "1",
    }),
    // Cadastro das campanhas vivas: status, objetivo e orçamento (CBO).
    // Campanha ativa sem verba no período também aparece — é sinal.
    allPages<MetaCampaign>(`${adAccountId}/campaigns`, {
      fields: "id,name,effective_status,objective,daily_budget",
      effective_status: JSON.stringify(["ACTIVE", "PAUSED", "IN_PROCESS", "WITH_ISSUES", "CAMPAIGN_PAUSED", "ADSET_PAUSED"]),
    }),
  ]);

  const isCur = (r: MetaRow) => r.date_start === cur.since;
  const reg = new Map(registry.map((c) => [c.id, c]));

  const curRows = byCampaign.filter(isCur);
  const prevRows = byCampaign.filter((r) => !isCur(r));
  const campaigns: Campaign[] = curRows.map((r) => {
    const c = r.campaign_id ? reg.get(r.campaign_id) : undefined;
    return {
      ...metaTotals(r, metric, type),
      id: `meta:${r.campaign_id}`,
      channel: "meta",
      name: r.campaign_name || c?.name || "Campanha sem nome",
      status: metaStatus(c?.effective_status),
      kind: metaObjective(c?.objective ?? r.objective),
      dailyBudget: c?.daily_budget ? num(c.daily_budget) / 100 : null,
    };
  });
  const seen = new Set(curRows.map((r) => r.campaign_id));
  for (const c of registry) {
    if (seen.has(c.id) || metaStatus(c.effective_status) !== "ativa") continue;
    campaigns.push({
      ...EMPTY_TOTALS,
      id: `meta:${c.id}`,
      channel: "meta",
      name: c.name,
      status: "ativa",
      kind: metaObjective(c.objective),
      dailyBudget: c.daily_budget ? num(c.daily_budget) / 100 : null,
    });
  }

  const curAccount = account.data.find(isCur);
  const prevAccount = account.data.find((r) => !isCur(r));
  return {
    totals: accountTotals(curAccount, curRows.map((r) => metaTotals(r, metric, type)), type),
    previous: accountTotals(prevAccount, prevRows.map((r) => metaTotals(r, metric, type)), type),
    daily: days.map((d) => {
      const t = metaTotals(d, metric, type);
      return { day: d.date_start, spend: t.spend, results: type === "branding" ? 0 : t.results };
    }),
    campaigns,
  };
}
