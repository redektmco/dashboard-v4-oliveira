import { all, insert, one, run, transaction } from "./db";
import { newToken } from "./social/id";
import { currentRitualDate, ritualWeekEnd } from "./week";
import { DIMENSIONS } from "./model/catalog";
import { computeScore, DEFAULT_CONFIG, type ScoreConfig, type WeightMap } from "./model/scoring";
import { insertDemoData, wipe } from "./seed";
import { EMPTY_WEEK, leadsOf, metaFields, type LeadMetric, type MetaWeek } from "./meta/metrics";
import { clientKey, type SheetClient } from "./import/clients-sheet";
import type {
  AccountType,
  Band,
  Client,
  Confidence,
  DimensionKey,
  OverrideHit,
  ScoreResult,
  User,
} from "./model/types";

export const today = () => new Date().toISOString().slice(0, 10);

const addDaysIso = (day: string, n: number) => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/* ----------------------------- settings ----------------------------- */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await one<{ value: T }>("SELECT value FROM settings WHERE key = ?", [key]);
  return row ? row.value : fallback;
}

export async function setSetting(key: string, value: unknown) {
  await run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

export async function getWeights(): Promise<WeightMap> {
  const stored = await getSetting<WeightMap>("weights", {});
  const out: WeightMap = {};
  for (const d of DIMENSIONS) out[d.key] = stored?.[d.key] ?? d.defaultWeight;
  return out;
}

export async function getConfig(): Promise<ScoreConfig> {
  const stored = await getSetting<Partial<ScoreConfig>>("config", {});
  return { ...DEFAULT_CONFIG, ...(stored ?? {}) };
}

/* ------------------------------ users ------------------------------ */

/**
 * Colunas públicas do time. Nunca `SELECT *`: esta lista vai para componentes
 * de cliente (selects de GT/Account, "preenchido por") e o `*` levava o hash
 * de senha de todo mundo serializado para o navegador.
 */
const USER_PUBLIC = "id, name, role";

export const listUsers = (role?: User["role"]) =>
  role
    ? all<User>(`SELECT ${USER_PUBLIC} FROM users WHERE role = ? ORDER BY name`, [role])
    : all<User>(`SELECT ${USER_PUBLIC} FROM users ORDER BY role, name`);

/**
 * Quem pode aparecer no "Preenchido por" de um formulário.
 *
 * Primeiro quem tem o papel. Se não houver ninguém — é o caso da unidade que
 * ainda não cadastrou os GTs, ou logo depois de limpar o time de exemplo —
 * cai para quem tem acesso ao painel, porque é quem de fato está preenchendo.
 * Sem esse fallback o `select` fica vazio e o formulário não envia.
 */
export async function listFillers(role: User["role"]): Promise<User[]> {
  const byRole = await listUsers(role);
  if (byRole.length) return byRole;
  return all<User>(`SELECT ${USER_PUBLIC} FROM users WHERE login IS NOT NULL AND active = 1 ORDER BY name`);
}

/** O que cada pessoa do time carrega: contas atribuídas e inputs assinados. */
export type UserFootprint = { gtOf: number; accountOf: number; perfFilled: number; checkinsFilled: number };

export async function userFootprints(): Promise<Map<number, UserFootprint>> {
  const rows = await all<{ id: number } & UserFootprint>(
    `SELECT u.id,
            (SELECT COUNT(*)::int FROM clients c WHERE c.gt_user_id = u.id) AS "gtOf",
            (SELECT COUNT(*)::int FROM clients c WHERE c.account_user_id = u.id) AS "accountOf",
            (SELECT COUNT(*)::int FROM performance_snapshots s WHERE s.filled_by = u.id) AS "perfFilled",
            (SELECT COUNT(*)::int FROM checkin_snapshots s WHERE s.filled_by = u.id) AS "checkinsFilled"
     FROM users u`,
  );
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * Exclui alguém do time. Só quem nunca assinou um input: snapshot é
 * auditoria ("quem preencheu"), e apagar a pessoa apagaria a assinatura.
 * Para quem já preencheu, o caminho é desativar o acesso. As contas em que
 * a pessoa estava nomeada ficam sem GT/Account até alguém ser atribuído.
 */
export async function deleteUser(id: number): Promise<{ error?: string }> {
  const fp = (await userFootprints()).get(id);
  if (!fp) return { error: "Usuário não encontrado." };
  if (fp.perfFilled + fp.checkinsFilled > 0)
    return {
      error: `Tem ${fp.perfFilled + fp.checkinsFilled} preenchimento(s) assinados no histórico. Desative o acesso em vez de excluir — o histórico guarda quem preencheu.`,
    };
  await transaction([
    ["UPDATE clients SET gt_user_id = NULL WHERE gt_user_id = ?", [id]],
    ["UPDATE clients SET account_user_id = NULL WHERE account_user_id = ?", [id]],
    ["UPDATE sm_projects SET created_by = NULL WHERE created_by = ?", [id]],
    ["UPDATE crm_integrations SET created_by = NULL WHERE created_by = ?", [id]],
    ["DELETE FROM users WHERE id = ?", [id]],
  ]);
  return {};
}

/* ----------------------------- clients ----------------------------- */

export type ClientRow = Client & { gt_name: string | null; account_name: string | null };

const CLIENT_SELECT = `
  SELECT c.id, c.name, c.account_type, c.mrr, c.gt_user_id, c.account_user_id,
         c.renewal_date::text AS renewal_date, c.active, c.created_at::text AS created_at,
         g.name AS gt_name, a.name AS account_name
  FROM clients c
  LEFT JOIN users g ON g.id = c.gt_user_id
  LEFT JOIN users a ON a.id = c.account_user_id`;

export const listClients = (onlyActive = true) =>
  all<ClientRow>(`${CLIENT_SELECT} ${onlyActive ? "WHERE c.active = 1" : ""} ORDER BY c.name`);

export const getClient = (id: number) => one<ClientRow>(`${CLIENT_SELECT} WHERE c.id = ?`, [id]);

export function createClient(c: {
  name: string;
  account_type: AccountType;
  mrr: number;
  gt_user_id: number | null;
  account_user_id: number | null;
  renewal_date: string | null;
}) {
  return insert(
    `INSERT INTO clients (name, account_type, mrr, gt_user_id, account_user_id, renewal_date)
     VALUES (?, ?, ?, ?, ?, ?::date) RETURNING id`,
    [c.name, c.account_type, c.mrr, c.gt_user_id, c.account_user_id, c.renewal_date],
  );
}

export async function updateClient(id: number, c: Partial<Client>) {
  const keys = (
    [
      "name",
      "account_type",
      "mrr",
      "gt_user_id",
      "account_user_id",
      "renewal_date",
      "active",
    ] as const
  ).filter((k) => k in c);
  if (!keys.length) return;
  const set = keys.map((k) => (k === "renewal_date" ? `${k} = ?::date` : `${k} = ?`)).join(", ");
  await run(`UPDATE clients SET ${set} WHERE id = ?`, [...keys.map((k) => c[k] ?? null), id]);
}

/**
 * O que existe ligado a cada cliente — base do "impacto" mostrado antes de
 * arquivar ou excluir. Uma query só para a carteira inteira.
 */
export type ClientFootprint = {
  perf: number;
  checkins: number;
  plans: number;
  projects: number;
  leads: number;
  integration: boolean;
};

export async function clientFootprints(): Promise<Map<number, ClientFootprint>> {
  const rows = await all<{ id: number } & Omit<ClientFootprint, "integration"> & { integration: number }>(
    `SELECT c.id,
            (SELECT COUNT(*)::int FROM performance_snapshots s WHERE s.client_id = c.id) AS perf,
            (SELECT COUNT(*)::int FROM checkin_snapshots s WHERE s.client_id = c.id) AS checkins,
            (SELECT COUNT(*)::int FROM action_plans a WHERE a.client_id = c.id) AS plans,
            (SELECT COUNT(*)::int FROM sm_projects p WHERE p.client_id = c.id) AS projects,
            (SELECT COUNT(*)::int FROM crm_leads l WHERE l.client_id = c.id) AS leads,
            (SELECT COUNT(*)::int FROM crm_integrations i WHERE i.client_id = c.id) AS integration
     FROM clients c`,
  );
  return new Map(rows.map((r) => [r.id, { ...r, integration: r.integration > 0 }]));
}

/**
 * Exclusão definitiva do cliente. O histórico (snapshots, check-ins, scores,
 * planos, integração e leads do CRM) cai junto por ON DELETE CASCADE; os
 * projetos de Social media ficam, só perdem o vínculo (ON DELETE SET NULL).
 */
export async function deleteClient(id: number): Promise<void> {
  await run("DELETE FROM clients WHERE id = ?", [id]);
}

/* ----------------------------- targets ----------------------------- */

/** Metas vigentes do cliente (a mais recente de cada chave até a data). */
export async function getTargets(clientId: number, at = today()): Promise<Record<string, number>> {
  const rows = await all<{ key: string; value: number }>(
    `SELECT DISTINCT ON (key) key, value FROM client_targets
     WHERE client_id = ? AND effective_from <= ?::date
     ORDER BY key, effective_from DESC, id DESC`,
    [clientId, at],
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.key] = Number(r.value);
  return out;
}

/** Metas vigentes de todos os clientes, em uma query. */
export async function getAllTargets(at = today()): Promise<Map<number, Record<string, number>>> {
  const rows = await all<{ client_id: number; key: string; value: number }>(
    `SELECT DISTINCT ON (client_id, key) client_id, key, value FROM client_targets
     WHERE effective_from <= ?::date
     ORDER BY client_id, key, effective_from DESC, id DESC`,
    [at],
  );
  const m = new Map<number, Record<string, number>>();
  for (const r of rows) {
    const cur = m.get(r.client_id) ?? {};
    cur[r.key] = Number(r.value);
    m.set(r.client_id, cur);
  }
  return m;
}

export async function setTargets(
  clientId: number,
  targets: Record<string, number>,
  effectiveFrom = today(),
) {
  const entries = Object.entries(targets).filter(([, v]) => isFinite(v));
  if (!entries.length) return;
  // Um único INSERT com várias linhas — evita um round-trip por meta.
  const values = entries.map(() => `(?, ?, ?, ?::date)`).join(", ");
  const params = entries.flatMap(([k, v]) => [clientId, k, v, effectiveFrom]);
  await run(
    `INSERT INTO client_targets (client_id, key, value, effective_from) VALUES ${values}`,
    params,
  );
}

export const targetHistory = (clientId: number) =>
  all<{ key: string; value: number; effective_from: string; created_at: string }>(
    `SELECT key, value, effective_from::text AS effective_from, created_at::text AS created_at
     FROM client_targets WHERE client_id = ? ORDER BY created_at DESC LIMIT 50`,
    [clientId],
  );

/* ---------------------------- snapshots ---------------------------- */

export type Snap = {
  id: number;
  client_id: number;
  ref_date: string;
  filled_by: number | null;
  filled_at: string;
  filler: string | null;
  data: Record<string, unknown>;
};

const SNAP_SELECT = (table: string) => `
  SELECT s.id, s.client_id, s.ref_date::text AS ref_date, s.filled_by,
         s.filled_at::text AS filled_at, s.data, u.name AS filler
  FROM ${table} s LEFT JOIN users u ON u.id = s.filled_by`;

const snapshotsOf = (table: string, clientId: number, limit = 30) =>
  all<Snap>(
    `${SNAP_SELECT(table)} WHERE s.client_id = ? ORDER BY s.ref_date DESC, s.id DESC LIMIT ?`,
    [clientId, limit],
  );

export const perfSnapshots = (clientId: number, limit = 30) =>
  snapshotsOf("performance_snapshots", clientId, limit);
export const checkinSnapshots = (clientId: number, limit = 30) =>
  snapshotsOf("checkin_snapshots", clientId, limit);

/**
 * Snapshots de todos os clientes, em duas queries.
 *
 * `perClient` limita aos N mais recentes de cada cliente (janela no próprio
 * Postgres). A carteira, a jornada do GT e a do Account só calculam o score
 * de hoje, que usa o último snapshot e poucas semanas de histórico — antes
 * elas baixavam a série inteira de todos os clientes a cada abertura, um
 * volume que só cresce. O recompute de vários dias segue pedindo tudo.
 */
async function allSnapshots(perClient?: number): Promise<{ perf: Map<number, Snap[]>; chk: Map<number, Snap[]> }> {
  const query = (table: string) =>
    perClient
      ? all<Snap>(
          `SELECT * FROM (
             ${SNAP_SELECT(table)}
           ) x WHERE x.rn <= ? ORDER BY x.ref_date DESC, x.id DESC`.replace(
            "u.name AS filler",
            "u.name AS filler, ROW_NUMBER() OVER (PARTITION BY s.client_id ORDER BY s.ref_date DESC, s.id DESC) AS rn",
          ),
          [perClient],
        )
      : all<Snap>(`${SNAP_SELECT(table)} ORDER BY s.ref_date DESC, s.id DESC`);
  const [perf, chk] = await Promise.all([query("performance_snapshots"), query("checkin_snapshots")]);
  const group = (rows: Snap[]) => {
    const m = new Map<number, Snap[]>();
    for (const r of rows) {
      const list = m.get(r.client_id);
      if (list) list.push(r);
      else m.set(r.client_id, [r]);
    }
    return m;
  };
  return { perf: group(perf), chk: group(chk) };
}

export async function saveSnapshot(
  kind: "performance" | "checkin",
  clientId: number,
  refDate: string,
  filledBy: number | null,
  data: Record<string, unknown>,
) {
  const table = kind === "performance" ? "performance_snapshots" : "checkin_snapshots";
  await run(
    `INSERT INTO ${table} (client_id, ref_date, filled_by, data)
     VALUES (?, ?::date, ?, ?::jsonb)`,
    [clientId, refDate, filledBy, JSON.stringify(data)],
  );
}

/* ------------------------------ score ------------------------------ */

/** Semana da Meta de um cliente: soma das contas + leads já pela métrica de cada conta. */
export type MetaAgg = { week: MetaWeek; leads: number };

/**
 * Dados automáticos por semana-ritual (chave = `ref_date` da semana que fecha):
 * contagem de leads do CRM, semanas do Meta Ads e as metas vigentes. É o que
 * faz a contabilização automática entrar direto no score sem passar pelo
 * preenchimento manual do GT.
 */
export type AutoOverlay = {
  leadsByWeek: Map<string, number>;
  metaByWeek: Map<string, MetaAgg>;
  targets: Record<string, number>;
};

const blank = (v: unknown) => v === undefined || v === null || v === "";

/**
 * Sobrepõe os dados automáticos nos snapshots de performance:
 *  1. Meta Ads preenche o que o GT deixou em branco no snapshot da semana
 *     (verba, CPL, faturamento, ROAS, alcance) — número digitado pelo GT
 *     sempre vence, porque pode somar canais que a Meta não enxerga;
 *  2. semana fechada com dado da Meta e sem snapshot manual vira um registro
 *     "Meta Ads" com as metas vigentes — o score anda mesmo se o GT atrasar;
 *  3. o CRM troca o `leads_real` das contas de geração (é a fonte mais
 *     completa de lead) e, na semana em curso ainda sem snapshot, sintetiza um
 *     registro "vivo" ancorado no dia do cálculo, para passar o filtro `<= at`.
 * Semanas da Meta anteriores à primeira com verba ficam de fora: conta
 * vinculada depois de meses parada não inventa "verba zero" retroativa.
 */
function applyOverlay(client: ClientRow, perf: Snap[], at: string, ov: AutoOverlay): Snap[] {
  const type = client.account_type;
  const crmLeads = (ref: string) => (type === "lead_gen" ? ov.leadsByWeek.get(ref) : undefined);

  const firstSpend = [...ov.metaByWeek]
    .filter(([, m]) => m.week.spend > 0)
    .map(([ref]) => ref)
    .sort()[0];
  const fromMeta = (ref: string) => {
    const m = ov.metaByWeek.get(ref);
    if (!m || !firstSpend || ref < firstSpend) return null;
    return metaFields(type, m.week, crmLeads(ref) ?? m.leads);
  };

  const list = perf.map((s) => {
    let data = s.data;
    const meta = fromMeta(s.ref_date);
    if (meta) {
      data = { ...data };
      for (const [k, v] of Object.entries(meta)) if (blank(data[k])) data[k] = v;
    }
    const n = crmLeads(s.ref_date);
    if (n !== undefined) data = { ...data, leads_real: n };
    return data === s.data ? s : { ...s, data };
  });

  const filled = new Set(list.map((s) => s.ref_date));
  for (const ref of ov.metaByWeek.keys()) {
    const meta = ref <= at && !filled.has(ref) ? fromMeta(ref) : null;
    if (!meta) continue;
    list.push({
      id: 0,
      client_id: client.id,
      ref_date: ref,
      filled_by: null,
      filled_at: ref + "T23:59:00",
      filler: "Meta Ads",
      data: { ...ov.targets, ...meta },
    });
  }

  const curWeek = ritualWeekEnd(at);
  const curCount = crmLeads(curWeek);
  const hasCur = list.some((s) => s.ref_date === curWeek && s.ref_date <= at);
  if (!hasCur && curCount !== undefined) {
    list.push({
      id: 0,
      client_id: client.id,
      ref_date: at,
      filled_by: null,
      filled_at: at + "T12:00:00",
      filler: "CRM",
      data: { leads_real: curCount, leads_meta: ov.targets.leads_meta ?? undefined },
    });
  }
  return list.sort((a, b) =>
    a.ref_date < b.ref_date ? 1 : a.ref_date > b.ref_date ? -1 : b.id - a.id,
  );
}

/** Cálculo puro a partir de snapshots já carregados — não toca no banco. */
function scoreFrom(
  client: ClientRow,
  perf: Snap[],
  chk: Snap[],
  at: string,
  weights: WeightMap,
  config: ScoreConfig,
  overlay?: AutoOverlay | null,
): ScoreResult {
  const perfEff = overlay ? applyOverlay(client, perf, at, overlay) : perf;
  const p = perfEff.filter((s) => s.ref_date <= at);
  const c = chk.filter((s) => s.ref_date <= at);
  const latestPerf = p[0] ?? null;
  const latestChk = c[0] ?? null;

  return computeScore({
    clientId: client.id,
    accountType: client.account_type,
    today: at,
    renewalDate: client.renewal_date,
    performance: latestPerf
      ? {
          ref_date: latestPerf.ref_date,
          filled_at: latestPerf.filled_at,
          by: latestPerf.filler,
          data: latestPerf.data,
        }
      : null,
    checkin: latestChk
      ? {
          ref_date: latestChk.ref_date,
          filled_at: latestChk.filled_at,
          by: latestChk.filler,
          data: latestChk.data,
        }
      : null,
    perfHistory: p.slice(1).map((s) => ({ ref_date: s.ref_date, data: s.data })),
    weights,
    config,
  });
}

/** Snapshots por cliente que o cálculo do score de um dia enxerga. */
const SCORE_WINDOW = 12;

export async function scoreFor(clientId: number, at = today()): Promise<ScoreResult | null> {
  const [client, perf, chk, weights, config, overlay] = await Promise.all([
    getClient(clientId),
    perfSnapshots(clientId, SCORE_WINDOW),
    checkinSnapshots(clientId, SCORE_WINDOW),
    getWeights(),
    getConfig(),
    autoOverlay(clientId),
  ]);
  if (!client) return null;
  return scoreFrom(client, perf, chk, at, weights, config, overlay);
}

export type ScoreSnapRow = {
  id: number;
  client_id: number;
  ref_day: string;
  score: number | null;
  raw_band: Band | null;
  band: Band | null;
  confidence: Confidence;
  overrides: OverrideHit[];
  breakdown: Record<string, unknown>;
  computed_at: string;
};

/** Grava vários dias de um cliente em um único INSERT. */
async function persistScores(clientId: number, rows: { day: string; r: ScoreResult }[]) {
  if (!rows.length) return;
  const values = rows.map(() => `(?, ?::date, ?, ?, ?, ?, ?::jsonb, ?::jsonb, now())`).join(", ");
  const params = rows.flatMap(({ day, r }) => [
    clientId,
    day,
    r.score,
    r.rawBand,
    r.band,
    r.confidence,
    JSON.stringify(r.overrides),
    JSON.stringify({ dimensions: r.dimensions, provenance: r.provenance }),
  ]);
  await run(
    `INSERT INTO score_snapshots
       (client_id, ref_day, score, raw_band, band, confidence, overrides, breakdown, computed_at)
     VALUES ${values}
     ON CONFLICT (client_id, ref_day) DO UPDATE SET
       score = excluded.score, raw_band = excluded.raw_band, band = excluded.band,
       confidence = excluded.confidence, overrides = excluded.overrides,
       breakdown = excluded.breakdown, computed_at = excluded.computed_at`,
    params,
  );
}

export const persistScore = (clientId: number, day: string, r: ScoreResult) =>
  persistScores(clientId, [{ day, r }]);

/**
 * Job diário (briefing 7 e 8). Carrega tudo de uma vez e calcula em memória:
 * sobre HTTP, uma query por cliente por dia levaria minutos.
 */
export async function recomputeRange(days: number, endDay = today()) {
  const [clients, snaps, weights, config, overlays] = await Promise.all([
    listClients(),
    allSnapshots(),
    getWeights(),
    getConfig(),
    autoOverlays(),
  ]);

  const dayList = Array.from({ length: days }, (_, i) => addDaysIso(endDay, -(days - 1 - i)));

  let n = 0;
  for (const client of clients) {
    const perf = snaps.perf.get(client.id) ?? [];
    const chk = snaps.chk.get(client.id) ?? [];
    const overlay = overlays.get(client.id) ?? null;
    const rows = dayList.map((day) => ({
      day,
      r: scoreFrom(client, perf, chk, day, weights, config, overlay),
    }));
    await persistScores(client.id, rows);
    n += rows.length;
  }
  return { clients: clients.length, snapshots: n, day: endDay };
}

export const recomputeAll = (day = today()) => recomputeRange(1, day);

export const scoreHistory = (clientId: number, limit = 60) =>
  all<ScoreSnapRow>(
    `SELECT id, client_id, ref_day::text AS ref_day, score, raw_band, band, confidence,
            overrides, breakdown, computed_at::text AS computed_at
     FROM score_snapshots WHERE client_id = ? ORDER BY ref_day DESC LIMIT ?`,
    [clientId, limit],
  );

/* ----------------------- integrações (CRM) ------------------------- */

export type Integration = {
  id: number;
  client_id: number;
  token: string;
  provider: string;
  active: number;
  created_at: string;
  last_event_at: string | null;
};

const INTEGRATION_SELECT = `
  SELECT id, client_id, token, provider, active, created_at::text AS created_at,
         last_event_at::text AS last_event_at
  FROM crm_integrations`;

export const getIntegration = (clientId: number) =>
  one<Integration>(`${INTEGRATION_SELECT} WHERE client_id = ?`, [clientId]);

export const getIntegrationByToken = (token: string) =>
  one<Integration>(`${INTEGRATION_SELECT} WHERE token = ?`, [token]);

/** Cria (ou reativa) a integração do cliente. Um webhook por cliente. */
export async function createIntegration(clientId: number, createdBy: number | null) {
  await run(
    `INSERT INTO crm_integrations (client_id, token, created_by) VALUES (?, ?, ?)
     ON CONFLICT (client_id) DO UPDATE SET active = 1`,
    [clientId, newToken(), createdBy],
  );
  return getIntegration(clientId);
}

export const setIntegrationActive = (clientId: number, active: boolean) =>
  run(`UPDATE crm_integrations SET active = ? WHERE client_id = ?`, [active ? 1 : 0, clientId]);

export const rotateIntegrationToken = (clientId: number) =>
  run(`UPDATE crm_integrations SET token = ? WHERE client_id = ?`, [newToken(), clientId]);

export const deleteIntegration = (clientId: number) =>
  run(`DELETE FROM crm_integrations WHERE client_id = ?`, [clientId]);

/**
 * Grava um lead recebido por webhook. Idempotente quando vem `dedupKey`
 * (id/e-mail/telefone do CRM): reenvio do mesmo lead não conta duas vezes.
 * Devolve `true` se contou um lead novo.
 */
export async function recordLead(
  clientId: number,
  refDate: string,
  dedupKey: string | null,
  payload: unknown,
): Promise<boolean> {
  const rows = await all<{ id: number }>(
    `INSERT INTO crm_leads (client_id, ref_date, dedup_key, payload)
     VALUES (?, ?::date, ?, ?::jsonb)
     ON CONFLICT (client_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [clientId, refDate, dedupKey, JSON.stringify(payload ?? {})],
  );
  await run(`UPDATE crm_integrations SET last_event_at = now() WHERE client_id = ?`, [clientId]);
  return rows.length > 0;
}

/** Overlay de todos os clientes com CRM ou Meta Ads ativos — uma passada só. */
async function autoOverlays(): Promise<Map<number, AutoOverlay>> {
  const [counts, targets, meta] = await Promise.all([
    all<{ client_id: number; ref_date: string; n: number }>(
      `SELECT l.client_id, l.ref_date::text AS ref_date, COUNT(*)::int AS n
       FROM crm_leads l
       JOIN crm_integrations i ON i.client_id = l.client_id AND i.active = 1
       GROUP BY l.client_id, l.ref_date`,
    ),
    getAllTargets(),
    metaWeeks(),
  ]);
  const map = new Map<number, AutoOverlay>();
  const of = (clientId: number) => {
    let ov = map.get(clientId);
    if (!ov) {
      ov = { leadsByWeek: new Map(), metaByWeek: new Map(), targets: targets.get(clientId) ?? {} };
      map.set(clientId, ov);
    }
    return ov;
  };
  for (const r of counts) of(r.client_id).leadsByWeek.set(r.ref_date, Number(r.n));
  for (const [clientId, weeks] of meta) of(clientId).metaByWeek = weeks;
  return map;
}

/** Overlay de um cliente só — usado no recompute pontual após cada webhook. */
async function autoOverlay(clientId: number): Promise<AutoOverlay | null> {
  const [active, meta] = await Promise.all([
    one<{ id: number }>(`SELECT id FROM crm_integrations WHERE client_id = ? AND active = 1`, [clientId]),
    metaWeeks(clientId),
  ]);
  const metaByWeek = meta.get(clientId) ?? new Map<string, MetaAgg>();
  if (!active && !metaByWeek.size) return null;
  const [counts, targets] = await Promise.all([
    active
      ? all<{ ref_date: string; n: number }>(
          `SELECT ref_date::text AS ref_date, COUNT(*)::int AS n FROM crm_leads
           WHERE client_id = ? GROUP BY ref_date`,
          [clientId],
        )
      : Promise.resolve([]),
    getTargets(clientId),
  ]);
  const leadsByWeek = new Map<string, number>();
  for (const c of counts) leadsByWeek.set(c.ref_date, Number(c.n));
  return { leadsByWeek, metaByWeek, targets };
}

export type IntegrationRow = Integration & {
  client_name: string;
  account_type: AccountType;
  client_active: number;
  total_leads: number;
  week_leads: number;
  prev_week_leads: number;
  last_lead_at: string | null;
};

/** Integrações cadastradas com a contabilidade de leads da semana. */
export async function listIntegrations(): Promise<IntegrationRow[]> {
  const cur = ritualWeekEnd(today());
  const prev = addDaysIso(cur, -7);
  return all<IntegrationRow>(
    `SELECT i.id, i.client_id, i.token, i.provider, i.active,
            i.created_at::text AS created_at, i.last_event_at::text AS last_event_at,
            c.name AS client_name, c.account_type, c.active AS client_active,
            COUNT(l.id)::int AS total_leads,
            COUNT(l.id) FILTER (WHERE l.ref_date = ?::date)::int AS week_leads,
            COUNT(l.id) FILTER (WHERE l.ref_date = ?::date)::int AS prev_week_leads,
            MAX(l.received_at)::text AS last_lead_at
     FROM crm_integrations i
     JOIN clients c ON c.id = i.client_id
     LEFT JOIN crm_leads l ON l.client_id = i.client_id
     GROUP BY i.id, c.name, c.account_type, c.active
     ORDER BY c.name`,
    [cur, prev],
  );
}

/* ---------------------------- Meta Ads ----------------------------- */

export type MetaLink = {
  id: number;
  client_id: number;
  client_name: string;
  account_type: AccountType;
  ad_account_id: string;
  name: string;
  currency: string | null;
  lead_metric: LeadMetric;
  active: number;
  last_sync_at: string | null;
  last_error: string | null;
};

export const listMetaLinks = () =>
  all<MetaLink>(
    `SELECT a.id, a.client_id, c.name AS client_name, c.account_type, a.ad_account_id, a.name,
            a.currency, a.lead_metric, a.active, a.last_sync_at::text AS last_sync_at, a.last_error
     FROM meta_ad_accounts a JOIN clients c ON c.id = a.client_id
     ORDER BY c.name, a.name`,
  );

export const getMetaLink = (adAccountId: string) =>
  one<{ client_id: number; name: string }>(
    `SELECT client_id, name FROM meta_ad_accounts WHERE ad_account_id = ?`,
    [adAccountId],
  );

/** Vincula a conta ao cliente. Reapontar uma conta já vinculada troca o dono. */
export async function linkMetaAccount(
  clientId: number,
  acc: { id: string; name: string; currency: string | null },
  leadMetric: LeadMetric,
  createdBy: number | null,
) {
  await run(
    `INSERT INTO meta_ad_accounts (client_id, ad_account_id, name, currency, lead_metric, created_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (ad_account_id) DO UPDATE SET
       client_id = excluded.client_id, name = excluded.name, currency = excluded.currency,
       lead_metric = excluded.lead_metric, active = 1`,
    [clientId, acc.id, acc.name, acc.currency, leadMetric, createdBy],
  );
}

export const unlinkMetaAccount = (adAccountId: string) =>
  run(`DELETE FROM meta_ad_accounts WHERE ad_account_id = ?`, [adAccountId]);

export const setMetaAccountActive = (adAccountId: string, active: boolean) =>
  run(`UPDATE meta_ad_accounts SET active = ? WHERE ad_account_id = ?`, [active ? 1 : 0, adAccountId]);

export const setMetaLeadMetric = (adAccountId: string, metric: LeadMetric) =>
  run(`UPDATE meta_ad_accounts SET lead_metric = ? WHERE ad_account_id = ?`, [metric, adAccountId]);

/** Grava as semanas puxadas da API (regrava: a Meta ajusta atribuição por dias). */
export async function saveMetaWeeks(adAccountId: string, weeks: Map<string, MetaWeek>) {
  const entries = [...weeks];
  if (entries.length) {
    const values = entries.map(() => `(?, ?::date, ?, ?, ?, ?, ?, ?, ?, ?, now())`).join(", ");
    await run(
      `INSERT INTO meta_insights
         (ad_account_id, ref_date, spend, leads, conversations, purchases, revenue, reach, impressions, clicks, synced_at)
       VALUES ${values}
       ON CONFLICT (ad_account_id, ref_date) DO UPDATE SET
         spend = excluded.spend, leads = excluded.leads, conversations = excluded.conversations,
         purchases = excluded.purchases, revenue = excluded.revenue, reach = excluded.reach,
         impressions = excluded.impressions, clicks = excluded.clicks, synced_at = excluded.synced_at`,
      entries.flatMap(([ref, w]) => [
        adAccountId,
        ref,
        w.spend,
        w.leads,
        w.conversations,
        w.purchases,
        w.revenue,
        w.reach,
        w.impressions,
        w.clicks,
      ]),
    );
  }
  await run(`UPDATE meta_ad_accounts SET last_sync_at = now(), last_error = NULL WHERE ad_account_id = ?`, [
    adAccountId,
  ]);
}

export const saveMetaError = (adAccountId: string, error: string) =>
  run(`UPDATE meta_ad_accounts SET last_sync_at = now(), last_error = ? WHERE ad_account_id = ?`, [
    error.slice(0, 500),
    adAccountId,
  ]);

const META_COLS = "i.spend, i.leads, i.conversations, i.purchases, i.revenue, i.reach, i.impressions, i.clicks";

// O driver devolve DOUBLE/INTEGER como número ou string conforme o backend.
const weekOf = (r: MetaWeek): MetaWeek => ({
  spend: Number(r.spend),
  leads: Number(r.leads),
  conversations: Number(r.conversations),
  purchases: Number(r.purchases),
  revenue: Number(r.revenue),
  reach: Number(r.reach),
  impressions: Number(r.impressions),
  clicks: Number(r.clicks),
});

/** Semanas da Meta por cliente, somando as contas ativas de cada um. */
export async function metaWeeks(clientId?: number): Promise<Map<number, Map<string, MetaAgg>>> {
  const rows = await all<MetaWeek & { client_id: number; lead_metric: LeadMetric; ref_date: string }>(
    `SELECT a.client_id, a.lead_metric, i.ref_date::text AS ref_date, ${META_COLS}
     FROM meta_insights i
     JOIN meta_ad_accounts a ON a.ad_account_id = i.ad_account_id AND a.active = 1
     ${clientId ? "WHERE a.client_id = ?" : ""}`,
    clientId ? [clientId] : [],
  );
  const out = new Map<number, Map<string, MetaAgg>>();
  for (const r of rows) {
    const byWeek = out.get(r.client_id) ?? new Map<string, MetaAgg>();
    out.set(r.client_id, byWeek);
    const cur = byWeek.get(r.ref_date) ?? { week: { ...EMPTY_WEEK }, leads: 0 };
    const w = weekOf(r);
    for (const k of Object.keys(w) as (keyof MetaWeek)[]) cur.week[k] += w[k];
    cur.leads += leadsOf(w, r.lead_metric);
    byWeek.set(r.ref_date, cur);
  }
  return out;
}

/** Números da Meta de uma conta por semana — para o painel de integrações. */
export async function metaWeeksByAccount(refs: string[]): Promise<Map<string, Map<string, MetaAgg>>> {
  if (!refs.length) return new Map();
  const rows = await all<MetaWeek & { ad_account_id: string; lead_metric: LeadMetric; ref_date: string }>(
    `SELECT i.ad_account_id, a.lead_metric, i.ref_date::text AS ref_date, ${META_COLS}
     FROM meta_insights i JOIN meta_ad_accounts a ON a.ad_account_id = i.ad_account_id
     WHERE i.ref_date IN (${refs.map(() => "?::date").join(", ")})`,
    refs,
  );
  const out = new Map<string, Map<string, MetaAgg>>();
  for (const r of rows) {
    const w = weekOf(r);
    const m = out.get(r.ad_account_id) ?? new Map<string, MetaAgg>();
    m.set(r.ref_date, { week: w, leads: leadsOf(w, r.lead_metric) });
    out.set(r.ad_account_id, m);
  }
  return out;
}

/* ------------------------ importação de planilha -------------------- */

export type ImportSummary = { created: string[]; updated: string[]; people: string[] };

const personKey = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().split(/\s+/)[0] ?? "";

/**
 * Sobe a carteira da planilha. Idempotente: o cliente é casado pelo nome
 * (sem acento, caixa e pontuação), então reimportar a mesma planilha só
 * atualiza. Na atualização, a planilha manda em MRR e time; o tipo de conta,
 * os contatos de cobrança e a meta de verba só são preenchidos quando ainda
 * estão vazios — o que foi ajustado no painel não é desfeito.
 * GT/Account que não existem entram como integrantes do time, sem login.
 */
export async function importClients(rows: SheetClient[]): Promise<ImportSummary> {
  const summary: ImportSummary = { created: [], updated: [], people: [] };
  const [existing, users, targets] = await Promise.all([
    all<{ id: number; name: string; billing_email: string | null; billing_phone: string | null }>(
      `SELECT id, name, billing_email, billing_phone FROM clients`,
    ),
    listUsers(),
    getAllTargets(),
  ]);
  const byKey = new Map(existing.map((c) => [clientKey(c.name), c]));
  const people = new Map<string, number>();
  for (const u of users) {
    const k = `${u.role}:${personKey(u.name)}`;
    if (!people.has(k)) people.set(k, u.id);
  }

  const person = async (name: string | null, role: "gt" | "account") => {
    if (!name) return null;
    const k = `${role}:${personKey(name)}`;
    let id = people.get(k);
    if (id === undefined) {
      id = await insert(`INSERT INTO users (name, role) VALUES (?, ?) RETURNING id`, [name, role]);
      people.set(k, id);
      summary.people.push(`${name} (${role === "gt" ? "GT" : "Account"})`);
    }
    return id;
  };

  for (const r of rows) {
    const gt = await person(r.gt, "gt");
    const acc = await person(r.account, "account");
    const cur = byKey.get(clientKey(r.name));
    let id: number;
    if (cur) {
      id = cur.id;
      await updateClient(id, {
        ...(r.mrr > 0 ? { mrr: r.mrr } : {}),
        ...(gt ? { gt_user_id: gt } : {}),
        ...(acc ? { account_user_id: acc } : {}),
      });
      if ((!cur.billing_email && r.email) || (!cur.billing_phone && r.phone)) {
        await run(`UPDATE clients SET billing_email = ?, billing_phone = ? WHERE id = ?`, [
          cur.billing_email || r.email,
          cur.billing_phone || r.phone,
          id,
        ]);
      }
      summary.updated.push(r.name);
    } else {
      id = await createClient({
        name: r.name,
        account_type: r.accountType,
        mrr: r.mrr,
        gt_user_id: gt,
        account_user_id: acc,
        renewal_date: null,
      });
      await run(`UPDATE clients SET billing_email = ?, billing_phone = ? WHERE id = ?`, [r.email, r.phone, id]);
      byKey.set(clientKey(r.name), { id, name: r.name, billing_email: r.email, billing_phone: r.phone });
      summary.created.push(r.name);
    }
    // Mídia gerida é mensal; a régua de verba é semanal (12 meses / 52 semanas).
    if (r.mediaMonthly && targets.get(id)?.budget_meta === undefined) {
      await setTargets(id, { budget_meta: Math.round((r.mediaMonthly * 12) / 52) });
    }
  }
  return summary;
}

/* --------------------------- carteira ------------------------------ */

export type PortfolioRow = {
  client: ClientRow;
  score: ScoreResult;
  history: { ref_day: string; score: number | null; band: Band | null }[];
  delta7: number | null;
  delta1: number | null;
  bandChanged48h: boolean;
  openPlans: number;
};

export async function portfolio(at = today()): Promise<PortfolioRow[]> {
  const [clients, snaps, weights, config, overlays, hist, plans] = await Promise.all([
    listClients(),
    // Mesma janela do `scoreFor` (12 por cliente): o score de hoje sai idêntico.
    allSnapshots(SCORE_WINDOW),
    getWeights(),
    getConfig(),
    autoOverlays(),
    all<{ client_id: number; ref_day: string; score: number | null; band: Band | null }>(
      `SELECT client_id, ref_day::text AS ref_day, score, band FROM score_snapshots
       WHERE ref_day <= ?::date AND ref_day > ?::date ORDER BY ref_day DESC`,
      [at, addDaysIso(at, -45)],
    ),
    all<{ client_id: number; n: number }>(
      `SELECT client_id, COUNT(*)::int AS n FROM action_plans
       WHERE status IN ('aberto','em_andamento') GROUP BY client_id`,
    ),
  ]);

  type Hist = { client_id: number; ref_day: string; score: number | null; band: Band | null };
  const histBy = new Map<number, Hist[]>();
  for (const h of hist) histBy.set(h.client_id, [...(histBy.get(h.client_id) ?? []), h]);
  const plansBy = new Map(plans.map((p) => [p.client_id, Number(p.n)]));

  const day7 = addDaysIso(at, -7);
  const day48 = addDaysIso(at, -2);

  return clients
    .map((client) => {
      const score = scoreFrom(
        client,
        snaps.perf.get(client.id) ?? [],
        snaps.chk.get(client.id) ?? [],
        at,
        weights,
        config,
        overlays.get(client.id) ?? null,
      );
      const h = histBy.get(client.id) ?? [];
      const prev7 = h.find((x) => x.ref_day <= day7);
      const prev1 = h.find((x) => x.ref_day < at);
      const ref48 = h.find((x) => x.ref_day <= day48);

      return {
        client,
        score,
        history: [...h].reverse(),
        delta7:
          score.score !== null && prev7?.score != null
            ? Math.round((score.score - prev7.score) * 10) / 10
            : null,
        delta1:
          score.score !== null && prev1?.score != null
            ? Math.round((score.score - prev1.score) * 10) / 10
            : null,
        bandChanged48h: !!ref48?.band && !!score.band && ref48.band !== score.band,
        openPlans: plansBy.get(client.id) ?? 0,
      };
    })
    .sort((a, b) => riskRank(a) - riskRank(b));
}

const BAND_ORDER: Record<Band, number> = { vermelho: 0, amarelo: 1, verde: 2 };

export function riskRank(r: PortfolioRow) {
  const band = r.score.band ?? "vermelho";
  return BAND_ORDER[band] * 1000 + (r.score.score ?? 0);
}

/* --------------------------- planos -------------------------------- */

export type Plan = {
  id: number;
  client_id: number;
  risk: string;
  plan: string;
  owner: string;
  due_date: string | null;
  status: "aberto" | "em_andamento" | "concluido" | "cancelado";
  clickup_url: string | null;
  created_at: string;
  closed_at: string | null;
};

const PLAN_SELECT = `
  SELECT p.id, p.client_id, p.risk, p.plan, p.owner, p.due_date::text AS due_date,
         p.status, p.clickup_url, p.created_at::text AS created_at,
         p.closed_at::text AS closed_at`;

export const listPlans = (clientId: number) =>
  all<Plan>(
    `${PLAN_SELECT} FROM action_plans p WHERE p.client_id = ? ORDER BY p.status, p.due_date`,
    [clientId],
  );

export const listOpenPlans = () =>
  all<Plan & { client_name: string }>(
    `${PLAN_SELECT}, c.name AS client_name FROM action_plans p
     JOIN clients c ON c.id = p.client_id
     WHERE p.status IN ('aberto','em_andamento')
     ORDER BY p.due_date IS NULL, p.due_date`,
  );

/**
 * Avisos do rail: o que a unidade está devendo, agora. Três contagens
 * baratas (um COUNT por tabela) em vez de recalcular a carteira inteira —
 * isto roda em toda página que a moldura desenha.
 */
export type Aviso = { id: string; label: string; count: number; href: string };

export async function avisos(): Promise<Aviso[]> {
  const ref = currentRitualDate();
  const [leitura, semana, planos] = await Promise.all([
    one<{ n: number }>(
      `SELECT count(*)::int AS n FROM clients c
       WHERE c.active = 1
         AND COALESCE(
               (SELECT max(s.ref_date) FROM checkin_snapshots s WHERE s.client_id = c.id),
               DATE '1970-01-01'
             ) < current_date - 35`,
    ),
    one<{ n: number }>(
      `SELECT count(*)::int AS n FROM clients c
       WHERE c.active = 1
         AND NOT EXISTS (
           SELECT 1 FROM performance_snapshots p
           WHERE p.client_id = c.id AND p.ref_date = ?::date
         )`,
      [ref],
    ),
    one<{ n: number }>(
      `SELECT count(*)::int AS n FROM action_plans
       WHERE status IN ('aberto','em_andamento')
         AND due_date IS NOT NULL AND due_date < current_date`,
    ),
  ]);

  return [
    {
      id: "checkin",
      label: "contas sem check-in há mais de 35 dias",
      count: leitura?.n ?? 0,
      href: "/account",
    },
    {
      id: "performance",
      label: "contas sem o número da semana",
      count: semana?.n ?? 0,
      href: "/gt",
    },
    { id: "planos", label: "planos de ação vencidos", count: planos?.n ?? 0, href: "/" },
  ].filter((a) => a.count > 0);
}

export const createPlan = (
  p: Omit<Plan, "id" | "created_at" | "closed_at" | "status" | "clickup_url">,
) =>
  insert(
    `INSERT INTO action_plans (client_id, risk, plan, owner, due_date)
     VALUES (?, ?, ?, ?, ?::date) RETURNING id`,
    [p.client_id, p.risk, p.plan, p.owner, p.due_date],
  );

export const updatePlanStatus = (id: number, status: Plan["status"]) =>
  run(
    `UPDATE action_plans SET status = ?,
       closed_at = CASE WHEN ? IN ('concluido','cancelado') THEN now() ELSE NULL END
     WHERE id = ?`,
    [status, status, id],
  );

export const getPlan = (id: number) => one<Plan>(`${PLAN_SELECT} FROM action_plans p WHERE p.id = ?`, [id]);

export const updatePlan = (
  id: number,
  p: Pick<Plan, "risk" | "plan" | "owner" | "due_date">,
) =>
  run(`UPDATE action_plans SET risk = ?, plan = ?, owner = ?, due_date = ?::date WHERE id = ?`, [
    p.risk,
    p.plan,
    p.owner,
    p.due_date,
    id,
  ]);

/** Plano registrado por engano. Plano real que não vai adiante é "cancelado", não excluído. */
export const deletePlan = (id: number) => run("DELETE FROM action_plans WHERE id = ?", [id]);

export const setPlanClickup = (id: number, url: string) =>
  run("UPDATE action_plans SET clickup_url = ? WHERE id = ?", [url, id]);

/* --------------------------- agregados ----------------------------- */

export function portfolioSummary(rows: PortfolioRow[]) {
  const byBand: Record<Band | "sem_dado", number> = {
    verde: 0,
    amarelo: 0,
    vermelho: 0,
    sem_dado: 0,
  };
  let mrrAtRisk = 0;
  let mrrTotal = 0;
  const staleFills: PortfolioRow[] = [];
  for (const r of rows) {
    mrrTotal += r.client.mrr;
    if (!r.score.band) byBand.sem_dado++;
    else byBand[r.score.band]++;
    if (r.score.band === "vermelho" || r.score.band === "amarelo") mrrAtRisk += r.client.mrr;
    if (r.score.confidence !== "alta") staleFills.push(r);
  }
  return { byBand, mrrAtRisk, mrrTotal, staleFills };
}

export function dimensionKeys(): DimensionKey[] {
  return DIMENSIONS.map((d) => d.key);
}

export type { OverrideHit };

/* --------------------------- bootstrap ----------------------------- */

/** Recria a carteira de demonstração do zero (usado por `npm run seed`). */
export async function seedDemo() {
  await wipe();
  const n = await insertDemoData();
  await recomputeRange(45);
  return n;
}

/* ------------------- listas de preenchimento ----------------------- */

/** Último snapshot de cada cliente, em uma query só. */
const lastByClient = (table: string) =>
  all<Snap>(
    `SELECT DISTINCT ON (s.client_id) s.id, s.client_id, s.ref_date::text AS ref_date,
            s.filled_by, s.filled_at::text AS filled_at, s.data, u.name AS filler
     FROM ${table} s LEFT JOIN users u ON u.id = s.filled_by
     ORDER BY s.client_id, s.ref_date DESC, s.id DESC`,
  );

export const lastPerfByClient = () => lastByClient("performance_snapshots");
export const lastCheckinByClient = () => lastByClient("checkin_snapshots");

/** Ids dos clientes que já têm performance registrada na semana de referência. */
export async function filledOn(refDate: string): Promise<Set<number>> {
  const rows = await all<{ client_id: number }>(
    "SELECT DISTINCT client_id FROM performance_snapshots WHERE ref_date = ?::date",
    [refDate],
  );
  return new Set(rows.map((r) => r.client_id));
}
