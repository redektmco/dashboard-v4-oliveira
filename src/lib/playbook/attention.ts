/**
 * Blocos novos do diagnóstico (seção 3 do playbook) que ficam FORA da nota:
 * aparecem na ficha como "ok" ou "ponto aberto" e sugerem um plano. Puro —
 * testado em scripts/test.ts. Depois do piloto dá para dar peso a eles.
 */
import { CRM_QUESTIONS } from "./templates";

export type AttentionStatus = "ok" | "aberto" | "sem_dado";

export type Attention = {
  key: "criativos" | "crm";
  label: string;
  owner: string;
  status: AttentionStatus;
  detail: string;
};

/** Abaixo disto de criativos aprovados (últimos 30 dias), é ponto aberto. */
export const CREATIVE_APPROVAL_FLOOR = 70;

export function creativeAttention(s: { projects: number; approved: number; changes: number; rejected: number; pending: number }): Attention {
  const base = { key: "criativos" as const, label: "Criativos", owner: "Account + Design" };
  if (!s.projects) return { ...base, status: "sem_dado", detail: "Sem projeto no Social media — a aprovação de criativos não é acompanhada aqui." };
  const decided = s.approved + s.changes + s.rejected;
  const pend = s.pending ? ` ${s.pending} aguardando o cliente.` : "";
  if (!decided) return { ...base, status: "sem_dado", detail: `Nenhuma decisão do cliente nos últimos 30 dias.${pend}` };
  const rate = Math.round((s.approved / decided) * 100);
  const refused = [s.changes ? `${s.changes} com ajuste pedido` : null, s.rejected ? `${s.rejected} reprovado(s)` : null].filter(Boolean).join(", ");
  const detail = `${rate}% aprovados em 30 dias (${s.approved} de ${decided}${refused ? `; ${refused}` : ""}).${pend}`;
  return { ...base, status: rate < CREATIVE_APPROVAL_FLOOR ? "aberto" : "ok", detail };
}

export function crmAttention(d: { filled_at: string; data: Partial<Record<string, string>> } | null, ageDays: number | null): Attention {
  const base = { key: "crm" as const, label: "CRM e processo comercial", owner: "Analista de CRM" };
  if (!d) return { ...base, status: "sem_dado", detail: "Diagnóstico de CRM ainda não preenchido." };
  const failing = CRM_QUESTIONS.filter((q) => d.data[q.key] === "nao").map((q) => q.label.replace(/\?$/, ""));
  const when = ageDays === null ? "" : ageDays === 0 ? " Preenchido hoje." : ` Preenchido há ${ageDays} dia${ageDays === 1 ? "" : "s"}.`;
  if (failing.length) return { ...base, status: "aberto", detail: `Não: ${failing.join("; ")}.${when}` };
  return { ...base, status: "ok", detail: `CRM organizado, com automações, no fluxo padrão e cliente satisfeito com as vendas.${when}` };
}
