import type { LeadSource } from "../model/types";
import { CHANNELS, sumTotals, type PerformanceData } from "./model";

/** null = fonte ainda sem registros; zero = fonte conhecida, sem eventos no período. */
export type CrmPeriodTotals = { leads: number | null; sales: number | null; revenue: number | null };

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  campaign: "Campanhas",
  webhook: "Webhook do CRM",
  both: "Campanhas + CRM",
};

const divide = (a: number | null, b: number | null) => a !== null && b !== null && b > 0 ? a / b : null;

/** Razões dos totais do período; nunca média de CPL/ROAS ou soma pixel + CRM. */
export function overviewMetrics(data: PerformanceData | null, crm: CrmPeriodTotals, source: LeadSource) {
  const linked = data ? CHANNELS.map((c) => data.channels[c]).filter((c) => c.linked) : [];
  const failed = linked.flatMap((c) => c.accounts.filter((a) => a.error).map((a) => a.name));
  // Uma parte ausente não pode parecer o total da conta nem baratear os custos.
  const complete = linked.length > 0 && failed.length === 0;
  const media = complete ? sumTotals(linked.map((c) => c.totals)) : null;
  // Conversões agregadas do Google em e-commerce/branding não comprovam leads.
  const campaignLeads = data?.accountType === "lead_gen" ? media?.leadResults ?? null : null;
  const leads = source === "webhook" ? crm.leads : source === "campaign" ? campaignLeads
    : campaignLeads !== null && crm.leads !== null ? campaignLeads + crm.leads : null;
  const spend = media?.spend ?? null;
  // Mesma base de CPL da Performance; leads de CRM usam toda a verba, como no score.
  const cplSpend = source === "campaign" && media && media.leadSpend > 0 ? media.leadSpend : spend;
  return {
    spend,
    revenue: crm.revenue,
    sales: crm.sales,
    leads,
    impressions: media?.impressions ?? null,
    roas: divide(crm.revenue, spend),
    cpv: divide(spend, crm.sales),
    cpl: divide(cplSpend, leads),
    ticket: divide(crm.revenue, crm.sales),
    failed,
    linked: linked.length > 0,
  };
}
