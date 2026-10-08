"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { logChange } from "@/lib/audit";
import type { ActionResult } from "@/lib/action";
import {
  addUpsellUpdate,
  completeStepByKey,
  createLearning,
  createUpsell,
  deleteLearning,
  deleteUpsell,
  getLearning,
  getStep,
  getUpsell,
  registerRun,
  saveCrmDiagnostic,
  setStepDone,
  updateLearning,
  updateStep,
  type LearningInput,
} from "@/lib/playbook/db";
import {
  CRM_QUESTIONS,
  ERROR_CAUSES,
  UPSELL_OPEN,
  UPSELL_STAGES,
  type CrmAnswer,
  type ErrorCause,
  type UpsellStage,
} from "@/lib/playbook/templates";

const str = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() ?? "";

function revalidateClient(clientId: number) {
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/");
}

/* ------------------------------ passos ------------------------------ */

export async function toggleStep(id: number, done: boolean): Promise<ActionResult> {
  const me = await requireUser();
  const step = await getStep(id);
  if (!step) return { error: "Passo não encontrado." };
  if (step.status === "arquivado") return { error: "Este passo é de uma flag anterior." };
  await setStepDone(id, done, me.name);
  revalidateClient(step.client_id);
  return { ok: done ? "Passo concluído." : "Passo reaberto." };
}

/** Owner e nota do passo (ex.: decisão da bonificação, resumo da ligação). */
export async function saveStep(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const id = Number(str(formData, "id"));
  const step = await getStep(id);
  if (!step) return { error: "Passo não encontrado." };
  const owner = str(formData, "owner").slice(0, 120);
  if (!owner) return { error: "Informe o owner." };
  await updateStep(id, owner, str(formData, "note").slice(0, 2000));
  revalidateClient(step.client_id);
  return { ok: "Passo atualizado." };
}

/** Passo recorrente (micro-reporte, reavaliação, ROPRE, upsell): registra o de hoje. */
export async function runStep(id: number): Promise<ActionResult> {
  const me = await requireUser();
  const step = await getStep(id);
  if (!step || !step.every_days) return { error: "Passo não encontrado." };
  if (step.status !== "pendente") return { error: "Este passo não está mais ativo." };
  await registerRun(id, me.name);
  revalidateClient(step.client_id);
  return { ok: "Registrado. O próximo vence em " + (step.every_days === 1 ? "1 dia." : `${step.every_days} dias.`) };
}

/** "Não foi erro nosso": fecha o passo com o registro da resposta. */
export async function notOurError(stepId: number): Promise<ActionResult> {
  const me = await requireUser();
  const step = await getStep(stepId);
  if (!step || step.key !== "erro_nosso") return { error: "Passo não encontrado." };
  await setStepDone(stepId, true, me.name);
  await updateStep(stepId, step.owner, "Não foi erro da equipe.");
  revalidateClient(step.client_id);
  return { ok: "Registrado: a causa não foi erro da equipe." };
}

/* ---------------------------- Erro nosso ---------------------------- */

function learningFields(f: FormData): LearningInput {
  const cause = str(f, "cause");
  return {
    what: str(f, "what").slice(0, 2000),
    cause: cause in ERROR_CAUSES ? (cause as ErrorCause) : null,
    why: str(f, "why").slice(0, 2000),
    who: str(f, "who").slice(0, 200),
    learned: str(f, "learned").slice(0, 2000),
  };
}

export async function saveLearning(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const id = Number(str(formData, "id")) || 0;
  const f = learningFields(formData);
  if (!f.what) return { error: "Descreva o que foi o erro." };
  if (id) {
    const cur = await getLearning(id);
    if (!cur) return { error: "Registro não encontrado." };
    await updateLearning(id, f);
    revalidateClient(cur.client_id);
    return { ok: "Registro atualizado." };
  }
  const clientId = Number(str(formData, "client_id"));
  const episodeId = Number(str(formData, "episode_id")) || null;
  await createLearning(clientId, episodeId, f, me.id);
  await completeStepByKey(clientId, "erro_nosso", me.name, "Erro da equipe — registro de aprendizado aberto.");
  await logChange(me, "plano", `Erro nosso registrado: ${f.what.slice(0, 80)}`, { clientId });
  revalidateClient(clientId);
  return { ok: "Registro de aprendizado aberto." };
}

