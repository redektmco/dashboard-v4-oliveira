// ============================================================
// Social media — domínio de aprovação de criativos.
// Portado do protótipo `aprovação-v4`, estendido com o vínculo
// ao cliente da carteira, o planejamento em calendário e os
// formatos verticais (Reels e Stories).
// ============================================================

export type PostStatus = "pending" | "approved" | "rejected";

/**
 * Formato do criativo, como o Instagram o publica.
 *  - feed: 1 arte = post; várias = carrossel (derivado da quantidade).
 *  - reels: um vídeo vertical 9:16.
 *  - story: sequência de frames verticais 9:16 (imagem ou vídeo), aprovada
 *    como um conjunto — o comentário do cliente pode apontar o frame.
 */
export type PostFormat = "feed" | "reels" | "story";

/** Estado do planejamento (a postagem no Instagram é manual). */
export type PublishStatus =
  | "draft" // ainda sem data
  | "scheduled" // aprovado e com data no calendário
  | "publishing" // legado do auto-post (descartado)
  | "published" // marcado como publicado
  | "failed"; // legado do auto-post (descartado)

/** Uma mídia dentro de um post (slide de carrossel, frame de story, vídeo do reels). */
export interface Asset {
  id: string;
  url: string; // URL pública (Vercel Blob em produção)
  name: string; // nome original do arquivo
  kind?: "image" | "video";
  contentType?: string;
  width?: number;
  height?: number;
  /** Duração em segundos (vídeo). */
  duration?: number;
  size?: number;
}

/** Um evento de decisão, guardado para histórico / auditoria do undo. */
export interface DecisionEvent {
  status: PostStatus;
  at: string; // ISO
  by: "client" | "admin";
}

/** Um post = um criativo (uma ou mais mídias) + legenda + status. */
export interface Post {
  id: string;
  projectId: string;
  order: number;
  format: PostFormat;
  caption: string;
  assets: Asset[];
  status: PostStatus;
  decidedAt: string | null;
  feedback?: string;
  history: DecisionEvent[];
  createdAt: string;
  // Planejamento
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
