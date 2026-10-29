import Link from "next/link";
import type { SalesResult } from "@/lib/crm/sales";
import type { FichaPeriod } from "@/lib/ficha-period";
import { Card } from "../kit";
import { SalesRefresh } from "./sales-refresh";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" });
const day = (value: string) => value.split("-").reverse().join("/");

export function SalesPanel({ client, sales, integration, period, query }: {
  client: { id: number; name: string }; sales: SalesResult;
  integration: { active: number } | null; period: Pick<FichaPeriod, "range">; query: string;
}) {
  const pageHref = (page: number) => `/clientes/${client.id}?${query ? `${query}&` : ""}vendas_pagina=${page}#vendas`;
  return <section aria-label="Vendas realizadas" className="flex min-w-0 flex-col gap-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-[16px] font-semibold text-ink-100">Vendas realizadas</h2><p className="mt-1 text-[12px] text-ink-400">Recebimento em São Paulo · atualização a cada 30 segundos. Semana de referência é o fechamento do ritual.</p></div><SalesRefresh /></header>
    {!integration && <Card className="p-4 text-[13px] text-ink-300">Sem integração de vendas configurada. O histórico existente permanece disponível.</Card>}
    {integration && !integration.active && <Card className="p-4 text-[13px] text-ink-300">Integração desativada. O histórico de vendas permanece disponível.</Card>}
    <div className="grid gap-3 sm:grid-cols-3">
      {[{ label: "Vendas no período", value: sales.count.toLocaleString("pt-BR") }, { label: "Valor total", value: money(sales.revenue) }, { label: "Ticket médio", value: sales.ticket === null ? "—" : money(sales.ticket) }].map(metric =>
        <Card key={metric.label} className="p-4"><p className="text-[12px] text-ink-400">{metric.label}</p><p className="mt-2 break-words text-[24px] font-semibold text-ink-100">{metric.value}</p></Card>)}
    </div>
    <Card className="min-w-0 overflow-hidden">
      <div className="border-b border-[var(--border-hair)] p-4"><h2 className="font-semibold text-ink-100">Recebimentos · {period.range}</h2><p className="mt-1 text-[12px] text-ink-400">A semana de referência é usada no ritual; o filtro considera a data de recebimento. Totais incluem todas as páginas.</p></div>
      {sales.rows.length === 0 ? <div className="p-8 text-center"><p className="text-ink-100">Nenhuma venda recebida neste período.</p><p className="mt-2 text-[13px] text-ink-400">Selecione outro período para consultar o histórico.</p></div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <caption className="sr-only">Vendas recebidas por {client.name}, em ordem de recebimento mais recente</caption>
          <thead className="bg-ink-800 text-[11px] uppercase text-ink-400"><tr>{["ID interno", "Recebimento (São Paulo)", "ID do negócio", "Valor", "Semana de referência"].map(label => <th key={label} scope="col" className="px-4 py-3">{label}</th>)}</tr></thead>
          <tbody>{sales.rows.map(sale => <tr key={sale.id} className="border-t border-[var(--border-hair)] text-ink-200">
            <td className="px-4 py-3 font-mono">#{sale.id}</td><td className="whitespace-nowrap px-4 py-3">{dateTime.format(new Date(sale.receivedAt))}</td>
            <td className="max-w-[240px] break-all px-4 py-3">{sale.externalId ?? "—"}</td><td className="whitespace-nowrap px-4 py-3 tnum">{money(sale.value)}</td><td className="whitespace-nowrap px-4 py-3">{day(sale.referenceWeek)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      <nav aria-label="Paginação de vendas" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-hair)] p-4 text-[13px] text-ink-300">
        <span>{sales.count} vendas · Página {sales.page} de {sales.pages}</span><div className="flex gap-4">{sales.page > 1 && <Link href={pageHref(sales.page - 1)} className="hover:text-ink-100">Anterior</Link>}{sales.page < sales.pages && <Link href={pageHref(sales.page + 1)} className="hover:text-ink-100">Próxima</Link>}</div>
      </nav>
    </Card>
    <p className="text-[12px] text-ink-400">Apenas vendas aceitas são registradas. Tentativas duplicadas e rejeitadas não aparecem no histórico.</p>
  </section>;
}
