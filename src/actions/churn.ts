"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { logChange } from "@/lib/audit";
import type { ActionResult } from "@/lib/action";
import { getClient, listUsers, today, updateClient } from "@/lib/repo";
import {
  addEvent,
  addEvidence,
  addTask,
  concludeRequest,
  createAttempt,
  createRequest,
  getRequest,
  respondAttempt,
  setStatus,
  setTaskDone,
  updateReasons,
} from "@/lib/churn/db";
import {
  CHANCE,
  CHANNEL,
  OUTCOME,
  REASONS,
  RESULT,
  STATUS,
  STRATEGIES,
  addDays,
  churnCode,
  isOpen,
  money,
  reasonLabel,
  type AttemptChange,
  type AttemptResult,
  type ChurnChannel,
  type ChurnOutcome,
  type ChurnStatus,
  type Evidence,
  type RetentionChance,
} from "@/lib/churn/types";
import { isOwnChurnBlob } from "@/lib/churn/storage";

const str = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() ?? "";
const numOrNull = (f: FormData, k: string) => {
  const v = str(f, k).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
};
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const who = (me: { id: number; name: string }) => ({ id: me.id, name: me.name });

function revalidateChurn(id?: number, clientId?: number) {
  revalidatePath("/churn", "layout");
  if (id) revalidatePath(`/churn/${id}`);
  if (clientId) revalidatePath(`/clientes/${clientId}`);
}

function parseEvidences(raw: string): Evidence[] {
  try {
    const list = JSON.parse(raw || "[]") as Evidence[];
    return Array.isArray(list)
      ? list
          .filter((e) => e && typeof e.url === "string" && isOwnChurnBlob(e.url))
          .map((e) => ({ name: String(e.name).slice(0, 200), url: e.url, size: Number(e.size) || 0, at: String(e.at || new Date().toISOString()) }))
      : [];
  } catch {
    return [];
  }
}

/* ------------------------------ abertura ------------------------------ */

export async function createChurnRequest(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const clientId = Number(str(formData, "client_id"));
  const client = clientId ? await getClient(clientId) : null;
  if (!client) return { error: "Selecione o cliente." };

  const requestedAt = str(formData, "requested_at");
  const channel = str(formData, "channel") as ChurnChannel;
  const main = str(formData, "main_reason");
  const justification = str(formData, "justification");
  const desiredEnd = str(formData, "desired_end");
  const ownerId = Number(str(formData, "owner_user_id")) || null;
  const chance = str(formData, "retention_chance") as RetentionChance;

  if (!isDate(requestedAt)) return { error: "Informe a data da solicitação." };
  if (!(channel in CHANNEL)) return { error: "Escolha o canal de recebimento." };
  if (!(main in REASONS)) return { error: "Escolha o motivo principal." };
  if (!justification) return { error: "Registre a justificativa apresentada pelo cliente." };
  if (!isDate(desiredEnd)) return { error: "Informe a data desejada para encerramento." };
  if (!ownerId) return { error: "Escolha o responsável pelo acompanhamento." };
  if (!(chance in CHANCE)) return { error: "Marque a possibilidade de retenção." };

  const secondary = formData
    .getAll("secondary_reasons")
    .map(String)
    .filter((k) => k in REASONS && k !== main);
  const owner = (await listUsers()).find((u) => u.id === ownerId) ?? null;

  const id = await createRequest(
    {
      client_id: clientId,
      requested_at: requestedAt,
      channel,
      main_reason: main,
      secondary_reasons: secondary,
      justification,
      desired_end: desiredEnd,
      owner_user_id: ownerId,
      retention_chance: chance,
      mrr: client.mrr,
      contract_code: client.contract_code,
      services: client.services ?? [],
      evidences: parseEvidences(str(formData, "evidences")),
    },
    who(me),
    owner?.name ?? null,
    addDays(today(), 2),
  );
  await logChange(me, "churn", `Pedido de cancelamento registrado (${churnCode(id)}): ${reasonLabel(main)}`, {
    clientId,
    data: { request: id },
  });
  revalidateChurn(id, clientId);
  redirect(`/churn/${id}?ok=${encodeURIComponent(`Solicitação ${churnCode(id)} criada. O contrato continua ativo.`)}`);
}

/* ------------------------------- edição ------------------------------- */

export async function saveChurnReasons(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const id = Number(str(formData, "id"));
  const req = await getRequest(id);
  if (!req) return { error: "Solicitação não encontrada." };
  if (!isOpen(req.status)) return { error: "Solicitação já concluída — os motivos não podem mais ser editados." };
  const main = str(formData, "main_reason");
  const justification = str(formData, "justification");
  const desiredEnd = str(formData, "desired_end");
  const chance = str(formData, "retention_chance") as RetentionChance;
  if (!(main in REASONS)) return { error: "Escolha o motivo principal." };
  if (!justification) return { error: "Registre a justificativa do cliente." };
  if (!(chance in CHANCE)) return { error: "Marque a possibilidade de retenção." };
  const secondary = formData
    .getAll("secondary_reasons")
    .map(String)
    .filter((k) => k in REASONS && k !== main);
  await updateReasons(id, {
    main_reason: main,
    secondary_reasons: secondary,
    justification,
    desired_end: isDate(desiredEnd) ? desiredEnd : null,
    retention_chance: chance,
  });
  await addEvent(id, "observacao", "Motivos da solicitação editados", who(me), {
    body: `Motivo principal: ${reasonLabel(main)}${secondary.length ? ` · secundários: ${secondary.map(reasonLabel).join(", ")}` : ""}`,
  });
  revalidateChurn(id);
  return { ok: "Motivos atualizados." };
}

