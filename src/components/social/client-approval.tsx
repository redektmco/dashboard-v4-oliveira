"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Post, PostStatus, Project } from "@/lib/social/types";
import InstagramPreview from "@/components/social/instagram-preview";

type View = "cards" | "grid" | "list";
const SWIPE_THRESHOLD = 110;

export default function ClientApproval({
  token,
  project,
  initialPosts,
}: {
  token: string;
  project: Pick<Project, "id" | "title" | "clientName" | "igHandle">;
  initialPosts: Post[];
}) {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [view, setView] = useState<View>("cards");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Estado (não ref): o botão "Desfazer" precisa re-renderizar quando a
  // pilha muda — ler `.current` durante o render não é seguro (nem
  // garantidamente reativo) e o linter de hooks já marca isso como erro.
  const [undoStack, setUndoStack] = useState<{ id: string; prev: PostStatus }[]>([]);

  const handle = "@" + project.igHandle;

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const decided = posts.filter((p) => p.status !== "pending").length;
  const approved = posts.filter((p) => p.status === "approved").length;
  const rejected = posts.filter((p) => p.status === "rejected").length;
  const total = posts.length;

  const pendingDeck = useMemo(
    () =>
      posts
        .filter((p) => p.status === "pending")
        .sort((a, b) => a.order - b.order),
    [posts],
  );

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const sendDecision = useCallback(
    async (postId: string, status: PostStatus, feedback?: string) => {
      try {
        await fetch(`/api/g/${token}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId, status, feedback }),
        });
      } catch {
        /* UI otimista; ignora erro transitório de rede */
      }
    },
    [token],
  );

  const applyStatus = useCallback(
    (postId: string, status: PostStatus, feedback?: string) => {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                status,
                decidedAt: status === "pending" ? null : new Date().toISOString(),
                feedback: status === "rejected" ? feedback : undefined,
              }
            : p,
        ),
      );
      void sendDecision(postId, status, feedback);
    },
    [sendDecision],
  );

  const decide = useCallback(
    (postId: string, status: Exclude<PostStatus, "pending">, feedback?: string) => {
      const post = posts.find((p) => p.id === postId);
      setUndoStack((prev) => [...prev, { id: postId, prev: post?.status ?? "pending" }]);
      applyStatus(postId, status, feedback);
      flashToast(status === "approved" ? "Aprovado" : "Reprovado");
    },
    [posts, applyStatus, flashToast],
  );

  const undo = useCallback(() => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((prev) => prev.slice(0, -1));
    applyStatus(last.id, last.prev);
    setToast(null);
  }, [undoStack, applyStatus]);

  const detailPost = detailId ? posts.find((p) => p.id === detailId) : null;

  return (
    <div className="app-shell">
      <header className="topbar">
        <img className="topbar__logo" src="/brand/v4-simbolo.webp" alt="V4" />
        <div className="grow">
          <div className="topbar__title">{project.title}</div>
          <div className="topbar__sub">
            {project.clientName} · aprovação de criativos
          </div>
        </div>
      </header>

      <div className="pad" style={{ paddingBottom: 0 }}>
        <div className="progress-row">
          <span>
            {decided} de {total} avaliados
          </span>
          <span>
            <span style={{ color: "var(--v4-green)" }}>{approved} aprov.</span>
            {"  ·  "}
            <span style={{ color: "var(--accent)" }}>{rejected} reprov.</span>
          </span>
        </div>
        <div className="progress" aria-hidden>
          <i style={{ width: `${total ? (decided / total) * 100 : 0}%` }} />
        </div>

        <div className="segmented" style={{ marginTop: 14 }} role="tablist">
          <SegBtn on={view === "cards"} onClick={() => setView("cards")} label="Cards">
            <path d="M4 5h16v14H4z" />
          </SegBtn>
          <SegBtn on={view === "grid"} onClick={() => setView("grid")} label="Grade">
            <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />
          </SegBtn>
          <SegBtn on={view === "list"} onClick={() => setView("list")} label="Lista">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </SegBtn>
        </div>
      </div>

      {view === "cards" && (
        <CardDeck
          deck={pendingDeck}
          handle={handle}
          onApprove={(id) => decide(id, "approved")}
          onReject={(id) => decide(id, "rejected")}
          onUndo={undo}
          canUndo={undoStack.length > 0}
          allDone={total > 0 && pendingDeck.length === 0}
          approved={approved}
          rejected={rejected}
        />
      )}

      {view === "grid" && <GridView posts={posts} onOpen={setDetailId} />}

      {view === "list" && <ListView posts={posts} handle={handle} onOpen={setDetailId} />}

      {detailPost && (
        <DetailSheet
          post={detailPost}
          handle={handle}
          onClose={() => setDetailId(null)}
          onDecide={(status, feedback) => {
            decide(detailPost.id, status, feedback);
          }}
          onReset={() => applyStatus(detailPost.id, "pending")}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          {undoStack.length > 0 && (
            <button type="button" onClick={undo}>
              Desfazer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Segmented button ---------------- */
function SegBtn({
  on,
  onClick,
  label,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button className={on ? "on" : ""} onClick={onClick} role="tab" aria-selected={on}>
      <svg viewBox="0 0 24 24">{children}</svg>
      {label}
    </button>
  );
}

/* ---------------- Swipe deck ---------------- */
function CardDeck({
  deck,
  handle,
  onApprove,
  onReject,
  onUndo,
  canUndo,
  allDone,
  approved,
  rejected,
}: {
  deck: Post[];
  handle: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onUndo: () => void;
  canUndo: boolean;
  allDone: boolean;
  approved: number;
  rejected: number;
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [leaving, setLeaving] = useState<null | "left" | "right">(null);
  // Estado, não ref: usado para decidir a transição durante o render
  // (sem transição enquanto o dedo arrasta o card, com transição ao soltar).
  const [isDragging, setIsDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const top = deck[0];

  const commit = (dir: "left" | "right", id: string) => {
    setLeaving(dir);
    setTimeout(() => {
      setLeaving(null);
      setDrag({ x: 0, y: 0 });
      if (dir === "right") onApprove(id);
      else onReject(id);
    }, 220);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (leaving) return;
    setIsDragging(true);
    start.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y });
  };
  const onPointerUp = () => {
    if (!start.current) return;
    start.current = null;
    setIsDragging(false);
    if (!top) return;
    if (drag.x > SWIPE_THRESHOLD) commit("right", top.id);
    else if (drag.x < -SWIPE_THRESHOLD) commit("left", top.id);
    else setDrag({ x: 0, y: 0 });
  };

  if (allDone || !top) {
    return (
      <div className="deck-wrap">
        <div className="deck">
          <div className="deck-empty">
            {allDone ? (
              <>
                <svg
                  className="icon"
                  style={{ width: 46, height: 46, stroke: "var(--v4-green)" }}
                  viewBox="0 0 24 24"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <h3>Tudo avaliado!</h3>
                <p className="muted">
                  {approved} aprovados · {rejected} reprovados. Você pode revisar
                  nas visões de grade ou lista e ajustar se precisar.
                </p>
                {canUndo && (
                  <button className="btn secondary" onClick={onUndo}>
                    Desfazer última
                  </button>
                )}
              </>
            ) : (
              <>
                <h3>Nenhum criativo ainda</h3>
                <p className="muted">
                  Assim que a equipe subir as artes, elas aparecem aqui.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const rot = drag.x / 18;
  const stampYes = Math.max(0, Math.min(1, drag.x / SWIPE_THRESHOLD));
  const stampNo = Math.max(0, Math.min(1, -drag.x / SWIPE_THRESHOLD));

  return (
    <div className="deck-wrap">
      <div className="deck">
        {deck.slice(0, 3).map((post, i) => {
          const isTop = i === 0;
          const transform = isTop
            ? leaving
              ? `translateX(${leaving === "right" ? 150 : -150}%) rotate(${
                  leaving === "right" ? 20 : -20
                }deg)`
              : `translate(${drag.x}px, ${drag.y}px) rotate(${rot}deg)`
            : `scale(${1 - i * 0.04}) translateY(${i * 10}px)`;
          return (
            <div
              key={post.id}
              className="deck-card"
              style={{
                transform,
                transition:
                  isTop && isDragging
                    ? "none"
                    : "transform 220ms var(--ease-out)",
                zIndex: 10 - i,
                opacity: i > 1 ? 0.6 : 1,
              }}
              onPointerDown={isTop ? onPointerDown : undefined}
              onPointerMove={isTop ? onPointerMove : undefined}
              onPointerUp={isTop ? onPointerUp : undefined}
              onPointerCancel={isTop ? onPointerUp : undefined}
            >
              {isTop && (
                <>
                  <div className="deck-stamp yes" style={{ opacity: stampYes }}>
                    Aprovar
                  </div>
                  <div className="deck-stamp no" style={{ opacity: stampNo }}>
                    Reprovar
                  </div>
                </>
              )}
              <div className="deck-card__inner">
                <InstagramPreview
                  handle={handle}
                  assets={post.assets}
                  caption={post.caption}
                  interactive={isTop && drag.x === 0}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="deck-actions">
        <button
          className="circle-btn undo"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Desfazer"
          style={{ opacity: canUndo ? 1 : 0.4 }}
        >
          <svg viewBox="0 0 24 24">
            <path d="M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 8" />
          </svg>
        </button>
        <button
          className="circle-btn no big"
          onClick={() => commit("left", top.id)}
          aria-label="Reprovar"
        >
          <svg viewBox="0 0 24 24">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <button
          className="circle-btn yes big"
          onClick={() => commit("right", top.id)}
          aria-label="Aprovar"
        >
          <svg viewBox="0 0 24 24">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>
      </div>
      <p className="hint" style={{ textAlign: "center" }}>
        Arraste para o lado ou use os botões · toque na arte para ver o carrossel
      </p>
    </div>
  );
}

/* ---------------- Grid view ---------------- */
function GridView({
  posts,
  onOpen,
}: {
  posts: Post[];
  onOpen: (id: string) => void;
}) {
  const sorted = [...posts].sort((a, b) => a.order - b.order);
  return (
    <div className="grid-view">
      {sorted.map((p) => (
        <div
          key={p.id}
          className={`grid-cell is-${p.status}`}
          onClick={() => onOpen(p.id)}
        >
          {p.assets[0] ? (
            <img src={p.assets[0].url} alt={p.caption.slice(0, 40)} />
          ) : (
            <div className="ig__placeholder" />
          )}
          <div className="grid-cell__status">
            <span className={`dot ${p.status}`} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- List view ---------------- */
const STATUS_LABEL: Record<PostStatus, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Reprovado",
};

function ListView({
  posts,
  onOpen,
}: {
  posts: Post[];
  handle: string;
  onOpen: (id: string) => void;
}) {
  const sorted = [...posts].sort((a, b) => a.order - b.order);
  return (
    <div className="list-view">
      {sorted.map((p) => (
        <div
          key={p.id}
          className={`list-row is-${p.status}`}
          onClick={() => onOpen(p.id)}
        >
          <div className="list-thumb">
            {p.assets[0] && <img src={p.assets[0].url} alt="" />}
          </div>
          <div className="list-body">
            <div className="cap">
              {p.caption ? p.caption.replace(/\n/g, " ") : "— sem legenda —"}
            </div>
            <div className="meta">
              #{p.order + 1} · {p.assets.length} arte
              {p.assets.length > 1 ? "s" : ""}
            </div>
          </div>
          <span className={`badge ${p.status}`}>
            <i />
            {STATUS_LABEL[p.status]}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Detail sheet ---------------- */
function DetailSheet({
  post,
  handle,
  onClose,
  onDecide,
  onReset,
}: {
  post: Post;
  handle: string;
  onClose: () => void;
  onDecide: (status: Exclude<PostStatus, "pending">, feedback?: string) => void;
  onReset: () => void;
}) {
  const [feedback, setFeedback] = useState(post.feedback ?? "");
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grip" />
        <InstagramPreview handle={handle} assets={post.assets} caption={post.caption} />

        <div className="row between" style={{ marginTop: 14 }}>
          <span className={`badge ${post.status}`}>
            <i />
            {STATUS_LABEL[post.status]}
          </span>
          {post.status !== "pending" && (
            <button className="btn ghost sm" onClick={onReset}>
              Voltar p/ pendente
            </button>
          )}
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>Comentário para a equipe (opcional)</label>
          <textarea
            className="textarea"
            placeholder="Ex.: trocar a cor do fundo, ajustar o texto…"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </div>

        <div className="sheet__row">
          <button
            className="btn secondary block"
            onClick={() => {
              onDecide("rejected", feedback.trim() || undefined);
              onClose();
            }}
          >
            Reprovar
          </button>
          <button
            className="btn primary block"
            onClick={() => {
              onDecide("approved");
              onClose();
            }}
          >
            Aprovar
          </button>
        </div>
      </div>
    </div>
  );
}
