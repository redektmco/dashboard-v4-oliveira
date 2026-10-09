import { all, insert } from "../db";

/**
 * Relacionamento: o que foi conversado com o cliente, datado e com tipo.
 *
 * Alimenta a coluna "Última interação" da listagem e a aba Relacionamento da
 * ficha. É um registro, não um estado: nada aqui é sobrescrito — o mesmo
 * princípio dos snapshots de performance e check-in.
 *
 * Não confundir com `audit_log` (lib/audit.ts), que guarda alterações que
 * NÓS fizemos no cadastro. Aqui é contato com o cliente.
 */

export type InteractionKind =
  | "reuniao"
  | "ligacao"
  | "mensagem"
  | "feedback"
  | "reclamacao"
  | "acordo"
  | "observacao";

export const INTERACTION_LABEL: Record<InteractionKind, string> = {
  reuniao: "Reunião",
  ligacao: "Ligação",
  mensagem: "Mensagem",
  feedback: "Feedback",
  reclamacao: "Reclamação",
  acordo: "Acordo",
  observacao: "Observação",
};

/** Tipos que pioram a leitura da conta — destacados na listagem. */
export const NEGATIVE_KINDS: InteractionKind[] = ["reclamacao"];

export type Interaction = {
  id: number;
  client_id: number;
  at: string;
  kind: InteractionKind;
  channel: string | null;
  title: string;
  note: string;
  user_id: number | null;
  user_name: string | null;
};

const SELECT = `SELECT id, client_id, at::text AS at, kind, channel, title, note, user_id, user_name
                FROM client_interactions`;

export const listInteractions = (clientId: number, limit = 50) =>
  all<Interaction>(`${SELECT} WHERE client_id = ? ORDER BY at DESC, id DESC LIMIT ?`, [clientId, limit]);

export type NewInteraction = {
  clientId: number;
  kind: InteractionKind;
  title: string;
  note?: string;
  channel?: string | null;
  /** Quando aconteceu. Sem isto, agora. */
  at?: string | null;
};

export const addInteraction = (i: NewInteraction, who: { id?: number | null; name?: string | null } | null) =>
  insert(
    `INSERT INTO client_interactions (client_id, at, kind, channel, title, note, user_id, user_name)
     VALUES (?, COALESCE(?::timestamptz, now()), ?, ?, ?, ?, ?, ?) RETURNING id`,
    [i.clientId, i.at ?? null, i.kind, i.channel ?? null, i.title, i.note ?? "", who?.id ?? null, who?.name ?? null],
  );

export const deleteInteraction = (id: number) => all(`DELETE FROM client_interactions WHERE id = ?`, [id]);

/**
 * A última interação de cada cliente, em uma query só — a listagem percorre
 * 40+ contas e não pode fazer uma consulta por linha. Mesmo `DISTINCT ON` de
 * `lastCheckinByClient` em `lib/repo.ts`.
 */
export const lastInteractionByClient = () =>
  all<Interaction>(
    `SELECT DISTINCT ON (client_id) id, client_id, at::text AS at, kind, channel, title, note, user_id, user_name
     FROM client_interactions ORDER BY client_id, at DESC, id DESC`,
  );

/** Quantas interações cada cliente tem — contador da aba Relacionamento. */
export const interactionCounts = () =>
  all<{ client_id: number; n: number }>(
    `SELECT client_id, COUNT(*)::int AS n FROM client_interactions GROUP BY client_id`,
  );
