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
  /**
   * Verba só das campanhas que geraram o resultado — é a base do CPL. Campanha
   * de alcance ou de visita ao Instagram não entra: somar a verba dela
   * inflaria o custo de cada lead. `leadSpend` = campanhas com formulário ou
   * contato no site, `convSpend` = com conversa, `resultSpend` = com qualquer um.
   */
  leadSpend: number;
  convSpend: number;
  resultSpend: number;
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
  leadSpend: 0,
  convSpend: 0,
  resultSpend: 0,
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
/** Evento "Contato" do pixel — o "Contatos no site" do Gerenciador. */
const CONTACT_TYPES = ["contact_total", "contact_website", "offsite_conversion.fb_pixel_contact", "onsite_web_contact"];
const CONVERSATION_TYPES = [
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.total_messaging_connection",
];
const PURCHASE_TYPES = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"];
const CLICK_TYPES = ["link_click"];

export function parseInsight(row: InsightRow): MetaWeek {
  return {
    spend: num(row.spend),
    leads: siteLeads(row.actions),
    conversations: pick(row.actions, CONVERSATION_TYPES),
    purchases: pick(row.actions, PURCHASE_TYPES),
    revenue: pick(row.action_values, PURCHASE_TYPES),
    reach: num(row.reach),
    impressions: num(row.impressions),
    clicks: pick(row.actions, CLICK_TYPES),
    leadSpend: 0,
    convSpend: 0,
    resultSpend: 0,
  };
}

export type CampaignRow = Pick<InsightRow, "spend" | "actions" | "date_start" | "date_stop"> & { campaign_id?: string };

/** Leads de site de uma campanha: formulário/pixel ou contato. */
export function siteLeads(actions: Action[] | undefined): number {
  // Maior dos dois, não a soma: site que dispara Lead e Contact no mesmo
  // envio contaria cada pessoa duas vezes.
  return Math.max(pick(actions, LEAD_TYPES), pick(actions, CONTACT_TYPES));
}

type CampaignTotals = Pick<MetaWeek, "leads" | "conversations" | "leadSpend" | "convSpend" | "resultSpend">;

/**
 * Leads, conversas e a verba que os gerou, somando campanha a campanha. É o
 * que separa "Contatos no site" de "Visitas ao Instagram" numa mesma conta:
 * a conta inteira junta a verba das duas, e o CPL sairia errado.
 */
export function campaignTotals(rows: CampaignRow[]): CampaignTotals {
  const out: CampaignTotals = { leads: 0, conversations: 0, leadSpend: 0, convSpend: 0, resultSpend: 0 };
  for (const r of rows) {
    const spend = num(r.spend);
    const leads = siteLeads(r.actions);
    const conv = pick(r.actions, CONVERSATION_TYPES);
    out.leads += leads;
    out.conversations += conv;
    if (leads > 0) out.leadSpend += spend;
    if (conv > 0) out.convSpend += spend;
    if (leads > 0 || conv > 0) out.resultSpend += spend;
  }
  return out;
}

export function leadsOf(w: MetaWeek, metric: LeadMetric): number {
  if (metric === "lead") return w.leads;
  if (metric === "messaging") return w.conversations;
  return w.leads + w.conversations;
}

/** Verba das campanhas que geraram os leads da métrica escolhida — base do CPL. */
export function leadSpendOf(w: MetaWeek, metric: LeadMetric): number {
  if (metric === "lead") return w.leadSpend;
  if (metric === "messaging") return w.convSpend;
  return w.resultSpend;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Campos do GT que a semana da Meta preenche, por tipo de conta.
 * `leads` já vem resolvido pela métrica escolhida em cada conta (e pelo CRM,
 * quando houver — o CRM enxerga todos os canais, a Meta só a própria mídia).
 * O CPL divide pela verba das campanhas de lead (`leadSpend`); sem ela (lead
 * só do CRM, conta sem campanha de lead) cai na verba total.
 * Razões com denominador zero ficam de fora: sem lead não há CPL.
 */
export function metaFields(type: AccountType, w: MetaWeek, leads: number, leadSpend = 0): Record<string, number> {
  const out: Record<string, number> = { budget_real: round2(w.spend) };
  if (type === "lead_gen") {
    out.leads_real = leads;
    if (leads > 0) out.cpl_real = round2((leadSpend > 0 ? leadSpend : w.spend) / leads);
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
