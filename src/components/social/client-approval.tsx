"use client";

import "./client-approval.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import InstagramPreview from "@/components/social/instagram-preview";
import { MediaView } from "@/components/social/media";
import { StoryViewer, type StoryControls, type StoryItem } from "@/components/social/story-viewer";
import { FormatIcon, FormatTag, StoryTray, VerticalPreview } from "@/components/social/vertical-preview";
import { assetKind, FORMAT_LABEL, formatBadge, isVertical } from "@/lib/social/media";
import type { Asset, Post, PostStatus, Project } from "@/lib/social/types";

/**
 * Link de aprovação do cliente.
 *
 * Quatro telas, uma tarefa cada — o cliente nunca precisa decidir onde
 * está o que:
 *  · Início   — quem pediu, quantas artes, o que fazer e o botão que começa.
 *  · Avaliar  — uma arte por vez: arrasta, ou usa os botões grandes.
 *  · Galeria  — todas as artes em grade, filtráveis por situação.
 *  · Lista    — a mesma informação em texto, para quem prefere ler.
 *
 * A navegação é uma barra flutuante; a tela de início a esconde para deixar
 * um único caminho à vista ("Começar").
 */

type Tab = "home" | "deck" | "grid" | "list";
type Filter = "all" | "pending" | "approved" | "rejected";
type Viewer = { ids: string[]; start: number };
type ToastAction = { label: string; run: () => void };

/** Arrasto (em px) a partir do qual o card sai aprovado/reprovado. */
const SWIPE_THRESHOLD = 110;
/** Puxador do "arraste para começar" e a folga dele dentro da trilha. */
const KNOB = 46;
const CTA_PAD = 9;

