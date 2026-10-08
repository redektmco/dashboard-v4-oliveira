import { all, insert, one, run } from "../db";
import type { Band } from "../model/types";
import {
  STEPS,
  UPSELL_OPEN,
  dueOf,
  type ErrorCause,
  type UpsellStage,
} from "./templates";

/**
 * Playbook por flag. A flag em vigor é a faixa do Health Score; quando ela
 * muda, o episódio aberto fecha (passos não feitos ficam "arquivado", não
 * somem) e um novo abre com os passos da nova flag, prazo contado da hora
 * da mudança. Quem chama: o recálculo diário, o recálculo após cada input e
 * a abertura da ficha do cliente (cobre o primeiro uso e o dia da mudança).
 */

export type Episode = {
  id: number;
  client_id: number;
  band: Band;
  prev_band: Band | null;
  started_at: string;
  ended_at: string | null;
};

export type Step = {
  id: number;
  episode_id: number;
  client_id: number;
  key: string;
  n: number;
  title: string;
  owner: string;
  due_at: string | null;
  every_days: number | null;
  status: "pendente" | "feito" | "arquivado";
  done_at: string | null;
  done_by: string | null;
  note: string;
  runs: number;
  last_run_at: string | null;
};

const EPISODE_SELECT = `SELECT id, client_id, band, prev_band, started_at::text AS started_at, ended_at::text AS ended_at FROM flag_episodes`;
const STEP_SELECT = `SELECT id, episode_id, client_id, key, n, title, owner, due_at::text AS due_at, every_days, status,
  done_at::text AS done_at, done_by, note, runs, last_run_at::text AS last_run_at FROM playbook_steps`;

export const openEpisode = (clientId: number) =>
  one<Episode>(`${EPISODE_SELECT} WHERE client_id = ? AND ended_at IS NULL`, [clientId]);

export const episodeHistory = (clientId: number, limit = 12) =>
  all<Episode>(`${EPISODE_SELECT} WHERE client_id = ? ORDER BY started_at DESC LIMIT ?`, [clientId, limit]);

export const episodeSteps = (episodeId: number) =>
  all<Step>(`${STEP_SELECT} WHERE episode_id = ? ORDER BY n`, [episodeId]);

export const getStep = (id: number) => one<Step>(`${STEP_SELECT} WHERE id = ?`, [id]);

/** Abre o episódio da flag e cria os passos. Idempotente: se outro já abriu, não duplica. */
async function startEpisode(clientId: number, band: Band, prev: Band | null) {
  const ep = await one<{ id: number; started_at: string }>(
    `INSERT INTO flag_episodes (client_id, band, prev_band) VALUES (?, ?, ?)
     ON CONFLICT (client_id) WHERE ended_at IS NULL DO NOTHING
     RETURNING id, started_at::text AS started_at`,
    [clientId, band, prev],
  );
  if (!ep) return;
  const start = new Date(ep.started_at);
  const steps = STEPS[band];
  const values = steps.map(() => `(?, ?, ?, ?, ?, ?, ?::timestamptz, ?)`).join(", ");
  await run(
    `INSERT INTO playbook_steps (episode_id, client_id, key, n, title, owner, due_at, every_days) VALUES ${values}
     ON CONFLICT (episode_id, key) DO NOTHING`,
    steps.flatMap((t) => [ep.id, clientId, t.key, t.n, t.title, t.owner, dueOf(t, start), t.everyDays ?? null]),
  );
}

/** Fecha o episódio e arquiva o que ficou pendente. Devolve se fechou (evita corrida). */
async function endEpisode(id: number): Promise<boolean> {
  const closed = await one<{ id: number }>(
    `UPDATE flag_episodes SET ended_at = now() WHERE id = ? AND ended_at IS NULL RETURNING id`,
    [id],
  );
  if (!closed) return false;
  await run(`UPDATE playbook_steps SET status = 'arquivado' WHERE episode_id = ? AND status = 'pendente'`, [id]);
  return true;
}

/**
 * Alinha os episódios com a flag atual de cada cliente. Uma leitura para a
 * carteira toda; só escreve onde a flag mudou. Cliente sem nota (`null`)
 * fica como está.
 */
export async function syncFlags(list: { clientId: number; band: Band | null }[]) {
  const withBand = list.filter((x): x is { clientId: number; band: Band } => x.band !== null);
  if (!withBand.length) return;
  const open = await all<Episode>(`${EPISODE_SELECT} WHERE ended_at IS NULL`);
  const byClient = new Map(open.map((e) => [e.client_id, e]));
  for (const { clientId, band } of withBand) {
    const cur = byClient.get(clientId);
    if (cur?.band === band) continue;
    if (cur && !(await endEpisode(cur.id))) continue;
    await startEpisode(clientId, band, cur?.band ?? null);
  }
}

export const syncFlag = (clientId: number, band: Band | null) => syncFlags([{ clientId, band }]);

