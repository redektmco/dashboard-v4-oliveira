/**
 * Manutenção de acesso fora do painel — útil quando ninguém consegue entrar.
 *
 *   npm run usuarios                  lista quem tem acesso
 *   npm run usuarios -- reset felipe  volta a senha padrão da unidade
 *
 * O boot do app já roda `ensureAdmins` (ver src/instrumentation.ts), então em
 * situação normal este script é só diagnóstico.
 */
import { all, migrate } from "../src/lib/db";
import { ensureAdmins, resetPassword, SENHA_PADRAO } from "../src/lib/auth";

type Row = {
  id: number;
  name: string;
  login: string | null;
  role: string;
  is_admin: number;
  active: number;
};

async function main() {
  await migrate();
  await ensureAdmins();

  const [cmd, arg] = process.argv.slice(2);

  if (cmd === "reset") {
    if (!arg) throw new Error("informe o login: npm run usuarios -- reset felipe");
    const u = await all<Row>("SELECT * FROM users WHERE login = ?", [arg.toLowerCase()]);
    if (!u.length) throw new Error(`login "${arg}" não existe`);
    await resetPassword(u[0].id, SENHA_PADRAO);
    console.log(`senha de ${u[0].name} (${arg}) redefinida para ${SENHA_PADRAO}`);
  }

  const rows = await all<Row>(
    "SELECT id, name, login, role, is_admin, active FROM users ORDER BY is_admin DESC, name",
  );
  for (const r of rows) {
    console.log(
      String(r.id).padStart(3),
      (r.login ?? "(sem acesso)").padEnd(16),
      r.role.padEnd(8),
      r.is_admin ? "admin" : "     ",
      r.active ? "ativo  " : "inativo",
      r.name,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
