/**
 * "Sincronizar" do construtor de relatórios: lê Meta Ads e Google Ads ao vivo
 * no período exato do relatório (não nas semanas-ritual do banco), em trechos
 * de 7 dias a partir do início, mais o período anterior inteiro para a
 * comparação. Mesmos critérios da aba Performance e do score: lead de site
 * conta formulário ou contato (o maior dos dois por campanha), conversa pela
 * métrica da conta; a base do CPL é a verba das campanhas que geraram lead na
 * Meta e a verba toda no Google (como o "Custo por lead bruto" do Google Ads).
 *
 * Uma conta com erro (token sem acesso, conta desativada) não derruba as
 * demais — vai para `errors`, e o editor diz qual ficou de fora.
 */
import { all } from "../db";
import { googleAdsConfigured, gaql } from "../google/ads";
import { allPages, fetchCampaignGoals, metaConfigured } from "../meta/graph";
import {
  EVENT_FIELDS,
  campaignTotals,
  leadSpendOf,
  leadsOf,
  parseInsight,
  type CampaignGoals,
  type CampaignRow,
  type InsightRow,
  type LeadMetric,
} from "../meta/metrics";
import { listGoogleLinks, listMetaLinks, today } from "../repo";
import { EMPTY_NUMS, previousPeriod } from "./metrics";
import type { ChannelNums, LiveSnapshot, WeekRow } from "./types";

type Range = { since: string; until: string };

