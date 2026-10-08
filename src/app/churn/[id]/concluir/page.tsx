import { notFound, redirect } from "next/navigation";
import { getRequest, listAttempts, statusDates } from "@/lib/churn/db";
import { STATUS, addMonths, dateBr, isOpen, monthYear, reasonLabel } from "@/lib/churn/types";
import { getClient, listUsers, today } from "@/lib/repo";
import { ChurnHeader, ClientBadge, ContextStrip, Meta, TonePill } from "@/components/churn/ui";
import { ConcludeForm } from "@/components/churn/conclude-form";
import { Icon } from "@/components/icon";
import Link from "next/link";

export const dynamic = "force-dynamic";

/** Churn 05 — Conclusão da solicitação. */
export default async function ConcludePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = Number(raw);
  const req = await getRequest(id);
  if (!req) notFound();
  if (!isOpen(req.status)) redirect(`/churn/${id}`);
  const at = today();
  const [attempts, dates, client, users] = await Promise.all([listAttempts(id), statusDates(id), getClient(req.client_id), listUsers()]);
  const since = client?.contract_start ?? client?.created_at.slice(0, 10) ?? null;
  const fidelityEnd = client?.fidelity_months && since ? addMonths(since, client.fidelity_months) : null;
  const refused = attempts.filter((a) => a.result === "recusada" || a.result === "contraproposta_recusada").length;

  return (
    <>
      <ChurnHeader
        crumbs={[{ href: "/churn", label: "Churn" }, { href: `/churn/${id}`, label: `${req.code} · ${req.client_name}` }, { label: "Concluir" }]}
        title="Concluir solicitação"
        pill={<TonePill tone={STATUS[req.status].tone}>{STATUS[req.status].label}</TonePill>}
        description="Formalize o resultado definitivo. A perda só é contabilizada após o encerramento efetivo do contrato."
        actions={
          <Link href={`/churn/${id}`} className="btn btn-ghost">
            <Icon name="fileText" size={15} />
            Ver solicitação
          </Link>
        }
      />

      <ContextStrip
        items={[
          <ClientBadge
            key="c"
            name={req.client_name}
            sub={[req.contract_code, req.services.join(" + "), since ? `cliente desde ${monthYear(since)}` : null].filter(Boolean).join(" · ")}
          />,
          <Meta key="s" k="Solicitado em" v={dateBr(req.requested_at)} />,
          <Meta key="m" k="Motivo inicial" v={reasonLabel(req.main_reason)} />,
          <Meta
            key="t"
            k="Tentativas de retenção"
            v={attempts.length ? `${attempts.length}${refused === attempts.length ? ` · ${attempts.length === 1 ? "recusada" : attempts.length === 2 ? "ambas recusadas" : "todas recusadas"}` : ""}` : "nenhuma"}
          />,
          <Meta key="o" k="Responsável" v={req.owner_name ?? "—"} />,
        ]}
      />

      <ConcludeForm
        id={id}
        mrr={req.mrr}
        mainReason={req.main_reason}
        desiredEnd={req.desired_end}
        contractStart={since}
        fidelityEnded={!fidelityEnd || fidelityEnd <= at}
        fidelityEnd={fidelityEnd}
        attempts={attempts.map((a) => ({ n: a.n, strategy: a.strategy, result: a.result, respondedAt: a.responded_at, proposedMrr: a.proposed_mrr }))}
        users={users.map((u) => u.name)}
        ownerName={req.owner_name}
        statusTrail={(["solicitado", "em_analise", "em_negociacao", "agendado"] as const)
          .filter((s) => dates[s])
          .map((s) => ({ status: s, date: dates[s]! }))}
        today={at}
      />
    </>
  );
}
