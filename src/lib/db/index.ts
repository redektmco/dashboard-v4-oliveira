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
  role TEXT NOT NULL CHECK (role IN ('gt','account','coord','social'))
);

-- Abre o papel 'social' num banco que ja nasceu antes dele existir. O CHECK
-- do CREATE acima so vale na criacao; em base existente re-cria a restricao.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('gt','account','coord','social'));

-- Acesso: uso fechado da unidade. Quem preenche continua vivendo em users --
-- as colunas abaixo dizem quem, alem disso, consegue entrar no painel.
ALTER TABLE users ADD COLUMN IF NOT EXISTS login TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS active SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login ON users (login);

-- Sessao no banco, nao cookie assinado: permite revogar acesso na hora
-- em que o admin desativa alguem, sem depender de segredo em env.
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

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

-- =====================================================================
-- Social media — aprovacao de criativos + planejamento + publicacao IG.
-- Ids sao texto (prj_/pst_) para casar com o app; um projeto e um board
-- de aprovacao ligado (opcionalmente) a um cliente da carteira.
-- =====================================================================
CREATE TABLE IF NOT EXISTS sm_projects (
  id TEXT PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  client_name TEXT NOT NULL,
  ig_handle TEXT NOT NULL,
  guest_token TEXT NOT NULL UNIQUE,
  archived SMALLINT NOT NULL DEFAULT 0,
  -- Credenciais da conta Instagram Business, por projeto (ready-to-wire).
  ig_user_id TEXT,
  ig_access_token TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sm_projects_client ON sm_projects (client_id);

CREATE TABLE IF NOT EXISTS sm_posts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES sm_projects(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  assets JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  decided_at TIMESTAMPTZ,
  feedback TEXT,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Planejamento e publicacao automatica no Instagram.
  scheduled_at TIMESTAMPTZ,
  publish_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (publish_status IN ('draft','scheduled','publishing','published','failed')),
  published_at TIMESTAMPTZ,
  ig_media_id TEXT,
  publish_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sm_posts_project ON sm_posts (project_id, ord);
CREATE INDEX IF NOT EXISTS idx_sm_posts_due
  ON sm_posts (publish_status, scheduled_at);

-- =====================================================================
-- Onboarding / LMS interno — portal de aprendizagem do novo funcionário.
-- Hierarquia categoria > módulo > aula; progresso individual por usuário.
-- Conteúdo 100% no banco (nada hardcoded no front). ord ordena cada
-- nível; status controla publicação (o funcionário só vê 'published').
-- =====================================================================
CREATE TABLE IF NOT EXISTS ob_categories (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  banner_url TEXT,
  icon TEXT,
  ord INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','published','archived')),
  is_demo SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ob_categories_ord ON ob_categories (ord);

CREATE TABLE IF NOT EXISTS ob_modules (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES ob_categories(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  ord INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft','published','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ob_modules_cat ON ob_modules (category_id, ord);

-- Uma linha por aula. A coluna type decide o que o front renderiza; os campos
-- de mídia (video_url/external_url/thumb_url/icon/checklist) são opcionais e só
-- o do tipo em uso é preenchido. A coluna content guarda Markdown (texto) ou as
-- instruções (link/ferramenta) — nunca HTML cru.
CREATE TABLE IF NOT EXISTS ob_lessons (
  id SERIAL PRIMARY KEY,
  module_id INTEGER NOT NULL REFERENCES ob_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'text'
    CHECK (type IN ('text','video','link','document','checklist','tool')),
  content TEXT NOT NULL DEFAULT '',
  video_url TEXT,
  external_url TEXT,
  thumb_url TEXT,
  icon TEXT,
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  ord INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft','published','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ob_lessons_mod ON ob_lessons (module_id, ord);

-- Progresso do funcionário, uma linha por (usuário, aula). Só nasce quando a
-- aula é aberta; ausência = "não iniciado". A conclusão de módulo/categoria é
-- um agregado desta tabela — mesmo princípio de nunca sobrescrever da seção 7.
CREATE TABLE IF NOT EXISTS ob_progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES ob_lessons(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','done')),
  checklist_state JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS idx_ob_progress_user ON ob_progress (user_id);
CREATE INDEX IF NOT EXISTS idx_ob_progress_lesson ON ob_progress (lesson_id);
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
