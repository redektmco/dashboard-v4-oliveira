"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import {
  createClient,
  createIntegration,
  createPlan,
  deleteClient,
  deleteIntegration,
  deletePlan,
  getClient,
  getPlan,
  persistScore,
  recomputeAll,
  recomputeRange,
  rotateIntegrationToken,
  saveSnapshot,
  scoreFor,
  setIntegrationActive,
  setSetting,
  setTargets,
  today,
  updateClient,
  updatePlan,
  updatePlanStatus,
  type Plan,
} from "@/lib/repo";
import { targetKeysFor } from "@/lib/model/catalog";
import { parseCheckinForm, parsePerformanceForm } from "@/lib/model/form";
import { DEFAULT_CONFIG } from "@/lib/model/scoring";
import type { AccountType, DimensionKey } from "@/lib/model/types";
import { ACCOUNT_TYPE_LABEL } from "@/lib/model/types";
import { DIMENSIONS } from "@/lib/model/catalog";
import { requireAdmin, requireUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/action";

const str = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() ?? "";
const numOrNull = (f: FormData, k: string) => {
  const v = str(f, k).replace(/\./g, "").replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
};

/** Recalcula e grava o snapshot do dia para um cliente — chamado após cada input. */
async function refresh(clientId: number) {
  const r = await scoreFor(clientId);
  if (r) await persistScore(clientId, today(), r);
}

/* ---------------------- input do GT (semanal) ---------------------- */

export async function savePerformance(formData: FormData) {
  await requireUser();
  const clientId = Number(str(formData, "client_id"));
  const accountType = str(formData, "account_type") as AccountType;
  const refDate = str(formData, "ref_date") || today();
  const filledBy = Number(str(formData, "filled_by")) || null;

  const data = parsePerformanceForm(accountType, (k) => str(formData, k));

  await saveSnapshot("performance", clientId, refDate, filledBy, data);

  // A meta preenchida na semana passa a valer como meta vigente do cliente.
  const targets: Record<string, number> = {};
  for (const t of targetKeysFor(accountType)) {
    const v = data[t.key];
    if (typeof v === "number") targets[t.key] = v;
  }
  await setTargets(clientId, targets, refDate);

  await refresh(clientId);
  revalidatePath("/");
  revalidatePath("/gt");
  revalidatePath(`/clientes/${clientId}`);
  redirect(`/clientes/${clientId}?ok=${encodeURIComponent("Snapshot de performance salvo e score recalculado.")}`);
}

/* ------------------- input do Account (check-in) ------------------- */

export async function saveCheckin(formData: FormData) {
  await requireUser();
  const clientId = Number(str(formData, "client_id"));
  const refDate = str(formData, "ref_date") || today();
  const filledBy = Number(str(formData, "filled_by")) || null;

  const data = parseCheckinForm((k) => str(formData, k));

  await saveSnapshot("checkin", clientId, refDate, filledBy, data);

  const renewal = str(formData, "renewal_date");
  if (renewal) await updateClient(clientId, { renewal_date: renewal });

  await refresh(clientId);
  revalidatePath("/");
  revalidatePath("/account");
  revalidatePath(`/clientes/${clientId}`);
  redirect(`/clientes/${clientId}?ok=${encodeURIComponent("Check-in salvo e score recalculado.")}`);
}

/* -------------------------- cadastro ------------------------------- */

/**
 * Cria ou edita um cliente (modal "Novo cliente" / "Editar"). Devolve o
 * resultado em vez de redirecionar: o modal fecha e a lista se atualiza no
 * lugar. O recálculo do score do dia sai depois da resposta — a carteira
 * calcula o score ao vivo, então ninguém espera por ele.
 */
export async function saveClient(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const id = Number(str(formData, "id")) || 0;
  const name = str(formData, "name");
  const accountType = str(formData, "account_type") as AccountType;
  if (!name) return { error: "Informe o nome do cliente." };
  if (!(accountType in ACCOUNT_TYPE_LABEL)) return { error: "Escolha o tipo de conta." };

  const payload = {
    name,
    account_type: accountType,
    mrr: numOrNull(formData, "mrr") ?? 0,
    gt_user_id: Number(str(formData, "gt_user_id")) || null,
    account_user_id: Number(str(formData, "account_user_id")) || null,
    renewal_date: str(formData, "renewal_date") || null,
  };
  const clientId = id ? (await updateClient(id, payload), id) : await createClient(payload);

  const targets: Record<string, number> = {};
  for (const t of targetKeysFor(payload.account_type)) {
    const v = numOrNull(formData, t.key);
    if (v !== null) targets[t.key] = v;
  }
  if (Object.keys(targets).length) await setTargets(clientId, targets, str(formData, "effective_from") || today());

  after(() => refresh(clientId));
  revalidatePath("/config");
  revalidatePath("/");
  return { ok: id ? `${name} atualizado.` : `${name} cadastrado.` };
}

/** Arquivar tira o cliente da carteira e dos formulários sem apagar histórico. */
export async function setClientArchived(id: number, archived: boolean): Promise<ActionResult> {
  await requireUser();
  const client = await getClient(id);
  if (!client) return { error: "Cliente não encontrado." };
  await updateClient(id, { active: archived ? 0 : 1 });
  revalidatePath("/config");
  revalidatePath("/");
  revalidatePath("/gt");
  revalidatePath("/account");
  return { ok: archived ? `${client.name} arquivado.` : `${client.name} voltou para a carteira.` };
}

/**
 * Exclusão definitiva — só administradores, e só confirmando o nome. Leva
 * junto todo o histórico do cliente (ver `deleteClient`).
 */
export async function removeClient(id: number, confirmName: string): Promise<ActionResult> {
  await requireAdmin();
  const client = await getClient(id);
  if (!client) return { error: "Cliente não encontrado." };
  if (confirmName.trim().toLowerCase() !== client.name.trim().toLowerCase())
    return { error: "O nome digitado não confere." };
  await deleteClient(id);
  revalidatePath("/config");
  revalidatePath("/");
  revalidatePath("/social");
  return { ok: `${client.name} excluído com todo o histórico.` };
}

/* ------------------------- calibração ------------------------------ */

export async function saveWeights(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const weights: Partial<Record<DimensionKey, number>> = {};
  for (const d of DIMENSIONS) {
    const v = numOrNull(formData, `w_${d.key}`);
    weights[d.key] = v ?? d.defaultWeight;
  }
  await setSetting("weights", weights);

  const config: Record<string, number> = {};
  for (const k of Object.keys(DEFAULT_CONFIG) as (keyof typeof DEFAULT_CONFIG)[]) {
    const v = numOrNull(formData, `cfg_${k}`);
    if (v !== null) config[k] = v;
  }
  await setSetting("config", config);

  // Recalcula a série inteira com os novos pesos — a recalibração precisa
  // reescrever o passado para que a comparação com o desfecho faça sentido.
  await recomputeRange(90);
  revalidatePath("/");
  revalidatePath("/config", "layout");
  return { ok: "Pesos salvos e últimos 90 dias recalculados." };
}

export async function resetWeights(): Promise<ActionResult> {
  await requireUser();
  await setSetting("weights", {});
  await setSetting("config", {});
  await recomputeRange(90);
  revalidatePath("/");
  revalidatePath("/config", "layout");
  return { ok: "Pesos e limiares voltaram ao padrão; 90 dias recalculados." };
}

export async function runRecompute(): Promise<ActionResult> {
  await requireUser();
  const r = await recomputeAll();
  revalidatePath("/");
  return { ok: `Score do dia recalculado para ${r.clients} cliente(s).` };
}

/* ----------------------- integrações (CRM) ------------------------- */

export async function enableIntegration(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const clientId = Number(str(formData, "client_id"));
  if (!clientId) return { error: "Escolha o cliente." };
  await createIntegration(clientId, me.id ?? null);
  revalidatePath("/config/integracoes");
  return { ok: "Webhook gerado. Copie o endereço e cole no CRM." };
}

export async function setIntegrationPaused(clientId: number, paused: boolean): Promise<ActionResult> {
  await requireAdmin();
  await setIntegrationActive(clientId, !paused);
  // Ligar/desligar muda o que entra no score — recalcula a série recente.
  after(() => recomputeRange(45));
  revalidatePath("/config/integracoes");
  revalidatePath("/");
  return { ok: paused ? "Integração pausada — os leads voltam para o input manual." : "Integração reativada." };
}

export async function rotateIntegration(clientId: number): Promise<ActionResult> {
  await requireAdmin();
  await rotateIntegrationToken(clientId);
  revalidatePath("/config/integracoes");
  return { ok: "Novo endereço gerado. Atualize o webhook no CRM." };
}

export async function removeIntegration(clientId: number): Promise<ActionResult> {
  await requireAdmin();
  await deleteIntegration(clientId);
  after(() => recomputeRange(45));
  revalidatePath("/config/integracoes");
  revalidatePath("/");
  return { ok: "Integração removida. Os leads já recebidos continuam no histórico." };
}

/* --------------------------- planos -------------------------------- */

function planFields(formData: FormData) {
  return {
    risk: str(formData, "risk"),
    plan: str(formData, "plan"),
    owner: str(formData, "owner"),
    due_date: str(formData, "due_date") || null,
  };
}

export async function savePlan(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const clientId = Number(str(formData, "client_id"));
  const id = Number(str(formData, "id")) || 0;
  const f = planFields(formData);
  if (!f.risk || !f.plan || !f.owner) return { error: "Preencha risco, plano e dono." };
  if (id) await updatePlan(id, f);
  else await createPlan({ client_id: clientId, ...f });
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/");
  return { ok: id ? "Plano atualizado." : "Plano registrado." };
}

export async function changePlanStatus(id: number, status: Plan["status"]): Promise<ActionResult> {
  await requireUser();
  const plan = await getPlan(id);
  if (!plan) return { error: "Plano não encontrado." };
  await updatePlanStatus(id, status);
  revalidatePath(`/clientes/${plan.client_id}`);
  revalidatePath("/");
  const label = { aberto: "reaberto", em_andamento: "em andamento", concluido: "concluído", cancelado: "cancelado" }[status];
  return { ok: `Plano ${label}.` };
}

export async function removePlan(id: number): Promise<ActionResult> {
  await requireUser();
  const plan = await getPlan(id);
  if (!plan) return { error: "Plano não encontrado." };
  await deletePlan(id);
  revalidatePath(`/clientes/${plan.client_id}`);
  revalidatePath("/");
  return { ok: "Plano excluído." };
}
