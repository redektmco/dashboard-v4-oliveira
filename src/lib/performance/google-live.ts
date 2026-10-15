/**
 * Google Ads ao vivo para a aba Performance: campanha a campanha no período,
 * as campanhas ativas sem entrega e a conta dia a dia (que dá os totais do
 * período e do anterior numa consulta só).
 */
import { gaql } from "../google/ads";
import type { AccountType } from "../model/types";
import { EMPTY_TOTALS, googleStatus, googleType, resultOf, type Campaign, type DayPoint, type Totals } from "./model";

type Range = { since: string; until: string };

type Metrics = {
  costMicros?: string | number;
  impressions?: string | number;
  clicks?: string | number;
  conversions?: string | number;
  conversionsValue?: string | number;
};

export type GoogleCampaignRow = {
  campaign?: { id?: string; name?: string; status?: string; advertisingChannelType?: string };
  campaignBudget?: { amountMicros?: string | number };
  metrics?: Metrics;
};

export type GoogleDayRow = { segments?: { date?: string }; metrics?: Metrics };

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Métricas do Google no formato da aba. `conversions` é o total das ações de
 * conversão da conta: vira lead (geração de lead) e compra (e-commerce),
 * como no sync semanal. Fracionário (atribuição por dados) fica com 1 casa.
 * A base do custo por resultado é a verba toda, como o "Custo por lead bruto"
 * do Google Ads: campanha que gastou sem converter também pesa no CPL.
 */
export function googleTotals(m: Metrics | undefined, type: AccountType): Totals {
  const spend = num(m?.costMicros) / 1_000_000;
  const conv = Math.round(num(m?.conversions) * 10) / 10;
  const results = resultOf(type, { leadResults: conv, purchases: conv, reach: null });
  return {
    ...EMPTY_TOTALS,
    spend,
    impressions: num(m?.impressions),
    clicks: num(m?.clicks),
    leads: conv,
    purchases: conv,
    revenue: num(m?.conversionsValue),
    results,
    resultSpend: spend,
  };
}

/** Soma as linhas diárias de um intervalo. */
export function sumDays(rows: GoogleDayRow[], r: Range, type: AccountType): Totals {
  const m: Required<Metrics> = { costMicros: 0, impressions: 0, clicks: 0, conversions: 0, conversionsValue: 0 };
  for (const row of rows) {
    const d = row.segments?.date;
    if (!d || d < r.since || d > r.until) continue;
    m.costMicros = num(m.costMicros) + num(row.metrics?.costMicros);
    m.impressions = num(m.impressions) + num(row.metrics?.impressions);
    m.clicks = num(m.clicks) + num(row.metrics?.clicks);
    m.conversions = num(m.conversions) + num(row.metrics?.conversions);
    m.conversionsValue = num(m.conversionsValue) + num(row.metrics?.conversionsValue);
  }
  return googleTotals(m, type);
}

const CAMPAIGN = "campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros";
const METRICS = "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value";

export async function googlePerformance(
  customerId: string,
  type: AccountType,
  cur: Range,
  prev: Range,
): Promise<{ totals: Totals; previous: Totals; daily: DayPoint[]; campaigns: Campaign[] }> {
  const between = (r: Range) => `segments.date BETWEEN '${r.since}' AND '${r.until}'`;
  const [rows, enabled, days] = await Promise.all([
    gaql<GoogleCampaignRow>(customerId, `SELECT ${CAMPAIGN}, ${METRICS} FROM campaign WHERE ${between(cur)}`),
    gaql<GoogleCampaignRow>(customerId, `SELECT ${CAMPAIGN} FROM campaign WHERE campaign.status = 'ENABLED'`),
    gaql<GoogleDayRow>(customerId, `SELECT segments.date, ${METRICS} FROM customer WHERE ${between({ since: prev.since, until: cur.until })}`),
  ]);

  const toCampaign = (r: GoogleCampaignRow): Campaign => ({
    ...googleTotals(r.metrics, type),
    id: `google:${r.campaign?.id}`,
    channel: "google",
    name: r.campaign?.name || "Campanha sem nome",
    status: googleStatus(r.campaign?.status),
    kind: googleType(r.campaign?.advertisingChannelType),
    dailyBudget: r.campaignBudget?.amountMicros ? num(r.campaignBudget.amountMicros) / 1_000_000 : null,
  });
  const campaigns = rows.map(toCampaign);
  const seen = new Set(rows.map((r) => r.campaign?.id));
  for (const r of enabled) if (!seen.has(r.campaign?.id)) campaigns.push(toCampaign({ ...r, metrics: {} }));

  return {
    totals: sumDays(days, cur, type),
    previous: sumDays(days, prev, type),
    daily: days
      .filter((d) => d.segments?.date && d.segments.date >= cur.since)
      .map((d) => {
        const t = googleTotals(d.metrics, type);
        return {
          day: d.segments!.date!,
          spend: t.spend,
          results: t.results,
          resultSpend: t.resultSpend,
          impressions: t.impressions,
          clicks: t.clicks,
          revenue: t.revenue,
        };
      }),
    campaigns,
  };
}