const STATUS_LABEL: Record<PostStatus, string> = {
  // Rascunho nunca chega aqui (a página filtra antes), mas o mapa é total
  // para o dia em que um estado novo aparecer sem ninguém lembrar desta tela.
  draft: "Pendente",
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Reprovado",
};

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
  const [tab, setTab] = useState<Tab>("home");
  const [filter, setFilter] = useState<Filter>("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [toast, setToast] = useState<{ msg: string; actions: ToastAction[] } | null>(null);
  const [rejectionReview, setRejectionReview] = useState(false);

  const handle = igHandle(project.igHandle);
  const brand = (project.clientName || project.title || "sua marca").trim();

  const undoStack = useRef<{ id: string; prev: PostStatus; prevFeedback?: string }[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = posts.length;
  const approved = posts.filter((p) => p.status === "approved").length;
  const rejected = posts.filter((p) => p.status === "rejected").length;
  const decided = approved + rejected;
  const pending = total - decided;

  const sorted = useMemo(() => [...posts].sort((a, b) => a.order - b.order), [posts]);
  const pendingDeck = useMemo(() => sorted.filter((p) => p.status === "pending"), [sorted]);
  const stories = useMemo(() => sorted.filter((p) => p.format === "story"), [sorted]);
  const rejectedPosts = useMemo(() => sorted.filter((p) => p.status === "rejected"), [sorted]);
  const filtered = useMemo(
    () => (filter === "all" ? sorted : sorted.filter((p) => p.status === filter)),
    [sorted, filter],
  );

  const allDecided = total > 0 && decided === total;
  // Terminou de avaliar tudo e reprovou alguma arte: abre uma vez o popup
  // para o cliente justificar as reprovas (reabre se ele voltar algo p/
  // pendente e concluir de novo).
  const prompted = useRef(false);
  useEffect(() => {
    if (allDecided && rejected > 0 && !prompted.current) {
      prompted.current = true;
      setRejectionReview(true);
    }
    if (!allDecided) prompted.current = false;
  }, [allDecided, rejected]);

  const flashToast = useCallback((msg: string, actions: ToastAction[] = [], ms = 4000) => {
    setToast({ msg, actions });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  useEffect(() => () => void (toastTimer.current && clearTimeout(toastTimer.current)), []);

  /**
   * Grava a decisão. A tela já mudou (otimista); se a gravação falhar, a
   * tela volta ao estado anterior e o cliente vê o aviso com "Tentar de
   * novo" — sem isso o erro é engolido e a decisão se perde sem ninguém saber.
   */
  const applyStatus = useCallback(
    function apply(postId: string, status: PostStatus, feedback?: string) {
      let before: Post | undefined;
      setPosts((prev) => {
        before = prev.find((p) => p.id === postId);
        return prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                status,
                decidedAt: status === "pending" ? null : new Date().toISOString(),
                feedback: status === "pending" ? undefined : feedback,
              }
            : p,
        );
      });
      void (async () => {
        try {
          const res = await fetch(`/api/g/${token}/decision`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ postId, status, feedback }),
          });
          if (!res.ok) throw new Error(String(res.status));
        } catch {
          if (before) setPosts((prev) => prev.map((p) => (p.id === postId ? before! : p)));
          flashToast(
            "Não foi possível salvar sua decisão. Verifique a conexão.",
            [{ label: "Tentar de novo", run: () => apply(postId, status, feedback) }],
            9000,
          );
        }
      })();
    },
    [token, flashToast],
  );

  const undo = useCallback(() => {
    const last = undoStack.current.pop();
    if (!last) return;
    applyStatus(last.id, last.prev, last.prevFeedback);
    setToast(null);
  }, [applyStatus]);

  const decide = useCallback(
    (postId: string, status: Exclude<PostStatus, "pending">, feedback?: string) => {
      const post = posts.find((p) => p.id === postId);
      undoStack.current.push({ id: postId, prev: post?.status ?? "pending", prevFeedback: post?.feedback });
      applyStatus(postId, status, feedback);
      // O motivo da reprova é pedido de uma vez só, no popup do fim da
      // avaliação — aqui basta poder voltar atrás.
      flashToast(status === "approved" ? "Aprovado" : "Reprovado", [{ label: "Desfazer", run: undo }]);
    },
    [posts, applyStatus, undo, flashToast],
  );

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

  const openViewer = (list: Post[], start: number) => setViewer({ ids: list.map((p) => p.id), start });
  const openPost = (p: Post) => {
    if (p.format === "story") openViewer(stories, Math.max(0, stories.findIndex((s) => s.id === p.id)));
    else openViewer([p], 0);
  };

  const viewerItems: StoryItem[] = useMemo(
    () =>
      viewer
        ? viewer.ids
            .map((id) => posts.find((p) => p.id === id))
            .filter((p): p is Post => Boolean(p))
            .map((p) => ({
              id: p.id,
              format: p.format,
              assets: p.assets,
              caption: p.caption || undefined,
              status: p.status,
            }))
        : [],
    [viewer, posts],
  );

  const detailPost = detailId ? posts.find((p) => p.id === detailId) : null;
  const stats = { total, approved, rejected, decided, pending };

  const goReview = () => setTab(pendingDeck.length ? "deck" : "grid");
  const openInGrid = (status: Filter) => {
    setFilter(status);
    setTab("grid");
  };

  return (
    <div className="ap">
      {tab === "home" && (
        <Home
          brand={brand}
          handle={handle}
          posts={sorted}
          stats={stats}
          onStart={goReview}
          onGrid={() => openInGrid("all")}
        />
      )}

      {tab === "deck" && (
        <Deck
          deck={pendingDeck}
          total={total}
          decided={decided}
          approved={approved}
          rejected={rejected}
          handle={handle}
          canUndo={undoStack.current.length > 0}
          onApprove={(id) => decide(id, "approved")}
          onReject={(id) => decide(id, "rejected")}
          onComment={(id) => setDetailId(id)}
          onExpand={openPost}
          onUndo={undo}
          onGrid={() => openInGrid("all")}
        />
      )}

      {tab === "grid" && (
        <Gallery
          posts={filtered}
          stories={stories}
          stats={stats}
          filter={filter}
          onFilter={setFilter}
          onOpen={setDetailId}
          onApprove={(id) => decide(id, "approved")}
          onStories={(i) => openViewer(stories, i)}
        />
      )}

      {tab === "list" && <ListView posts={filtered} filter={filter} onFilter={setFilter} stats={stats} onOpen={setDetailId} />}

      {tab !== "home" && <TabBar tab={tab} pending={stats.pending} onChange={setTab} />}

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
        <div className="ap-toast" role="status">
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

/* ============================ Início ============================ */

type Stats = { total: number; approved: number; rejected: number; decided: number; pending: number };

/**
 * Tela de entrada: diz de quem são as artes, quantas são e o que o cliente
 * precisa fazer. É também o resumo — volta aqui a qualquer momento pela
 * barra de navegação e vê o placar.
 */
function Home({
  brand,
  handle,
  posts,
  stats,
  onStart,
  onGrid,
}: {
  brand: string;
  handle: string;
  posts: Post[];
  stats: Stats;
  onStart: () => void;
  onGrid: () => void;
}) {
  const fan = posts.slice(0, 3);
  const done = stats.total > 0 && stats.pending === 0;
  const cta = stats.total === 0 ? "aguardando artes" : done ? "revisar" : stats.decided ? "continuar" : "começar";

  return (
    <main className="ap-home">
      <div className="ap-home__glow" aria-hidden />
      <div className="ap-home__grid" aria-hidden />

      <header className="ap-home__brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/v4-simbolo.webp" alt="" width={26} height={26} />
        <span>V4 Oliveira &amp; Co</span>
      </header>

      <div className="ap-fan" aria-hidden>
        {fan.map((p, i) => (
          <div key={p.id} className={`ap-fan__card ap-fan__card--${i}`}>
            {p.assets[0] ? (
              <MediaView asset={p.assets[0]} sizes="200px" priority={i === 0} />
            ) : (
              <span className="ap-fan__empty" />
            )}
            <span className="ap-fan__tag">
              <FormatIcon badge={formatBadge(p)} />
            </span>
          </div>
        ))}
        {fan.length === 0 && <div className="ap-fan__card ap-fan__card--0 is-empty" />}
        <span className="ap-fan__bubble ap-fan__bubble--no">
          <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </span>
        <span className="ap-fan__bubble ap-fan__bubble--talk">
          <svg viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z" /></svg>
        </span>
        <span className="ap-fan__bubble ap-fan__bubble--yes">
          <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
        </span>
      </div>

      <span className="ap-home__chip">
        {brand}
        <i />
        {handle}
      </span>
      <h1 className="ap-home__title">
        Hora de aprovar
        <br />
        <em>os criativos</em>
      </h1>
      <p className="ap-home__lead">
        {stats.total === 0
          ? "Assim que a equipe subir as artes, elas aparecem aqui para você avaliar."
          : "Uma arte por vez: aprove, reprove ou comente o que precisa mudar. Dá para desfazer a qualquer momento."}
      </p>

      {stats.total > 0 && (
        <>
          <div className="ap-score">
            <div className="ap-score__head">
              <b>
                {stats.decided} de {stats.total}
              </b>{" "}
              {plural(stats.decided, "avaliada", "avaliadas")}
              <span className="ap-score__handle">{handle}</span>
            </div>
            <div className="ap-bar" aria-hidden>
              <i style={{ width: `${(stats.decided / stats.total) * 100}%` }} />
            </div>
            <div className="ap-score__legend">
              <span className="is-ok">
                <i /> {stats.approved} {plural(stats.approved, "aprovada", "aprovadas")}
              </span>
              <span className="is-no">
                <i /> {stats.rejected} {plural(stats.rejected, "reprovada", "reprovadas")}
              </span>
              <span className="is-wait">
                <i /> {stats.pending} {plural(stats.pending, "pendente", "pendentes")}
              </span>
            </div>
          </div>

        </>
      )}

      <div className="ap-home__foot">
        <SlideToStart label={cta} disabled={stats.total === 0} onDone={onStart} />
        {stats.total > 0 && (
          <button type="button" className="ap-link" onClick={onGrid}>
            Ver todas as {stats.total} artes em grade
          </button>
        )}
      </div>
    </main>
  );
}

/**
 * "Arraste para começar": o botão vermelho corre dentro da trilha e só
 * entrega a tela de avaliação quando chega ao fim. É um gesto deliberado —
 * o cliente entra na avaliação porque quis, não porque esbarrou no botão.
 *
 * Quem usa teclado ou leitor de tela não arrasta nada: o próprio puxador é
 * um botão, e Enter/Espaço/→ completam o percurso.
 */
function SlideToStart({
  label,
  disabled = false,
  onDone,
}: {
  label: string;
  disabled?: boolean;
  onDone: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const origin = useRef(0);
  const [x, setX] = useState(0);
  const [span, setSpan] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState(false);

  // Curso do puxador = trilha - puxador - folga dos dois lados. Medido no
  // layout (e a cada resize) porque o render não pode ler a ref.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => setSpan(Math.max(0, el.clientWidth - KNOB - CTA_PAD * 2));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const finish = useCallback(() => {
    setDone(true);
    setX(span);
    setTimeout(onDone, 170);
  }, [onDone, span]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || done) return;
    setDragging(true);
    origin.current = e.clientX - x;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setX(Math.min(Math.max(e.clientX - origin.current, 0), span));
  };
  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (span > 0 && x >= span * 0.82) finish();
    else setX(0);
  };

  const progress = span > 0 ? x / span : 0;

  return (
    <div
      ref={track}
      className={`ap-cta ${dragging ? "is-dragging" : ""} ${done ? "is-done" : ""}`}
      data-disabled={disabled ? "" : undefined}
    >
      <span className="ap-cta__fill" style={{ transform: `scaleX(${done ? 1 : progress})` }} aria-hidden />
      <button
        type="button"
        className="ap-cta__icon"
        style={{ transform: `translateX(${x}px)`, transition: dragging ? "none" : "transform 220ms var(--ap-ease)" }}
        disabled={disabled}
        aria-label={`Arraste para ${label}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
            e.preventDefault();
            if (!disabled && !done) finish();
          }
        }}
      >
        <svg viewBox="0 0 24 24">
          <path d="M19.5 4.5c-1.7-1.5-4.3-1.2-6 .5L12 6.5l-1.5-1.5c-1.7-1.7-4.3-2-6-.5-2 1.7-2.1 4.8-.2 6.7L12 20l7.7-8.8c1.9-1.9 1.8-5-.2-6.7z" />
        </svg>
      </button>
      <span className="ap-cta__label" style={{ opacity: 1 - progress * 1.6 }}>
        {disabled ? "Aguardando artes" : `Arraste para ${label}`}
      </span>
      <span className="ap-cta__chev" style={{ opacity: 1 - progress * 1.6 }} aria-hidden>
        <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
        <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
        <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
      </span>
    </div>
  );
}

/* ============================ Avaliar ============================ */

function Deck({
  deck,
  total,
  decided,
  approved,
  rejected,
  handle,
  canUndo,
  onApprove,
  onReject,
  onComment,
  onExpand,
  onUndo,
  onGrid,
}: {
  deck: Post[];
  total: number;
  decided: number;
  approved: number;
  rejected: number;
  handle: string;
  canUndo: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onComment: (id: string) => void;
  onExpand: (p: Post) => void;
  onUndo: () => void;
  onGrid: () => void;
}) {
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<null | "left" | "right">(null);
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
    // Botões dentro do card (setas, expandir) não iniciam arrasto.
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

  if (!top) {
    return (
      <main className="ap-main ap-main--center">
        <div className="ap-done">
          <span className="ap-done__mark">
            <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
          <h2>{total ? "Tudo avaliado!" : "Nenhum criativo ainda"}</h2>
          <p>
            {total
              ? `${approved} aprovados · ${rejected} reprovados. Pode revisar tudo na galeria e mudar o que quiser.`
              : "Assim que a equipe subir as artes, elas aparecem aqui."}
          </p>
          <div className="ap-done__row">
            {canUndo && (
              <button type="button" className="ap-btn ghost" onClick={onUndo}>
                Desfazer última
              </button>
            )}
            {total > 0 && (
              <button type="button" className="ap-btn solid" onClick={onGrid}>
                Ver galeria
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  const rot = drag.x / 18;
  const yes = Math.max(0, Math.min(1, drag.x / SWIPE_THRESHOLD));
  const no = Math.max(0, Math.min(1, -drag.x / SWIPE_THRESHOLD));

  return (
    <main className="ap-main ap-main--deck">
      <div className="ap-progress">
        <div className="ap-bar" aria-hidden>
          <i style={{ width: `${total ? (decided / total) * 100 : 0}%` }} />
        </div>
        <span className="ap-progress__count">
          {decided}
          <em>/{total} avaliadas</em>
        </span>
      </div>

      <div className="ap-stage">
        {deck.slice(0, 3).map((post, i) => {
          const isTop = i === 0;
          const transform = isTop
            ? leaving
              ? `translateX(${leaving === "right" ? 150 : -150}%) rotate(${leaving === "right" ? 18 : -18}deg)`
              : `translate(${drag.x}px, ${drag.y * 0.35}px) rotate(${rot}deg)`
            : `scale(${1 - i * 0.05}) translateY(${-i * 12}px)`;
          return (
            <div
              key={post.id}
              className="ap-stage__slot"
              style={{
                transform,
                transition: isTop && dragging ? "none" : "transform 240ms cubic-bezier(.16,1,.3,1)",
                zIndex: 10 - i,
                pointerEvents: isTop ? "auto" : "none",
              }}
              onPointerDown={isTop ? onPointerDown : undefined}
              onPointerMove={isTop ? onPointerMove : undefined}
              onPointerUp={isTop ? onPointerUp : undefined}
              onPointerCancel={isTop ? onPointerUp : undefined}
            >
              {isTop ? (
                <>
                  <CreativeCard
                    post={post}
                    handle={handle}
                    priority
                    onExpand={() => onExpand(post)}
                    onCaption={() => onComment(post.id)}
                  />
                  <span className="ap-stamp yes" style={{ opacity: yes }}>
                    Aprovar
                  </span>
                  <span className="ap-stamp no" style={{ opacity: no }}>
                    Reprovar
                  </span>
                </>
              ) : (
                // Carta de trás: só a arte, sem controle nenhum — é profundidade,
                // não conteúdo. Tamanho fixo para o baralho ficar alinhado mesmo
                // com artes de proporções diferentes.
                <div className="ap-ghost" aria-hidden>
                  {post.assets[0] && <MediaView asset={post.assets[0]} sizes="400px" />}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="ap-actions">
        <ActionButton
          kind="undo"
          label="Desfazer"
          disabled={!canUndo}
          onClick={onUndo}
          path={
            <>
              <path d="M9 14 4 9l5-5" />
              <path d="M4 9h11a6 6 0 0 1 0 12h-4" />
            </>
          }
        />
        <ActionButton
          kind="no"
          big
          label="Reprovar"
          onClick={() => commit("left", top.id)}
          path={<path d="M18 6 6 18M6 6l12 12" />}
        />
        <ActionButton
          kind="yes"
          big
          label="Aprovar"
          onClick={() => commit("right", top.id)}
          path={<path d="M20 6 9 17l-5-5" />}
        />
      </div>

      {decided === 0 && <p className="ap-hint">Arraste o card para os lados ou use os botões</p>}
    </main>
  );
}

function ActionButton({
  kind,
  label,
  path,
  onClick,
  big = false,
  disabled = false,
}: {
  kind: "undo" | "no" | "talk" | "yes";
  label: string;
  path: React.ReactNode;
  onClick: () => void;
  big?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`ap-act ap-act--${kind} ${big ? "is-big" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      <span className="ap-act__circle">
        <svg viewBox="0 0 24 24">{path}</svg>
      </span>
      <span className="ap-act__label">{label}</span>
    </button>
  );
}

/* ---------------- Card do criativo (com setas de carrossel) ---------------- */

/**
 * A arte como ela é: nada de corte. A mídia entra inteira (`contain`) sobre
 * um fundo desfocado dela mesma, então um 1:1, um 4:5 e um 9:16 convivem no
 * mesmo card sem deformar nem esconder pedaço nenhum.
 *
 * Carrossel/Stories: setas de verdade nas laterais (esquerda/direita), barras
 * de progresso no topo e contador — o cliente vê que há mais slides sem
 * precisar adivinhar que a arte é "tocável".
 */
function CreativeCard({
  post,
  handle,
  priority = false,
  onExpand,
  onCaption,
}: {
  post: Post;
  handle: string;
  priority?: boolean;
  onExpand?: () => void;
  onCaption?: () => void;
}) {
  const [slide, setSlide] = useState(0);
  const assets = post.assets;
  const count = assets.length;
  const idx = Math.min(slide, Math.max(count - 1, 0));
  const asset: Asset | undefined = assets[idx];
  const badge = formatBadge(post);
  const unit = post.format === "story" ? "frame" : "arte";
  // O card assume a proporção da arte (entre 9:16 e 1.91:1, os limites do
  // Instagram): nada de corte, e sem sobra de fundo quando não precisa.
  const ratio = aspectOf(asset, post.format);

  const go = (delta: number) => setSlide((s) => Math.min(Math.max(s + delta, 0), count - 1));

  const caption = (post.caption || "").trim();

  return (
    <article className={`ap-card is-${post.status}`}>
      <div className="ap-card__media" style={{ "--ap-ratio": ratio } as React.CSSProperties}>
        {asset && assetKind(asset) === "image" && !asset.url.startsWith("blob:") && (
          <div className="ap-card__blur" style={{ backgroundImage: `url("${asset.url}")` }} aria-hidden />
        )}
        <div className="ap-card__art" key={asset?.id ?? "empty"}>
          {asset ? (
            <MediaView
              asset={asset}
              fit="contain"
              priority={priority && idx === 0}
              playing
              sizes="(max-width: 520px) 100vw, 420px"
            />
          ) : (
            <span className="ap-card__none">sem arte</span>
          )}
        </div>

        {count > 1 && (
          <div className="ap-card__bars" aria-hidden>
            {assets.map((a, i) => (
              <span key={a.id} className={i <= idx ? "on" : ""} />
            ))}
          </div>
        )}

        <div className="ap-card__top">
          <span className="ap-chip">
            <FormatIcon badge={badge} />
            {FORMAT_LABEL[badge]}
            {count > 1 && ` · ${count} ${unit}s`}
          </span>
          {post.status !== "pending" && (
            <span className={`ap-chip ap-chip--${post.status}`}>{STATUS_LABEL[post.status]}</span>
          )}
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              className="ap-arrow is-prev"
              onClick={() => go(-1)}
              disabled={idx === 0}
              aria-label={`${unit === "frame" ? "Frame" : "Arte"} anterior`}
            >
              <svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <button
              type="button"
              className="ap-arrow is-next"
              onClick={() => go(1)}
              disabled={idx === count - 1}
              aria-label={unit === "frame" ? "Próximo frame" : "Próxima arte"}
            >
              <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
            </button>
            <span className="ap-card__counter" aria-live="polite">
              {idx + 1}/{count}
            </span>
          </>
        )}

        {onExpand && (
          <button type="button" className="ap-card__zoom" onClick={onExpand} aria-label="Ver em tela cheia">
            <svg viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
          </button>
        )}
      </div>

      <footer className="ap-card__foot">
        <span className="ap-card__handle">{handle}</span>
        <p className={`ap-card__caption ${caption ? "" : "is-empty"}`}>{caption || "sem legenda"}</p>
        {onCaption && caption.length > 80 && (
          <button type="button" className="ap-card__more" onClick={onCaption}>
            ver legenda inteira
          </button>
        )}
      </footer>
    </article>
  );
}

