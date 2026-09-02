// ============================================================
// Social media — domínio de aprovação de criativos.
// Portado do protótipo `aprovação-v4`, estendido com o vínculo
// ao cliente da carteira e o ciclo de agendamento/publicação IG.
// ============================================================

export type PostStatus = "pending" | "approved" | "rejected";

/** Estado da publicação automática no Instagram. */
export type PublishStatus =
  | "draft" // ainda não agendado
  | "scheduled" // aprovado e com data/hora definida
  | "publishing" // worker pegou o post e está publicando
  | "published" // publicado com sucesso
  | "failed"; // falhou — ver publish_error

/** Uma arte dentro de um post (imagem; slides de carrossel). */
export interface Asset {
  id: string;
  url: string; // URL pública (Vercel Blob em produção)
  name: string; // nome original do arquivo
  width?: number;
  height?: number;
}

/** Um evento de decisão, guardado para histórico / auditoria do undo. */
export interface DecisionEvent {
  status: PostStatus;
  at: string; // ISO
  by: "client" | "admin";
}

/** Um post = um criativo (uma ou mais artes) + legenda + status. */
export interface Post {
  id: string;
  projectId: string;
  order: number;
  caption: string;
  assets: Asset[];
  status: PostStatus;
  decidedAt: string | null;
  feedback?: string;
  history: DecisionEvent[];
  createdAt: string;
  // Planejamento / publicação
  scheduledAt: string | null;
  publishStatus: PublishStatus;
  publishedAt: string | null;
  igMediaId: string | null;
  publishError: string | null;
}

/** Um projeto = um board de aprovação de um cliente / uma entrega. */
export interface Project {
  id: string;
  clientId: number | null;
  title: string;
  clientName: string;
  guestToken: string;
  igHandle: string;
  archived: boolean;
  igUserId: string | null;
  /** Presença do token — nunca serializamos o valor para o cliente. */
  hasIgToken: boolean;
  createdBy: number | null;
  createdAt: string;
}
