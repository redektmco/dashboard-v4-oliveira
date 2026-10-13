"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { logChange } from "@/lib/audit";
import { getClient } from "@/lib/repo";
import { addLeadSource, archiveLeadSource, getLeadSource, restoreLeadSource } from "@/lib/crm/goals";
import type { ActionResult } from "@/lib/action";

/**
 * Ações de fontes de leads da aba Forecast e fontes da ficha. (O forecast
 * em si é `client_targets`, salvo pelo painel de Performance.)
 *
 * Nada aqui apaga: remover fonte é arquivar (`active = 0`), e é o que
 * torna o "Desfazer" do toast possível de verdade — o desfazer só reativa a
 * linha. Apagar de fato deixaria o histórico sem explicação para o número do
 * mês passado.
 */

const revalidateFicha = (clientId: number) => {
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/clientes");
};

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
