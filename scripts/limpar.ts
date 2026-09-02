/**
 * Tira da base o que era só demonstração.
 *
 *   npm run limpar               mostra o plano, não altera nada
 *   npm run limpar -- --confirm  executa
 *
 * O que faz:
 *  1. mantém APENAS dois clientes — o de pior e o de melhor score de hoje —
 *     e apaga os demais (as snapshots, metas e planos vão junto por cascade);
 *  2. repassa GT e Account dos dois sobreviventes para quem tem acesso ao
 *     painel, para nenhum cliente ficar apontando para um nome que vai sumir;
 *  3. apaga os usuários sem login — o "time sem acesso", que era só figurante
 *     de seed e aparecia no /usuarios e nos selects de preenchimento;
 *  4. recalcula os últimos 45 dias.
 *
 * É destrutivo e não tem volta: o dry-run é o padrão de propósito.
 */
import { all, migrate, run } from "../src/lib/db";
import { portfolio, recomputeRange } from "../src/lib/repo";

type UserRow = { id: number; name: string; login: string | null; role: string };

async function main() {
  const confirm = process.argv.includes("--confirm");
  await migrate();

  /* ---------- 1. quem fica ---------- */

  const rows = (await portfolio()).filter((r) => r.score.score !== null);
  if (rows.length < 2) throw new Error("carteira com menos de dois clientes pontuados — nada a fazer");

  const ordered = [...rows].sort((a, b) => a.score.score! - b.score.score!);
  const pior = ordered[0];
  const melhor = ordered[ordered.length - 1];
  const manter = [pior.client.id, melhor.client.id];

  const todos = await all<{ id: number; name: string }>("SELECT id, name FROM clients ORDER BY id");
  const remover = todos.filter((c) => !manter.includes(Number(c.id)));

  console.log("MANTER");
  console.log(`  ${String(Math.round(pior.score.score!)).padStart(3)}  ${pior.client.name}  (pior score)`);
  console.log(`  ${String(Math.round(melhor.score.score!)).padStart(3)}  ${melhor.client.name}  (melhor score)`);
  console.log(`\nREMOVER ${remover.length} cliente(s)`);
  for (const c of remover) console.log(`  #${c.id} ${c.name}`);

  /* ---------- 2 e 3. usuários ---------- */

  const users = await all<UserRow>("SELECT id, name, login, role FROM users ORDER BY id");
  const comAcesso = users.filter((u) => u.login);
  const semAcesso = users.filter((u) => !u.login);

  if (!comAcesso.length)
    throw new Error("ninguém tem login: apagar o time sem acesso deixaria a base sem usuário");

  const novoGt = comAcesso.find((u) => u.role === "gt") ?? comAcesso[0];
  const novoAcc = comAcesso.find((u) => u.role === "account") ?? comAcesso[comAcesso.length - 1];

  console.log(`\nREMOVER ${semAcesso.length} usuário(s) sem acesso`);
  for (const u of semAcesso) console.log(`  #${u.id} ${u.name} (${u.role})`);
  console.log(`\nREATRIBUIR os dois clientes → GT ${novoGt.name} · Account ${novoAcc.name}`);
  console.log("  (o histórico de 'preenchido por' desses usuários vira '—')");

  if (!confirm) {
    console.log("\nDry-run. Nada foi alterado. Rode com --confirm para executar.");
    return;
  }

  /* ---------- execução ---------- */

  if (remover.length) {
    await run(
      `DELETE FROM clients WHERE id NOT IN (${manter.map(() => "?").join(", ")})`,
      manter,
    );
  }

  await run(
    `UPDATE clients SET gt_user_id = ?, account_user_id = ? WHERE id IN (${manter
      .map(() => "?")
      .join(", ")})`,
    [novoGt.id, novoAcc.id, ...manter],
  );

  if (semAcesso.length) {
    const ids = semAcesso.map((u) => u.id);
    const marks = ids.map(() => "?").join(", ");
    // `filled_by` é FK sem cascade: solta a referência antes de apagar.
    await run(`UPDATE performance_snapshots SET filled_by = NULL WHERE filled_by IN (${marks})`, ids);
    await run(`UPDATE checkin_snapshots SET filled_by = NULL WHERE filled_by IN (${marks})`, ids);
    await run(`DELETE FROM users WHERE id IN (${marks})`, ids);
  }

  const r = await recomputeRange(45);
  console.log(`\nFeito. ${remover.length} cliente(s) e ${semAcesso.length} usuário(s) removidos.`);
  console.log(`Recompute de 45 dias: ${r.snapshots} score(s) em ${r.clients} cliente(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
