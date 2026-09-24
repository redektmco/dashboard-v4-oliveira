/**
 * Sobe a carteira a partir da planilha de Gestão de Projetos (CSV).
 *   npm run importar:clientes -- caminho/da/planilha.csv
 * Idempotente: reimportar só atualiza. O mesmo import existe no painel em
 * Configurações → Clientes → Importar planilha.
 */
import { readFileSync } from "node:fs";
import { migrate } from "../src/lib/db";
import { parseClientsSheet } from "../src/lib/import/clients-sheet";
import { importClients, recomputeAll } from "../src/lib/repo";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("informe o CSV: npm run importar:clientes -- planilha.csv");
  await migrate();
  const rows = parseClientsSheet(readFileSync(file, "utf8"));
  const r = await importClients(rows);
  await recomputeAll();
  console.log(`${rows.length} cliente(s) na planilha`);
  console.log(`novos (${r.created.length}): ${r.created.join(", ") || "—"}`);
  console.log(`atualizados (${r.updated.length}): ${r.updated.join(", ") || "—"}`);
  if (r.people.length) console.log(`time adicionado: ${r.people.join(", ")}`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