export async function changeChurnStatus(id: number, to: ChurnStatus): Promise<ActionResult> {
  const me = await requireUser();
  const req = await getRequest(id);
  if (!req) return { error: "Solicitação não encontrada." };
  if (!isOpen(req.status) || !isOpen(to)) return { error: "Para encerrar, use “Concluir solicitação”." };
  await setStatus(id, req.status, to, who(me));
  revalidateChurn(id, req.client_id);
  return { ok: `Status: ${STATUS[to].label}.` };
}

/** Composer do histórico: observação, contato ou anexo. */
export async function addChurnNote(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const id = Number(str(formData, "id"));
  const kind = str(formData, "kind") as "observacao" | "contato" | "anexo";
  const text = str(formData, "text");
  if (!["observacao", "contato", "anexo"].includes(kind)) return { error: "Tipo inválido." };
  const req = await getRequest(id);
  if (!req) return { error: "Solicitação não encontrada." };
  const files = parseEvidences(str(formData, "evidences"));
  if (kind === "anexo" && !files.length) return { error: "Anexe um arquivo." };
  if (kind !== "anexo" && !text) return { error: "Escreva o registro." };
  for (const f of files) await addEvidence(id, f);
  const title =
    kind === "contato"
      ? text.split("\n")[0].slice(0, 120)
      : kind === "anexo"
        ? `Anexo: ${files.map((f) => f.name).join(", ")}`
        : "Observação";
  const body = kind === "contato" ? text.split("\n").slice(1).join("\n").trim() : text;
  await addEvent(id, kind, title, who(me), { body, data: files.length ? { files } : {} });
  revalidateChurn(id);
  return { ok: "Registro salvo no histórico." };
}

/* ----------------------------- tentativas ----------------------------- */

export async function registerAttempt(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const id = Number(str(formData, "id"));
  const req = await getRequest(id);
  if (!req) return { error: "Solicitação não encontrada." };
  if (!isOpen(req.status)) return { error: "Solicitação já concluída." };
  const strategy = str(formData, "strategy");
  const proposal = str(formData, "proposal");
  if (!(strategy in STRATEGIES)) return { error: "Escolha a estratégia de negociação." };
  if (!proposal) return { error: "Descreva a proposta." };

  const current = numOrNull(formData, "current_mrr") ?? req.mrr;
  const proposed = numOrNull(formData, "proposed_mrr");
  const changes: AttemptChange[] = [];
  if (proposed !== null && proposed !== current) {
    const pct = current ? Math.round(((proposed - current) / current) * 100) : 0;
    changes.push({ label: "Valor mensal", current: money(current), proposed: money(proposed), delta: `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%` });
  }
  const scopeLabels = formData.getAll("change_label").map(String);
  const scopeCurrent = formData.getAll("change_current").map(String);
  const scopeProposed = formData.getAll("change_proposed").map(String);
  scopeLabels.forEach((label, i) => {
    if (label.trim() && (scopeProposed[i] ?? "").trim())
      changes.push({ label: label.trim(), current: (scopeCurrent[i] ?? "").trim() || "—", proposed: scopeProposed[i].trim(), delta: "—" });
  });

  const ownerId = Number(str(formData, "owner_user_id")) || me.id;
  const due = str(formData, "due_date");
  const owner = (await listUsers()).find((u) => u.id === ownerId);
  const createTask = str(formData, "create_task") === "on";
  const n = await createAttempt(
    id,
    {
      strategy,
      proposal,
      changes,
      current_mrr: current,
      proposed_mrr: proposed,
      owner_user_id: ownerId,
      due_date: isDate(due) ? due : null,
      sent_at: today(),
    },
    who(me),
    createTask ? { text: str(formData, "task_text") || `Cobrar retorno da proposta (${STRATEGIES[strategy]})`, owner: owner?.name ?? null } : null,
  );
  // Proposta enviada: a solicitação passa a estar em negociação.
  if (req.status === "solicitado" || req.status === "em_analise") await setStatus(id, req.status, "em_negociacao", who(me));
  revalidateChurn(id, req.client_id);
  return { ok: `Tentativa ${n} registrada.` };
}

