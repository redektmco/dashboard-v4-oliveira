/**
 * Regras puras do Meta Ads: leitura da resposta da API de Insights e tradução
 * para os campos do GT. Não toca em rede nem banco — é o que os testes cobrem.
 */
import type { AccountType } from "../model/types";

/** O que conta como "lead" numa conta: formulário/pixel, conversa no WhatsApp/Direct, ou os dois. */
export type LeadMetric = "lead" | "messaging" | "both";

export const LEAD_METRIC_LABEL: Record<LeadMetric, string> = {
  lead: "Formulário / pixel",
  messaging: "Conversas iniciadas",
  both: "Formulário + conversas",
};

/** Uma semana-ritual de uma conta (ou a soma das contas de um cliente). */
export type MetaWeek = {
  spend: number;
  leads: number;
  conversations: number;
  purchases: number;
  revenue: number;
  reach: number;
  impressions: number;
  clicks: number;
};

export const EMPTY_WEEK: MetaWeek = {
  spend: 0,
  leads: 0,
  conversations: 0,
  purchases: 0,
  revenue: 0,
  reach: 0,
  impressions: 0,
  clicks: 0,
};

type Action = { action_type: string; value: string };
export type InsightRow = {
  spend?: string;
  reach?: string;
  impressions?: string;
  actions?: Action[];
  action_values?: Action[];
  date_start: string;
  date_stop: string;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Primeiro tipo de ação presente, na ordem de preferência. A Meta devolve o
 * agregado (`lead`, `purchase`) junto com as quebras por origem — somar tudo
 * contaria o mesmo lead duas ou três vezes.
 */
function pick(list: Action[] | undefined, types: string[]): number {
  if (!list) return 0;
  for (const t of types) {
    const hit = list.find((a) => a.action_type === t);
    if (hit) return num(hit.value);
  }
  return 0;
}

const LEAD_TYPES = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];
const CONVERSATION_TYPES = [
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.total_messaging_connection",
];
const PURCHASE_TYPES = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"];
const CLICK_TYPES = ["link_click"];

export function parseInsight(row: InsightRow): MetaWeek {
  return {
    spend: num(row.spend),
    leads: pick(row.actions, LEAD_TYPES),
    conversations: pick(row.actions, CONVERSATION_TYPES),
    purchases: pick(row.actions, PURCHASE_TYPES),
    revenue: pick(row.action_values, PURCHASE_TYPES),
    reach: num(row.reach),
    impressions: num(row.impressions),
    clicks: pick(row.actions, CLICK_TYPES),
  };
}

export function leadsOf(w: MetaWeek, metric: LeadMetric): number {
  if (metric === "lead") return w.leads;
  if (metric === "messaging") return w.conversations;
  return w.leads + w.conversations;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Campos do GT que a semana da Meta preenche, por tipo de conta.
 * `leads` já vem resolvido pela métrica escolhida em cada conta (e pelo CRM,
 * quando houver — o CRM enxerga todos os canais, a Meta só a própria mídia).
 * Razões com denominador zero ficam de fora: sem lead não há CPL.
 */
export function metaFields(type: AccountType, w: MetaWeek, leads: number): Record<string, number> {
  const out: Record<string, number> = { budget_real: round2(w.spend) };
  if (type === "lead_gen") {
    out.leads_real = leads;
    if (leads > 0) out.cpl_real = round2(w.spend / leads);
  } else if (type === "ecommerce") {
    out.revenue_real = round2(w.revenue);
    if (w.spend > 0) out.roas_real = round2(w.revenue / w.spend);
    if (w.purchases > 0) out.ticket_real = round2(w.revenue / w.purchases);
  } else {
    out.reach_real = w.reach;
  }
  return out;
}

/** Datas (inclusive) da semana-ritual que fecha em `ref`. */
export function weekRange(ref: string): { since: string; until: string } {
  const d = new Date(ref + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 6);
  return { since: d.toISOString().slice(0, 10), until: ref };
}
