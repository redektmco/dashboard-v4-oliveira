/**
 * Regras puras do construtor de relatórios: catálogo de métricas, soma do
 * período, comparação com o período anterior, formatação e leitura do que
 * foi digitado à mão. Sem rede nem banco — é o que os testes cobrem.
 */
import type {
  ChannelNums,
  LeadRule,
  MetricKey,
  NumberFormat,
  ReportData,
  Source,
  WeekRow,
} from "./types";

export type MetricDef = {
  label: string;
  format: NumberFormat;
  /** Menor é melhor (CPL, CPC): a seta da variação inverte a cor. */
  lowerIsBetter?: boolean;
  /** Nem melhor nem pior por si (investir mais ou menos): a variação fica neutra. */
  neutral?: boolean;
  /** Só existe num canal — o seletor de fonte some. */
  only?: "meta" | "crm";
  /** Meta semanal do cliente que corresponde (`client_targets`). */
  targetKey?: string;
  /** A meta é por semana e soma no período (leads), ou é uma razão (CPL). */
  targetSums?: boolean;
  hint?: string;
};

export const METRICS: Record<MetricKey, MetricDef> = {
  spend: { label: "Investimento", format: "currency", neutral: true, targetKey: "budget_meta", targetSums: true },
  impressions: { label: "Impressões", format: "int", neutral: true, targetKey: "reach_meta", targetSums: true },
  reach: { label: "Alcance", format: "int", only: "meta", neutral: true, hint: "Soma do alcance semanal da Meta." },
  clicks: { label: "Cliques", format: "int" },
  ctr: { label: "CTR", format: "percent" },
  cpc: { label: "CPC", format: "currency", lowerIsBetter: true },
  cpm: { label: "CPM", format: "currency", lowerIsBetter: true },
  leads: { label: "Leads", format: "int", targetKey: "leads_meta", targetSums: true, hint: "No total, segue o \"Leads contam de\" do cliente (padrão: conversão das campanhas). Num canal só: Meta = formulário/contato e conversas; Google = conversões." },
  cpl: { label: "Custo por lead", format: "currency", lowerIsBetter: true, targetKey: "cpl_meta" },
  conversations: { label: "Conversas iniciadas", format: "int", only: "meta" },
  purchases: { label: "Compras / conversões", format: "int" },
  revenue: { label: "Faturamento", format: "currency", targetKey: "revenue_meta", targetSums: true },
  roas: { label: "ROAS", format: "x", targetKey: "roas_meta" },
  ticket: { label: "Ticket médio", format: "currency", targetKey: "ticket_meta" },
  crm_leads: { label: "Leads no CRM", format: "int", only: "crm", hint: "Leads recebidos pelo webhook do CRM." },
};

export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

export const EMPTY_NUMS: ChannelNums = {
  spend: 0,
  impressions: 0,
  reach: 0,
  clicks: 0,
  leads: 0,
  conversations: 0,
  purchases: 0,
  revenue: 0,
  leadSpend: 0,
};

export type Totals = ChannelNums & { crmLeads: number; weeks: number };

/**
 * Leads de uma semana no total (Meta + Google) pela regra do cliente: só a
 * campanha, o CRM (semana sem lead no CRM usa a campanha) ou a soma.
 */
export function weekLeads(w: WeekRow, rule: LeadRule): number {
  const media = w.meta.leads + w.google.leads;
  if (rule === "webhook") return w.crmLeads > 0 ? w.crmLeads : media;
  if (rule === "both") return media + w.crmLeads;
  return media;
}

/**
 * Soma das semanas na fonte pedida. No total (`all`), Lead segue o "Leads
 * contam de" do cliente; num canal só, é sempre a conversão daquele canal.
 */
