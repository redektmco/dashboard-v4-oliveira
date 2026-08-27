/**
 * Migra o banco SQLite local (fase self-host) para o Postgres do Neon.
 *
 *   npx dotenv -e .env.local -- npx tsx scripts/migrate-sqlite.ts [caminho.db]
 *
 * Preserva ids, autoria e datas — a série histórica é o ativo do modelo, e o
 * princípio é nunca sobrescrever. Recalcula os scores no final.
 * Idempotente no destino: aborta se já houver clientes gravados.
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { all, migrate, run } from "../src/lib/db";
import { recomputeRange } from "../src/lib/repo";

const src = process.argv[2] ?? path.join(process.cwd(), "data", "healthscore.db");
const db = new DatabaseSync(src, { readOnly: true });
const rows = <T>(sql: string) => db.prepare(sql).all() as T[];

await migrate();

const already = await all<{ n: number }>("SELECT COUNT(*)::int AS n FROM clients");
if (Number(already[0].n) > 0) {
  console.error(
    `Destino já tem ${already[0].n} clientes. Limpe antes (npm run seed) ou migre para um banco vazio.`,
  );
  process.exit(1);
}

/** INSERT em lote, em blocos — cada query é um round-trip HTTP. */
async function bulk(table: string, cols: string[], casts: string[], data: unknown[][]) {
  if (!data.length) return 0;
  const CHUNK = 200;
  for (let i = 0; i < data.length; i += CHUNK) {
    const slice = data.slice(i, i + CHUNK);
    const tuple = `(${casts.join(", ")})`;
    await run(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES ${slice.map(() => tuple).join(", ")}`,
      slice.flat(),
    );
  }
  return data.length;
}

const users = rows<{ id: number; name: string; role: string }>("SELECT * FROM users");
const clients = rows<Record<string, unknown>>("SELECT * FROM clients");
const targets = rows<Record<string, unknown>>("SELECT * FROM client_targets");
const perf = rows<Record<string, unknown>>("SELECT * FROM performance_snapshots");
const chk = rows<Record<string, unknown>>("SELECT * FROM checkin_snapshots");
const plans = rows<Record<string, unknown>>("SELECT * FROM action_plans");
const settings = rows<{ key: string; value: string }>("SELECT * FROM settings");

const n = {
  users: await bulk(
    "users",
    ["id", "name", "role"],
    ["?", "?", "?"],
    users.map((u) => [u.id, u.name, u.role]),
  ),
  clients: await bulk(
    "clients",
    ["id", "name", "account_type", "mrr", "gt_user_id", "account_user_id", "renewal_date", "active"],
    ["?", "?", "?", "?", "?", "?", "?::date", "?"],
    clients.map((c) => [
      c.id,
      c.name,
      c.account_type,
      c.mrr,
      c.gt_user_id,
      c.account_user_id,
      c.renewal_date,
      c.active,
    ]),
  ),
  targets: await bulk(
    "client_targets",
    ["id", "client_id", "key", "value", "effective_from"],
    ["?", "?", "?", "?", "?::date"],
    targets.map((t) => [t.id, t.client_id, t.key, t.value, t.effective_from]),
  ),
  performance: await bulk(
    "performance_snapshots",
    ["id", "client_id", "ref_date", "filled_by", "filled_at", "data"],
    ["?", "?", "?::date", "?", "?::timestamptz", "?::jsonb"],
    perf.map((s) => [s.id, s.client_id, s.ref_date, s.filled_by, s.filled_at, s.data]),
  ),
  checkins: await bulk(
    "checkin_snapshots",
    ["id", "client_id", "ref_date", "filled_by", "filled_at", "data"],
    ["?", "?", "?::date", "?", "?::timestamptz", "?::jsonb"],
    chk.map((s) => [s.id, s.client_id, s.ref_date, s.filled_by, s.filled_at, s.data]),
  ),
  plans: await bulk(
    "action_plans",
    ["id", "client_id", "risk", "plan", "owner", "due_date", "status", "clickup_url"],
    ["?", "?", "?", "?", "?", "?::date", "?", "?"],
    plans.map((p) => [
      p.id,
      p.client_id,
      p.risk,
      p.plan,
      p.owner,
      p.due_date,
      p.status,
      p.clickup_url,
    ]),
  ),
  settings: await bulk(
    "settings",
    ["key", "value"],
    ["?", "?::jsonb"],
    settings.map((s) => [s.key, s.value]),
  ),
};

// Ids vieram explícitos: realinhar as sequences para o próximo INSERT não colidir.
for (const t of ["users", "clients", "client_targets", "performance_snapshots", "checkin_snapshots", "action_plans"]) {
  await run(
    `SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 1))`,
  );
}

const r = await recomputeRange(60);
console.log("Migrado de", src);
console.table(n);
console.log(`Scores recalculados: ${r.snapshots} snapshots de ${r.clients} clientes.`);
