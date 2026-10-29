import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClient, today } from "@/lib/repo";
import { one } from "@/lib/db";
import { parsePeriod, periodQuery } from "@/lib/ficha-period";
import { listSales, salesPage } from "@/lib/crm/sales";
import { PeriodPicker } from "@/components/cliente/period-picker";
import { PageHead } from "@/components/page-head";
import { Card } from "@/components/kit";

export const dynamic = "force-dynamic";
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" });
const day = (value: string) => value.split("-").reverse().join("/");

export default async function SalesPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ periodo?: string | string[]; de?: string | string[]; ate?: string | string[]; page?: string | string[] }>;
}) {
  await requireUser();
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();
  const client = await getClient(Number(id));
  if (!client) notFound();
  const sp = await searchParams;
  const currentDay = today();
  const period = parsePeriod(sp, currentDay);
  const [sales, integration] = await Promise.all([
    listSales(client.id, period.since, period.until, salesPage(sp.page)),
    one<{ active: number }>("SELECT active FROM crm_integrations WHERE client_id = ?", [client.id]),
  ]);
  const query = periodQuery(period);
  const back = `/clientes/${id}${query ? `?${query}` : ""}`;
  const pageHref = (page: number) => `/clientes/${id}/vendas?${query ? `${query}&` : ""}page=${page}`;
  return <div className="flex min-w-0 flex-col gap-6">
    <PageHead title="Vendas realizadas" description={`${client.name} · Vendas recebidas pelo webhook, no horário de São Paulo.`}
      crumbs={[{ href: "/clientes", label: "Clientes" }, { href: back, label: client.name }, { label: "Vendas realizadas" }]}
      actions={<PeriodPicker value={period} today={currentDay} />} />
    <Link href={back} className="w-fit text-[13px] text-ink-300 hover:text-ink-100">← Voltar à ficha do cliente</Link>
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
  </div>;
}