export function totalsOf(weeks: WeekRow[], source: Source, rule: LeadRule = "campaign"): Totals {
  const out: Totals = { ...EMPTY_NUMS, crmLeads: 0, weeks: weeks.length };
  for (const w of weeks) {
    for (const k of Object.keys(EMPTY_NUMS) as (keyof ChannelNums)[]) {
      if (source !== "google") out[k] += w.meta[k];
      if (source !== "meta") out[k] += w.google[k];
    }
    if (source === "all") out.leads += weekLeads(w, rule) - (w.meta.leads + w.google.leads);
    out.crmLeads += w.crmLeads;
  }
  return out;
}

const div = (a: number, b: number) => (b > 0 ? a / b : null);

/** Valor da métrica sobre uma soma. Razão sem denominador volta null (sem lead não há CPL). */
export function metricOf(t: Totals, metric: MetricKey): number | null {
  switch (metric) {
    case "ctr": {
      const r = div(t.clicks, t.impressions);
      return r === null ? null : r * 100;
    }
    case "cpc":
      return div(t.spend, t.clicks);
    case "cpm": {
      const r = div(t.spend, t.impressions);
      return r === null ? null : r * 1000;
    }
    case "cpl":
      // Verba das campanhas de lead; sem ela (dado antigo, lead só do CRM), a verba toda.
      return div(t.leadSpend > 0 ? t.leadSpend : t.spend, t.leads);
    case "roas":
      return div(t.revenue, t.spend);
    case "ticket":
      return div(t.revenue, t.purchases);
    case "crm_leads":
      return t.crmLeads;
    default:
      return t[metric];
  }
}

/** A fonte efetiva: métrica de um canal só ignora o que o bloco pediu. */
export const sourceFor = (metric: MetricKey, source: Source): Source =>
  METRICS[metric].only === "meta" ? "meta" : source;

export function metricValue(
  data: ReportData,
  metric: MetricKey,
  source: Source,
  which: "current" | "previous" = "current",
): number | null {
  const weeks = which === "current" ? data.weeks : data.prevWeeks;
  if (!weeks.length) return null;
  return metricOf(totalsOf(weeks, sourceFor(metric, source), data.leadSource), metric);
}

/** Variação percentual. Sem base (zero ou ausente) não há variação. */
export function deltaPct(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/** Variação boa, ruim ou neutra, já considerando "menor é melhor". */
export function deltaTone(delta: number | null, lowerIsBetter = false): "up" | "down" | "flat" {
  if (delta === null || Math.abs(delta) < 0.5) return "flat";
  const good = lowerIsBetter ? delta < 0 : delta > 0;
  return good ? "up" : "down";
}

/** Uma série por semana do período, na fonte pedida. */
export function weeklySeries(data: ReportData, metric: MetricKey, source: Source) {
  const src = sourceFor(metric, source);
  return data.weeks.map((w) => ({ label: shortDay(w.start), value: metricOf(totalsOf([w], src, data.leadSource), metric) }));
}

/** Meta x Google lado a lado no período. */
export function channelSeries(data: ReportData, metric: MetricKey) {
  return (["meta", "google"] as const).map((c) => ({
    label: c === "meta" ? "Meta Ads" : "Google Ads",
    value: metricOf(totalsOf(data.weeks, c), metric),
  }));
}

/**
 * Meta do período a partir da meta semanal do cliente: o que soma (leads,
 * verba) multiplica pelas semanas; o que é razão (CPL, ROAS) vale igual.
 */
export function autoTarget(data: ReportData, metric: MetricKey): number | null {
  const def = METRICS[metric];
  if (!def.targetKey) return null;
  const weekly = data.targets[def.targetKey];
  if (weekly === undefined || weekly === null) return null;
  return def.targetSums ? weekly * Math.max(1, data.weeks.length) : weekly;
}

/* ------------------------------ formatação ------------------------------ */

const nf = (min: number, max: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: max });

