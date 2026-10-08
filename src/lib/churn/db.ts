import { all, insert, one, run, transaction } from "../db";
import {
  STATUS,
  churnCode,
  strategyLabel,
  type AttemptChange,
  type AttemptResult,
  type ChurnAttempt,
  type ChurnChannel,
  type ChurnEvent,
  type ChurnEventKind,
  type ChurnOutcome,
  type ChurnRequest,
  type ChurnStatus,
  type ChurnTask,
  type Evidence,
  type RetentionChance,
} from "./types";

/**
 * Repositório do Churn. Mesma regra do resto do app: nada é sobrescrito sem
 * deixar rastro — cada mudança de status, tentativa, resposta e conclusão
 * vira uma linha em `churn_events`, que é o histórico da solicitação.
 */

type Who = { id: number | null; name: string | null };

const REQUEST_SELECT = `
  SELECT r.id, r.client_id, c.name AS client_name, c.active AS client_active, c.account_type,
         COALESCE(c.contract_start, c.created_at::date)::text AS client_since,
         r.status, r.requested_at::text AS requested_at, r.channel, r.main_reason, r.secondary_reasons,
         r.justification, r.desired_end::text AS desired_end, r.owner_user_id, o.name AS owner_name,
         r.retention_chance, r.mrr, r.contract_code, r.services, r.evidences, r.outcome, r.final_reason,
         r.final_note, r.effective_end::text AS effective_end, r.new_mrr, r.client_inactivated,
         r.closed_at::text AS closed_at, cb.name AS created_by_name, r.created_at::text AS created_at,
         r.updated_at::text AS updated_at,
         (SELECT COUNT(*)::int FROM churn_attempts a WHERE a.request_id = r.id) AS attempts,
         (SELECT COUNT(*)::int FROM churn_attempts a WHERE a.request_id = r.id AND a.result = 'aguardando') AS attempts_open,
         (SELECT MAX(e.at)::date::text FROM churn_events e
           WHERE e.request_id = r.id AND e.kind = 'status' AND e.data->>'to' = r.status) AS status_since
  FROM churn_requests r
  JOIN clients c ON c.id = r.client_id
  LEFT JOIN users o ON o.id = r.owner_user_id
  LEFT JOIN users cb ON cb.id = r.created_by`;

const withCode = (r: Omit<ChurnRequest, "code">): ChurnRequest => ({
  ...r,
  code: churnCode(r.id),
  mrr: Number(r.mrr),
  new_mrr: r.new_mrr === null ? null : Number(r.new_mrr),
  status_since: r.status_since ?? r.requested_at,
});

export async function listRequests(): Promise<ChurnRequest[]> {
  const rows = await all<Omit<ChurnRequest, "code">>(`${REQUEST_SELECT} ORDER BY r.requested_at DESC, r.id DESC`);
  return rows.map(withCode);
}

export async function getRequest(id: number): Promise<ChurnRequest | null> {
  const r = await one<Omit<ChurnRequest, "code">>(`${REQUEST_SELECT} WHERE r.id = ?`, [id]);
  return r ? withCode(r) : null;
}

export async function requestsForClient(clientId: number): Promise<ChurnRequest[]> {
  const rows = await all<Omit<ChurnRequest, "code">>(`${REQUEST_SELECT} WHERE r.client_id = ? ORDER BY r.requested_at DESC`, [clientId]);
  return rows.map(withCode);
}

const ATTEMPT_SELECT = `
  SELECT a.id, a.request_id, a.n, a.strategy, a.proposal, a.changes, a.current_mrr, a.proposed_mrr,
         a.owner_user_id, u.name AS owner_name, a.due_date::text AS due_date, a.sent_at::text AS sent_at,
         a.result, a.response, a.response_kind, a.responded_at::text AS responded_at, a.created_at::text AS created_at
  FROM churn_attempts a LEFT JOIN users u ON u.id = a.owner_user_id`;

const numAttempt = (a: ChurnAttempt): ChurnAttempt => ({
  ...a,
  current_mrr: a.current_mrr === null ? null : Number(a.current_mrr),
  proposed_mrr: a.proposed_mrr === null ? null : Number(a.proposed_mrr),
});

export const listAttempts = async (requestId: number) =>
  (await all<ChurnAttempt>(`${ATTEMPT_SELECT} WHERE a.request_id = ? ORDER BY a.n DESC`, [requestId])).map(numAttempt);

/** Todas as tentativas já concluídas ou abertas (análise por estratégia). */
export const listAllAttempts = async () =>
  (await all<ChurnAttempt>(`${ATTEMPT_SELECT} ORDER BY a.request_id, a.n`)).map(numAttempt);

