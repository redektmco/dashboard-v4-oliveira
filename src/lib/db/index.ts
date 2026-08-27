import { neon } from "@neondatabase/serverless";

/**
 * Postgres (Neon) via driver HTTP serverless.
 *
 * Cada query é um round-trip HTTP, então o `repo` foi escrito para buscar em
 * lote — nunca uma query por cliente dentro de um laço. Ver `recomputeRange`.
 *
 * Datas voltam sempre como texto (`::text` nas queries): o cálculo compara e
 * subtrai strings `YYYY-MM-DD` e não deve receber objetos `Date`.
 */

type Sql = ReturnType<typeof neon>;

let _sql: Sql | null = null;

export function getSql(): Sql {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL não definida. Rode `vercel env pull .env.local --yes` " +
          "depois de provisionar o Neon pelo Marketplace.",
      );
    }
    _sql = neon(url);
  }
  return _sql;
}

/** Converte os `?` do SQL para os `$1..$n` do Postgres. */
function toPg(sql: string) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function all<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const rows = await getSql().query(toPg(sql), params as never[]);
  return rows as T[];
}

export async function one<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await all<T>(sql, params);
  return rows[0] ?? null;
}

export async function run(sql: string, params: unknown[] = []): Promise<void> {
  await all(sql, params);
}

/** INSERT que devolve o id gerado. */
export async function insert(sql: string, params: unknown[] = []): Promise<number> {
  const row = await one<{ id: number }>(sql, params);
  return Number(row!.id);
}

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('gt','account','coord'))
);

CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('lead_gen','ecommerce','branding')),
  mrr DOUBLE PRECISION NOT NULL DEFAULT 0,
  gt_user_id INTEGER REFERENCES users(id),
  account_user_id INTEGER REFERENCES users(id),
  renewal_date DATE,
  active SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Metas por cliente: onde vive a régua de normalização (briefing 10.1).
-- Versionadas por data — a meta muda por ciclo sem apagar o histórico.
CREATE TABLE IF NOT EXISTS client_targets (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  effective_from DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_targets_client
  ON client_targets (client_id, key, effective_from DESC);

-- Snapshot datado, nunca sobrescreve (princípio de arquitetura, seção 7).
CREATE TABLE IF NOT EXISTS performance_snapshots (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ref_date DATE NOT NULL,
  filled_by INTEGER REFERENCES users(id),
  filled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_perf_client
  ON performance_snapshots (client_id, ref_date DESC, id DESC);

CREATE TABLE IF NOT EXISTS checkin_snapshots (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ref_date DATE NOT NULL,
  filled_by INTEGER REFERENCES users(id),
  filled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chk_client
  ON checkin_snapshots (client_id, ref_date DESC, id DESC);

-- Resultado do recompute diário. Um por cliente por dia.
CREATE TABLE IF NOT EXISTS score_snapshots (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ref_day DATE NOT NULL,
  score DOUBLE PRECISION,
  raw_band TEXT,
  band TEXT,
  confidence TEXT NOT NULL,
  overrides JSONB NOT NULL,
  breakdown JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, ref_day)
);
CREATE INDEX IF NOT EXISTS idx_score_client
  ON score_snapshots (client_id, ref_day DESC);

CREATE TABLE IF NOT EXISTS action_plans (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  risk TEXT NOT NULL,
  plan TEXT NOT NULL,
  owner TEXT NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto','em_andamento','concluido','cancelado')),
  clickup_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_plans_client ON action_plans (client_id, status);

-- Pesos e limiares: editáveis para a recalibração trimestral (seção 9).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

let migrated = false;

/** Cria o schema se ainda não existir. Idempotente. */
export async function migrate() {
  if (migrated) return;
  const sql = getSql();
  for (const stmt of DDL.split(";\n").map((s) => s.trim()).filter(Boolean)) {
    await sql.query(stmt);
  }
  migrated = true;
}