/* ============================ Galeria ============================ */

function Gallery({
  posts,
  stories,
  stats,
  filter,
  onFilter,
  onOpen,
  onApprove,
  onStories,
}: {
  posts: Post[];
  stories: Post[];
  stats: Stats;
  filter: Filter;
  onFilter: (f: Filter) => void;
  onOpen: (id: string) => void;
  onApprove: (id: string) => void;
  onStories: (i: number) => void;
}) {
  return (
    <main className="ap-main">
      <h2 className="ap-h1">Galeria</h2>
      <Filters filter={filter} onFilter={onFilter} stats={stats} />

      {stories.length > 0 && filter === "all" && (
        <div className="ap-strip">
          <StoryTray stories={stories} onOpen={onStories} />
        </div>
      )}

      {posts.length === 0 ? (
        <Empty filter={filter} />
      ) : (
        <div className="ap-grid">
          {posts.map((p) => {
            const badge = formatBadge(p);
            const count = p.assets.length;
            return (
              <article key={p.id} className={`ap-tile is-${p.status}`}>
                {p.assets[0] ? (
                  <MediaView asset={p.assets[0]} sizes="(max-width: 700px) 50vw, 250px" />
                ) : (
                  <span className="ap-tile__none" />
                )}
                <button type="button" className="ap-tile__open" onClick={() => onOpen(p.id)}>
                  <span className="ap-tile__shade" aria-hidden />
                  <span className="ap-tile__meta">
                    <FormatIcon badge={badge} />
                    {count > 1 && <em>{count}</em>}
                  </span>
                  <span className="ap-tile__name">
                    {FORMAT_LABEL[badge]}
                    <b>#{String(p.order + 1).padStart(2, "0")}</b>
                  </span>
                </button>
                <button
                  type="button"
                  className="ap-tile__act"
                  onClick={() => (p.status === "approved" ? onOpen(p.id) : onApprove(p.id))}
                  aria-label={p.status === "approved" ? "Aprovado — abrir para mudar" : `Aprovar criativo ${p.order + 1}`}
                  title={p.status === "approved" ? "Aprovado" : "Aprovar"}
                >
                  {p.status === "rejected" ? (
                    <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24">
                      <path d="M19.5 4.5c-1.7-1.5-4.3-1.2-6 .5L12 6.5l-1.5-1.5c-1.7-1.7-4.3-2-6-.5-2 1.7-2.1 4.8-.2 6.7L12 20l7.7-8.8c1.9-1.9 1.8-5-.2-6.7z" />
                    </svg>
                  )}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "pending", label: "Pendentes" },
  { id: "approved", label: "Aprovadas" },
  { id: "rejected", label: "Reprovadas" },
];

function Filters({ filter, onFilter, stats }: { filter: Filter; onFilter: (f: Filter) => void; stats: Stats }) {
  const count: Record<Filter, number> = {
    all: stats.total,
    pending: stats.pending,
    approved: stats.approved,
    rejected: stats.rejected,
  };
  return (
    <div className="ap-filters" role="group" aria-label="Filtrar criativos">
      {FILTERS.map((f) => {
        const on = filter === f.id;
        return (
          <button
            key={f.id}
            type="button"
            className={`ap-filter is-${f.id} ${on ? "on" : ""}`}
            aria-pressed={on}
            onClick={() => onFilter(on && f.id !== "all" ? "all" : f.id)}
          >
            {on && f.id !== "all" && (
              <svg viewBox="0 0 24 24" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
            )}
            {f.label}
            <em>{count[f.id]}</em>
          </button>
        );
      })}
    </div>
  );
}

function Empty({ filter }: { filter: Filter }) {
  const text: Record<Filter, string> = {
    all: "Nenhum criativo por aqui ainda.",
    pending: "Nada pendente — você avaliou tudo.",
    approved: "Você ainda não aprovou nenhuma arte.",
    rejected: "Nenhuma arte reprovada. Ótimo sinal.",
  };
  return <p className="ap-empty">{text[filter]}</p>;
}

/* ============================ Lista ============================ */

function ListView({
  posts,
  filter,
  onFilter,
  stats,
  onOpen,
}: {
  posts: Post[];
  filter: Filter;
  onFilter: (f: Filter) => void;
  stats: Stats;
  onOpen: (id: string) => void;
}) {
  return (
    <main className="ap-main">
      <h2 className="ap-h1">Lista</h2>
      <Filters filter={filter} onFilter={onFilter} stats={stats} />
      {posts.length === 0 ? (
        <Empty filter={filter} />
      ) : (
        <div className="ap-list">
          {posts.map((p) => (
            <button key={p.id} type="button" className={`ap-row is-${p.status}`} onClick={() => onOpen(p.id)}>
              <span className={`ap-row__thumb ${isVertical(p) ? "is-vertical" : ""}`}>
                {p.assets[0] && <MediaView asset={p.assets[0]} sizes="64px" />}
              </span>
              <span className="ap-row__body">
                <span className="ap-row__head">
                  <FormatTag badge={formatBadge(p)} />
                  <em>#{String(p.order + 1).padStart(2, "0")}</em>
                </span>
                <span className="ap-row__cap">
                  {p.caption ? p.caption.replace(/\n/g, " ") : "— sem legenda —"}
                </span>
                {p.feedback && <span className="ap-row__fb">“{p.feedback}”</span>}
              </span>
              <span className={`ap-pill is-${p.status}`}>
                <i />
                {STATUS_LABEL[p.status]}
              </span>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

/* ============================ Navegação ============================ */

const TABS: { id: Tab; label: string; path: React.ReactNode }[] = [
  { id: "deck", label: "Avaliar", path: <><rect x="6" y="3" width="12" height="15" rx="2.5" /><path d="M4 8v11a2 2 0 0 0 2 2h10" /></> },
  { id: "grid", label: "Galeria", path: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></> },
  { id: "list", label: "Lista", path: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /> },
];

function TabBar({ tab, pending, onChange }: { tab: Tab; pending: number; onChange: (t: Tab) => void }) {
  return (
    <nav className="ap-nav" aria-label="Seções">
      <div className="ap-nav__pill">
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={on ? "on" : ""}
              aria-current={on ? "page" : undefined}
              aria-label={t.label}
              onClick={() => onChange(t.id)}
            >
              <svg viewBox="0 0 24 24">{t.path}</svg>
              {on && <span>{t.label}</span>}
              {t.id === "deck" && pending > 0 && !on && <i className="ap-nav__dot" aria-label={`${pending} pendentes`} />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ============================ Detalhe ============================ */

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="ap-sheet__backdrop" onClick={onClose} role="presentation">
      <div className="ap-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Criativo">
        <div className="ap-sheet__grip" />
        <button type="button" className="ap-sheet__close" onClick={onClose} aria-label="Fechar">
          <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>

        <p className="ap-sheet__eyebrow">Como vai aparecer no Instagram</p>
        <div className="sm-preview">
          {vertical ? (
            <div className="ap-sheet__vertical">
              <VerticalPreview
                format={post.format}
                assets={post.assets}
                caption={post.caption}
                handle={handle}
                onExpand={onExpand}
              />
            </div>
          ) : (
            <InstagramPreview handle={handle} assets={post.assets} caption={post.caption} onExpand={onExpand} />
          )}
        </div>

        <div className="ap-sheet__row">
          <FormatTag badge={formatBadge(post)} />
          <span className={`ap-pill is-${post.status}`}>
            <i />
            {STATUS_LABEL[post.status]}
          </span>
          <span className="ap-sheet__spacer" />
          {post.status !== "pending" && (
            <button type="button" className="ap-btn tiny" onClick={onReset}>
              Voltar p/ pendente
            </button>
          )}
        </div>

        {post.format === "story" && post.caption && (
          <p className="ap-note">Observação da equipe: {post.caption}</p>
        )}

        <label className="ap-field">
          <span>O que precisa mudar? (opcional)</span>
          <textarea
            placeholder={
              post.format === "story"
                ? "Ex.: frame 2, trocar o texto do preço…"
                : "Ex.: trocar a cor do fundo, ajustar o texto…"
            }
            value={feedback}
            maxLength={1000}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </label>

        <div className="ap-sheet__foot">
          <button
            type="button"
            className="ap-btn no"
            onClick={() => {
              onDecide("rejected", feedback.trim() || undefined);
              onClose();
            }}
          >
            <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>
            Reprovar
          </button>
          <button
            type="button"
            className="ap-btn yes"
            onClick={() => {
              onDecide("approved", feedback.trim() || undefined);
              onClose();
            }}
          >
            <svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5" /></svg>
            Aprovar
          </button>
        </div>
      </div>
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
    <div className="ap-sheet__backdrop" onClick={onClose} role="presentation">
      <div className="ap-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="ap-sheet__grip" />
        <h3 className="ap-sheet__title">Por que reprovou?</h3>
        <p className="ap-sheet__lead">
          Você reprovou {posts.length} {posts.length === 1 ? "arte" : "artes"}. Diga rapidinho o que precisa mudar em
          cada uma — assim a equipe já refaz certo.
        </p>

        <div className="ap-reject">
          {posts.map((p) => (
            <div key={p.id} className="ap-reject__item">
              <span className={`ap-row__thumb ${isVertical(p) ? "is-vertical" : ""}`}>
                {p.assets[0] && <MediaView asset={p.assets[0]} sizes="56px" />}
              </span>
              <div className="ap-reject__body">
                <div className="ap-reject__head">
                  <FormatTag badge={formatBadge(p)} />
                  <em>#{String(p.order + 1).padStart(2, "0")}</em>
                </div>
                <textarea
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

        <div className="ap-sheet__foot">
          <button type="button" className="ap-btn ghost" onClick={onClose}>
            Agora não
          </button>
          <button type="button" className="ap-btn solid" onClick={() => onSave(drafts)}>
            Enviar justificativas
          </button>
        </div>
      </div>
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

/** Proporção que o card deve assumir, dentro do que o Instagram aceita. */
function aspectOf(asset: Asset | undefined, format: Post["format"]): string {
  const fallback = format === "feed" ? 4 / 5 : 9 / 16;
  const r = asset?.width && asset?.height ? asset.width / asset.height : fallback;
  return String(Math.min(Math.max(r, 9 / 16), 1.91));
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "@fulano" a partir de "fulano", "@fulano" ou vazio. */
function igHandle(raw?: string | null): string {
  const h = (raw || "").trim().replace(/^@+/, "");
  return h ? `@${h}` : "@suamarca";
}
