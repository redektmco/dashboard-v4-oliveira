"use client";

import { Modal } from "@/components/modal";
import type { Post } from "@/lib/social/types";

type Entry = { title: string; detail: string; at: string; dot: string };

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

/** Um evento de decisão vira uma linha em português, com a cor do estado. */
function describe(e: Post["history"][number]): Entry {
  const byClient = e.by === "client";
  const who = byClient ? "o cliente" : "a equipe";
  if (e.status === "approved")
    return { title: "Aprovado", detail: `Aprovado por ${who}.`, at: e.at, dot: "bg-verde" };
  if (e.status === "rejected")
    return { title: "Reprovado", detail: `Reprovado por ${who}.`, at: e.at, dot: "bg-vermelho" };
  if (e.status === "draft")
    return { title: "Voltou para rascunho", detail: "Saiu do link do cliente.", at: e.at, dot: "bg-ink-500" };
  return {
    title: "Enviado para aprovação",
    detail: byClient ? "Reaberto pelo cliente." : "A equipe colocou o criativo no link.",
    at: e.at,
    dot: "bg-amarelo",
  };
}

/**
 * Histórico de revisões: a sequência de decisões do criativo, do início ao
 * estado de hoje. Vem de `post.history` — o que aconteceu de verdade, não
 * um resumo reconstruído na tela.
 */
export function HistoryModal({ post, onClose }: { post: Post | null; onClose: () => void }) {
  const entries: Entry[] = post
    ? [
        {
          title: "Criativo criado",
          detail:
            post.assets.length > 1
              ? `${post.assets.length} mídias enviadas pela equipe.`
              : "Mídia enviada pela equipe.",
          at: post.createdAt,
          dot: "bg-ink-600",
        },
        ...post.history.map(describe),
        ...(post.feedback?.trim()
          ? [
              {
                title: "Comentário do cliente",
                detail: post.feedback.trim(),
                at: post.decidedAt ?? post.createdAt,
                dot: "bg-vermelho",
              },
            ]
          : []),
      ]
    : [];

  return (
    <Modal
      open={Boolean(post)}
      onClose={onClose}
      size="sm"
      title="Histórico de revisões"
      description={post?.caption ? post.caption.replace(/\n/g, " ").slice(0, 70) : undefined}
    >
      {entries.length <= 1 ? (
        <p className="py-2 text-[13px] text-ink-400">
          Ainda sem decisões. O histórico começa quando o criativo vai para o link do cliente.
        </p>
      ) : (
        <ol className="flex flex-col">
          {entries.map((e, i) => (
            <li
              key={`${e.title}-${e.at}-${i}`}
              className="flex gap-3 border-b border-[var(--border-hair)] py-3 last:border-0"
            >
              <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${e.dot}`} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-ink-100">{e.title}</div>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-300">{e.detail}</p>
              </div>
              <span className="tnum shrink-0 font-mono text-[11px] text-ink-500">{when(e.at)}</span>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