export type PendingAttempt = ChurnAttempt & { client_name: string; request_status: ChurnStatus };

/** "Negociações pendentes": tentativas aguardando retorno, de todas as contas. */
export async function pendingAttempts(): Promise<PendingAttempt[]> {
  const rows = await all<PendingAttempt>(
    `SELECT a.id, a.request_id, a.n, a.strategy, a.due_date::text AS due_date, a.sent_at::text AS sent_at, a.result,
            c.name AS client_name, r.status AS request_status
     FROM churn_attempts a
     JOIN churn_requests r ON r.id = a.request_id
     JOIN clients c ON c.id = r.client_id
     WHERE a.result = 'aguardando' AND r.status NOT IN ('retido','cancelado')
     ORDER BY a.due_date NULLS LAST, a.id`,
  );
  return rows;
}

export const listTasks = (requestId: number) =>
  all<ChurnTask>(
    `SELECT id, request_id, attempt_id, kind, text, owner, due_date::text AS due_date, note, done
     FROM churn_tasks WHERE request_id = ? ORDER BY done, due_date NULLS LAST, id`,
    [requestId],
  );

export const listEvents = (requestId: number) =>
  all<ChurnEvent>(
    `SELECT id, request_id, to_char(at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at, kind, title, body, data, user_name
     FROM churn_events WHERE request_id = ? ORDER BY at DESC, id DESC`,
    [requestId],
  );

/** Datas em que a solicitação entrou em cada status (barra de etapas). */
export async function statusDates(requestId: number): Promise<Partial<Record<ChurnStatus, string>>> {
  const rows = await all<{ to: ChurnStatus; day: string }>(
    `SELECT data->>'to' AS "to", MIN(at)::date::text AS day FROM churn_events
     WHERE request_id = ? AND kind = 'status' GROUP BY data->>'to'`,
    [requestId],
  );
  return Object.fromEntries(rows.map((r) => [r.to, r.day]));
}

export async function addEvent(
  requestId: number,
  kind: ChurnEventKind,
  title: string,
  who: Who | null,
  opts: { body?: string; data?: Record<string, unknown>; at?: string } = {},
) {
  await run(
    `INSERT INTO churn_events (request_id, kind, title, body, data, user_id, user_name, at)
     VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, COALESCE(?::timestamptz, now()))`,
    [requestId, kind, title, opts.body ?? "", JSON.stringify(opts.data ?? {}), who?.id ?? null, who?.name ?? null, opts.at ?? null],
  );
}

const touch = (id: number) => run(`UPDATE churn_requests SET updated_at = now() WHERE id = ?`, [id]);

/* ------------------------------ abertura ------------------------------ */

export type NewRequest = {
  client_id: number;
  requested_at: string;
  channel: ChurnChannel;
  main_reason: string;
  secondary_reasons: string[];
  justification: string;
  desired_end: string | null;
  owner_user_id: number | null;
  retention_chance: RetentionChance;
  mrr: number;
  contract_code: string | null;
  services: string[];
  evidences: Evidence[];
};

/**
 * Registra a solicitação com status inicial "Solicitado", o evento de
 * abertura e a tarefa de primeiro contato (48 h) para o responsável.
 * O contrato continua ativo — a perda só conta na conclusão.
 */
export async function createRequest(r: NewRequest, who: Who, ownerName: string | null, firstContactDue: string) {
  const id = await insert(
    `INSERT INTO churn_requests (client_id, requested_at, channel, main_reason, secondary_reasons, justification,
       desired_end, owner_user_id, retention_chance, mrr, contract_code, services, evidences, created_by)
     VALUES (?, ?::date, ?, ?, ?::jsonb, ?, ?::date, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?) RETURNING id`,
    [
      r.client_id,
      r.requested_at,
      r.channel,
      r.main_reason,
      JSON.stringify(r.secondary_reasons),
      r.justification,
      r.desired_end,
      r.owner_user_id,
      r.retention_chance,
      r.mrr,
      r.contract_code,
      JSON.stringify(r.services),
      JSON.stringify(r.evidences),
      who.id,
    ],
  );
  await transaction([
    [
      `INSERT INTO churn_events (request_id, kind, title, body, data, user_id, user_name)
       VALUES (?, 'status', ?, '', ?::jsonb, ?, ?)`,
      [id, `Status inicial: ${STATUS.solicitado.label}`, JSON.stringify({ from: null, to: "solicitado" }), who.id, who.name],
    ],
    [
      `INSERT INTO churn_events (request_id, kind, title, body, data, user_id, user_name)
       VALUES (?, 'abertura', ?, ?, '{}'::jsonb, ?, ?)`,
      [
        id,
        `Solicitação registrada via ${r.channel === "outro" ? "outro canal" : { email: "e-mail", whatsapp: "WhatsApp", call: "call", reuniao: "reunião" }[r.channel]}`,
        "Evento “Pedido de cancelamento” registrado no histórico da conta. Contrato permanece ativo.",
        who.id,
        who.name,
      ],
    ],
    [
      `INSERT INTO churn_tasks (request_id, kind, text, owner, due_date) VALUES (?, 'tarefa', ?, ?, ?::date)`,
      [id, "Primeiro contato com o cliente sobre o pedido", ownerName, firstContactDue],
    ],
  ]);
  return id;
}

