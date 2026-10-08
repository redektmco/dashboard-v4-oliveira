/**
 * "Prioridades de hoje": ordena as contas por urgência e diz, em uma frase,
 * por que cada uma está na lista e qual a próxima ação. Puro — sem rede nem
 * banco — para poder ser testado.
 */
import type { Band } from "./model/types";

export type PriorityInput = {
  id: number;
  name: string;
  band: Band | null;
  score: number | null;
  delta7: number | null;
  mrr: number;
  owner: string | null;
  overrides: string[];
  openPlans: number;
  /** Dias de atraso do plano aberto mais atrasado (0 = nenhum atrasado). */
  planLateDays: number;
  /** Dias até a renovação (negativo = vencida); null sem data. */
  renewalIn: number | null;
  /** A conta tem mídia vinculada e a última semana fechada ficou sem verba. */
  spendStopped: boolean;
};

export type PriorityAction = "criar_plano" | "cobrar_plano" | "revisar" | "ver_conta";

export type Priority = {
  id: number;
  name: string;
  band: Band | null;
  why: string;
  meta: string;
  action: PriorityAction;
};

const pts = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

type Reason = { weight: number; text: string };

export function reasonsOf(a: PriorityInput): Reason[] {
  const out: Reason[] = [];
  if (a.delta7 !== null && a.delta7 <= -5) out.push({ weight: 10 + Math.min(-a.delta7, 30) / 3, text: `o score caiu ${pts(-a.delta7)} pts em 7 dias` });
  if (a.spendStopped) out.push({ weight: 20, text: "a verba de mídia está parada" });
  if (a.overrides.length) out.push({ weight: 25, text: `${a.overrides[0]} disparou um override no score` });
  if (a.planLateDays > 0)
    out.push({ weight: 30, text: `o plano de ação está ${a.planLateDays} ${plural(a.planLateDays, "dia", "dias")} atrasado` });
  if (a.renewalIn !== null && a.renewalIn < 0)
    out.push({ weight: 30, text: `o contrato venceu ${a.renewalIn === -1 ? "ontem" : `há ${-a.renewalIn} dias`}` });
  else if (a.renewalIn !== null && a.renewalIn <= 30) out.push({ weight: 15, text: `o contrato renova em ${a.renewalIn} ${plural(a.renewalIn, "dia", "dias")}` });
  if (a.band === "vermelho" && a.openPlans === 0) out.push({ weight: 10, text: "não há plano de ação" });
  return out.sort((x, y) => y.weight - x.weight);
}

const BAND_POINTS: Record<Band, number> = { vermelho: 100, amarelo: 50, verde: 0 };

function actionOf(a: PriorityInput): PriorityAction {
  if (a.planLateDays > 0) return "cobrar_plano";
  if (a.overrides.length) return "revisar";
  if (a.openPlans === 0 && (a.band === "vermelho" || a.band === "amarelo")) return "criar_plano";
  return "ver_conta";
}

const sentence = (parts: string[]) => {
  const s = parts.join(" e ");
  return s.charAt(0).toUpperCase() + s.slice(1) + ".";
};

export function topPriorities(accounts: PriorityInput[], limit = 5): Priority[] {
  return accounts
    .map((a) => {
      const reasons = reasonsOf(a);
      // Conta sem score só entra se houver um sinal de fato (plano, contrato).
      const signal = reasons.filter((r) => r.text !== "não há plano de ação");
      const points = (a.band ? BAND_POINTS[a.band] : 0) + reasons.reduce((s, r) => s + r.weight, 0);
      return { a, reasons, signal, points };
    })
    .filter((x) => x.signal.length > 0 || x.a.band === "vermelho" || x.a.band === "amarelo")
    .sort((x, y) => y.points - x.points || y.a.mrr - x.a.mrr)
    .slice(0, limit)
    .map(({ a, reasons }) => {
      const top = reasons.slice(0, 2).map((r) => r.text);
      const why = top.length
        ? sentence(top)
        : a.band === "vermelho"
          ? `Conta crítica, com score ${a.score === null ? "—" : Math.round(a.score)}.`
          : `Conta em atenção, com score ${a.score === null ? "—" : Math.round(a.score)}.`;
      const meta = [
        a.score !== null ? `Score ${Math.round(a.score)}` : null,
        a.mrr > 0 ? `${brl(a.mrr)} MRR` : null,
        a.openPlans === 0 ? "Sem plano de ação" : `${a.openPlans} ${plural(a.openPlans, "plano em aberto", "planos em aberto")}`,
        a.owner ? `Responsável: ${a.owner}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return { id: a.id, name: a.name, band: a.band, why, meta, action: actionOf(a) };
    });
}
