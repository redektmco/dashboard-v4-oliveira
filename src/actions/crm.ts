"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth";
import { logChange } from "@/lib/audit";
import { getClient, listClients, setTargets, updateClient, today } from "@/lib/repo";
import { addInteraction, INTERACTION_LABEL, type InteractionKind } from "@/lib/crm/interactions";
import { STAGE_LABEL, type Stage } from "@/lib/model/types";
import type { ActionResult } from "@/lib/action";

/**
 * Ações da tela de Clientes (CRM).
 *
 * As ações em massa recebem a lista de ids que a tela selecionou e devolvem
 * quantos clientes foram afetados — a confirmação já mostrou esse número ao
 * usuário antes de chamar, e a frase do toast tem de bater com ela.
 *
 * Tudo que muda cadastro passa por `logChange`: é o que alimenta a aba
 * Histórico da ficha e o "Últimas alterações" de Configurações.
 */

function revalidateCrm() {
  revalidatePath("/clientes");
  revalidatePath("/config", "layout");
  revalidatePath("/");
}

const KINDS = Object.keys(INTERACTION_LABEL) as InteractionKind[];
const STAGES = Object.keys(STAGE_LABEL) as Stage[];

/* -------------------------- relacionamento ------------------------- */

export async function registerInteraction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const clientId = Number(formData.get("client_id"));
  const kind = String(formData.get("kind") ?? "") as InteractionKind;
  const title = String(formData.get("title") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const at = String(formData.get("at") ?? "").trim();

  if (!KINDS.includes(kind)) return { error: "Escolha o tipo da interação." };
  if (!title) return { error: "Descreva a interação em uma linha." };

  const client = await getClient(clientId);
  if (!client) return { error: "Cliente não encontrado." };

  await addInteraction({ clientId, kind, title, note, at: at || null }, me);
  await logChange(me, "cliente", `${INTERACTION_LABEL[kind]} registrada: ${title}`, { clientId });
  revalidateCrm();
  revalidatePath(`/clientes/${clientId}`);
  return { ok: `${INTERACTION_LABEL[kind]} registrada em ${client.name}.` };
}

/* ------------------------------ etapa ------------------------------ */

/** `stage = null` devolve o cliente para a etapa derivada automaticamente. */
export async function setRelationshipStage(clientId: number, stage: Stage | null): Promise<ActionResult> {
  const me = await requireUser();
  if (stage !== null && !STAGES.includes(stage)) return { error: "Etapa inválida." };
  const client = await getClient(clientId);
  if (!client) return { error: "Cliente não encontrado." };

  await updateClient(clientId, { stage_override: stage });
  await logChange(
    me,
    "cliente",
    stage ? `Etapa fixada em ${STAGE_LABEL[stage]}: ${client.name}` : `Etapa voltou a ser automática: ${client.name}`,
    { clientId },
  );
  revalidateCrm();
  revalidatePath(`/clientes/${clientId}`);
  return { ok: stage ? `Etapa de ${client.name}: ${STAGE_LABEL[stage]}.` : `Etapa de ${client.name} voltou a ser automática.` };
}

/* -------------------------- ações em massa ------------------------- */

/** Só clientes que existem — a seleção da tela pode estar velha. */
async function resolve(ids: number[]) {
  if (!ids.length) return [];
  const all = await listClients(false);
  const wanted = new Set(ids);
  return all.filter((c) => wanted.has(c.id));
}

export async function bulkAssignOwner(
  ids: number[],
  field: "account_user_id" | "gt_user_id",
  userId: number | null,
): Promise<ActionResult> {
  const me = await requireUser();
  const clients = await resolve(ids);
  if (!clients.length) return { error: "Nenhum cliente selecionado." };

  const papel = field === "account_user_id" ? "Account" : "GT";
  for (const c of clients) {
    await updateClient(c.id, { [field]: userId } as never);
    await logChange(me, "cliente", `${papel} alterado em massa: ${c.name}`, { clientId: c.id });
  }
  revalidateCrm();
  return { ok: `${papel} atualizado em ${clients.length} ${plural(clients.length, "cliente", "clientes")}.` };
}