const shift = (day: string, n: number) => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Trechos de 7 dias a partir do início (o último pode ser menor) — o mesmo corte do `time_increment=7` da Meta. */
export function chunksOf(r: Range): Range[] {
  const out: Range[] = [];
  for (let s = r.since; s <= r.until; s = shift(s, 7)) {
    const e = shift(s, 6);
    out.push({ since: s, until: e < r.until ? e : r.until });
  }
  return out;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const add = (a: ChannelNums, b: ChannelNums): ChannelNums => {
  const out = { ...a };
  for (const k of Object.keys(EMPTY_NUMS) as (keyof ChannelNums)[]) out[k] += b[k];
  return out;
};

/* ------------------------------- Meta ------------------------------- */

type MetaRow = InsightRow & { inline_link_clicks?: string };

/**
 * Números de um trecho: verba, impressões, alcance, cliques no link e compras
 * da conta (alcance não soma entre campanhas); leads, conversas e a verba que
 * os gerou campanha a campanha.
 */
export function metaNums(account: MetaRow | undefined, campaigns: CampaignRow[], metric: LeadMetric, goals?: CampaignGoals): ChannelNums {
  if (!account && !campaigns.length) return { ...EMPTY_NUMS };
  const w = account ? parseInsight(account) : parseInsight({ date_start: "", date_stop: "" });
  const week = { ...w, ...campaignTotals(campaigns, goals) };
  return {
    spend: week.spend,
    impressions: week.impressions,
    reach: week.reach,
    clicks: account?.inline_link_clicks !== undefined ? num(account.inline_link_clicks) : week.clicks,
    leads: leadsOf(week, metric),
    conversations: week.conversations,
    purchases: week.purchases,
    revenue: week.revenue,
    leadSpend: leadSpendOf(week, metric),
  };
}

const META_FIELDS = `spend,impressions,reach,inline_link_clicks,${EVENT_FIELDS}`;

async function metaAccount(id: string, metric: LeadMetric, cur: Range, prev: Range) {
  const q = (level: "account" | "campaign", r: Range, step: boolean) =>
    allPages<MetaRow & CampaignRow>(`${id}/insights`, {
      level,
      fields: level === "account" ? META_FIELDS : "campaign_id,spend,actions,conversions",
      time_range: JSON.stringify(r),
      ...(step ? { time_increment: "7" } : {}),
    });
  const [acc, camp, accPrev, campPrev, goals] = await Promise.all([
    q("account", cur, true),
    q("campaign", cur, true),
    q("account", prev, false),
    q("campaign", prev, false),
    fetchCampaignGoals(id),
  ]);
  const byStart = new Map(acc.map((r) => [r.date_start, r]));
  const campByStart = new Map<string, CampaignRow[]>();
  for (const c of camp) campByStart.set(c.date_start, [...(campByStart.get(c.date_start) ?? []), c]);
  return {
    chunks: chunksOf(cur).map((c) => metaNums(byStart.get(c.since), campByStart.get(c.since) ?? [], metric, goals)),
    previous: metaNums(accPrev[0], campPrev, metric, goals),
  };
}

/* ------------------------------ Google ------------------------------ */

type GoogleRow = {
  campaign?: { id?: string };
  segments?: { date?: string };
  metrics?: { costMicros?: string | number; impressions?: string | number; clicks?: string | number; conversions?: string | number; conversionsValue?: string | number };
};

/**
 * Linhas campanha × dia somadas por trecho. Conversão vira lead e compra (como
 * no sync semanal); a base do CPL é a verba toda do trecho, como o "Custo por
 * lead bruto" do Google Ads.
 */
export function googleBuckets(rows: GoogleRow[], buckets: Range[]): ChannelNums[] {
  const out = buckets.map(() => ({ ...EMPTY_NUMS }));
  for (const r of rows) {
    const d = r.segments?.date;
    if (!d) continue;
    const i = buckets.findIndex((b) => d >= b.since && d <= b.until);
    if (i < 0) continue;
    const spend = num(r.metrics?.costMicros) / 1_000_000;
    const conv = num(r.metrics?.conversions);
    const t = out[i];
    t.spend += spend;
    t.leadSpend += spend;
    t.impressions += num(r.metrics?.impressions);
    t.clicks += num(r.metrics?.clicks);
    t.leads += conv;
    t.purchases += conv;
    t.revenue += num(r.metrics?.conversionsValue);
  }
  // Atribuição por dados deixa conversão fracionária: 1 casa, como na aba Performance.
  for (const t of out) {
    t.leads = Math.round(t.leads * 10) / 10;
    t.purchases = Math.round(t.purchases * 10) / 10;
  }
  return out;
}

async function googleAccount(customerId: string, cur: Range, prev: Range) {
  const rows = await gaql<GoogleRow>(
    customerId,
    `SELECT campaign.id, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value
     FROM campaign WHERE segments.date BETWEEN '${prev.since}' AND '${cur.until}'`,
  );
  const chunks = chunksOf(cur);
  const all = googleBuckets(rows, [...chunks, prev]);
  return { chunks: all.slice(0, chunks.length), previous: all[chunks.length] };
}

/* ------------------------------ junção ------------------------------ */

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class NoAccountsError extends Error {}

/**
 * Lê ao vivo e monta o retrato do período. O fim fica limitado a hoje (dia
 * em curso entra parcial); período inteiro no futuro volta zerado.
 */
export async function syncLive(clientId: number, start: string, end: string): Promise<LiveSnapshot> {
  const [metaLinks, googleLinks] = await Promise.all([listMetaLinks(), listGoogleLinks()]);
  const meta = metaLinks.filter((l) => l.client_id === clientId && l.active === 1);
  const google = googleLinks.filter((l) => l.client_id === clientId && l.active === 1);
  if (!meta.length && !google.length)
    throw new NoAccountsError("Este cliente não tem conta de Meta Ads ou Google Ads vinculada. Vincule em Performance › Integrações.");

  const day = today();
  const cur: Range = { since: start, until: end < day ? end : day };
  const p = previousPeriod(start, end);
  const prev: Range = { since: p.start, until: p.end };
  const chunks = cur.since <= cur.until ? chunksOf(cur) : [];
  const errors: LiveSnapshot["errors"] = [];

  type Part = { chunks: ChannelNums[]; previous: ChannelNums };
  const run = async (name: string, ok: boolean, missing: string, fn: () => Promise<Part>): Promise<Part | null> => {
    if (!ok) {
      errors.push({ account: name, error: missing });
      return null;
    }
    if (!chunks.length) return null;
    try {
      return await fn();
    } catch (e) {
      errors.push({ account: name, error: message(e) });
      return null;
    }
  };

  const [metaParts, googleParts, crm] = await Promise.all([
    Promise.all(
      meta.map((l) => run(l.name || l.ad_account_id, metaConfigured(), "META_ACCESS_TOKEN não configurado.", () => metaAccount(l.ad_account_id, l.lead_metric, cur, prev))),
    ),
    Promise.all(
      google.map((l) => run(l.name || l.customer_id, googleAdsConfigured(), "Credenciais do Google Ads não configuradas.", () => googleAccount(l.customer_id, cur, prev))),
    ),
    all<{ day: string; n: number }>(
      `SELECT (received_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS day, count(*)::int AS n
       FROM crm_leads WHERE client_id = ?
         AND (received_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ?::date AND ?::date
       GROUP BY 1`,
      [clientId, prev.since, cur.until],
    ),
  ]);

  // Nenhuma conta lida: gravar zeros esconderia os números do banco — erro.
  if (chunks.length && ![...metaParts, ...googleParts].some(Boolean))
    throw new Error(`Não deu para ler nenhuma conta: ${errors.map((e) => `${e.account} — ${e.error}`).join("; ")}`);

  const sum = (parts: (Part | null)[], pick: (p: Part) => ChannelNums) =>
    parts.filter((x): x is Part => !!x).reduce((a, x) => add(a, pick(x)), { ...EMPTY_NUMS });
  const crmIn = (r: Range) => crm.filter((c) => c.day >= r.since && c.day <= r.until).reduce((a, c) => a + Number(c.n), 0);

  const weeks: WeekRow[] = chunks.map((c, i) => ({
    ref: c.until,
    start: c.since,
    meta: sum(metaParts, (x) => x.chunks[i]),
    google: sum(googleParts, (x) => x.chunks[i]),
    crmLeads: crmIn(c),
  }));
  const prevWeeks: WeekRow[] = [
    { ref: prev.until, start: prev.since, meta: sum(metaParts, (x) => x.previous), google: sum(googleParts, (x) => x.previous), crmLeads: crmIn(prev) },
  ];

  return { clientId, start, end, at: new Date().toISOString(), weeks, prevWeeks, errors };
}
