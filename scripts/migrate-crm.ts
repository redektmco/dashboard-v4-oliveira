/**
 * Aplica o schema (idempotente) e confirma as tabelas de Integrações (CRM).
 *
 *   npm run migrate:crm
 */
import { all, migrate } from "../src/lib/db";

async function main() {
  await migrate({ force: true });
  const rows = await all<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('crm_integrations','crm_leads')
     ORDER BY table_name`,
  );
  console.log("Tabelas de Integrações:", rows.map((r) => r.table_name).join(", ") || "(nenhuma)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
