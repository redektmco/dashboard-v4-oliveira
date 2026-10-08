import { listRequests } from "@/lib/churn/db";
import { listClients, listUsers, today } from "@/lib/repo";
import { requireUser } from "@/lib/auth";
import { NewRequestForm, type FormClient } from "@/components/churn/new-request-form";

export const dynamic = "force-dynamic";

/** Churn 02 — Registrar solicitação. `?cliente=<id>` já abre com a conta escolhida. */
export default async function NewChurnPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const me = await requireUser();
  const { cliente } = await searchParams;
  const [clients, users, requests] = await Promise.all([listClients(), listUsers(), listRequests()]);
  const openBy = new Set(requests.filter((r) => r.status !== "retido" && r.status !== "cancelado").map((r) => r.client_id));

  const rows: FormClient[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    mrr: c.mrr,
    accountUserId: c.account_user_id,
    contractCode: c.contract_code,
    services: c.services ?? [],
    contractStart: c.contract_start ?? c.created_at.slice(0, 10),
    contractStartIsSignup: !c.contract_start,
    fidelityMonths: c.fidelity_months,
    noticeDays: c.notice_days,
    openRequest: openBy.has(c.id),
  }));

  return (
    <NewRequestForm
      clients={rows}
      users={users.map((u) => ({ id: u.id, name: u.name }))}
      previous={requests.map((r) => ({
        id: r.id,
        code: r.code,
        clientId: r.client_id,
        requestedAt: r.requested_at,
        reason: r.main_reason,
        status: r.status,
        outcome: r.outcome,
      }))}
      meId={me.id}
      today={today()}
      initialClient={Number(cliente) || null}
    />
  );
}
