import { notFound } from "next/navigation";
import { checkinSnapshots, getClient, listFillers, scoreFor, today } from "@/lib/repo";
import { fieldsFor } from "@/lib/model/catalog";
import { ACCOUNT_TYPE_LABEL } from "@/lib/model/types";
import { CheckinForm, type Scale } from "@/components/checkin-form";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SCALE_ORDER = ["q1_satisfaction", "q2_climate", "q3_trust", "q4_lead_quality", "q5_engagement", "q6_expectation"];

export default async function CheckinFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fila?: string }>;
}) {
  const me = await requireUser();
  const { id } = await params;
  const { fila } = await searchParams;
  const queue = (fila ?? "").split(",").map(Number).filter((n) => n > 0 && n !== Number(id));
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

  const fields = fieldsFor(client.account_type, "account");
  const scales: Scale[] = SCALE_ORDER.flatMap((k) => {
    const f = fields.find((x) => x.key === k);
    return f && f.input.kind === "scale5" ? [{ key: k, question: f.question ?? f.label, anchors: f.input.anchors ?? {} }] : [];
  });

  return (
    <CheckinForm
      client={{
        id: client.id,
        name: client.name,
        typeLabel: ACCOUNT_TYPE_LABEL[client.account_type],
        accountName: client.account_name,
        gtName: client.gt_name,
        mrr: client.mrr,
        renewalDate: client.renewal_date,
      }}
      history={history.map((s) => ({
        id: s.id,
        date: s.ref_date,
        filler: s.filler,
        scales: SCALE_ORDER.map((k) => (Number(s.data[k]) > 0 ? Number(s.data[k]) : null)),
        risk: Boolean(s.data.risk_flag),
        riskNote: String(s.data.risk_note ?? ""),
      }))}
      accounts={accounts}
      me={{ id: me.id, name: me.name }}
      scales={scales}
      previous={score ? { score: score.score, band: score.band } : null}
      today={at}
      queue={queue}
    />
  );
}
