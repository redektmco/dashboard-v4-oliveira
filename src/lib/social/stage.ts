// ============================================================
// Estágio do criativo na tela de Criativos.
//
// O banco guarda quatro estados (draft/pending/approved/rejected).
// A tela mostra cinco, porque "reprovado" tem dois significados bem
// diferentes para quem vai refazer a arte:
//
//   rejected + comentário  → "Ajustes solicitados" (o cliente disse o que mudar)
//   rejected sem comentário → "Reprovado" (cai fora, sem conversa)
//
// Separar os dois é o que faz a fila de trabalho ter sentido: um pede
// retrabalho guiado, o outro pede decisão. Não é estado novo no banco —
// é leitura do mesmo dado.
// ============================================================
import type { Post, PostStatus } from "./types";

/**
 * Derivado de PostStatus de propósito: um estado novo no banco vira erro de
 * compilação aqui até alguém decidir como ele aparece na tela.
 */
export type Stage = PostStatus | "changes";

export const stageOf = (p: Pick<Post, "status" | "feedback">): Stage =>
  p.status === "rejected" ? (p.feedback?.trim() ? "changes" : "rejected") : p.status;

type StageStyle = {
  label: string;
  /** Rótulo curto para os chips de filtro. */
  chip: string;
  /** Classe do badge (fundo + texto). */
  badge: string;
  /** Classe do pontinho colorido. */
  dot: string;
  /** Precisa de ação do time — ganha a barra vermelha na linha. */
  urgent: boolean;
};

export const STAGE: Record<Stage, StageStyle> = {
  draft: {
    label: "Rascunho",
    chip: "Rascunhos",
    badge: "bg-ink-800 text-ink-300",
    dot: "bg-ink-500",
    urgent: false,
  },
  pending: {
    label: "Aguardando",
    chip: "Aguardando",
    badge: "bg-amarelo-dim text-amarelo-fg",
    dot: "bg-amarelo",
    urgent: false,
  },
  approved: {
    label: "Aprovado",
    chip: "Aprovados",
    badge: "bg-verde-dim text-verde-fg",
    dot: "bg-verde",
    urgent: false,
  },
  rejected: {
    label: "Reprovado",
    chip: "Reprovados",
    badge: "bg-vermelho-dim text-vermelho-fg",
    dot: "bg-vermelho",
    urgent: true,
  },
  changes: {
    label: "Ajustes solicitados",
    chip: "Ajustes",
    badge: "bg-vermelho-dim text-vermelho-fg",
    dot: "bg-vermelho",
    urgent: true,
  },
};

/** Ordem dos chips de filtro, da esquerda para a direita. */
export const STAGE_ORDER: Stage[] = ["pending", "approved", "rejected", "changes", "draft"];
