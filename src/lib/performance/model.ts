/**
 * Aba Performance da ficha: o formato único em que Meta e Google chegam
 * (lidos ao vivo das APIs, no período escolhido) e as contas derivadas —
 * CTR, CPC, CPM, custo por resultado, ROAS, frequência, variação contra o
 * período anterior. Regras puras, sem rede nem banco: é o que os testes cobrem.
 */
import type { AccountType } from "../model/types";

export type Channel = "meta" | "google";
export const CHANNELS: Channel[] = ["meta", "google"];
export const CHANNEL_NAME: Record<Channel, string> = { meta: "Meta Ads", google: "Google Ads" };

/** Totais de um canal (ou de uma campanha) num período. */
export type Totals = {
  spend: number;
  impressions: number;
  /** Pessoas únicas — só a Meta informa; `null` no Google. */
  reach: number | null;
  /** Cliques (todos). */
  clicks: number;
  /** Cliques no link — só a Meta separa. */
  linkClicks: number | null;
  /** Leads de site/formulário + contato (Meta) ou conversões (Google). */
  leads: number;
  /** Conversas iniciadas no WhatsApp/Direct/Messenger (só Meta). */
  conversations: number;
  purchases: number;
  revenue: number;
  /** O resultado que vale para o tipo de conta (lead, compra ou alcance). */
  results: number;
  /** Verba das campanhas que geraram resultado — base do custo por resultado. */
  resultSpend: number;
};

export const EMPTY_TOTALS: Totals = {
  spend: 0,
  impressions: 0,
  reach: null,
  clicks: 0,
  linkClicks: null,
  leads: 0,
  conversations: 0,
  purchases: 0,
  revenue: 0,
  results: 0,
  resultSpend: 0,
};

export type CampaignStatus = "ativa" | "pausada" | "encerrada" | "problema";
export const STATUS_LABEL: Record<CampaignStatus, string> = {
  ativa: "Ativa",
  pausada: "Pausada",
  encerrada: "Encerrada",
  problema: "Com problema",
};

export type Campaign = Totals & {
  id: string;
  channel: Channel;
  name: string;
  status: CampaignStatus;
  /** Objetivo (Meta) ou tipo de campanha (Google), já traduzido. */
  kind: string;
  /** Orçamento diário em R$, quando a campanha tem um (no Google, sempre; na Meta, só CBO). */
  dailyBudget: number | null;
};

export type DayPoint = {
  day: string;
  spend: number;
  results: number;
  /** Verba das campanhas com resultado no dia (base do custo por resultado). */
  resultSpend?: number;
  impressions?: number;
  clicks?: number;
  revenue?: number;
};

export type ChannelData = {
  channel: Channel;
  /** Há conta vinculada e ativa. */
  linked: boolean;
  accounts: { id: string; name: string; error: string | null; lastSync: string | null }[];
  totals: Totals;
  previous: Totals | null;
  daily: DayPoint[];
  campaigns: Campaign[];
};

export type PerformanceData = {
  since: string;
  until: string;
  previous: { since: string; until: string };
  accountType: AccountType;
  /** Verba contratada proporcional ao período (meta semanal ÷ 7 × dias), quando houver. */
  budgetTarget: number | null;
  channels: Record<Channel, ChannelData>;
  fetchedAt: string;
};

/* ---------------------------- tradução ---------------------------- */

const META_OBJECTIVE: Record<string, string> = {
  OUTCOME_LEADS: "Cadastro",
  LEAD_GENERATION: "Cadastro",
  OUTCOME_SALES: "Vendas",
  CONVERSIONS: "Conversões",
  PRODUCT_CATALOG_SALES: "Catálogo",
  OUTCOME_TRAFFIC: "Tráfego",
  LINK_CLICKS: "Tráfego",
  OUTCOME_ENGAGEMENT: "Engajamento",
  POST_ENGAGEMENT: "Engajamento",
  PAGE_LIKES: "Curtidas",
  EVENT_RESPONSES: "Evento",
  MESSAGES: "Mensagens",
  OUTCOME_AWARENESS: "Reconhecimento",
  REACH: "Alcance",
  BRAND_AWARENESS: "Reconhecimento",
  VIDEO_VIEWS: "Visualização de vídeo",
  OUTCOME_APP_PROMOTION: "App",
  APP_INSTALLS: "App",
  STORE_VISITS: "Visitas à loja",
};

export const metaObjective = (o: string | null | undefined) => (o ? META_OBJECTIVE[o] ?? o.toLowerCase() : "—");

