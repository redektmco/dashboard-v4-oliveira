"use client";

import type { LeadSource } from "@/lib/model/types";
import { LEAD_SOURCE_LABEL, overviewMetrics, type CrmPeriodTotals } from "@/lib/performance/overview";
import { Icon } from "../icon";
import { Card } from "../kit";
import { usePerformanceData } from "./performance-data";

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const number = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const multiple = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`;

export function OverviewMetrics({ crm, source, periodLabel, clientId, query }: {
  crm: CrmPeriodTotals; source: LeadSource; periodLabel: string; clientId: number; query: string;
}) {
  const { data, error, loading, retry } = usePerformanceData();
  const m = overviewMetrics(data, crm, source);
  const items = [
    { label: "Valor investido", value: m.spend, format: money, detail: "Mídia · Meta + Google", pending: loading },
    { label: "Valor vendido", value: m.revenue, format: money, detail: "Vendas recebidas pelo webhook" },
    { label: "Vendas realizadas", value: m.sales, format: number, detail: "Negócios ganhos no CRM" },
    { label: "Total de leads", value: m.leads, format: number, detail: LEAD_SOURCE_LABEL[source], pending: loading && source !== "webhook", title: "Respeita a fonte configurada no cliente e a métrica de leads da Meta. No Google, usa as conversões principais, como em Performance." },
    { label: "ROAS", value: m.roas, format: multiple, detail: "Valor vendido ÷ mídia", pending: loading && crm.revenue !== null },
    { label: "CPV", value: m.cpv, format: money, detail: "Mídia ÷ vendas realizadas", pending: loading && crm.sales !== null, title: "Custo por venda. Considera apenas mídia; não é o CAC completo da operação." },
    { label: "CPL", value: m.cpl, format: money, detail: source === "campaign" ? "Verba de leads ÷ leads" : "Mídia ÷ leads", pending: loading },
    { label: "Ticket médio (TM)", value: m.ticket, format: money, detail: "Valor vendido ÷ vendas" },
    { label: "Impressões", value: m.impressions, format: number, detail: "Exibições · Meta + Google", pending: loading },
  ];
  const performanceHref = `/clientes/${clientId}${query ? `?${query}` : ""}#performance`;
  return (
    <section aria-label="Resultados do período" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-[15px] font-semibold text-ink-100">Resultados do período</h2>
        <span className="text-[12px] text-ink-400">{periodLabel}</span>
      </div>
      <Card className="overflow-hidden">
        <dl className="grid grid-cols-2 gap-px bg-[var(--border-hair)] sm:grid-cols-3 xl:grid-cols-5">
          {items.map((item) => (
            <div key={item.label} title={item.title} className="flex min-w-0 flex-col gap-1.5 bg-ink-900 px-4 py-3.5">
              <dt className="text-[11px] font-medium text-ink-300">{item.label}</dt>
              <dd className="tnum font-display text-[21px] font-semibold leading-tight tracking-[-0.5px] text-ink-100" aria-busy={Boolean(item.pending)}>
                {item.pending ? <span className="text-[13px] font-normal tracking-normal text-ink-400">Carregando…</span> : item.value === null ? "—" : item.format(item.value)}
              </dd>
              <span className="text-[11px] leading-4 text-ink-400">{item.detail}</span>
            </div>
          ))}
          <div className="flex flex-col justify-center gap-2 bg-ink-900 px-4 py-3.5">
            <dt className="text-[11px] text-ink-400">Canais, campanhas e evolução</dt>
            <dd><a href={performanceHref} className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-100 hover:underline">
              Analisar performance <Icon name="arrowRight" size={13} />
            </a></dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-hair)] px-4 py-2.5 text-[12px] text-ink-400">
          <span>Health Score e status abaixo refletem a saúde atual da conta.</span>
        </div>
      </Card>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1 text-[12px] leading-5 text-ink-400" role="status">
        {loading && <span>Atualizando mídia do período…</span>}
        {error && <span className="text-amarelo-fg">{error} <button type="button" onClick={retry} className="underline underline-offset-2">Tentar novamente</button></span>}
        {!loading && !error && m.failed.length > 0 && <span className="text-amarelo-fg">Mídia incompleta em {m.failed.join(", ")}. Revise a integração em Performance. <button type="button" onClick={retry} className="underline underline-offset-2">Tentar novamente</button></span>}
        {!loading && !error && !m.linked && <span>Nenhuma conta de mídia ativa vinculada.</span>}
        {crm.sales === null && <span>Nenhuma venda recebida pelo webhook. Valor vendido, vendas e ticket ainda sem dados.</span>}
        {source !== "campaign" && crm.leads === null && <span>Nenhum lead recebido pelo webhook; total de leads ainda sem dados.</span>}
        {source === "both" && <span>Campanhas + CRM somam as fontes e podem incluir o mesmo lead.</span>}
        <span>CPV considera só mídia; CAC completo exige os demais custos de aquisição.</span>
      </div>
    </section>
  );
}
