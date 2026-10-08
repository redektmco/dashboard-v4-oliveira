import { neon } from "@neondatabase/serverless";

/**
 * Postgres (Neon) via driver HTTP serverless.
 *
 * Cada query é um round-trip HTTP, então o `repo` foi escrito para buscar em
 * lote — nunca uma query por cliente dentro de um laço. Ver `recomputeRange`.
 *
 * Datas voltam sempre como texto (`::text` nas queries): o cálculo compara e
 * subtrai strings `YYYY-MM-DD` e não deve receber objetos `Date`.
 *
 * Desenvolvimento local: `DATABASE_URL=pglite://./.data/pglite` troca o Neon
 * por um Postgres embutido (PGlite, WASM) gravado em disco. Sem isso o
 * `npm run dev` escreve direto no banco de produção do `.env.local`.
 */

type Driver = {
  query(sql: string, params: unknown[]): Promise<unknown[]>;
  /** Vários statements num único round-trip, dentro de uma transação. */
  batch(statements: string[]): Promise<void>;
  /** Vários statements parametrizados, tudo ou nada, num único round-trip. */
  tx(steps: { sql: string; params: unknown[] }[]): Promise<void>;
};

let _driver: Promise<Driver> | null = null;

function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não definida. Rode `vercel env pull .env.local --yes` " +
        "depois de provisionar o Neon pelo Marketplace.",
    );
  }
  return url;
}

function neonDriver(url: string): Driver {
  const sql = neon(url);
  return {
    query: (text, params) => sql.query(text, params as never[]) as Promise<unknown[]>,
    batch: async (statements) => {
      await sql.transaction(statements.map((s) => sql.query(s)));
    },
    tx: async (steps) => {
      await sql.transaction(steps.map((st) => sql.query(st.sql, st.params as never[])));
    },
  };
}

type PgliteDb = {
  query(sql: string, params: unknown[]): Promise<{ rows: unknown[] }>;
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: { query(sql: string, params: unknown[]): Promise<unknown> }) => Promise<T>): Promise<T>;
};

async function pgliteDriver(url: string): Promise<Driver> {
  // Uma instância por processo, sobrevivendo ao hot reload do dev server:
  // o PGlite é single-user e não aceita duas aberturas do mesmo diretório.
  const g = globalThis as typeof globalThis & { __pglite?: Promise<PgliteDb> };
  g.__pglite ??= (async () => {
    // Nome fora do alcance do bundler: é dependência de desenvolvimento e
    // não deve entrar no pacote da função em produção.
    const pkg = "@electric-sql/pglite";
    const { PGlite } = (await import(/* turbopackIgnore: true */ /* webpackIgnore: true */ pkg)) as {
      PGlite: new (dir: string) => PgliteDb;
    };
    const dir = url.replace(/^pglite:\/\//, "") || "./.data/pglite";
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dir, { recursive: true });
    return new PGlite(dir);
  })();
  const db = await g.__pglite;
  return {
    query: async (text, params) => (await db.query(text, params)).rows,
    batch: async (statements) => {
      await db.exec(`BEGIN;\n${statements.join(";\n")};\nCOMMIT;`);
    },
    tx: async (steps) => {
      await db.transaction(async (t) => {
        for (const st of steps) await t.query(st.sql, st.params);
      });
    },
  };
}

