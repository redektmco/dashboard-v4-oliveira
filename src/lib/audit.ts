import { all, run } from "./db";

/**
 * Log de alterações: o "Últimas alterações" de Configurações e parte do
 * histórico da conta na ficha do cliente. Cada linha já nasce como frase
 * pronta para leitura ("Piso do amarelo 58 → 60"), com quem fez e quando —
 * o log é para gente ler, não para reconstruir estado.
 *
 * Gravar nunca derruba a ação que gerou o registro: se o insert falhar, a
 * alteração em si já aconteceu e é ela que importa.
 */

export type AuditKind =
  | "calibracao"
  | "meta"
  | "cliente"
  | "integracao"
  | "cobranca"
  | "usuario"
  | "plano"
  | "checkin_agendado"
  | "churn";

export type AuditEntry = {
  id: number;
  at: string;
  user_name: string | null;
  kind: AuditKind;
  client_id: number | null;
  text: string;
  data: Record<string, unknown>;
};

export async function logChange(
  who: { id?: number | null; name?: string | null } | null,
  kind: AuditKind,
  text: string,
  opts: { clientId?: number | null; data?: Record<string, unknown> } = {},
) {
  try {
    await run(
      `INSERT INTO audit_log (user_id, user_name, kind, client_id, text, data)
       VALUES (?, ?, ?, ?, ?, ?::jsonb)`,
      [who?.id ?? null, who?.name ?? null, kind, opts.clientId ?? null, text, JSON.stringify(opts.data ?? {})],
    );
  } catch (e) {
    console.error("[audit] falha ao registrar alteração:", e);
  }
}

const SELECT = `SELECT id, at::text AS at, user_name, kind, client_id, text, data FROM audit_log`;

export const listChanges = (limit = 5) =>
  all<AuditEntry>(`${SELECT} ORDER BY at DESC, id DESC LIMIT ?`, [limit]);

export const listClientChanges = (clientId: number, limit = 30) =>
  all<AuditEntry>(`${SELECT} WHERE client_id = ? ORDER BY at DESC, id DESC LIMIT ?`, [clientId, limit]);