export async function setStepDone(id: number, done: boolean, by: string) {
  await run(
    `UPDATE playbook_steps SET status = ?, done_at = CASE WHEN ? THEN now() ELSE NULL END, done_by = ?
     WHERE id = ? AND status <> 'arquivado'`,
    [done ? "feito" : "pendente", done, done ? by : null, id],
  );
}

export const updateStep = (id: number, owner: string, note: string) =>
  run(`UPDATE playbook_steps SET owner = ?, note = ? WHERE id = ?`, [owner, note, id]);

/** Passo recorrente: registra a execução de hoje e empurra o próximo vencimento. */
export const registerRun = (id: number, by: string) =>
  run(
    `UPDATE playbook_steps SET runs = runs + 1, last_run_at = now(), done_by = ?,
       due_at = now() + make_interval(days => every_days)
     WHERE id = ? AND status = 'pendente' AND every_days IS NOT NULL`,
    [by, id],
  );

/**
 * Marca o passo do episódio aberto pela chave (ex.: oportunidade registrada
 * conclui "mapear expansão"; check-in salvo registra o ROPRE). Não faz nada
 * se a flag atual não tem esse passo.
 */
export async function completeStepByKey(clientId: number, key: string, by: string, note = "") {
  const s = await one<Step>(
    `${STEP_SELECT} WHERE client_id = ? AND key = ? AND status = 'pendente'
       AND episode_id IN (SELECT id FROM flag_episodes WHERE client_id = ? AND ended_at IS NULL)`,
    [clientId, key, clientId],
  );
  if (!s) return;
  if (s.every_days) await registerRun(s.id, by);
  else {
    await setStepDone(s.id, true, by);
    if (note) await run(`UPDATE playbook_steps SET note = CASE WHEN note = '' THEN ? ELSE note END WHERE id = ?`, [note, s.id]);
  }
}

/** Passos atrasados de episódios abertos — aviso do rail e prioridades. */
export async function lateSteps(): Promise<{ client_id: number; n: number; oldest: string }[]> {
  return all(
    `SELECT s.client_id, COUNT(*)::int AS n, MIN(s.due_at)::text AS oldest
     FROM playbook_steps s JOIN flag_episodes e ON e.id = s.episode_id AND e.ended_at IS NULL
     JOIN clients c ON c.id = s.client_id AND c.active = 1
     WHERE s.status = 'pendente' AND s.due_at < now()
     GROUP BY s.client_id`,
  );
}

/* --------------------------- Erro nosso --------------------------- */

export type LearningRecord = {
  id: number;
  client_id: number;
  episode_id: number | null;
  what: string;
  cause: ErrorCause | null;
  why: string;
  who: string;
  learned: string;
  prevention_plan_id: number | null;
  prevention_title: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  /** Entrada na flag que originou o registro (base dos prazos). */
  flag_at: string | null;
  flag_band: Band | null;
};

const LEARNING_SELECT = `
  SELECT l.id, l.client_id, l.episode_id, l.what, l.cause, l.why, l.who, l.learned, l.prevention_plan_id,
         p.risk AS prevention_title, u.name AS created_by_name, l.created_at::text AS created_at,
         l.updated_at::text AS updated_at, e.started_at::text AS flag_at, e.band AS flag_band
  FROM learning_records l
  LEFT JOIN action_plans p ON p.id = l.prevention_plan_id
  LEFT JOIN users u ON u.id = l.created_by
  LEFT JOIN flag_episodes e ON e.id = l.episode_id`;

export const learningRecords = (clientId: number) =>
  all<LearningRecord>(`${LEARNING_SELECT} WHERE l.client_id = ? ORDER BY l.created_at DESC`, [clientId]);

export const getLearning = (id: number) => one<LearningRecord>(`${LEARNING_SELECT} WHERE l.id = ?`, [id]);

export type LearningInput = { what: string; cause: ErrorCause | null; why: string; who: string; learned: string };