function driver(): Promise<Driver> {
  if (!_driver) {
    const url = databaseUrl();
    _driver = url.startsWith("pglite:") ? pgliteDriver(url) : Promise.resolve(neonDriver(url));
  }
  return _driver;
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
  const rows = await (await driver()).query(toPg(sql), params);
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

/** Vários comandos como uma transação só — tudo ou nada, um round-trip no Neon. */
export async function transaction(steps: [sql: string, params?: unknown[]][]): Promise<void> {
  await (await driver()).tx(steps.map(([sql, params = []]) => ({ sql: toPg(sql), params })));
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
    CHECK (status IN ('draft','pending','approved','rejected')),
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

-- Capa do cliente na aba Social media > Projetos: a visualizacao em grade
-- mostra uma imagem por cliente. A chave e a mesma que agrupa a tela
-- ('c:<client_id>' para cliente da carteira, 'n:<nome normalizado>' para
-- projeto avulso) — ver src/lib/social/clients.ts. Fica fora da tabela
-- clients de proposito: projeto avulso nao tem linha na carteira.
CREATE TABLE IF NOT EXISTS sm_client_covers (
  client_key TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- Formato do criativo: post de feed (1 arte = post, varias = carrossel),
-- Reels (video vertical) ou Story (sequencia vertical de frames 9:16).
ALTER TABLE sm_posts ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'feed';
ALTER TABLE sm_posts DROP CONSTRAINT IF EXISTS sm_posts_format_check;
ALTER TABLE sm_posts ADD CONSTRAINT sm_posts_format_check
  CHECK (format IN ('feed','reels','story'));

-- Rascunho: criativo montado pelo time que ainda nao foi para o link do
-- cliente. So sai de 'draft' quando alguem clica em enviar para aprovacao.
ALTER TABLE sm_posts DROP CONSTRAINT IF EXISTS sm_posts_status_check;
ALTER TABLE sm_posts ADD CONSTRAINT sm_posts_status_check
  CHECK (status IN ('draft','pending','approved','rejected'));

-- Chave de idempotencia gerada no navegador por arquivo enviado: reenviar o
-- mesmo lote depois de uma falha parcial nao duplica o criativo.
ALTER TABLE sm_posts ADD COLUMN IF NOT EXISTS client_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sm_posts_client_key
  ON sm_posts (project_id, client_key) WHERE client_key IS NOT NULL;

-- =====================================================================
-- Integracoes — contabilizacao automatica de leads. O CRM envia um webhook
-- por lead para /api/integrations/webhook/<token>; uma integracao por
-- cliente (token na URL, como o guest do Social). A contagem por semana-
-- ritual alimenta direto a regua de "Leads gerados" no score.
-- =====================================================================
CREATE TABLE IF NOT EXISTS crm_integrations (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'generic',
  active SMALLINT NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_event_at TIMESTAMPTZ
);

-- Cada lead recebido, datado pela semana-ritual que fecha. Nunca sobrescreve:
-- a contagem e um COUNT desta tabela, mesmo principio do snapshot.
CREATE TABLE IF NOT EXISTS crm_leads (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ref_date DATE NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dedup_key TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_crm_leads_client ON crm_leads (client_id, ref_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_leads_dedup
  ON crm_leads (client_id, dedup_key) WHERE dedup_key IS NOT NULL;

-- =====================================================================
-- Cobranca — fatura automatica mensal por cliente (Configuracoes > Cobranca).
-- Uma linha em billing_charges e "a proxima parcela": recorrente ('mensal')
-- avanca due_date em 1 mes sozinha depois de cada disparo, unica dispara uma
-- vez e fica inativa. O cron roda 0h (America/Sao_Paulo) e dispara e-mail
-- (Resend) e WhatsApp (Meta Cloud API) — ambos opt-in por env; sem a chave
-- configurada, o canal e pulado (nunca falha o disparo dos demais).
-- billing_dispatch_log e o historico: uma linha por (parcela, vencimento,
-- canal), com o pixel de rastreio gravando opened_at na abertura do e-mail.
-- =====================================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_email TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_phone TEXT;

CREATE TABLE IF NOT EXISTS billing_charges (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  due_date DATE NOT NULL,
  recurrence TEXT NOT NULL DEFAULT 'unica' CHECK (recurrence IN ('unica','mensal')),
  active SMALLINT NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_charges_due ON billing_charges (active, due_date);
CREATE INDEX IF NOT EXISTS idx_billing_charges_client ON billing_charges (client_id);

CREATE TABLE IF NOT EXISTS billing_dispatch_log (
  id SERIAL PRIMARY KEY,
  charge_id INTEGER NOT NULL REFERENCES billing_charges(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','whatsapp')),
  status TEXT NOT NULL DEFAULT 'failed' CHECK (status IN ('sent','failed')),
  error TEXT,
  tracking_token TEXT UNIQUE,
  opened_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_billing_log_charge ON billing_dispatch_log (charge_id, sent_at DESC);
-- Idempotencia: o cron pode rodar mais de uma vez no mesmo dia (retry da
-- Vercel, disparo manual em cima do cron) sem duplicar o envio.
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_log_dedup
  ON billing_dispatch_log (charge_id, due_date, channel);

-- =====================================================================
-- Meta Ads — puxa verba, leads/conversas, receita e alcance direto da API
-- de Insights com o token do usuario de sistema da unidade (env
-- META_ACCESS_TOKEN, nunca no banco). Um cliente pode ter varias contas de
-- anuncio; cada conta pertence a um cliente so. meta_insights guarda uma
-- linha por (conta, semana-ritual): o sync regrava as ultimas semanas, que a
-- Meta ainda ajusta por atribuicao atrasada.
-- =====================================================================
CREATE TABLE IF NOT EXISTS meta_ad_accounts (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  currency TEXT,
  lead_metric TEXT NOT NULL DEFAULT 'both' CHECK (lead_metric IN ('lead','messaging','both')),
  active SMALLINT NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sync_at TIMESTAMPTZ,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_meta_ad_accounts_client ON meta_ad_accounts (client_id);

CREATE TABLE IF NOT EXISTS meta_insights (
  ad_account_id TEXT NOT NULL REFERENCES meta_ad_accounts(ad_account_id) ON DELETE CASCADE,
  ref_date DATE NOT NULL,
  spend DOUBLE PRECISION NOT NULL DEFAULT 0,
  leads INTEGER NOT NULL DEFAULT 0,
  conversations INTEGER NOT NULL DEFAULT 0,
  purchases INTEGER NOT NULL DEFAULT 0,
  revenue DOUBLE PRECISION NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ad_account_id, ref_date)
);

-- =====================================================================
-- Google Ads — mesma ideia do Meta: verba, conversoes e receita por semana-
-- ritual, puxadas da Google Ads API com um service account (envs
-- GOOGLE_SA_* e GOOGLE_ADS_DEVELOPER_TOKEN, nunca no banco). Um cliente pode
-- ter varias contas; cada conta pertence a um cliente so. As semanas entram
-- na mesma leitura de midia do Meta e somam com ele.
-- =====================================================================
CREATE TABLE IF NOT EXISTS google_ad_accounts (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  currency TEXT,
  active SMALLINT NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sync_at TIMESTAMPTZ,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_google_ad_accounts_client ON google_ad_accounts (client_id);

CREATE TABLE IF NOT EXISTS google_insights (
  customer_id TEXT NOT NULL REFERENCES google_ad_accounts(customer_id) ON DELETE CASCADE,
  ref_date DATE NOT NULL,
  spend DOUBLE PRECISION NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  revenue DOUBLE PRECISION NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, ref_date)
);

-- =====================================================================
-- Redesign (ficha do cliente + Configurações).
-- audit_log: "Últimas alterações" de Configurações e o histórico da conta.
-- calibration_versions: cada "Salvar e recalcular" vira uma versão (v1,
-- v2…) e dá para voltar a uma anterior.
-- action_plans ganha prioridade, dimensão, tarefas e autor; client_targets
-- e clients guardam quem mudou a meta e o check-in agendado.
-- =====================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT,
  kind TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log (at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_client ON audit_log (client_id, at DESC);

CREATE TABLE IF NOT EXISTS calibration_versions (
  id SERIAL PRIMARY KEY,
  version INTEGER NOT NULL UNIQUE,
  weights JSONB NOT NULL,
  config JSONB NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'media';
ALTER TABLE action_plans DROP CONSTRAINT IF EXISTS action_plans_priority_check;
ALTER TABLE action_plans ADD CONSTRAINT action_plans_priority_check
  CHECK (priority IN ('alta','media','baixa'));
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS dimension TEXT;
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS tasks JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE client_targets ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS next_checkin_at TIMESTAMPTZ;

ALTER TABLE crm_integrations ADD COLUMN IF NOT EXISTS crm_name TEXT;

ALTER TABLE billing_charges DROP CONSTRAINT IF EXISTS billing_charges_recurrence_check;
ALTER TABLE billing_charges ADD CONSTRAINT billing_charges_recurrence_check
  CHECK (recurrence IN ('unica','mensal','trimestral','anual'));

-- =====================================================================
-- Contrato do cliente — puxado pela solicitacao de churn (numero, servicos,
-- inicio, fidelidade e aviso previo). Preenchido no cadastro do cliente.
-- =====================================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_code TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS services JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contract_start DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS fidelity_months INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notice_days INTEGER;

-- =====================================================================
-- Churn — solicitacoes de cancelamento ja formalizadas pelo cliente (nao e
-- previsao). Uma solicitacao vai de 'solicitado' ate o desfecho ('retido' ou
-- 'cancelado'); tentativas de retencao, tarefas e o historico (contatos,
-- notas, mudancas de status) ficam em tabelas proprias e nunca sao
-- sobrescritos. Valores do contrato sao copiados na abertura: o historico
-- continua certo mesmo se o cadastro do cliente mudar depois.
-- =====================================================================
CREATE TABLE IF NOT EXISTS churn_requests (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'solicitado'
    CHECK (status IN ('solicitado','em_analise','em_negociacao','agendado','retido','cancelado')),
  requested_at DATE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'outro' CHECK (channel IN ('email','whatsapp','call','reuniao','outro')),
  main_reason TEXT NOT NULL,
  secondary_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  justification TEXT NOT NULL DEFAULT '',
  desired_end DATE,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  retention_chance TEXT NOT NULL DEFAULT 'media' CHECK (retention_chance IN ('alta','media','baixa','nenhuma')),
  mrr DOUBLE PRECISION NOT NULL DEFAULT 0,
  contract_code TEXT,
  services JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidences JSONB NOT NULL DEFAULT '[]'::jsonb,
  outcome TEXT CHECK (outcome IN ('retido','retido_alteracao','cancelado')),
  final_reason TEXT,
  final_note TEXT,
  effective_end DATE,
  new_mrr DOUBLE PRECISION,
  client_inactivated SMALLINT NOT NULL DEFAULT 0,
  closed_at TIMESTAMPTZ,
  closed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_churn_req_client ON churn_requests (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_churn_req_status ON churn_requests (status);

CREATE TABLE IF NOT EXISTS churn_attempts (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES churn_requests(id) ON DELETE CASCADE,
  n INTEGER NOT NULL,
  strategy TEXT NOT NULL,
  proposal TEXT NOT NULL DEFAULT '',
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_mrr DOUBLE PRECISION,
  proposed_mrr DOUBLE PRECISION,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date DATE,
  sent_at DATE NOT NULL,
  result TEXT NOT NULL DEFAULT 'aguardando'
    CHECK (result IN ('aguardando','aceita','recusada','contraproposta_aceita','contraproposta_recusada')),
  response TEXT,
  response_kind TEXT CHECK (response_kind IN ('resposta','contraproposta')),
  responded_at DATE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, n)
);

CREATE TABLE IF NOT EXISTS churn_tasks (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES churn_requests(id) ON DELETE CASCADE,
  attempt_id INTEGER REFERENCES churn_attempts(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'tarefa' CHECK (kind IN ('tarefa','pendencia')),
  text TEXT NOT NULL,
  owner TEXT,
  due_date DATE,
  note TEXT,
  done SMALLINT NOT NULL DEFAULT 0,
  done_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_churn_tasks_req ON churn_tasks (request_id);

CREATE TABLE IF NOT EXISTS churn_events (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES churn_requests(id) ON DELETE CASCADE,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind TEXT NOT NULL CHECK (kind IN ('abertura','observacao','contato','anexo','status','tentativa','resposta','conclusao')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_churn_events_req ON churn_events (request_id, at DESC);

-- =====================================================================
-- Playbook do Account (Framework de Saude da Carteira).
-- Plano de acao no formato padrao: DOR (risk), MOTIVO, ACAO (plan), PRAZO,
-- OWNER e OBJETIVO. Cliente ganha nicho (benchmark com a rede) e
-- proximidade (visita x gift card).
-- flag_episodes: cada entrada do cliente numa flag (verde/amarelo/vermelho);
-- no maximo um episodio aberto por cliente. playbook_steps: os passos do
-- playbook daquela flag, com prazo contado da entrada. Passo nao feito
-- quando a flag muda fica 'arquivado' (historico, nao some).
-- learning_records: "Erro nosso" (secao 6). upsell_opportunities: expansao
-- dos clientes Green. crm_diagnostics: bloco CRM e processo comercial.
-- =====================================================================
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS motivo TEXT NOT NULL DEFAULT '';
ALTER TABLE action_plans ADD COLUMN IF NOT EXISTS objetivo TEXT NOT NULL DEFAULT '';

ALTER TABLE clients ADD COLUMN IF NOT EXISTS niche TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS proximity TEXT;
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_proximity_check;
ALTER TABLE clients ADD CONSTRAINT clients_proximity_check CHECK (proximity IN ('perto','longe'));

CREATE TABLE IF NOT EXISTS flag_episodes (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  band TEXT NOT NULL CHECK (band IN ('verde','amarelo','vermelho')),
  prev_band TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_flag_open ON flag_episodes (client_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_flag_client ON flag_episodes (client_id, started_at DESC);

CREATE TABLE IF NOT EXISTS playbook_steps (
  id SERIAL PRIMARY KEY,
  episode_id INTEGER NOT NULL REFERENCES flag_episodes(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  n INTEGER NOT NULL,
  title TEXT NOT NULL,
  owner TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  every_days INTEGER,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','feito','arquivado')),
  done_at TIMESTAMPTZ,
  done_by TEXT,
  note TEXT NOT NULL DEFAULT '',
  runs INTEGER NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  UNIQUE (episode_id, key)
);
CREATE INDEX IF NOT EXISTS idx_steps_due ON playbook_steps (status, due_at);
CREATE INDEX IF NOT EXISTS idx_steps_client ON playbook_steps (client_id);

CREATE TABLE IF NOT EXISTS learning_records (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  episode_id INTEGER REFERENCES flag_episodes(id) ON DELETE SET NULL,
  what TEXT NOT NULL,
  cause TEXT CHECK (cause IN ('processo','comunicacao','execucao','prazo','analise')),
  why TEXT NOT NULL DEFAULT '',
  who TEXT NOT NULL DEFAULT '',
  learned TEXT NOT NULL DEFAULT '',
  prevention_plan_id INTEGER REFERENCES action_plans(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_learning_client ON learning_records (client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS upsell_opportunities (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  product TEXT NOT NULL,
  rationale TEXT NOT NULL DEFAULT '',
  value DOUBLE PRECISION,
  stage TEXT NOT NULL DEFAULT 'mapeada'
    CHECK (stage IN ('mapeada','repassada','apresentada','negociacao','ganha','perdida')),
  commercial_owner TEXT NOT NULL DEFAULT '',
  updates JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_upsell_client ON upsell_opportunities (client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_diagnostics (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  filled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  filled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_crm_diag_client ON crm_diagnostics (client_id, filled_at DESC);
`;

/**
 * Versão do DDL acima. Mudou o schema? Troque a string — é ela que faz o
 * próximo boot aplicar o DDL de novo.
 */
export const SCHEMA_VERSION = "2026-10-08.playbook";

let migrated = false;

/**
 * Cria/atualiza o schema. Idempotente.
 *
 * Roda no `register()` de cada boot, antes da primeira requisição — então o
 * custo aqui é tempo de cold start. Antes eram ~45 statements em série, um
 * round-trip HTTP cada, e um `ALTER TABLE users` que trava a tabela a cada
 * boot. Agora: uma leitura da versão gravada e, só se ela mudou, o DDL
 * inteiro num único round-trip transacional.
 */
export async function migrate({ force = false }: { force?: boolean } = {}) {
  if (migrated && !force) return;
  if (!force) {
    const current = await one<{ value: string }>(
      "SELECT value FROM settings WHERE key = 'schema_version'",
    ).catch(() => null); // banco novo: a tabela settings ainda não existe
    if (current?.value === SCHEMA_VERSION) {
      migrated = true;
      return;
    }
  }
  const statements = DDL.split(";\n").map((s) => s.trim()).filter(Boolean);
  statements.push(
    `INSERT INTO settings (key, value, updated_at) VALUES ('schema_version', '${JSON.stringify(SCHEMA_VERSION)}'::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()`,
  );
  await (await driver()).batch(statements);
  migrated = true;
}