export function metaStatus(s: string | null | undefined): CampaignStatus {
  switch (s) {
    case "ACTIVE":
    case "IN_PROCESS":
      return "ativa";
    case "PAUSED":
    case "CAMPAIGN_PAUSED":
    case "ADSET_PAUSED":
      return "pausada";
    case "WITH_ISSUES":
    case "DISAPPROVED":
    case "PENDING_BILLING_INFO":
      return "problema";
    default:
      return "encerrada"; // ARCHIVED, DELETED ou sem cadastro (campanha apagada)
  }
}

const GOOGLE_TYPE: Record<string, string> = {
  SEARCH: "Pesquisa",
  DISPLAY: "Display",
  PERFORMANCE_MAX: "Performance Max",
  VIDEO: "YouTube",
  SHOPPING: "Shopping",
  DEMAND_GEN: "Demand Gen",
  DISCOVERY: "Discovery",
  LOCAL: "Local",
  SMART: "Smart",
  MULTI_CHANNEL: "App",
  HOTEL: "Hotel",
  LOCAL_SERVICES: "Serviços locais",
};

export const googleType = (t: string | null | undefined) => (t ? GOOGLE_TYPE[t] ?? t.toLowerCase() : "—");

export function googleStatus(s: string | null | undefined): CampaignStatus {
  if (s === "ENABLED") return "ativa";
  if (s === "PAUSED") return "pausada";
  return "encerrada";
}

/* ---------------------------- contas ---------------------------- */

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export const ctr = (t: Pick<Totals, "clicks" | "impressions">) => ratio(t.clicks * 100, t.impressions);
export const cpc = (t: Pick<Totals, "spend" | "clicks">) => ratio(t.spend, t.clicks);
export const cpm = (t: Pick<Totals, "spend" | "impressions">) => ratio(t.spend * 1000, t.impressions);
export const roas = (t: Pick<Totals, "revenue" | "spend">) => ratio(t.revenue, t.spend);
export const frequency = (t: Pick<Totals, "impressions" | "reach">) => (t.reach ? ratio(t.impressions, t.reach) : null);
/** Resultados ÷ cliques, em %. */
export const convRate = (t: Pick<Totals, "results" | "clicks">) => ratio(t.results * 100, t.clicks);

/**
 * Custo por resultado. Usa a verba só das campanhas que geraram resultado:
 * campanha de alcance ou de visita ao perfil somada inflaria o CPL. Sem essa
 * verba (resultado vindo de campanha sem cadastro), cai na verba total.
 */
export function cpr(t: Pick<Totals, "spend" | "results" | "resultSpend">): number | null {
  if (t.results <= 0) return null;
  return (t.resultSpend > 0 ? t.resultSpend : t.spend) / t.results;
}

