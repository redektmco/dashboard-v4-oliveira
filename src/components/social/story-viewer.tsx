"use client";

import "./story.css";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MediaView } from "./media";
import { navReducer } from "./story-nav";
import { assetKind } from "@/lib/social/media";
import type { Asset, PostFormat, PostStatus } from "@/lib/social/types";

/** Um item do viewer: um Story (vários frames) ou um Reels (um vídeo). */
export type StoryItem = {
  id: string;
  format: PostFormat;
  assets: Asset[];
  caption?: string;
  status?: PostStatus;
};

export type StoryControls = {
  pause: () => void;
  resume: () => void;
  /** Próximo frame (ou próximo item, se era o último frame). */
  next: () => void;
  /** Pula direto para o próximo item — usado depois de decidir. */
  nextItem: () => void;
};

const IMAGE_MS = 6000;
const HOLD_MS = 200;

const STATUS_TEXT: Record<PostStatus, string> = {
  // O viewer também roda no painel, onde rascunho existe.
  draft: "Rascunho",
  pending: "Aguardando avaliação",
  approved: "Aprovado",
  rejected: "Reprovado",
};

/**
 * Visualização de Stories em tela cheia, no idioma do Instagram: barras de
 * progresso por frame, toque à direita avança, à esquerda volta, segurar
 * pausa, arrastar para baixo fecha. Setas do teclado e Esc no desktop.
 *
 * Adaptação para aprovação (`holdOnPending`): o viewer não pula sozinho para
 * o próximo Story enquanto o atual está pendente — o cliente para no último
 * frame com os botões de decisão à vista, em vez de ver a sequência passar.
 */
