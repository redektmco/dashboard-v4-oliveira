import { notFound } from "next/navigation";
import { checkinSnapshots, getClient, listFillers, scoreFor, today } from "@/lib/repo";
import { CheckinForm } from "@/components/checkin-form";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CheckinFormPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const clientId = Number(id);
  const at = today();
  // Cadastro, histórico, score e time em paralelo — um round-trip de espera.
  const [client, history, accounts, score] = await Promise.all([
    getClient(clientId),
    checkinSnapshots(clientId, 8),
    listFillers("account"),
    scoreFor(clientId, at),
  ]);
  if (!client) notFound();

  return <CheckinForm client={client} history={history} accounts={accounts} score={score} at={at} />;
}
