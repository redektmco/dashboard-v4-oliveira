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
  /**
   * Eventos padrão do pixel (Contato, Agendar, Enviar inscrição…) vêm aqui,
   * não em `actions` — é onde mora o "Contatos no site" do Gerenciador.
   */
  conversions?: Action[];
  conversion_values?: Action[];
  date_start: string;
  date_stop: string;
};

/** Campos de evento que toda leitura de insights pede. */
export const EVENT_FIELDS = "actions,action_values,conversions,conversion_values";

/** `actions` + `conversions`: o mesmo tipo pode vir nos dois, e `pick` fica com o primeiro. */
const events = (r: Pick<InsightRow, "actions" | "conversions">) => [...(r.actions ?? []), ...(r.conversions ?? [])];
const eventValues = (r: Pick<InsightRow, "action_values" | "conversion_values">) => [
  ...(r.action_values ?? []),
  ...(r.conversion_values ?? []),
];

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
/** Evento "Contato" do pixel — o "Contatos no site" do Gerenciador (em `conversions` ou `actions`). */
const CONTACT_TYPES = [
  "contact_total",
  "contact_website",
  "offsite_conversion.fb_pixel_contact",
  "onsite_web_contact",
  "contact",
];
const CONVERSATION_TYPES = [
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.total_messaging_connection",
];
const PURCHASE_TYPES = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"];
const CLICK_TYPES = ["link_click"];

/* --------------------- o que a campanha otimiza --------------------- */

/**
 * O evento que um conjunto de anúncios otimiza — é o que o Gerenciador chama
 * de "Resultados". Contar por ele (e não só por uma lista fixa de nomes) é o
 * que pega Contato, Agendamento, Inscrição e conversão personalizada sem
 * depender de alguém lembrar de cadastrar cada nome de evento.
 */
export type AdSetGoal = {
  campaign_id?: string;
  optimization_goal?: string;
  promoted_object?: {
    custom_event_type?: string;
    custom_conversion_id?: string;
    custom_event_str?: string;
  };
};

export type OptimizedEvent = { key: string; kind: "lead" | "conversation" | "purchase"; types: string[] };

/** Eventos padrão do pixel que são lead para uma conta de geração de leads. */
const LEAD_EVENTS = new Set([
  "LEAD",
  "CONTACT",
  "SCHEDULE",
  "SUBMIT_APPLICATION",
  "COMPLETE_REGISTRATION",
  "START_TRIAL",
  "SUBSCRIBE",
  "FIND_LOCATION",
]);

/** Os nomes que um evento padrão pode ter na resposta (em `actions` ou em `conversions`). */
const eventTypes = (event: string): string[] => {
  const e = event.toLowerCase();
  return [`offsite_conversion.fb_pixel_${e}`, `${e}_total`, `${e}_website`, `onsite_web_${e}`, e];
};

export function optimizedEvent(a: AdSetGoal): OptimizedEvent | null {
  const goal = a.optimization_goal ?? "";
  const po = a.promoted_object ?? {};
  if (goal === "LEAD_GENERATION" || goal === "QUALITY_LEAD")
    return { key: "form", kind: "lead", types: ["onsite_conversion.lead_grouped", "lead", "leadgen_grouped"] };
  if (goal === "CONVERSATIONS" || goal === "MESSAGING_PURCHASE_CONVERSION" || goal === "MESSAGING_APPOINTMENT_CONVERSION")
    return { key: "conv", kind: "conversation", types: CONVERSATION_TYPES };
  if (po.custom_conversion_id)
    return { key: `custom:${po.custom_conversion_id}`, kind: "lead", types: [`offsite_conversion.custom.${po.custom_conversion_id}`] };
  const ev = (po.custom_event_type ?? "").toUpperCase();
  if (ev === "PURCHASE") return { key: "purchase", kind: "purchase", types: PURCHASE_TYPES };
  if (LEAD_EVENTS.has(ev)) {
    const types = ev === "LEAD" ? [...LEAD_TYPES, ...eventTypes(ev)] : ev === "CONTACT" ? [...CONTACT_TYPES, ...eventTypes(ev)] : eventTypes(ev);
    return { key: ev, kind: "lead", types };
  }
  if (ev === "OTHER" && po.custom_event_str) return { key: `other:${po.custom_event_str}`, kind: "lead", types: ["offsite_conversion.fb_pixel_custom"] };
  return null;
}

/** Eventos otimizados por campanha (vários conjuntos podem otimizar coisas diferentes). */
export type CampaignGoals = Map<string, OptimizedEvent[]>;

