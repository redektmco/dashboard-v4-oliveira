/**
 * Contexto do cliente para o "Escrever com IA": o que o painel sabe da conta
 * além dos números — cadastro, metas do período, interações registradas,
 * resumo dos últimos check-ins e planos de ação. A IA usa para acertar o
 * foco e o tom; o que é interno da agência vai marcado como tal.
 */
import { getClient, checkinSnapshots, listPlans } from "../repo";
import { INTERACTION_LABEL, listInteractions } from "../crm/interactions";
import { listGoals, PERIOD_LABEL } from "../crm/goals";
import { ACCOUNT_TYPE_LABEL } from "../model/types";

const day = (s: string | null | undefined) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");
const clip = (s: unknown, n: number) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
const shift = (d: string, n: number) => {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

/**
 * Texto com o contexto da conta, do início do período (com 30 dias de folga
 * antes) até o fim. Vazio quando não há cliente.
 */
export async function clientContext(clientId: number, start: string, end: string): Promise<string> {
  const [client, interactions, checkins, plans, goals] = await Promise.all([
    getClient(clientId),
    listInteractions(clientId, 40),
    checkinSnapshots(clientId, 3),
    listPlans(clientId),
    listGoals(clientId),
  ]);
  if (!client) return "";
  const from = shift(start, -30);
  const out: string[] = [];

  const cadastro = [
    `Tipo de conta: ${ACCOUNT_TYPE_LABEL[client.account_type] ?? client.account_type}`,
    client.niche ? `Nicho: ${client.niche}` : "",
    Array.isArray(client.services) && client.services.length ? `Serviços contratados: ${client.services.join(", ")}` : "",
    client.contract_start ? `Cliente desde: ${day(client.contract_start)}` : "",
    client.main_contact ? `Contato principal: ${client.main_contact}` : "",
  ].filter(Boolean);
  out.push(`Cadastro:\n${cadastro.map((l) => `- ${l}`).join("\n")}`);

  if (goals.length)
    out.push(
      `Metas combinadas com o cliente:\n${goals
        .map((g) => `- ${g.label}: ${g.direction === "teto" ? "no máximo" : "pelo menos"} ${g.target} (${PERIOD_LABEL[g.period].toLowerCase()})`)
        .join("\n")}`,
    );

  const recent = interactions.filter((i) => i.at.slice(0, 10) >= from && i.at.slice(0, 10) <= end).slice(0, 15);
  if (recent.length)
    out.push(
      `Interações com o cliente (mais recentes primeiro):\n${recent
        .map((i) => `- ${day(i.at.slice(0, 10))} · ${INTERACTION_LABEL[i.kind]}: ${clip(i.title, 120)}${i.note ? ` — ${clip(i.note, 300)}` : ""}`)
        .join("\n")}`,
    );

  const notes = checkins
    .map((c) => ({ when: c.ref_date, summary: clip(c.data.summary, 500), risk: clip(c.data.risk_note, 300) }))
    .filter((c) => c.summary || c.risk);
  if (notes.length)
    out.push(
      `Últimos check-ins (INTERNO — use só para orientar o foco):\n${notes
        .map((c) => `- ${day(c.when)}: ${[c.summary, c.risk && `Ponto de atenção: ${c.risk}`].filter(Boolean).join(" | ")}`)
        .join("\n")}`,
    );

  const open = plans.filter((p) => p.status === "aberto" || p.status === "em_andamento").slice(0, 6);
  if (open.length)
    out.push(
      `Planos de ação em andamento (INTERNO — pode virar "próximos passos", sem citar problemas internos):\n${open
        .map((p) => `- ${clip(p.plan, 200)}${p.due_date ? ` (prazo ${day(p.due_date)})` : ""}`)
        .join("\n")}`,
    );

  return out.join("\n\n");
}
