"use client";

import type { LeadSource } from "@/lib/model/types";
import { LEAD_SOURCE_LABEL, overviewMetrics, type CrmPeriodTotals } from "@/lib/performance/overview";
import { serviceScope } from "@/lib/model/services";
import { Icon } from "../icon";
import { Card } from "../kit";
import { usePerformanceData } from "./performance-data";

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const number = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const multiple = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`;
const percent = (n: number, d: number) => `${(n / d * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const width = (value: number | null, max: number) => value !== null && max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0;
const overline = "text-[10px] font-semibold uppercase tracking-[0.8px] text-ink-400";

function MetricValue({ value, format = number, pending = false }: { value: number | null; format?: (n: number) => string; pending?: boolean }) {
  return <span aria-busy={pending}>{pending ? <span className="text-[12px] font-normal tracking-normal text-ink-400">Carregando…</span> : value === null ? "—" : format(value)}</span>;
}
function Track({ value, max, red = false, tall = false }: { value: number | null; max: number; red?: boolean; tall?: boolean }) {
  return <div aria-hidden="true" className={`w-full overflow-hidden rounded-full bg-ink-800 ${tall ? "h-2.5" : "h-1.5"}`}><div className={`h-full rounded-full ${red ? "bg-[#E50914]" : "bg-gradient-to-r from-[#6E9BF5] to-[#6E9BF5]/40"}`} style={{ width: `${width(value, max)}%` }} /></div>;
}

export function OverviewMetrics({ crm, source, periodLabel, clientId, query, services = [] }: {
  crm: CrmPeriodTotals; source: LeadSource; periodLabel: string; clientId: number; query: string; services?: string[];
}) {
  const { data, error, loading, retry } = usePerformanceData();
  const m = overviewMetrics(data, crm, source);
  const scope = serviceScope(services);
  const media = scope.media !== false;
  // Campaign conversions in commerce/branding are not identified as leads.
  const showLeads = source === "webhook" || !data || data.accountType === "lead_gen";
  const leadPending = loading && source !== "webhook";
  const performanceHref = `/clientes/${clientId}${query ? `?${query}` : ""}#performance`;
  const salesHref = `/clientes/${clientId}${query ? `?${query}` : ""}#vendas`;
  if (!media && scope.crm === false) return <Card className="p-4">
    <h2 className="font-display text-[15px] font-semibold text-ink-100">Serviços e entregáveis</h2>
    <p className="mt-2 text-[13px] text-ink-300">{services.join(" · ")}</p>
    <p className="mt-1 text-[12px] text-ink-400">Sem mídia ou CRM no escopo cadastrado. Indicadores de campanha não se aplicam a este contrato. Saúde, entregas e histórico continuam disponíveis.</p>
    <a href={salesHref} className="mt-3 inline-block text-[12px] text-ink-200 underline">Consultar histórico de vendas</a>
  </Card>;
  const moneyMax = Math.max(m.spend ?? 0, m.revenue ?? 0);
  const stages = [
    ...(media ? [{ label: "Impressões", value: m.impressions, detail: "Exibições · Meta + Google", pending: loading, max: m.impressions ?? 0, link: false }] : []),
    ...(showLeads ? [{ label: "Leads", value: m.leads, detail: `${LEAD_SOURCE_LABEL[source]}${media && !loading && m.leads !== null && m.impressions !== null && m.impressions > 0 ? ` · ${percent(m.leads, m.impressions)} das impressões` : ""}`, pending: leadPending, max: media ? m.impressions ?? 0 : m.leads ?? 0, link: false }] : []),
    { label: "Vendas", value: m.sales, detail: `Negócios ganhos no CRM${showLeads && !leadPending && m.sales !== null && m.leads !== null && m.leads > 0 ? ` · ${percent(m.sales, m.leads)} do volume de leads` : ""}`, pending: false, max: showLeads ? m.leads ?? 0 : m.sales ?? 0, link: true },
  ];
  const costs = [
    ...(media && showLeads ? [{ label: "CPL", value: m.cpl, detail: source === "campaign" ? "Verba de leads ÷ leads" : "Mídia ÷ leads", pending: loading }] : []),
    ...(media ? [{ label: "CPV", value: m.cpv, detail: "Mídia ÷ vendas realizadas", pending: loading && crm.sales !== null }] : []),
    { label: "Ticket médio", value: m.ticket, detail: "Valor vendido ÷ vendas", pending: false },
  ];
  return <section aria-label="Resultados do período" className="flex min-w-0 flex-col gap-3">
    <Card className="min-w-0 overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-[18px] lg:px-6">
        <div className="min-w-0"><h2 className="text-[15px] font-semibold text-ink-100">{media ? "Desempenho de mídia" : "Resultados do CRM"}</h2><p className="mt-0.5 text-[12px] text-ink-400">{media ? "Meta + Google" : "Vendas recebidas pelo webhook"} · {periodLabel}</p></div>
        {media && <a href={performanceHref} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-100 hover:underline">Analisar performance <Icon name="arrowRight" size={14} /></a>}
      </header>
      <div className={`grid min-w-0 border-t border-[var(--border-hair)] ${media ? "xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.4fr)_minmax(0,1fr)]" : "md:grid-cols-2"}`}>
        {media && <div className="flex min-w-0 flex-col gap-5 p-5 lg:p-6">
          <h3 className={overline}>ROAS</h3>
          <div className="flex min-w-0 flex-wrap items-end gap-3" title="Referência de receita igual à mídia; não representa margem ou lucro.">
            <div className="tnum break-all font-display text-[52px] font-bold leading-[52px] tracking-[-1.5px]"><MetricValue value={m.roas} format={multiple} pending={loading && crm.revenue !== null} /></div>
            <div className="min-w-0 pb-1"><p className={`text-[12px] font-semibold ${m.roas === null || loading ? "text-ink-400" : m.roas < 1 ? "text-vermelho-fg" : "text-verde-fg"}`}>{loading ? "Atualizando mídia" : m.roas === null ? "Sem dados para comparar" : m.roas < 1 ? "● Receita abaixo da mídia" : "● Receita cobre a mídia"}</p><p className="mt-0.5 text-[11px] text-ink-500">Referência de mídia: 1,0x</p></div>
          </div>
          <div className="flex flex-col gap-3.5">{[{ label: "Investido", value: m.spend, pending: loading, red: true }, { label: "Vendido", value: m.revenue, pending: false, red: false }].map(item => <div key={item.label} className="space-y-1.5"><div className="flex flex-wrap justify-between gap-x-3 gap-y-1"><span className="text-[12px] text-ink-400">{item.label}</span><span className="tnum break-all font-mono text-[13px] font-semibold text-ink-100"><MetricValue value={item.value} format={money} pending={item.pending} /></span></div><Track value={item.pending ? null : item.value} max={moneyMax} red={item.red} /></div>)}</div>
          <p className="text-[11px] text-ink-500">Vendas recebidas pelo webhook.</p>
        </div>}
        <div className={`flex min-w-0 flex-col gap-[18px] border-[var(--border-hair)] p-5 lg:p-6 ${media ? "border-t xl:border-l xl:border-t-0" : ""}`}>
          <h3 className={overline} title="Razões entre volumes de fontes distintas, sem comprovar atribuição individual ou conversão de pessoas.">{media ? "Funil de aquisição" : "Volumes do CRM"}</h3>
          {stages.map(stage => <div key={stage.label} className="space-y-2"><div className="flex items-end justify-between gap-3"><div className="min-w-0"><h4 className="text-[13px] font-medium text-ink-100">{stage.link ? <a href={salesHref} className="underline decoration-ink-500 underline-offset-4 hover:decoration-ink-100">Vendas <span className="sr-only">realizadas — consultar histórico</span><Icon name="arrowRight" size={12} className="ml-1 inline-block" /></a> : stage.label}</h4><p className="mt-0.5 text-[11px] leading-4 text-ink-500">{stage.detail}</p></div><div className="tnum shrink-0 font-display text-[22px] font-bold text-ink-100"><MetricValue value={stage.value} pending={stage.pending} /></div></div><Track value={stage.pending ? null : stage.value} max={stage.max} tall /></div>)}

        </div>
        <div className="min-w-0 border-t border-[var(--border-hair)] p-5 md:border-l lg:p-6 xl:border-t-0">
          <h3 className={`${overline} mb-3.5`}>Custos unitários</h3>
          <dl>{costs.map((cost, index) => <div key={cost.label} className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3.5 ${index < costs.length - 1 ? "border-b border-[var(--border-hair)]" : ""}`}><div className="min-w-0"><dt className="text-[13px] font-medium text-ink-100">{cost.label}</dt><p className="mt-0.5 text-[11px] leading-4 text-ink-500">{cost.detail}</p></div><dd className="tnum break-all font-mono text-[17px] font-semibold text-ink-100"><MetricValue value={cost.value} format={money} pending={cost.pending} /></dd></div>)}</dl>
        </div>
      </div>
      <footer className="flex flex-wrap justify-between gap-x-5 gap-y-2 border-t border-[var(--border-hair)] bg-ink-800/40 px-5 py-3 text-[12px] leading-5 text-ink-400 lg:px-6"><span>Custos unitários aparecem quando houver leads e vendas no período.</span>{media && <span>CPV considera só mídia; CAC completo exige os demais custos.</span>}</footer>
    </Card>
    <div className="flex flex-wrap items-start gap-x-4 gap-y-1 text-[12px] leading-5 text-ink-400" role="status">
      {media && loading && <span>Atualizando mídia do período…</span>}
      {media && error && <span className="text-amarelo-fg">{error} <button type="button" onClick={retry} className="underline underline-offset-2">Tentar novamente</button></span>}
      {media && !loading && !error && m.failed.length > 0 && <span className="text-amarelo-fg">Mídia incompleta em {m.failed.join(", ")}. Revise a integração em Performance. <button type="button" onClick={retry} className="underline underline-offset-2">Tentar novamente</button></span>}
      {media && !loading && !error && !m.linked && <span>Nenhuma conta de mídia ativa vinculada.</span>}
      {crm.sales === null && <span>Nenhuma venda recebida pelo webhook. Valor vendido, vendas e ticket ainda sem dados.</span>}
      {showLeads && source !== "campaign" && crm.leads === null && <span>Nenhum lead recebido pelo webhook; total de leads ainda sem dados.</span>}
      {showLeads && source === "both" && <span>Campanhas + CRM somam as fontes e podem incluir o mesmo lead.</span>}
    </div>
  </section>;
}
