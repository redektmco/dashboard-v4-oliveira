/**
 * Cria uma sessão de desenvolvimento e imprime o cookie, para abrir o painel
 * local sem passar pela tela de login. Semeia a carteira de demonstração se
 * o banco estiver vazio.
 *
 *   DATABASE_URL=pglite://./.data/pglite npx tsx scripts/dev-session.ts
 *
 * Só funciona fora de produção — recusa rodar contra um banco remoto.
 */
import { randomBytes } from "node:crypto";
import { all, migrate, one, run } from "../src/lib/db";
import { ensureAdmins } from "../src/lib/auth";
import { seedDemo } from "../src/lib/repo";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("pglite:")) {
    console.error("Recusado: este script só roda contra o PGlite local (DATABASE_URL=pglite://./.data/pglite).");
    process.exit(1);
  }

  await migrate();
  await ensureAdmins();

  const [{ n }] = await all<{ n: number }>("SELECT count(*)::int AS n FROM clients");
  if (n === 0) {
    console.log("Banco vazio — semeando a carteira de demonstração…");
    await seedDemo();
  }
  const [{ n: clients }] = await all<{ n: number }>("SELECT count(*)::int AS n FROM clients");

  const me = await one<{ id: number; name: string }>("SELECT id, name FROM users WHERE login = 'felipe'");
  if (!me) {
    console.error("Usuário admin 'felipe' não encontrado.");
    process.exit(1);
  }

  const token = randomBytes(32).toString("hex");
  await run("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, now() + interval '1 day')", [token, me.id]);

  console.log(`clientes no banco: ${clients}`);
  console.log(`COOKIE=v4_sess=${token}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