export async function updateReasons(
  id: number,
  r: { main_reason: string; secondary_reasons: string[]; justification: string; desired_end: string | null; retention_chance: RetentionChance },
) {
  await run(
    `UPDATE churn_requests SET main_reason = ?, secondary_reasons = ?::jsonb, justification = ?, desired_end = ?::date,
       retention_chance = ?, updated_at = now() WHERE id = ?`,
    [r.main_reason, JSON.stringify(r.secondary_reasons), r.justification, r.desired_end, r.retention_chance, id],
  );
}

export async function addEvidence(id: number, e: Evidence) {
  await run(`UPDATE churn_requests SET evidences = evidences || ?::jsonb, updated_at = now() WHERE id = ?`, [JSON.stringify([e]), id]);
}

/* ------------------------------- status ------------------------------- */

export async function setStatus(id: number, from: ChurnStatus, to: ChurnStatus, who: Who) {
  if (from === to) return;
  await transaction([
    [`UPDATE churn_requests SET status = ?, updated_at = now() WHERE id = ?`, [to, id]],
    [
      `INSERT INTO churn_events (request_id, kind, title, data, user_id, user_name) VALUES (?, 'status', ?, ?::jsonb, ?, ?)`,
      [id, `Status alterado: ${STATUS[from].label} → ${STATUS[to].label}`, JSON.stringify({ from, to }), who.id, who.name],
    ],
  ]);
}

/* ----------------------------- tentativas ----------------------------- */

export type NewAttempt = {
  strategy: string;
  proposal: string;
  changes: AttemptChange[];
  current_mrr: number | null;
  proposed_mrr: number | null;
  owner_user_id: number | null;
  due_date: string | null;
  sent_at: string;
};

export async function createAttempt(requestId: number, a: NewAttempt, who: Who, task: { text: string; owner: string | null } | null) {
  const next = await one<{ n: number }>(`SELECT COALESCE(MAX(n), 0)::int + 1 AS n FROM churn_attempts WHERE request_id = ?`, [requestId]);
  const n = next?.n ?? 1;
  const attemptId = await insert(
    `INSERT INTO churn_attempts (request_id, n, strategy, proposal, changes, current_mrr, proposed_mrr, owner_user_id, due_date, sent_at, created_by)
     VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?::date, ?::date, ?) RETURNING id`,
    [requestId, n, a.strategy, a.proposal, JSON.stringify(a.changes), a.current_mrr, a.proposed_mrr, a.owner_user_id, a.due_date, a.sent_at, who.id],
  );
  const steps: [string, unknown[]][] = [
    [
      `INSERT INTO churn_events (request_id, kind, title, body, data, user_id, user_name) VALUES (?, 'tentativa', ?, ?, ?::jsonb, ?, ?)`,
      [requestId, `Tentativa ${n} enviada — ${strategyLabel(a.strategy)}`, a.proposal, JSON.stringify({ attempt: n }), who.id, who.name],
    ],
    [`UPDATE churn_requests SET updated_at = now() WHERE id = ?`, [requestId]],
  ];
  if (task)
    steps.push([
      `INSERT INTO churn_tasks (request_id, attempt_id, kind, text, owner, due_date) VALUES (?, ?, 'tarefa', ?, ?, ?::date)`,
      [requestId, attemptId, task.text, task.owner, a.due_date],
    ]);
  await transaction(steps);
  return n;
}

export async function respondAttempt(
  attemptId: number,
  r: { result: AttemptResult; response: string; kind: "resposta" | "contraproposta"; responded_at: string },
  who: Who,
) {
  const a = await one<{ request_id: number; n: number }>(`SELECT request_id, n FROM churn_attempts WHERE id = ?`, [attemptId]);
  if (!a) return null;
  await transaction([
    [
      `UPDATE churn_attempts SET result = ?, response = ?, response_kind = ?, responded_at = ?::date WHERE id = ?`,
      [r.result, r.response, r.kind, r.responded_at, attemptId],
    ],
    [
      `INSERT INTO churn_events (request_id, kind, title, body, data, user_id, user_name) VALUES (?, 'resposta', ?, ?, ?::jsonb, ?, ?)`,
      [
        a.request_id,
        r.kind === "contraproposta" ? `Contraproposta do cliente (tentativa ${a.n})` : `Resposta do cliente (tentativa ${a.n})`,
        r.response,
        JSON.stringify({ attempt: a.n, result: r.result }),
        who.id,
        who.name,
      ],
    ],
    [`UPDATE churn_requests SET updated_at = now() WHERE id = ?`, [a.request_id]],
  ]);
  return a.request_id;
}

