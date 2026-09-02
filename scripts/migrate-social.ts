/**
 * Aplica o schema (idempotente) e confirma as tabelas de Social media.
 *
 *   npm run migrate:social
 */
import { all, migrate } from "../src/lib/db";

async function main() {
  await migrate();
  const rows = await all<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('sm_projects','sm_posts')
     ORDER BY table_name`,
  );
  console.log("Tabelas de Social media:", rows.map((r) => r.table_name).join(", ") || "(nenhuma)");

  const roleCheck = await all<{ constraint_name: string }>(
    `SELECT constraint_name FROM information_schema.check_constraints
     WHERE constraint_name = 'users_role_check'`,
  );
  console.log("Constraint de role:", roleCheck.length ? "atualizada (inclui 'social')" : "não encontrada");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
