/**
 * Roda uma vez por boot do servidor, antes da primeira requisição.
 * Garante que o schema exista — `migrate` é idempotente (CREATE IF NOT EXISTS) —
 * e que Felipe e Michelle já existam como administradores, para que um banco
 * novo nasça com acesso sem depender de script manual.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.DATABASE_URL) return;
  const { migrate } = await import("./lib/db");
  try {
    await migrate();
  } catch (e) {
    console.error("[healthscore] falha ao migrar o schema:", e);
    return;
  }
  try {
    const { ensureAdmins } = await import("./lib/auth");
    await ensureAdmins();
  } catch (e) {
    console.error("[healthscore] falha ao garantir os administradores:", e);
  }
}