/* ------------------------------- tarefas ------------------------------- */

export async function addTask(
  requestId: number,
  t: { text: string; owner: string | null; due_date: string | null; kind: "tarefa" | "pendencia"; note?: string | null; done?: boolean },
) {
  await run(
    `INSERT INTO churn_tasks (request_id, kind, text, owner, due_date, note, done, done_at)
     VALUES (?, ?, ?, ?, ?::date, ?, ?, CASE WHEN ? = 1 THEN now() END)`,
    [requestId, t.kind, t.text, t.owner, t.due_date, t.note ?? null, t.done ? 1 : 0, t.done ? 1 : 0],
  );
  await touch(requestId);
}

export async function setTaskDone(taskId: number, done: boolean) {
  const t = await one<{ request_id: number }>(
    `UPDATE churn_tasks SET done = ?, done_at = CASE WHEN ? = 1 THEN now() END WHERE id = ? RETURNING request_id`,
    [done ? 1 : 0, done ? 1 : 0, taskId],
  );
  return t?.request_id ?? null;
}

/* ------------------------------ conclusão ------------------------------ */

export type Conclusion = {
  outcome: ChurnOutcome;
  final_reason: string | null;
  final_note: string;
  effective_end: string | null;
  new_mrr: number | null;
};

/**
 * Fecha a solicitação com o resultado definitivo. Cancelamento inativa o
 * cliente na data efetiva (já agora, se a data passou; senão o job diário
 * faz isso no dia — ver `applyScheduledInactivations`). O histórico fica.
 */
export async function concludeRequest(id: number, from: ChurnStatus, c: Conclusion, who: Who, today: string) {
  const to: ChurnStatus = c.outcome === "cancelado" ? "cancelado" : "retido";
  await transaction([
    [
      `UPDATE churn_requests SET status = ?, outcome = ?, final_reason = ?, final_note = ?, effective_end = ?::date,
         new_mrr = ?, closed_at = now(), closed_by = ?, updated_at = now() WHERE id = ?`,
      [to, c.outcome, c.final_reason, c.final_note, c.effective_end, c.new_mrr, who.id, id],
    ],
    [
      `INSERT INTO churn_events (request_id, kind, title, data, user_id, user_name) VALUES (?, 'status', ?, ?::jsonb, ?, ?)`,
      [id, `Status alterado: ${STATUS[from].label} → ${STATUS[to].label}`, JSON.stringify({ from, to }), who.id, who.name],
    ],
    [
      `INSERT INTO churn_events (request_id, kind, title, body, data, user_id, user_name) VALUES (?, 'conclusao', ?, ?, ?::jsonb, ?, ?)`,
      [
        id,
        c.outcome === "cancelado" ? "Churn concluído — cancelamento efetivado" : c.outcome === "retido" ? "Cliente retido" : "Cliente retido com alteração",
        c.final_note,
        JSON.stringify({ outcome: c.outcome }),
        who.id,
        who.name,
      ],
    ],
  ]);
  if (c.outcome === "cancelado") await applyScheduledInactivations(today);
}

/**
 * Cancelamentos com data efetiva já alcançada e cliente ainda ativo: tira o
 * cliente da carteira. Roda na conclusão e no job diário (recompute).
 */
export async function applyScheduledInactivations(today: string): Promise<number> {
  const due = await all<{ id: number; client_id: number }>(
    `SELECT id, client_id FROM churn_requests
     WHERE status = 'cancelado' AND client_inactivated = 0 AND (effective_end IS NULL OR effective_end <= ?::date)`,
    [today],
  );
  if (!due.length) return 0;
  await transaction(
    due.flatMap((d) => [
      [`UPDATE clients SET active = 0 WHERE id = ?`, [d.client_id]] as [string, unknown[]],
      [`UPDATE churn_requests SET client_inactivated = 1 WHERE id = ?`, [d.id]] as [string, unknown[]],
    ]),
  );
  return due.length;
}

/** Quantas solicitações abertas — contador do menu. */
export async function openCount(): Promise<number> {
  const r = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM churn_requests WHERE status NOT IN ('retido','cancelado')`);
  return r?.n ?? 0;
}
