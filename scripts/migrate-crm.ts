/**
 * Aplica o schema (idempotente) e confirma as tabelas do CRM.
 *
 *   npm run migrate:crm
 *
 * Em desenvolvimento, aponte para o PGlite antes de rodar contra produção:
 *   DATABASE_URL=pglite://./.data/pglite npx tsx scripts/migrate-crm.ts
 */
import { all, migrate } from "../src/lib/db";

const CLIENT_COLUMNS = ["main_contact", "contact_email", "contact_phone", "checkin_every_days", "stage_override"];
const TABLES = ["crm_integrations", "crm_leads", "client_interactions"];

async function main() {
  await migrate({ force: true });

  const tables = await all<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY(?)
     ORDER BY table_name`,
    [TABLES],
  );
  const columns = await all<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'clients' AND column_name = ANY(?)
     ORDER BY column_name`,
    [CLIENT_COLUMNS],
  );

  const found = tables.map((t) => t.table_name);
  const cols = columns.map((c) => c.column_name);
  console.log("Tabelas do CRM:", found.join(", ") || "(nenhuma)");
  console.log("Colunas novas em clients:", cols.join(", ") || "(nenhuma)");

  const faltando = [
    ...TABLES.filter((t) => !found.includes(t)).map((t) => `tabela ${t}`),
    ...CLIENT_COLUMNS.filter((c) => !cols.includes(c)).map((c) => `coluna clients.${c}`),
  ];
  if (faltando.length) {
    console.error("FALTANDO:", faltando.join(", "));
    process.exit(1);
  }
  console.log("Schema do CRM completo.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
