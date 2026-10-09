"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { logChange } from "@/lib/audit";
import { getClient } from "@/lib/repo";
import { parseBR } from "@/lib/model/target-fields";
import {
  addGoal,
  addLeadSource,
  archiveGoal,
  archiveLeadSource,
  getGoal,
  getLeadSource,
  restoreGoal,
  restoreLeadSource,
  PERIOD_LABEL,
  type GoalDirection,
  type GoalPeriod,
} from "@/lib/crm/goals";
import type { ActionResult } from "@/lib/action";

/**
 * Ações da aba Metas e integrações da ficha.
 *
 * Nada aqui apaga: remover meta ou fonte é arquivar (`active = 0`), e é o que
 * torna o "Desfazer" do toast possível de verdade — o desfazer só reativa a
 * linha. Apagar de fato deixaria o histórico sem explicação para o número do
 * mês passado.
 */

const revalidateFicha = (clientId: number) => {
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
};

const PERIODS: GoalPeriod[] = ["mensal", "trimestral"];
const DIRECTIONS: GoalDirection[] = ["piso", "teto"];

export async function createGoal(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const clientId = Number(formData.get("client_id"));
  const metric = String(formData.get("metric") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const period = String(formData.get("period") ?? "mensal") as GoalPeriod;
  const direction = String(formData.get("direction") ?? "piso") as GoalDirection;
  const scope = String(formData.get("scope") ?? "").trim() || "todas";
  const target = parseBR(String(formData.get("target") ?? ""));

  if (!label) return { error: "Dê um nome à meta." };
  if (!PERIODS.includes(period)) return { error: "Período inválido." };
  if (!DIRECTIONS.includes(direction)) return { error: "Escolha se o número é piso ou teto." };
  if (target === null) return { error: "Informe o valor da meta." };
  if (target <= 0) return { error: "O valor da meta tem de ser maior que zero." };

  const client = await getClient(clientId);
  if (!client) return { error: "Cliente não encontrado." };

  await addGoal({ clientId, metric, label, direction, target, period, scope }, me.id ?? null);
  await logChange(me, "meta", `Meta ${PERIOD_LABEL[period].toLowerCase()} criada: ${label} (${client.name})`, {
    clientId,
    data: { metric, target, direction, period, scope },
  });
  revalidateFicha(clientId);
  return { ok: `Meta "${label}" criada.` };
}

/** Arquiva a meta. `restoreGoalAction` é o par que o Desfazer chama. */
export async function removeGoal(id: number): Promise<ActionResult> {
  const me = await requireUser();
  const goal = await getGoal(id);
  if (!goal) return { error: "Meta não encontrada." };

  await archiveGoal(id);
  await logChange(me, "meta", `Meta removida: ${goal.label}`, { clientId: goal.client_id });
  revalidateFicha(goal.client_id);
  return { ok: `Meta "${goal.label}" removida.` };
}

export async function restoreGoalAction(id: number): Promise<ActionResult> {
  const me = await requireUser();
  const goal = await getGoal(id);
  if (!goal) return { error: "Meta não encontrada." };

  await restoreGoal(id);
  await logChange(me, "meta", `Meta restaurada: ${goal.label}`, { clientId: goal.client_id });
  revalidateFicha(goal.client_id);
  return { ok: `Meta "${goal.label}" de volta.` };
}

export async function createLeadSource(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const clientId = Number(formData.get("client_id"));
  const name = String(formData.get("name") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!name) return { error: "Dê um nome à fonte." };

  const client = await getClient(clientId);
  if (!client) return { error: "Cliente não encontrado." };

  await addLeadSource(clientId, name, note);
  await logChange(me, "cliente", `Fonte de leads cadastrada: ${name} (${client.name})`, { clientId });
  revalidateFicha(clientId);
  return { ok: `Fonte "${name}" cadastrada.` };
}

export async function removeLeadSource(id: number): Promise<ActionResult> {
  const me = await requireUser();
  const src = await getLeadSource(id);
  if (!src) return { error: "Fonte não encontrada." };

  await archiveLeadSource(id);
  await logChange(me, "cliente", `Fonte de leads removida: ${src.name}`, { clientId: src.client_id });
  revalidateFicha(src.client_id);
  return { ok: `Fonte "${src.name}" removida.` };
}

export async function restoreLeadSourceAction(id: number): Promise<ActionResult> {
  const me = await requireUser();
  const src = await getLeadSource(id);
  if (!src) return { error: "Fonte não encontrada." };

  await restoreLeadSource(id);
  await logChange(me, "cliente", `Fonte de leads restaurada: ${src.name}`, { clientId: src.client_id });
  revalidateFicha(src.client_id);
  return { ok: `Fonte "${src.name}" de volta.` };
}