export function StoryViewer({
  items,
  startIndex = 0,
  handle,
  avatarUrl = "/brand/v4-simbolo.webp",
  onClose,
  renderFooter,
  holdOnPending = false,
}: {
  items: StoryItem[];
  startIndex?: number;
  handle: string;
  avatarUrl?: string;
  onClose: () => void;
  renderFooter?: (item: StoryItem, controls: StoryControls) => React.ReactNode;
  holdOnPending?: boolean;
}) {
  const ctx = useMemo(
    () => ({
      counts: items.map((i) => i.assets.length),
      hold: items.map((i) => holdOnPending && i.status === "pending"),
    }),
    [items, holdOnPending],
  );
  const [nav, dispatch] = useReducer(navReducer, undefined, () => ({
    itemIdx: Math.min(Math.max(startIndex, 0), Math.max(items.length - 1, 0)),
    frameIdx: 0,
    progress: 0,
    ended: false,
  }));
  const { itemIdx, frameIdx, progress, ended } = nav;
  const [held, setHeld] = useState(false);
  // O relógio do frame só anda com a mídia na tela — em rede lenta o cliente
  // não vê a barra correr (e o frame pular) antes de a arte aparecer.
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [userPaused, setUserPaused] = useState(false);
  const [muted, setMuted] = useState(true);

  const item = items[itemIdx];
  const frames = item?.assets ?? [];
  const frame = frames[Math.min(frameIdx, frames.length - 1)];
  const isVideo = frame ? assetKind(frame) === "video" : false;
  const frameKey = item && frame ? `${item.id}:${frameIdx}:${frame.url}` : "";
  const loading = readyKey !== frameKey;
  const paused = held || userPaused || ended || loading;

  const videoRef = useRef<HTMLVideoElement>(null);

  const next = useCallback((auto = false) => dispatch({ type: "next", auto, ctx }), [ctx]);
  const prev = useCallback(() => dispatch({ type: "prev", ctx }), [ctx]);
  const nextItem = useCallback(() => dispatch({ type: "item", delta: 1, ctx }), [ctx]);
  const prevItem = useCallback(() => dispatch({ type: "item", delta: -1, ctx }), [ctx]);
  const restart = () => dispatch({ type: "goto", itemIdx, frameIdx: 0 });

  // Relógio do frame: imagem tem duração fixa; vídeo segue o próprio tempo.
  useEffect(() => {
    if (!frame || paused) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const v = videoRef.current;
      if (isVideo && v) {
        if (v.duration && isFinite(v.duration)) dispatch({ type: "progress", value: v.currentTime / v.duration });
      } else {
        dispatch({ type: "tick", dt: (now - last) / IMAGE_MS, ctx });
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frame, paused, isVideo, ctx]);

  // Vídeo acompanha pausa e som.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    if (paused) v.pause();
    else void v.play().catch(() => undefined);
  }, [paused, muted, frame]);

  // Teclado, rolagem travada, pausa ao sair da aba.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("textarea, input");
      if (e.key === "Escape") onClose();
      if (typing) return;
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") {
        e.preventDefault();
        setUserPaused((p) => !p);
      }
    };
    const onVis = () => document.hidden && setUserPaused(true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [next, prev, onClose]);

  // O próximo frame de imagem já fica montado (invisível) para a troca não
  // piscar — pela mesma URL otimizada que será exibida.
  const upcoming = frames[frameIdx + 1] ?? items[itemIdx + 1]?.assets[0];

  // Gestos: toque curto navega, segurar pausa, arrastar para baixo fecha,
  // arrastar para o lado troca de Story.
  const gesture = useRef<{ x: number; y: number; t: number; timer: ReturnType<typeof setTimeout> | null } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      t: Date.now(),
      timer: setTimeout(() => setHeld(true), HOLD_MS),
    };
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.timer) clearTimeout(g.timer);
    const wasHeld = held;
    setHeld(false);
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (dy > 90 && Math.abs(dy) > Math.abs(dx)) return onClose();
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) return dx < 0 ? nextItem() : prevItem();
    if (wasHeld || Date.now() - g.t > HOLD_MS) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width * 0.3) prev();
    else next();
  };

  const controls: StoryControls = {
    pause: () => setUserPaused(true),
    resume: () => setUserPaused(false),
    next: () => next(),
    nextItem: () => nextItem(),
  };

  if (!item || !frame || typeof document === "undefined") return null;

  const label = item.format === "reels" ? "Reels" : "Story";
  const counter = items.length > 1 ? `${label} ${itemIdx + 1} de ${items.length}` : label;

  return createPortal(
    <div className="story-viewer" role="dialog" aria-modal="true" aria-label={`${label}s de ${handle}`}>
      <button
        type="button"
        className="story-nav story-nav--prev"
        onClick={prevItem}
        disabled={itemIdx === 0}
        aria-label={`${label} anterior`}
      >
        <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
      </button>

      <div className="story-stage">
        <div className="story-slot">
        <div
          className="story-frame"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            gesture.current = null;
            setHeld(false);
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {!isVideo && !frame.url.startsWith("blob:") && (
            <div className="story-backdrop" style={{ backgroundImage: `url("${frame.url}")` }} aria-hidden />
          )}
          <div className="story-media" key={`${item.id}-${frameIdx}`}>
            <MediaView
              asset={frame}
              fit="contain"
              priority
              sizes="(max-width: 480px) 100vw, 440px"
              videoRef={videoRef}
              playing
              loop={false}
              muted={muted}
              onEnded={() => next(true)}
              onReady={() => setReadyKey(frameKey)}
            />
          </div>
          {loading && (
            <div className="story-loading" aria-label="Carregando">
              <span />
            </div>
          )}

          <div className="story-top">
            <div className="story-bars" aria-hidden>
              {frames.map((f, i) => (
                <span key={f.id} className="story-bar">
                  <i
                    style={{
                      transform: `scaleX(${i < frameIdx ? 1 : i === frameIdx ? progress : 0})`,
                    }}
                  />
                </span>
              ))}
            </div>
            <div className="story-head">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="story-avatar" src={avatarUrl} alt="" width={32} height={32} />
              <div className="story-who">
                <span className="story-handle">{handle}</span>
                <span className="story-meta">
                  {counter}
                  {frames.length > 1 && ` · frame ${frameIdx + 1}/${frames.length}`}
                </span>
              </div>
              {item.status && (
                <span className={`story-status is-${item.status}`}>{STATUS_TEXT[item.status]}</span>
              )}
              <div className="story-tools" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
                {isVideo && (
                  <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Ativar som" : "Silenciar"}>
                    {muted ? (
                      <svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" /></svg>
                    ) : (
                      <svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></svg>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (ended ? restart() : setUserPaused((p) => !p))}
                  aria-label={ended ? "Ver de novo" : paused ? "Continuar" : "Pausar"}
                >
                  {ended ? (
                    <svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" /></svg>
                  ) : paused ? (
                    <svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8V4z" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" /></svg>
                  )}
                </button>
                <button type="button" onClick={onClose} aria-label="Fechar">
                  <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          </div>

          {item.caption ? (
            <div className="story-caption">
              <b>{handle}</b> {item.caption}
            </div>
          ) : null}

          {held && <div className="story-held" aria-hidden />}
          {upcoming && assetKind(upcoming) === "image" && (
            <div className="story-preload" aria-hidden>
              <MediaView asset={upcoming} fit="contain" sizes="(max-width: 480px) 100vw, 440px" />
            </div>
          )}
        </div>
        </div>

        {renderFooter && (
          <div className="story-footer" onPointerDown={(e) => e.stopPropagation()}>
            {renderFooter(item, controls)}
          </div>
        )}
      </div>

      <button
        type="button"
        className="story-nav story-nav--next"
        onClick={nextItem}
        disabled={itemIdx >= items.length - 1}
        aria-label={`Próximo ${label.toLowerCase()}`}
      >
        <svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
      </button>
    </div>,
    document.body,
  );
}
