import { listAllAttempts, listRequests } from "@/lib/churn/db";
import { listClients, listUsers, today } from "@/lib/repo";
import { ChurnAnalysis } from "@/components/churn/analysis";

export const dynamic = "force-dynamic";

/** Churn 06 — Histórico e análise. */
export default async function ChurnAnalysisPage() {
  const [requests, attempts, clients, users] = await Promise.all([listRequests(), listAllAttempts(), listClients(false), listUsers()]);
  return (
    <ChurnAnalysis
      requests={requests.filter((r) => r.status === "retido" || r.status === "cancelado")}
      attempts={attempts.map((a) => ({ requestId: a.request_id, strategy: a.strategy, result: a.result, at: a.responded_at ?? a.sent_at }))}
      clients={clients.map((c) => ({ id: c.id, active: c.active === 1, services: c.services ?? [] }))}
      owners={users.map((u) => u.name)}
      today={today()}
    />
  );
}
