import { getConfig, lastCheckinByClient, portfolio, today } from "@/lib/repo";
import { fieldsFor } from "@/lib/model/catalog";
import { daysBetween } from "@/lib/model/scoring";
import { requireUser } from "@/lib/auth";
import { CheckinQueue, type QueueRow } from "@/components/checkin/queue";
import type { Scale } from "@/components/checkin-script";

export const dynamic = "force-dynamic";

const SCALE_ORDER = ["q1_satisfaction", "q2_climate", "q3_trust", "q4_lead_quality", "q5_engagement", "q6_expectation"];

/**
 * Check-ins — a lista da jornada do Account. Cobertura de leitura no topo,
 * fila agrupada por responsável e, ao lado, por onde começar: contas com
 * score baixo e nenhuma leitura recente que o confirme.
 */
export default async function AccountPage() {
  await requireUser();
  const at = today();
  const [carteira, lastChk, cfg] = await Promise.all([portfolio(at), lastCheckinByClient(), getConfig()]);
  const lastBy = new Map(lastChk.map((s) => [s.client_id, s]));

  const rows: QueueRow[] = carteira.map(({ client: c, score }) => {
    const last = lastBy.get(c.id) ?? null;
    return {
      id: c.id,
      name: c.name,
      type: c.account_type,
      account: c.account_name,
      gt: c.gt_name,
      lastDate: last?.ref_date ?? null,
      lastBy: last?.filler ?? null,
      age: last ? daysBetween(last.ref_date, at) : null,
      score: score.score === null ? null : Math.round(score.score),
      band: score.band,
      risk: last?.data.risk_flag === true,
    };
  });

  // As perguntas do roteiro são as mesmas para todo tipo de conta.
  const fields = fieldsFor("lead_gen", "account");
  const scales: Scale[] = SCALE_ORDER.flatMap((k) => {
    const f = fields.find((x) => x.key === k);
    return f && f.input.kind === "scale5" ? [{ key: k, question: f.question ?? f.label, anchors: f.input.anchors ?? {} }] : [];
  });

  return <CheckinQueue rows={rows} limit={cfg.checkinMaxAgeDays} scales={scales} />;
}
