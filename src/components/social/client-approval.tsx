"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Post, PostStatus, Project } from "@/lib/social/types";
import InstagramPreview from "@/components/social/instagram-preview";
import { MediaView } from "@/components/social/media";
import { StoryViewer, type StoryControls, type StoryItem } from "@/components/social/story-viewer";
import { FormatIcon, FormatTag, StoryTray, VerticalPreview } from "@/components/social/vertical-preview";
import { formatBadge, isVertical } from "@/lib/social/media";

type View = "cards" | "grid" | "list";
const SWIPE_THRESHOLD = 110;

type Viewer = { ids: string[]; start: number };
type ToastAction = { label: string; run: () => void };

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
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [toast, setToast] = useState<{ msg: string; actions: ToastAction[] } | null>(null);
  const [rejectionReview, setRejectionReview] = useState(false);

  const handle = "@" + project.igHandle;

  const undoStack = useRef<{ id: string; prev: PostStatus; prevFeedback?: string }[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const decided = posts.filter((p) => p.status !== "pending").length;
  const approved = posts.filter((p) => p.status === "approved").length;
  const rejected = posts.filter((p) => p.status === "rejected").length;
  const total = posts.length;

  const sorted = useMemo(() => [...posts].sort((a, b) => a.order - b.order), [posts]);
  const pendingDeck = useMemo(() => sorted.filter((p) => p.status === "pending"), [sorted]);
  const stories = useMemo(() => sorted.filter((p) => p.format === "story"), [sorted]);
  const rejectedPosts = useMemo(() => sorted.filter((p) => p.status === "rejected"), [sorted]);

  const allDecided = total > 0 && decided === total;
  // Terminou de avaliar tudo e reprovou alguma arte: abre uma vez o popup
  // para o cliente justificar as reprovas (reabre se ele voltar algo p/ pendente
  // e concluir de novo).
  const prompted = useRef(false);
  useEffect(() => {
    if (allDecided && rejected > 0 && !prompted.current) {
      prompted.current = true;
      setRejectionReview(true);
    }
    if (!allDecided) prompted.current = false;
  }, [allDecided, rejected]);

  function saveRejectionFeedback(drafts: Record<string, string>) {
    for (const [id, text] of Object.entries(drafts)) {
      const post = posts.find((p) => p.id === id);
      const value = text.trim() || undefined;
      if (post && post.status === "rejected" && (post.feedback ?? "") !== (value ?? "")) {
        applyStatus(id, "rejected", value);
      }
    }
    setRejectionReview(false);
  }

  const flashToast = useCallback((msg: string, actions: ToastAction[] = [], ms = 4000) => {
    setToast({ msg, actions });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  /**
   * Grava a decisão. A tela já mudou (otimista); se a gravação falhar, a
   * tela volta ao estado anterior e o cliente vê o aviso com "Tentar de
   * novo" — antes o erro era engolido e a decisão se perdia sem ninguém saber.
   */
  function applyStatus(postId: string, status: PostStatus, feedback?: string) {
    const before = posts.find((p) => p.id === postId);
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              status,
              decidedAt: status === "pending" ? null : new Date().toISOString(),
              feedback: status === "pending" ? undefined : feedback,
            }
          : p,
      ),
    );
    void (async () => {
      try {
        const res = await fetch(`/api/g/${token}/decision`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId, status, feedback }),
        });
        if (!res.ok) throw new Error(String(res.status));
      } catch {
        if (before) setPosts((prev) => prev.map((p) => (p.id === postId ? before : p)));
        flashToast(
          "Não foi possível salvar sua decisão. Verifique a conexão.",
          [{ label: "Tentar de novo", run: () => applyStatus(postId, status, feedback) }],
          9000,
        );
      }
    })();
  }

  function decide(postId: string, status: Exclude<PostStatus, "pending">, feedback?: string) {
    const post = posts.find((p) => p.id === postId);
    undoStack.current.push({ id: postId, prev: post?.status ?? "pending", prevFeedback: post?.feedback });
    applyStatus(postId, status, feedback);
    const actions: ToastAction[] = [{ label: "Desfazer", run: undo }];
    // Reprovou sem dizer o motivo: um toque para explicar à equipe.
    if (status === "rejected" && !feedback) actions.unshift({ label: "Comentar", run: () => setDetailId(postId) });
    flashToast(status === "approved" ? "Aprovado" : "Reprovado", actions, status === "rejected" && !feedback ? 6000 : 4000);
  }

  function undo() {
    const last = undoStack.current.pop();
    if (!last) return;
    applyStatus(last.id, last.prev, last.prevFeedback);
    setToast(null);
  }

  const openViewer = (list: Post[], start: number) => setViewer({ ids: list.map((p) => p.id), start });
  const openPost = (p: Post) => {
    if (p.format === "story") openViewer(stories, stories.findIndex((s) => s.id === p.id));
    else openViewer([p], 0);
  };

  const viewerItems: StoryItem[] = useMemo(
    () =>
      viewer
        ? viewer.ids
            .map((id) => posts.find((p) => p.id === id))
            .filter((p): p is Post => Boolean(p))
            .map((p) => ({ id: p.id, format: p.format, assets: p.assets, caption: p.caption || undefined, status: p.status }))
        : [],
    [viewer, posts],
  );

  const detailPost = detailId ? posts.find((p) => p.id === detailId) : null;

  return (
    <div className="app-shell">
      <header className="topbar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="topbar__logo" src="/brand/v4-simbolo.webp" alt="V4" />
        <div className="grow">
          <div className="topbar__title">{project.title}</div>
          <div className="topbar__sub">{project.clientName} · aprovação de criativos</div>
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

        {stories.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <StoryTray stories={stories} onOpen={(i) => openViewer(stories, i)} />
          </div>
        )}

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
          onOpen={openPost}
          onUndo={undo}
          canUndo={undoStack.current.length > 0}
          allDone={total > 0 && pendingDeck.length === 0}
          approved={approved}
          rejected={rejected}
        />
      )}

      {view === "grid" && <GridView posts={sorted} onOpen={setDetailId} />}

      {view === "list" && <ListView posts={sorted} onOpen={setDetailId} />}

      {detailPost && (
        <DetailSheet
          post={detailPost}
          handle={handle}
          onClose={() => setDetailId(null)}
          onExpand={() => openPost(detailPost)}
          onDecide={(status, feedback) => decide(detailPost.id, status, feedback)}
          onReset={() => applyStatus(detailPost.id, "pending")}
        />
      )}

      {rejectionReview && rejectedPosts.length > 0 && (
        <RejectionReview
          posts={rejectedPosts}
          onClose={() => setRejectionReview(false)}
          onSave={saveRejectionFeedback}
        />
      )}

      {viewer && viewerItems.length > 0 && (
        <StoryViewer
          items={viewerItems}
          startIndex={viewer.start}
          handle={handle}
          holdOnPending
          onClose={() => setViewer(null)}
          renderFooter={(item, controls) => (
            <ViewerDecision
              key={item.id}
              item={item}
              controls={controls}
              onDecide={(status, feedback) => {
                decide(item.id, status, feedback);
                controls.resume();
                controls.nextItem();
              }}
              onReset={() => applyStatus(item.id, "pending")}
            />
          )}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.msg}</span>
          {toast.actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                setToast(null);
                a.run();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Decisão dentro do viewer de Stories ---------------- */
function ViewerDecision({
  item,
  controls,
  onDecide,
  onReset,
}: {
  item: StoryItem;
  controls: StoryControls;
  onDecide: (status: Exclude<PostStatus, "pending">, feedback?: string) => void;
  onReset: () => void;
}) {
  const [commenting, setCommenting] = useState(false);
  const [text, setText] = useState("");

  if (item.status && item.status !== "pending" && !commenting) {
    return (
      <div className="story-decided">
        <span className={item.status === "approved" ? "is-ok" : "is-no"}>
          {item.status === "approved" ? "Você aprovou este " : "Você reprovou este "}
          {item.format === "reels" ? "Reels" : "Story"}
        </span>
        <button type="button" onClick={onReset}>
          Mudar decisão
        </button>
      </div>
    );
  }

  if (commenting) {
    return (
      <div className="story-comment">
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="O que precisa mudar? Ex.: frame 2, trocar o texto do preço."
          maxLength={1000}
        />
        <div className="story-decision">
          <button
            type="button"
            className="is-ghost"
            onClick={() => {
              setCommenting(false);
              controls.resume();
            }}
          >
            Voltar
          </button>
          <button
            type="button"
            className="is-no"
            onClick={() => {
              setCommenting(false);
              onDecide("rejected", text.trim() || undefined);
            }}
          >
            Reprovar com comentário
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="story-decision">
      <button
        type="button"
        className="is-no"
        onClick={() => {
          controls.pause();
          setCommenting(true);
        }}
      >
        <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>
        Reprovar
      </button>
      <button type="button" className="is-ok" onClick={() => onDecide("approved")}>
        <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
        Aprovar
      </button>
    </div>
  );
}

/* ---------------- Revisão das reprovas (popup ao concluir) ---------------- */
function RejectionReview({
  posts,
  onClose,
  onSave,
}: {
  posts: Post[];
  onClose: () => void;
  onSave: (drafts: Record<string, string>) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(posts.map((p) => [p.id, p.feedback ?? ""])),
  );

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grip" />
        <h3 style={{ margin: 0 }}>Por que reprovou?</h3>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Você reprovou {posts.length} {posts.length === 1 ? "arte" : "artes"}. Diga rapidinho o que precisa mudar em
          cada uma — assim a equipe já refaz certo.
        </p>

        <div className="reject-list">
          {posts.map((p) => (
            <div key={p.id} className="reject-item">
              <div className={`list-thumb ${isVertical(p) ? "list-thumb--vertical" : ""}`}>
                {p.assets[0] && <MediaView asset={p.assets[0]} sizes="52px" />}
              </div>
              <div className="grow">
                <div className="reject-item__head">
                  <FormatTag badge={formatBadge(p)} />
                  <span className="muted">#{p.order + 1}</span>
                </div>
                <textarea
                  className="textarea"
                  placeholder={
                    p.format === "story"
                      ? "Ex.: frame 2, trocar o texto do preço…"
                      : "Ex.: trocar a cor do fundo, ajustar o texto…"
                  }
                  value={drafts[p.id] ?? ""}
                  maxLength={1000}
                  onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="sheet__row">
          <button className="btn ghost block" onClick={onClose}>
            Agora não
          </button>
          <button className="btn primary block" onClick={() => onSave(drafts)}>
            Enviar justificativas
          </button>
        </div>
      </div>
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
  onOpen,
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
  onOpen: (p: Post) => void;
  onUndo: () => void;
  canUndo: boolean;
  allDone: boolean;
  approved: number;
  rejected: number;
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [leaving, setLeaving] = useState<null | "left" | "right">(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

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
    // Botões dentro do card (expandir) não iniciam arrasto.
    if ((e.target as HTMLElement).closest("button")) return;
    setDragging(true);
    start.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !start.current) return;
    setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y });
  };
  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
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
                <svg className="icon" style={{ width: 46, height: 46, stroke: "var(--v4-green)" }} viewBox="0 0 24 24">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <h3>Tudo avaliado!</h3>
                <p className="muted">
                  {approved} aprovados · {rejected} reprovados. Você pode revisar nas visões de grade ou lista e
                  ajustar se precisar.
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
                <p className="muted">Assim que a equipe subir as artes, elas aparecem aqui.</p>
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
  const topVertical = isVertical(top);

  return (
    <div className="deck-wrap">
      <div className="deck">
        {deck.slice(0, 3).map((post, i) => {
          const isTop = i === 0;
          const vertical = isVertical(post);
          const transform = isTop
            ? leaving
              ? `translateX(${leaving === "right" ? 150 : -150}%) rotate(${leaving === "right" ? 20 : -20}deg)`
              : `translate(${drag.x}px, ${drag.y}px) rotate(${rot}deg)`
            : `scale(${1 - i * 0.04}) translateY(${i * 10}px)`;
          return (
            <div
              key={post.id}
              className="deck-card"
              style={{
                transform,
                transition: isTop && dragging ? "none" : "transform 220ms var(--ease-out)",
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
              <div className={`deck-card__inner ${vertical ? "deck-card__inner--vertical" : ""}`}>
                {vertical ? (
                  <VerticalPreview
                    format={post.format}
                    assets={post.assets}
                    caption={post.caption}
                    handle={handle}
                    interactive={isTop && drag.x === 0}
                    playing={isTop}
                    priority={i < 2}
                    onExpand={isTop ? () => onOpen(post) : undefined}
                  />
                ) : (
                  <InstagramPreview
                    handle={handle}
                    assets={post.assets}
                    caption={post.caption}
                    interactive={isTop && drag.x === 0}
                    priority={i < 2}
                  />
                )}
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
          aria-label="Desfazer última avaliação"
          title="Desfazer última avaliação"
          style={{ opacity: canUndo ? 1 : 0.4 }}
        >
          <svg viewBox="0 0 24 24">
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h11a6 6 0 0 1 0 12h-4" />
          </svg>
          <span className="circle-btn__label">Desfazer</span>
        </button>
        <button className="circle-btn no big" onClick={() => commit("left", top.id)} aria-label="Reprovar">
          <svg viewBox="0 0 24 24">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <button className="circle-btn yes big" onClick={() => commit("right", top.id)} aria-label="Aprovar">
          <svg viewBox="0 0 24 24">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>
      </div>
      <p className="hint" style={{ textAlign: "center" }}>
        {topVertical
          ? top.format === "story"
            ? "Toque nas bordas para passar os frames · toque no centro para assistir em tela cheia"
            : "Toque no vídeo para assistir em tela cheia"
          : "Arraste para o lado ou use os botões · toque na arte para ver o carrossel"}
      </p>
    </div>
  );
}

/* ---------------- Grid view ---------------- */
function GridView({ posts, onOpen }: { posts: Post[]; onOpen: (id: string) => void }) {
  return (
    <div className="grid-view">
      {posts.map((p) => {
        const badge = formatBadge(p);
        return (
          <div key={p.id} className={`grid-cell is-${p.status}`} onClick={() => onOpen(p.id)}>
            {p.assets[0] ? <MediaView asset={p.assets[0]} sizes="(max-width: 480px) 33vw, 160px" /> : <div className="ig__placeholder" />}
            {badge !== "post" && (
              <span className={`grid-cell__fmt fmt-tag--${badge}`} title={badge}>
                <FormatIcon badge={badge} />
              </span>
            )}
            <div className="grid-cell__status">
              <span className={`dot ${p.status}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- List view ---------------- */
const STATUS_LABEL: Record<PostStatus, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Reprovado",
};

function ListView({ posts, onOpen }: { posts: Post[]; onOpen: (id: string) => void }) {
  return (
    <div className="list-view">
      {posts.map((p) => (
        <div key={p.id} className={`list-row is-${p.status}`} onClick={() => onOpen(p.id)}>
          <div className={`list-thumb ${isVertical(p) ? "list-thumb--vertical" : ""}`}>
            {p.assets[0] && <MediaView asset={p.assets[0]} sizes="52px" />}
          </div>
          <div className="list-body">
            <div style={{ marginBottom: 3 }}>
              <FormatTag badge={formatBadge(p)} />
            </div>
            <div className="cap">{p.caption ? p.caption.replace(/\n/g, " ") : "— sem legenda —"}</div>
            <div className="meta">
              #{p.order + 1} · {p.assets.length} {p.format === "story" ? "frame" : "arte"}
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
  onExpand,
  onDecide,
  onReset,
}: {
  post: Post;
  handle: string;
  onClose: () => void;
  onExpand: () => void;
  onDecide: (status: Exclude<PostStatus, "pending">, feedback?: string) => void;
  onReset: () => void;
}) {
  const [feedback, setFeedback] = useState(post.feedback ?? "");
  const vertical = isVertical(post);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grip" />
        {vertical ? (
          <div style={{ maxWidth: 260, margin: "0 auto" }}>
            <VerticalPreview format={post.format} assets={post.assets} caption={post.caption} handle={handle} onExpand={onExpand} />
          </div>
        ) : (
          <InstagramPreview handle={handle} assets={post.assets} caption={post.caption} />
        )}

        <div className="row between" style={{ marginTop: 14 }}>
          <div className="row" style={{ gap: 8 }}>
            <FormatTag badge={formatBadge(post)} />
            <span className={`badge ${post.status}`}>
              <i />
              {STATUS_LABEL[post.status]}
            </span>
          </div>
          {post.status !== "pending" && (
            <button className="btn ghost sm" onClick={onReset}>
              Voltar p/ pendente
            </button>
          )}
        </div>
        {post.format === "story" && post.caption && (
          <p className="hint" style={{ marginTop: 10 }}>
            Observação da equipe: {post.caption}
          </p>
        )}

        <div className="field" style={{ marginTop: 14 }}>
          <label>Comentário para a equipe (opcional)</label>
          <textarea
            className="textarea"
            placeholder={post.format === "story" ? "Ex.: frame 2, trocar o texto do preço…" : "Ex.: trocar a cor do fundo, ajustar o texto…"}
            value={feedback}
            maxLength={1000}
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
              onDecide("approved", feedback.trim() || undefined);
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