/** Número escrito como o cliente lê: "R$ 12.480", "3,2x", "1,8%", "12,4 mil". */
export function formatValue(v: number | null, format: NumberFormat, { compact = false } = {}): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const short = (n: number) => {
    if (abs >= 1_000_000) return `${nf(0, 1).format(n / 1_000_000)} mi`;
    if (abs >= 10_000) return `${nf(0, 1).format(n / 1_000)} mil`;
    return null;
  };
  switch (format) {
    case "currency": {
      const c = compact ? short(v) : null;
      if (c) return `R$ ${c}`;
      return `R$ ${abs >= 1000 ? nf(0, 0).format(v) : nf(2, 2).format(v)}`;
    }
    case "percent":
      return `${nf(1, 1).format(v)}%`;
    case "x":
      return `${nf(1, 2).format(v)}x`;
    case "decimal":
      return nf(0, 2).format(v);
    default:
      return (compact && short(v)) || nf(0, 0).format(Math.round(v));
  }
}

export function formatDelta(d: number | null): string {
  if (d === null) return "—";
  const sign = d > 0 ? "+" : d < 0 ? "−" : "";
  return `${sign}${nf(0, 1).format(Math.abs(d))}%`;
}

/* --------------------------- digitado à mão --------------------------- */

/** "12.480,50", "3,2", "R$ 1.200", "18%" → número. */
export function parseNumberBR(raw: string): number | null {
  const s = raw.replace(/R\$|%|x$/gi, "").trim().replace(/\s/g, "");
  if (!s) return null;
  // Com vírgula, o ponto é milhar; sem vírgula, ponto seguido de 3 dígitos também.
  const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/\.(?=\d{3}(\D|$))/g, "");
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

/** Linhas "Rótulo; valor" (ou tab, colado da planilha) → pontos do gráfico. */
export function parsePairs(text: string): { label: string; value: number | null }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(/\t|;/);
      const value = parts.length > 1 ? parseNumberBR(parts[parts.length - 1]) : null;
      const label = (parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0]).trim();
      return { label, value };
    });
}

/** Tabela colada da planilha (tab) ou separada por ";". */
export function parseGrid(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => l.split(/\t|;/).map((c) => c.trim()));
}

/* -------------------------------- datas -------------------------------- */

const shift = (day: string, n: number) => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);

/** Período imediatamente anterior, do mesmo tamanho. */
export function previousPeriod(start: string, end: string): { start: string; end: string } {
  const len = daysBetween(start, end) + 1;
  return { start: shift(start, -len), end: shift(start, -1) };
}

export const shortDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
export const longDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "outubro de 2026" quando o período é um mês cheio; senão "01/10/2026 a 31/10/2026". */
export function periodLabel(start: string, end: string): string {
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  const lastOfMonth = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 0)).getUTCDate();
  if (s.getUTCDate() === 1 && e.getUTCDate() === lastOfMonth) {
    if (s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth())
      return `${MONTHS[s.getUTCMonth()]} de ${s.getUTCFullYear()}`;
    if (s.getUTCFullYear() === e.getUTCFullYear())
      return `${MONTHS[s.getUTCMonth()]} a ${MONTHS[e.getUTCMonth()]} de ${s.getUTCFullYear()}`;
  }
  return `${longDay(start)} a ${longDay(end)}`;
}

export type PeriodPreset = "last_month" | "this_month" | "last_30" | "last_4w" | "last_12w" | "last_quarter";

export const PRESET_LABEL: Record<PeriodPreset, string> = {
  last_month: "Mês passado",
  this_month: "Este mês",
  last_30: "Últimos 30 dias",
  last_4w: "Últimas 4 semanas",
  last_12w: "Últimas 12 semanas",
  last_quarter: "Trimestre passado",
};