export async function answerAttempt(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const attemptId = Number(str(formData, "attempt_id"));
  const result = str(formData, "result") as AttemptResult;
  const kind = str(formData, "response_kind") === "contraproposta" ? "contraproposta" : "resposta";
  const response = str(formData, "response");
  const date = str(formData, "responded_at");
  if (!(result in RESULT) || result === "aguardando") return { error: "Escolha o resultado." };
  if (!response) return { error: "Registre o que o cliente respondeu." };
  const requestId = await respondAttempt(attemptId, { result, response, kind, responded_at: isDate(date) ? date : today() }, who(me));
  if (!requestId) return { error: "Tentativa não encontrada." };
  revalidateChurn(requestId);
  return { ok: "Resposta registrada." };
}

/* ------------------------------- tarefas ------------------------------- */

export async function addChurnTask(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireUser();
  const id = Number(str(formData, "id"));
  const text = str(formData, "text");
  if (!text) return { error: "Descreva a tarefa." };
  const due = str(formData, "due_date");
  await addTask(id, {
    text,
    owner: str(formData, "owner") || null,
    due_date: isDate(due) ? due : null,
    kind: str(formData, "kind") === "pendencia" ? "pendencia" : "tarefa",
  });
  revalidateChurn(id);
  return { ok: "Tarefa criada." };
}

export async function toggleChurnTask(taskId: number, done: boolean): Promise<ActionResult> {
  await requireUser();
  const requestId = await setTaskDone(taskId, done);
  if (requestId) revalidateChurn(requestId);
  return { ok: done ? "Tarefa concluída." : "Tarefa reaberta." };
}

/* ------------------------------ conclusão ------------------------------ */

export async function concludeChurn(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const id = Number(str(formData, "id"));
  const req = await getRequest(id);
  if (!req) return { error: "Solicitação não encontrada." };
  if (!isOpen(req.status)) return { error: "Esta solicitação já foi concluída." };

  const outcome = str(formData, "outcome") as ChurnOutcome;
  if (!(outcome in OUTCOME)) return { error: "Escolha o resultado." };
  const end = str(formData, "effective_end");
  const finalReason = str(formData, "final_reason");
  const note = str(formData, "final_note");
  const newMrr = numOrNull(formData, "new_mrr");
  if (outcome === "cancelado" && !isDate(end)) return { error: "Informe a data efetiva de encerramento." };
  if (outcome === "cancelado" && !(finalReason in REASONS)) return { error: "Escolha o motivo final." };
  if (outcome === "retido_alteracao" && newMrr === null) return { error: "Informe o novo valor mensal." };

  // Pendências do encerramento (checklist do formulário) viram tarefas.
  const texts = formData.getAll("pend_text").map(String);
  const owners = formData.getAll("pend_owner").map(String);
  const dues = formData.getAll("pend_due").map(String);
  const dones = formData.getAll("pend_done").map(String);
  if (outcome === "cancelado")
    for (let i = 0; i < texts.length; i++) {
      if (!texts[i].trim()) continue;
      await addTask(id, {
        kind: "pendencia",
        text: texts[i].trim(),
        owner: owners[i]?.trim() || null,
        due_date: isDate(dues[i] ?? "") ? dues[i] : null,
        done: dones[i] === "1",
      });
    }

  await concludeRequest(
    id,
    req.status,
    {
      outcome,
      final_reason: outcome === "cancelado" ? finalReason : finalReason in REASONS ? finalReason : req.main_reason,
      final_note: note,
      effective_end: outcome === "cancelado" ? end : null,
      new_mrr: outcome === "retido_alteracao" ? newMrr : null,
    },
    who(me),
    today(),
  );

  if (outcome === "retido_alteracao" && newMrr !== null && str(formData, "update_mrr") === "on") {
    await updateClient(req.client_id, { mrr: newMrr });
    await logChange(me, "cliente", `MRR ${money(req.mrr)} → ${money(newMrr)} (retenção ${churnCode(id)})`, { clientId: req.client_id });
  }
  await logChange(
    me,
    "churn",
    outcome === "cancelado"
      ? `Churn concluído (${churnCode(id)}): cancelamento efetivado em ${end.split("-").reverse().join("/")}`
      : `Cliente retido (${churnCode(id)})${outcome === "retido_alteracao" ? " com alteração" : ""}`,
    { clientId: req.client_id, data: { request: id, outcome } },
  );

  revalidateChurn(id, req.client_id);
  revalidatePath("/");
  revalidatePath("/config", "layout");
  redirect(
    `/churn/${id}?ok=${encodeURIComponent(outcome === "cancelado" ? "Cancelamento registrado. O histórico fica preservado." : "Retenção registrada.")}`,
  );
}

export async function attachChurnEvidence(id: number, e: Evidence): Promise<ActionResult> {
  const me = await requireUser();
  const [file] = parseEvidences(JSON.stringify([e]));
  if (!file) return { error: "Arquivo inválido." };
  await addEvidence(id, file);
  await addEvent(id, "anexo", `Anexo: ${file.name}`, who(me), { data: { files: [file] } });
  revalidateChurn(id);
  return { ok: "Anexo adicionado." };
}