export async function bulkSetStage(ids: number[], stage: Stage | null): Promise<ActionResult> {
  const me = await requireUser();
  const clients = await resolve(ids);
  if (!clients.length) return { error: "Nenhum cliente selecionado." };

  for (const c of clients) {
    await updateClient(c.id, { stage_override: stage });
    await logChange(me, "cliente", stage ? `Etapa fixada em ${STAGE_LABEL[stage]}: ${c.name}` : `Etapa automática: ${c.name}`, {
      clientId: c.id,
    });
  }
  revalidateCrm();
  return {
    ok: stage
      ? `${clients.length} ${plural(clients.length, "cliente marcado", "clientes marcados")} como ${STAGE_LABEL[stage]}.`
      : `Etapa voltou a ser automática em ${clients.length} ${plural(clients.length, "cliente", "clientes")}.`,
  };
}

export async function bulkArchive(ids: number[], archived: boolean): Promise<ActionResult> {
  const me = await requireUser();
  const clients = await resolve(ids);
  // Arquivar quem já está arquivado (ou o contrário) não é erro, é ruído:
  // só conta quem de fato muda de estado.
  const alvo = clients.filter((c) => Boolean(c.active) === archived);
  if (!alvo.length) return { error: archived ? "Nenhum cliente ativo selecionado." : "Nenhum cliente arquivado selecionado." };

  for (const c of alvo) {
    await updateClient(c.id, { active: archived ? 0 : 1 });
    await logChange(me, "cliente", `${archived ? "Cliente arquivado" : "Cliente reativado"} em massa: ${c.name}`, {
      clientId: c.id,
    });
  }
  revalidateCrm();
  revalidatePath("/account");
  const n = alvo.length;
  return {
    ok: archived
      ? `${n} ${plural(n, "cliente arquivado", "clientes arquivados")}.`
      : `${n} ${plural(n, "cliente restaurado", "clientes restaurados")}.`,
  };
}

/** Mesma meta para vários clientes de uma vez (ex.: teto de CPL da unidade). */
export async function bulkSetTarget(ids: number[], key: string, value: number): Promise<ActionResult> {
  const me = await requireUser();
  if (!key) return { error: "Escolha o indicador do forecast." };
  // `setTargets` descarta valor não-finito em silêncio; barrar aqui para a
  // ação não responder "aplicada" sem ter gravado nada.
  if (!Number.isFinite(value)) return { error: "Informe um valor numérico para o forecast." };
  const clients = await resolve(ids);
  if (!clients.length) return { error: "Nenhum cliente selecionado." };

  const from = today();
  for (const c of clients) {
    await setTargets(c.id, { [key]: value }, from, me.id);
    await logChange(me, "meta", `Forecast de ${key} definido em massa: ${c.name}`, { clientId: c.id, data: { key, value } });
  }
  revalidateCrm();
  revalidatePath("/gt");
  return { ok: `Forecast aplicado a ${clients.length} ${plural(clients.length, "cliente", "clientes")}.` };
}

/* ------------------------------ admin ------------------------------ */

/** Dados do cliente para exportação — o CSV é montado no navegador. */
export async function exportClients(ids: number[]): Promise<{ rows?: string[][]; error?: string }> {
  await requireAdmin();
  const clients = await resolve(ids);
  if (!clients.length) return { error: "Nenhum cliente selecionado." };
  return {
    rows: clients.map((c) => [
      String(c.id),
      c.name,
      c.niche ?? "",
      c.account_name ?? "",
      c.gt_name ?? "",
      String(c.mrr),
      c.contract_start ?? "",
      c.renewal_date ?? "",
      (c.services ?? []).join(" | "),
      c.active ? "ativo" : "arquivado",
    ]),
  };
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