/** Datas do atalho de período, vistas em `today` (YYYY-MM-DD). */
export function presetRange(preset: PeriodPreset, today: string): { start: string; end: string } {
  const t = new Date(today + "T00:00:00Z");
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const yesterday = shift(today, -1);
  switch (preset) {
    case "last_month":
      return { start: iso(new Date(Date.UTC(y, m - 1, 1))), end: iso(new Date(Date.UTC(y, m, 0))) };
    case "this_month":
      return { start: iso(new Date(Date.UTC(y, m, 1))), end: yesterday < iso(new Date(Date.UTC(y, m, 1))) ? today : yesterday };
    case "last_30":
      return { start: shift(today, -30), end: yesterday };
    case "last_4w":
      return { start: shift(today, -28), end: yesterday };
    case "last_12w":
      return { start: shift(today, -84), end: yesterday };
    case "last_quarter": {
      const q = Math.floor(m / 3);
      return { start: iso(new Date(Date.UTC(y, (q - 1) * 3, 1))), end: iso(new Date(Date.UTC(y, q * 3, 0))) };
    }
  }
}

/* ------------------------------ variáveis ------------------------------ */

/** Variáveis aceitas nos textos — é o que faz um modelo servir a qualquer cliente. */
export const VARIABLES = [
  { key: "{cliente}", hint: "Nome do cliente" },
  { key: "{periodo}", hint: "Período do relatório" },
  { key: "{periodo_anterior}", hint: "Período de comparação" },
  { key: "{data}", hint: "Data de hoje" },
] as const;

export function fillVariables(text: string, data: ReportData, today: string): string {
  return text
    .replaceAll("{cliente}", data.client?.name ?? "Cliente")
    .replaceAll("{periodo_anterior}", periodLabel(data.previous.start, data.previous.end))
    .replaceAll("{periodo}", periodLabel(data.period.start, data.period.end))
    .replaceAll("{data}", longDay(today));
}

/** Sem números — capa e textos com cliente e período, para a miniatura da lista. */
export function blankData(client: { id: number; name: string } | null, start: string, end: string): ReportData {
  return {
    client,
    period: { start, end },
    previous: previousPeriod(start, end),
    weeks: [],
    prevWeeks: [],
    score: { value: null, band: null, day: null },
    targets: {},
    leadSource: "campaign",
    sample: false,
    source: { kind: "db" },
  };
}

/* ------------------------------- exemplo ------------------------------- */

/**
 * Números de exemplo para o modelo sem cliente: determinísticos (sem
 * `Math.random`), para o servidor e o navegador desenharem igual.
 */
export function sampleData(start: string, end: string): ReportData {
  const prev = previousPeriod(start, end);
  const weeksIn = (s: string, e: string, seed: number): WeekRow[] => {
    const out: WeekRow[] = [];
    // Semanas que fecham dentro do período, de 7 em 7 dias a partir do fim.
    for (let ref = e, i = 0; ref >= s; ref = shift(ref, -7), i++) {
      const k = 1 + 0.12 * Math.sin(seed + i * 1.7);
      const meta: ChannelNums = {
        spend: Math.round(2400 * k),
        impressions: Math.round(118_000 * k),
        reach: Math.round(46_000 * k),
        clicks: Math.round(1750 * k),
        leads: Math.round(96 * k * (1 + 0.05 * Math.cos(i))),
        conversations: Math.round(38 * k),
        purchases: Math.round(14 * k),
        revenue: Math.round(9800 * k),
        leadSpend: Math.round(2100 * k),
      };
      const google: ChannelNums = {
        spend: Math.round(1300 * k),
        impressions: Math.round(31_000 * k),
        reach: 0,
        clicks: Math.round(980 * k),
        leads: Math.round(41 * k),
        conversations: 0,
        purchases: Math.round(41 * k),
        revenue: Math.round(5200 * k),
        leadSpend: Math.round(1300 * k),
      };
      out.push({ ref, start: shift(ref, -6), meta, google, crmLeads: Math.round(120 * k) });
    }
    return out.reverse();
  };
  return {
    client: null,
    period: { start, end },
    previous: prev,
    weeks: weeksIn(start, end, 1),
    prevWeeks: weeksIn(prev.start, prev.end, 4),
    score: { value: 78, band: "verde", day: end },
    targets: { leads_meta: 140, cpl_meta: 30, budget_meta: 3800, revenue_meta: 14000, roas_meta: 3 },
    leadSource: "campaign",
    sample: true,
    source: { kind: "sample" },
  };
}
