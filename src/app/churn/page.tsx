import Link from "next/link";
import { listRequests } from "@/lib/churn/db";
import { addDays, isOpen, money } from "@/lib/churn/types";
import { listUsers, today } from "@/lib/repo";
import { Icon } from "@/components/icon";
import { CHURN_TABS, ChurnHeader } from "@/components/churn/ui";
import { RequestsBoard } from "@/components/churn/requests-board";
import { Box, Dot } from "@/components/churn/ui";
import type { ChurnTone } from "@/lib/churn/types";

export const dynamic = "force-dynamic";

/** Churn 01 — Gestão de solicitações. */
export default async function ChurnPage() {
  const at = today();
  const [requests, users] = await Promise.all([listRequests(), listUsers()]);
  const since = addDays(at, -90);

  const open = requests.filter((r) => isOpen(r.status));
  const closed90 = requests.filter((r) => !isOpen(r.status) && (r.closed_at ?? r.updated_at).slice(0, 10) >= since);
  const canceled = closed90.filter((r) => r.status === "cancelado");
  const retained = closed90.filter((r) => r.status === "retido");
  const rate = canceled.length + retained.length ? Math.round((retained.length / (canceled.length + retained.length)) * 100) : null;

  return (
    <>
      <ChurnHeader
        crumbs={[{ href: "/churn", label: "Churn" }]}
        title="Solicitações"
        description="Solicitações de cancelamento já formalizadas pelos clientes — da análise ao encerramento ou retenção."
        tabs={CHURN_TABS}
        actions={
          <Link href="/churn/nova" className="btn btn-light">
            <Icon name="plus" size={15} />
            Nova solicitação
          </Link>
        }
      />

      <Box className="grid grid-cols-2 gap-5 px-5 py-5 md:grid-cols-3 lg:px-6 xl:flex xl:items-stretch">
        <Kpi tone="azul" label="Solicitações abertas" value={String(open.length)} hint={`${open.filter((r) => r.status === "solicitado").length} aguardando análise`} />
        <Kpi tone="vermelho" label="Cancelamentos concluídos" value={String(canceled.length)} hint="Últimos 90 dias" />
        <Kpi tone="verde" label="Clientes retidos" value={String(retained.length)} hint={rate === null ? "Últimos 90 dias" : `Taxa de retenção de ${rate}%`} />
        <Kpi
          tone="vermelho"
          label="Receita perdida (MRR)"
          value={money(canceled.reduce((a, r) => a + r.mrr, 0))}
          unit="/mês"
          hint={`${canceled.length} ${canceled.length === 1 ? "contrato encerrado" : "contratos encerrados"}`}
        />
        <Kpi
          tone="amarelo"
          label="Receita em negociação"
          value={money(open.reduce((a, r) => a + r.mrr, 0))}
          unit="/mês"
          hint={`${open.length} ${open.length === 1 ? "solicitação em andamento" : "solicitações em andamento"}`}
        />
      </Box>

      <RequestsBoard requests={requests} owners={users.map((u) => u.name)} today={at} />
    </>
  );
}

function Kpi({ tone, label, value, unit, hint }: { tone: ChurnTone; label: string; value: string; unit?: string; hint: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5 xl:border-l xl:border-[var(--border-hair)] xl:pl-5 xl:first:border-l-0 xl:first:pl-0">
      <span className="flex items-center gap-[7px] text-[13px] text-ink-300">
        <Dot tone={tone} />
        {label}
      </span>
      <span className="flex items-end gap-1">
        <span className="tnum font-display text-[22px] font-semibold leading-none text-ink-100 lg:text-[24px]">{value}</span>
        {unit && <span className="pb-0.5 text-[13px] text-ink-500">{unit}</span>}
      </span>
      <span className="text-[12px] text-ink-500">{hint}</span>
    </div>
  );
}