/** Variação em % contra o período anterior; null sem base de comparação. */
export function delta(cur: number | null, prev: number | null | undefined): number | null {
  if (cur === null || prev === null || prev === undefined || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/**
 * O resultado que vale para o tipo de conta. `leadResults` já vem pela
 * métrica de lead de cada conta (formulário/contato, conversas ou os dois).
 */
export function resultOf(type: AccountType, t: { leadResults: number; purchases: number; reach: number | null }): number {
  if (type === "ecommerce") return t.purchases;
  if (type === "branding") return t.reach ?? 0;
  return t.leadResults;
}

export const RESULT_LABEL: Record<AccountType, { one: string; cost: string }> = {
  lead_gen: { one: "Leads", cost: "CPL" },
  ecommerce: { one: "Compras", cost: "Custo por compra" },
  branding: { one: "Alcance", cost: "CPM" },
};

/** Soma de totais (alcance soma por conta — pessoa em duas contas conta duas vezes). */
export function sumTotals(list: Totals[]): Totals {
  const out: Totals = { ...EMPTY_TOTALS };
  let reach: number | null = null;
  let link: number | null = null;
  for (const t of list) {
    out.spend += t.spend;
    out.impressions += t.impressions;
    out.clicks += t.clicks;
    out.leads += t.leads;
    out.conversations += t.conversations;
    out.purchases += t.purchases;
    out.revenue += t.revenue;
    out.results += t.results;
    out.resultSpend += t.resultSpend;
    if (t.reach !== null) reach = (reach ?? 0) + t.reach;
    if (t.linkClicks !== null) link = (link ?? 0) + t.linkClicks;
  }
  return { ...out, reach, linkClicks: link };
}

/** Meta + Google do mesmo dia, para o gráfico empilhado. */
export function mergeDaily(since: string, until: string, series: Partial<Record<Channel, DayPoint[]>>) {
  const out: { day: string; meta: number; google: number; results: number }[] = [];
  const idx = Object.fromEntries(
    CHANNELS.map((c) => [c, new Map((series[c] ?? []).map((p) => [p.day, p]))]),
  ) as Record<Channel, Map<string, DayPoint>>;
  for (let d = since; d <= until; ) {
    const m = idx.meta.get(d);
    const g = idx.google.get(d);
    out.push({ day: d, meta: m?.spend ?? 0, google: g?.spend ?? 0, results: (m?.results ?? 0) + (g?.results ?? 0) });
    const next = new Date(d + "T00:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    d = next.toISOString().slice(0, 10);
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Verba contratada do período: meta semanal ÷ 7 × dias. */
export const budgetFor = (weekly: number | undefined | null, days: number) =>
  weekly && weekly > 0 ? round2((weekly / 7) * days) : null;

/* ------------------------- métricas do dia a dia ------------------------- */

/** O que dá para pôr no gráfico de baixo da aba Performance, dia a dia. */
export type DailyMetric = "results" | "cpr" | "clicks" | "impressions" | "ctr" | "cpc" | "cpm" | "revenue" | "roas";

export type DailyMetricDef = {
  id: DailyMetric;
  /** Soma entre canais (barra empilhada) ou é razão (uma barra do total). */
  additive: boolean;
  format: "int" | "money" | "pct" | "x";
  /** Para quais tipos de conta a métrica faz sentido. */
  types?: AccountType[];
};

export const DAILY_METRICS: DailyMetricDef[] = [
  { id: "results", additive: true, format: "int", types: ["lead_gen", "ecommerce"] },
  { id: "cpr", additive: false, format: "money", types: ["lead_gen", "ecommerce"] },
  { id: "revenue", additive: true, format: "money", types: ["ecommerce"] },
  { id: "roas", additive: false, format: "x", types: ["ecommerce"] },
  { id: "clicks", additive: true, format: "int" },
  { id: "impressions", additive: true, format: "int" },
  { id: "ctr", additive: false, format: "pct" },
  { id: "cpc", additive: false, format: "money" },
  { id: "cpm", additive: false, format: "money" },
];

export const dailyMetricsFor = (type: AccountType) => DAILY_METRICS.filter((m) => !m.types || m.types.includes(type));

type DayAgg = { spend: number; results: number; resultSpend: number; impressions: number; clicks: number; revenue: number };

const aggOf = (p: DayPoint | undefined): DayAgg => ({
  spend: p?.spend ?? 0,
  results: p?.results ?? 0,
  resultSpend: p?.resultSpend ?? (p && p.results > 0 ? p.spend : 0),
  impressions: p?.impressions ?? 0,
  clicks: p?.clicks ?? 0,
  revenue: p?.revenue ?? 0,
});

/** Valor da métrica num dia; razão sem denominador é `null` (fica sem barra). */
export function dayValue(m: DailyMetric, a: DayAgg): number | null {
  switch (m) {
    case "results":
      return a.results;
    case "clicks":
      return a.clicks;
    case "impressions":
      return a.impressions;
    case "revenue":
      return a.revenue;
    case "cpr":
      return a.results > 0 ? round2((a.resultSpend || a.spend) / a.results) : null;
    case "ctr":
      return a.impressions > 0 ? round2((a.clicks / a.impressions) * 100) : null;
    case "cpc":
      return a.clicks > 0 ? round2(a.spend / a.clicks) : null;
    case "cpm":
      return a.impressions > 0 ? round2((a.spend / a.impressions) * 1000) : null;
    case "roas":
      return a.spend > 0 ? round2(a.revenue / a.spend) : null;
  }
}

export type MetricDay = { day: string; parts: Partial<Record<Channel, number | null>>; total: number | null };

/** Série dia a dia de uma métrica, por canal e no total, de `since` a `until` (dia sem dado = zero). */
export function dailyMetricSeries(
  since: string,
  until: string,
  series: Partial<Record<Channel, DayPoint[]>>,
  metric: DailyMetric,
): MetricDay[] {
  const channels = CHANNELS.filter((c) => series[c]);
  const idx = Object.fromEntries(channels.map((c) => [c, new Map((series[c] ?? []).map((p) => [p.day, p]))])) as Record<Channel, Map<string, DayPoint>>;
  const out: MetricDay[] = [];
  for (let d = since; d <= until; ) {
    const parts: Partial<Record<Channel, number | null>> = {};
    const total: DayAgg = aggOf(undefined);
    for (const c of channels) {
      const a = aggOf(idx[c].get(d));
      parts[c] = dayValue(metric, a);
      for (const k of Object.keys(total) as (keyof DayAgg)[]) total[k] += a[k];
    }
    out.push({ day: d, parts, total: dayValue(metric, total) });
    const next = new Date(d + "T00:00:00Z");
    next.setUTCDate(next.getUTCDate() + 1);
    d = next.toISOString().slice(0, 10);
  }
  return out;
}