export async function removeLearning(id: number): Promise<ActionResult> {
  await requireUser();
  const cur = await getLearning(id);
  if (!cur) return { error: "Registro não encontrado." };
  await deleteLearning(id);
  revalidateClient(cur.client_id);
  return { ok: "Registro excluído." };
}

/* ------------------------------ Upsell ------------------------------ */

const money = (v: string) => {
  const n = Number(v.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", "."));
  return v && isFinite(n) ? n : null;
};

export async function saveUpsell(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const clientId = Number(str(formData, "client_id"));
  const product = str(formData, "product").slice(0, 200);
  if (!clientId || !product) return { error: "Informe o produto ou serviço sugerido." };
  await createUpsell(
    clientId,
    {
      product,
      rationale: str(formData, "rationale").slice(0, 2000),
      value: money(str(formData, "value")),
      commercial_owner: str(formData, "commercial_owner").slice(0, 120),
    },
    { id: me.id, name: me.name },
  );
  await completeStepByKey(clientId, "mapear_expansao", me.name, `Oportunidade: ${product}`);
  await logChange(me, "plano", `Oportunidade de upsell mapeada: ${product}`, { clientId });
  revalidateClient(clientId);
  return { ok: "Oportunidade registrada." };
}

/** Status da semana: etapa + nota. Alimenta os passos 2 e 3 do playbook Green. */
export async function updateUpsell(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const id = Number(str(formData, "id"));
  const opp = await getUpsell(id);
  if (!opp) return { error: "Oportunidade não encontrada." };
  const stage = str(formData, "stage") as UpsellStage;
  if (!(stage in UPSELL_STAGES)) return { error: "Escolha a etapa." };
  const note = str(formData, "note").slice(0, 1000);
  if (!note && stage === opp.stage) return { error: "Escreva o status da semana ou mude a etapa." };
  const owner = formData.has("commercial_owner") ? str(formData, "commercial_owner").slice(0, 120) : undefined;
  await addUpsellUpdate(id, stage, note, me.name, owner);

  if (stage !== "mapeada") await completeStepByKey(opp.client_id, "repasse_comercial", me.name, `Repassada: ${opp.product}`);
  // Status semanal registrado conta como o acompanhamento da semana.
  await completeStepByKey(opp.client_id, "acompanhar_upsell", me.name);
  if (!UPSELL_OPEN.includes(stage))
    await logChange(me, "plano", `Upsell ${stage === "ganha" ? "fechado" : "perdido"}: ${opp.product}`, { clientId: opp.client_id });
  revalidateClient(opp.client_id);
  return { ok: "Status registrado." };
}

export async function removeUpsell(id: number): Promise<ActionResult> {
  await requireUser();
  const opp = await getUpsell(id);
  if (!opp) return { error: "Oportunidade não encontrada." };
  await deleteUpsell(id);
  revalidateClient(opp.client_id);
  return { ok: "Oportunidade excluída." };
}

/* ------------------- Diagnóstico de CRM (bloco novo) ------------------- */

export async function saveCrmDiag(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const clientId = Number(str(formData, "client_id"));
  if (!clientId) return { error: "Cliente não informado." };
  const data: Record<string, string> = {};
  for (const q of CRM_QUESTIONS) {
    const v = str(formData, q.key) as CrmAnswer;
    if (v !== "sim" && v !== "nao") return { error: `Responda: ${q.label}` };
    data[q.key] = v;
  }
  const note = str(formData, "note").slice(0, 1000);
  if (note) data.note = note;
  await saveCrmDiagnostic(clientId, me.id, data);
  revalidateClient(clientId);
  return { ok: "Diagnóstico de CRM salvo." };
}
