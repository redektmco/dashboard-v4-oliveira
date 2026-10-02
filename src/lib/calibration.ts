import { all, one, run } from "./db";
import { DIMENSIONS } from "./model/catalog";
import { DEFAULT_CONFIG, type ScoreConfig, type WeightMap } from "./model/scoring";
import type { Band, DimensionKey } from "./model/types";
import { getConfig, getWeights, setSetting, simulateToday } from "./repo";

/**
 * Versões da calibração. Cada "Salvar e recalcular" grava uma versão nova
 * (v1, v2…) com os pesos e limiares completos — a versão em uso é sempre a
 * mais recente. Voltar a uma versão antiga cria outra versão com os valores
 * dela, para o histórico nunca perder o que esteve valendo e quando.
 */

export type CalibrationVersion = {
  version: number;
  weights: WeightMap;
  config: ScoreConfig;
  note: string;
  created_at: string;
  by: string | null;
};

const SELECT = `
  SELECT v.version, v.weights, v.config, v.note, v.created_at::text AS created_at, u.name AS by
  FROM calibration_versions v LEFT JOIN users u ON u.id = v.created_by`;

/** Rótulos curtos dos limiares — usados no log e na lista de mudanças. */
export const CONFIG_LABEL: Record<keyof ScoreConfig, string> = {
  greenFloor: "Piso do verde",
  yellowFloor: "Piso do amarelo",
  perfMaxAgeDays: "Frescor da performance (dias)",
  checkinMaxAgeDays: "Frescor do check-in (dias)",
  underMetaThreshold: "Override: performance abaixo de",
  underMetaCycles: "Override: ciclos seguidos",
  renewalAlertDays: "Alerta de renovação (dias)",
};

/**
 * Banco que já tinha pesos salvos antes das versões existirem: a primeira
 * leitura grava a configuração vigente como v1, datada de quando os pesos
 * foram salvos pela última vez.
 */
async function ensureBaseline() {
  const any = await one<{ n: number }>(`SELECT count(*)::int AS n FROM calibration_versions`);
  if (any && Number(any.n) > 0) return;
  const [weights, config, stamp] = await Promise.all([
    getWeights(),
    getConfig(),
    one<{ at: string }>(`SELECT updated_at::text AS at FROM settings WHERE key = 'weights'`),
  ]);
  await run(
    `INSERT INTO calibration_versions (version, weights, config, note, created_at)
     VALUES (1, ?::jsonb, ?::jsonb, 'Configuração inicial', COALESCE(?::timestamptz, now()))
     ON CONFLICT (version) DO NOTHING`,
    [JSON.stringify(weights), JSON.stringify(config), stamp?.at ?? null],
  );
}

export async function listVersions(limit = 12): Promise<CalibrationVersion[]> {
  await ensureBaseline();
  const rows = await all<CalibrationVersion>(`${SELECT} ORDER BY v.version DESC LIMIT ?`, [limit]);
  return rows.map((r) => ({ ...r, config: { ...DEFAULT_CONFIG, ...r.config } }));
}

export async function currentVersion(): Promise<CalibrationVersion> {
  const [v] = await listVersions(1);
  return v;
}

/** Frases do que mudou entre duas calibrações ("Piso do amarelo 58 → 60"). */
export function describeChanges(
  from: { weights: WeightMap; config: ScoreConfig },
  to: { weights: WeightMap; config: ScoreConfig },
): string[] {
  const out: string[] = [];
  for (const d of DIMENSIONS) {
    const a = from.weights[d.key] ?? d.defaultWeight;
    const b = to.weights[d.key] ?? d.defaultWeight;
    if (a !== b) out.push(`Peso ${d.label} ${a}% → ${b}%`);
  }
  for (const k of Object.keys(CONFIG_LABEL) as (keyof ScoreConfig)[]) {
    if (from.config[k] !== to.config[k]) out.push(`${CONFIG_LABEL[k]} ${from.config[k]} → ${to.config[k]}`);
  }
  return out;
}

/** Grava a calibração como nova versão e passa a usá-la. Não recalcula. */
export async function saveVersion(
  weights: WeightMap,
  config: ScoreConfig,
  note: string,
  userId: number | null,
): Promise<number> {
  await ensureBaseline();
  const row = await one<{ version: number }>(
    `INSERT INTO calibration_versions (version, weights, config, note, created_by)
     VALUES ((SELECT COALESCE(MAX(version), 0) + 1 FROM calibration_versions), ?::jsonb, ?::jsonb, ?, ?)
     RETURNING version`,
    [JSON.stringify(weights), JSON.stringify(config), note, userId],
  );
  await Promise.all([setSetting("weights", weights), setSetting("config", config)]);
  return Number(row!.version);
}

export const getVersion = async (version: number) => {
  const r = await one<CalibrationVersion>(`${SELECT} WHERE v.version = ?`, [version]);
  return r ? { ...r, config: { ...DEFAULT_CONFIG, ...r.config } } : null;
};

/* ------------------------- prévia do impacto ------------------------ */

export type BandCounts = { verde: number; amarelo: number; vermelho: number; sem_dado: number };

export type ImpactPreview = {
  today: BandCounts;
  next: BandCounts;
  changes: { id: number; name: string; from: Band | null; to: Band | null; a: number | null; b: number | null }[];
  clients: number;
};

const count = (rows: { band: Band | null }[]): BandCounts => {
  const c: BandCounts = { verde: 0, amarelo: 0, vermelho: 0, sem_dado: 0 };
  for (const r of rows) c[r.band ?? "sem_dado"]++;
  return c;
};

/**
 * Compara a carteira de hoje com a configuração em uso e com a proposta.
 * Clientes que trocam de faixa saem ordenados do que mais piora para o que
 * mais melhora — piorar é o que pede atenção antes de salvar.
 */
export async function previewImpact(weights: WeightMap, config: ScoreConfig): Promise<ImpactPreview> {
  const [curW, curC] = await Promise.all([getWeights(), getConfig()]);
  const [before, after] = await simulateToday([
    { weights: curW, config: curC },
    { weights, config },
  ]);
  const rank: Record<Band, number> = { vermelho: 0, amarelo: 1, verde: 2 };
  const changes = after
    .map((b, i) => ({ a: before[i], b }))
    .filter(({ a, b }) => a.band !== b.band)
    .map(({ a, b }) => ({ id: b.id, name: b.name, from: a.band, to: b.band, a: a.score, b: b.score }))
    .sort((x, y) => (rank[x.to ?? "vermelho"] - rank[x.from ?? "vermelho"]) - (rank[y.to ?? "vermelho"] - rank[y.from ?? "vermelho"]));
  return { today: count(before), next: count(after), changes, clients: after.length };
}

/** Pesos e limiares vindos de um formulário ou objeto parcial, saneados. */
export function sanitizeCalibration(input: {
  weights?: Partial<Record<DimensionKey, unknown>>;
  config?: Partial<Record<keyof ScoreConfig, unknown>>;
}): { weights: WeightMap; config: ScoreConfig } {
  const weights: WeightMap = {};
  for (const d of DIMENSIONS) {
    const n = Number(input.weights?.[d.key]);
    weights[d.key] = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : d.defaultWeight;
  }
  const config = { ...DEFAULT_CONFIG };
  for (const k of Object.keys(DEFAULT_CONFIG) as (keyof ScoreConfig)[]) {
    const n = Number(input.config?.[k]);
    if (Number.isFinite(n) && n >= 0) config[k] = n;
  }
  return { weights, config };
}

export { nextQuarterStart } from "./quarter";
