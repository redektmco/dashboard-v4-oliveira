import { all, insert, one, run } from "./db";
import { DIMENSIONS } from "./model/catalog";
import { computeScore, DEFAULT_CONFIG, type ScoreConfig, type WeightMap } from "./model/scoring";
import { insertDemoData, wipe } from "./seed";
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

export const listUsers = (role?: User["role"]) =>
  role
    ? all<User>("SELECT * FROM users WHERE role = ? ORDER BY name", [role])
    : all<User>("SELECT * FROM users ORDER BY role, name");

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
  return all<User>("SELECT * FROM users WHERE login IS NOT NULL AND active = 1 ORDER BY name");
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

/** Todos os snapshots de todos os clientes, em duas queries. */
async function allSnapshots(): Promise<{ perf: Map<number, Snap[]>; chk: Map<number, Snap[]> }> {
  const [perf, chk] = await Promise.all([
    all<Snap>(`${SNAP_SELECT("performance_snapshots")} ORDER BY s.ref_date DESC, s.id DESC`),
    all<Snap>(`${SNAP_SELECT("checkin_snapshots")} ORDER BY s.ref_date DESC, s.id DESC`),
  ]);
  const group = (rows: Snap[]) => {
    const m = new Map<number, Snap[]>();
    for (const r of rows) m.set(r.client_id, [...(m.get(r.client_id) ?? []), r]);
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

/** Cálculo puro a partir de snapshots já carregados — não toca no banco. */
function scoreFrom(
  client: ClientRow,
  perf: Snap[],
  chk: Snap[],
  at: string,
  weights: WeightMap,
  config: ScoreConfig,
): ScoreResult {
  const p = perf.filter((s) => s.ref_date <= at);
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

export async function scoreFor(clientId: number, at = today()): Promise<ScoreResult | null> {
  const [client, perf, chk, weights, config] = await Promise.all([
    getClient(clientId),
    perfSnapshots(clientId, 12),
    checkinSnapshots(clientId, 12),
    getWeights(),
    getConfig(),
  ]);
  if (!client) return null;
  return scoreFrom(client, perf, chk, at, weights, config);
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
  const [clients, snaps, weights, config] = await Promise.all([
    listClients(),
    allSnapshots(),
    getWeights(),
    getConfig(),
  ]);

  const dayList = Array.from({ length: days }, (_, i) => addDaysIso(endDay, -(days - 1 - i)));

  let n = 0;
  for (const client of clients) {
    const perf = snaps.perf.get(client.id) ?? [];
    const chk = snaps.chk.get(client.id) ?? [];
    const rows = dayList.map((day) => ({
      day,
      r: scoreFrom(client, perf, chk, day, weights, config),
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
  const [clients, snaps, weights, config, hist, plans] = await Promise.all([
    listClients(),
    allSnapshots(),
    getWeights(),
    getConfig(),
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