export const createLearning = (clientId: number, episodeId: number | null, f: LearningInput, by: number) =>
  insert(
    `INSERT INTO learning_records (client_id, episode_id, what, cause, why, who, learned, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [clientId, episodeId, f.what, f.cause, f.why, f.who, f.learned, by],
  );

export const updateLearning = (id: number, f: LearningInput) =>
  run(
    `UPDATE learning_records SET what = ?, cause = ?, why = ?, who = ?, learned = ?, updated_at = now() WHERE id = ?`,
    [f.what, f.cause, f.why, f.who, f.learned, id],
  );

export const linkPrevention = (id: number, planId: number) =>
  run(`UPDATE learning_records SET prevention_plan_id = ?, updated_at = now() WHERE id = ?`, [planId, id]);

export const deleteLearning = (id: number) => run(`DELETE FROM learning_records WHERE id = ?`, [id]);

/* ----------------------------- Upsell ----------------------------- */

export type UpsellUpdate = { at: string; by: string; stage: UpsellStage; note: string };

export type Upsell = {
  id: number;
  client_id: number;
  product: string;
  rationale: string;
  value: number | null;
  stage: UpsellStage;
  commercial_owner: string;
  updates: UpsellUpdate[];
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

const UPSELL_SELECT = `
  SELECT o.id, o.client_id, o.product, o.rationale, o.value, o.stage, o.commercial_owner, o.updates,
         u.name AS created_by_name, o.created_at::text AS created_at, o.updated_at::text AS updated_at,
         o.closed_at::text AS closed_at
  FROM upsell_opportunities o LEFT JOIN users u ON u.id = o.created_by`;

export const upsells = (clientId: number) =>
  all<Upsell>(`${UPSELL_SELECT} WHERE o.client_id = ? ORDER BY o.closed_at IS NOT NULL, o.created_at DESC`, [clientId]);

export const getUpsell = (id: number) => one<Upsell>(`${UPSELL_SELECT} WHERE o.id = ?`, [id]);

export const createUpsell = (
  clientId: number,
  f: { product: string; rationale: string; value: number | null; commercial_owner: string },
  by: { id: number; name: string },
) =>
  insert(
    `INSERT INTO upsell_opportunities (client_id, product, rationale, value, commercial_owner, updates, created_by)
     VALUES (?, ?, ?, ?, ?, ?::jsonb, ?) RETURNING id`,
    [
      clientId,
      f.product,
      f.rationale,
      f.value,
      f.commercial_owner,
      JSON.stringify([{ at: new Date().toISOString(), by: by.name, stage: "mapeada", note: "Oportunidade mapeada." }]),
      by.id,
    ],
  );

/** Status da semana: muda a etapa (ou não) e grava a nota no histórico. */
export async function addUpsellUpdate(id: number, stage: UpsellStage, note: string, by: string, commercialOwner?: string) {
  const entry: UpsellUpdate = { at: new Date().toISOString(), by, stage, note };
  const closed = !UPSELL_OPEN.includes(stage);
  await run(
    `UPDATE upsell_opportunities SET stage = ?, updates = updates || ?::jsonb, updated_at = now(),
       commercial_owner = COALESCE(?, commercial_owner),
       closed_at = CASE WHEN ? THEN COALESCE(closed_at, now()) ELSE NULL END
     WHERE id = ?`,
    [stage, JSON.stringify([entry]), commercialOwner ?? null, closed, id],
  );
}

export const deleteUpsell = (id: number) => run(`DELETE FROM upsell_opportunities WHERE id = ?`, [id]);

/* --------------------- CRM e processo comercial --------------------- */

export type CrmDiagnostic = {
  id: number;
  client_id: number;
  filled_by_name: string | null;
  filled_at: string;
  /** Respostas "sim" | "nao" por pergunta (CRM_QUESTIONS) e `note`. */
  data: Partial<Record<string, string>>;
};

export const latestCrmDiagnostic = (clientId: number) =>
  one<CrmDiagnostic>(
    `SELECT d.id, d.client_id, u.name AS filled_by_name, d.filled_at::text AS filled_at, d.data
     FROM crm_diagnostics d LEFT JOIN users u ON u.id = d.filled_by
     WHERE d.client_id = ? ORDER BY d.filled_at DESC, d.id DESC LIMIT 1`,
    [clientId],
  );

export const saveCrmDiagnostic = (clientId: number, by: number, data: CrmDiagnostic["data"]) =>
  run(`INSERT INTO crm_diagnostics (client_id, filled_by, data) VALUES (?, ?, ?::jsonb)`, [clientId, by, JSON.stringify(data)]);

/* ------------------------- Criativos (Social) ------------------------- */

export type CreativeStats = { projects: number; approved: number; changes: number; rejected: number; pending: number };

/** Decisões do cliente nos criativos dos últimos 30 dias (módulo Social media). */
export async function creativeStats(clientId: number): Promise<CreativeStats> {
  const r = await one<CreativeStats>(
    `SELECT
       (SELECT COUNT(*)::int FROM sm_projects WHERE client_id = ? AND archived = 0) AS projects,
       COUNT(*) FILTER (WHERE p.status = 'approved' AND p.decided_at >= now() - interval '30 days')::int AS approved,
       COUNT(*) FILTER (WHERE p.status = 'rejected' AND COALESCE(p.feedback, '') <> '' AND p.decided_at >= now() - interval '30 days')::int AS changes,
       COUNT(*) FILTER (WHERE p.status = 'rejected' AND COALESCE(p.feedback, '') = '' AND p.decided_at >= now() - interval '30 days')::int AS rejected,
       COUNT(*) FILTER (WHERE p.status = 'pending')::int AS pending
     FROM sm_posts p JOIN sm_projects j ON j.id = p.project_id
     WHERE j.client_id = ?`,
    [clientId, clientId],
  );
  return r ?? { projects: 0, approved: 0, changes: 0, rejected: 0, pending: 0 };
}