export function campaignGoals(adsets: AdSetGoal[]): CampaignGoals {
  const out: CampaignGoals = new Map();
  for (const a of adsets) {
    const ev = optimizedEvent(a);
    if (!ev || !a.campaign_id) continue;
    const list = out.get(a.campaign_id) ?? [];
    if (!list.some((x) => x.key === ev.key)) list.push(ev);
    out.set(a.campaign_id, list);
  }
  return out;
}

/** Leads do que a campanha otimiza (o maior entre os eventos de lead, para não contar o mesmo envio duas vezes). */
function optimizedLeads(list: Action[], goals: OptimizedEvent[] | undefined): number {
  if (!goals) return 0;
  return Math.max(0, ...goals.filter((g) => g.kind === "lead").map((g) => pick(list, g.types)));
}

export function parseInsight(row: InsightRow & { campaign_id?: string }, goals?: CampaignGoals): MetaWeek {
  const ev = events(row);
  return {
    spend: num(row.spend),
    leads: Math.max(siteLeads(ev), optimizedLeads(ev, row.campaign_id ? goals?.get(row.campaign_id) : undefined)),
    conversations: pick(ev, CONVERSATION_TYPES),
    purchases: pick(ev, PURCHASE_TYPES),
    revenue: pick(eventValues(row), PURCHASE_TYPES),
    reach: num(row.reach),
    impressions: num(row.impressions),
    clicks: pick(row.actions, CLICK_TYPES),
    leadSpend: 0,
    convSpend: 0,
    resultSpend: 0,
  };
}

export type CampaignRow = Pick<InsightRow, "spend" | "actions" | "conversions" | "date_start" | "date_stop"> & {
  campaign_id?: string;
};

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
export function campaignTotals(rows: CampaignRow[], goals?: CampaignGoals): CampaignTotals {
  const out: CampaignTotals = { leads: 0, conversations: 0, leadSpend: 0, convSpend: 0, resultSpend: 0 };
  for (const r of rows) {
    const spend = num(r.spend);
    const w = parseInsight({ ...r, date_start: r.date_start, date_stop: r.date_stop }, goals);
    const leads = w.leads;
    const conv = w.conversations;
    out.leads += leads;
    out.conversations += conv;
    if (leads > 0) out.leadSpend += spend;
    if (conv > 0) out.convSpend += spend;
    if (leads > 0 || conv > 0) out.resultSpend += spend;
  }
  return out;
}

/* ------------------------------ vigia ------------------------------ */

/**
 * Eventos que não são resultado (engajamento, navegação): nunca viram alerta.
 * Todo o resto que aparece numa campanha com verba e resultado zero vira.
 */
const NOT_RESULTS = /^(link_click|landing_page_view|page_engagement|post_engagement|post_reaction|post|comment|like|video_view|photo_view|onsite_conversion\.post_save|post_interaction_gross|post_interaction_net|onsite_conversion\.flow_complete|view_content|offsite_conversion\.fb_pixel_view_content|.*view_content.*|omni_view_content|search|.*_search|add_to_wishlist.*|frequency_.*)$/;

export type UnreadEvent = { campaign: string; spend: number; events: Record<string, number> };

/**
 * Campanhas com verba, sem nenhum lead, conversa ou compra contado, mas com
 * eventos de conversão na resposta — o painel estaria mostrando zero onde o
 * Gerenciador mostra resultado. É o que acende o alerta da conta.
 */
export function unreadEvents(
  rows: (CampaignRow & { campaign_name?: string })[],
  goals?: CampaignGoals,
): UnreadEvent[] {
  const out: UnreadEvent[] = [];
  for (const r of rows) {
    const spend = num(r.spend);
    if (spend <= 0) continue;
    const w = parseInsight({ ...r, date_start: r.date_start, date_stop: r.date_stop }, goals);
    if (w.leads > 0 || w.conversations > 0 || w.purchases > 0) continue;
    const found: Record<string, number> = {};
    for (const a of events(r)) {
      const v = num(a.value);
      if (v > 0 && !NOT_RESULTS.test(a.action_type)) found[a.action_type] = Math.max(found[a.action_type] ?? 0, v);
    }
    if (Object.keys(found).length) out.push({ campaign: r.campaign_name || r.campaign_id || "campanha", spend, events: found });
  }
  return out;
}

/** Uma linha para o alerta: "Campanha X (R$ 120): 31 × schedule_total". */
export function describeUnread(list: UnreadEvent[] | null | undefined): string | null {
  if (!list?.length) return null;
  const top = list[0];
  const ev = Object.entries(top.events)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k, v]) => `${v} × ${k}`)
    .join(", ");
  const more = list.length > 1 ? ` e mais ${list.length - 1} campanha(s)` : "";
  return `Evento não contado como resultado — ${top.campaign}: ${ev}${more}`;
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
