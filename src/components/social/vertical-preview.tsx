"use client";

import "./story.css";
import { useState } from "react";
import { MediaView } from "./media";
import { FORMAT_LABEL, formatBadge, type FormatBadge } from "@/lib/social/media";
import type { Asset, Post, PostFormat, PostStatus } from "@/lib/social/types";

/**
 * Prévia vertical 9:16 de Story ou Reels, do tamanho de um card. Toque nas
 * bordas troca de frame; o botão de expandir abre a tela cheia.
 * Story: barras de frame no topo. Reels: legenda embaixo e a coluna de ações.
 */
export function VerticalPreview({
  format,
  assets,
  caption = "",
  handle,
  avatarUrl = "/brand/v4-simbolo.webp",
  interactive = true,
  playing = true,
  priority = false,
  onExpand,
}: {
  format: PostFormat;
  assets: Asset[];
  caption?: string;
  handle: string;
  avatarUrl?: string;
  interactive?: boolean;
  /** Vídeo roda mudo em loop (card do topo). Fora do topo, só a capa. */
  playing?: boolean;
  priority?: boolean;
  onExpand?: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const frame = assets[Math.min(idx, assets.length - 1)];
  const isReels = format === "reels";

  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    if (assets.length > 1 && x < 0.3) setIdx((i) => Math.max(i - 1, 0));
    else if (assets.length > 1 && x > 0.7) setIdx((i) => Math.min(i + 1, assets.length - 1));
    else onExpand?.();
  };

  return (
    <div className={`vcard ${isReels ? "vcard--reels" : "vcard--story"}`}>
      <div className="vcard__media" onClick={onTap}>
        {frame ? (
          <MediaView asset={frame} fit="cover" priority={priority} playing={playing} sizes="(max-width: 480px) 90vw, 360px" />
        ) : (
          <div className="vcard__empty">sem mídia</div>
        )}
      </div>

      <div className="vcard__top">
        {!isReels && (
          <div className="story-bars" aria-hidden>
            {assets.map((a, i) => (
              <span key={a.id} className="story-bar">
                <i style={{ transform: `scaleX(${i <= idx ? 1 : 0})` }} />
              </span>
            ))}
          </div>
        )}
        <div className="vcard__head">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="story-avatar" src={avatarUrl} alt="" width={26} height={26} />
          <span className="vcard__handle">{handle}</span>
          <FormatTag badge={isReels ? "reels" : "story"} />
          {assets.length > 1 && (
            <span className="vcard__count">
              {idx + 1}/{assets.length}
            </span>
          )}
        </div>
      </div>

      {isReels && (
        <>
          <div className="vcard__reels-actions" aria-hidden>
            <svg viewBox="0 0 24 24"><path d="M19.5 4.5c-1.7-1.5-4.3-1.2-6 .5L12 6.5l-1.5-1.5c-1.7-1.7-4.3-2-6-.5-2 1.7-2.1 4.8-.2 6.7L12 20l7.7-8.8c1.9-1.9 1.8-5-.2-6.7z" /></svg>
            <svg viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z" /></svg>
            <svg viewBox="0 0 24 24"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
          </div>
          <div className="vcard__caption">
            <b>{handle}</b> {caption || <i>sem legenda</i>}
          </div>
        </>
      )}

      {onExpand && (
        <button type="button" className="vcard__expand" onClick={onExpand} aria-label="Ver em tela cheia">
          <svg viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
        </button>
      )}
    </div>
  );
}

/** Etiqueta de formato — o mesmo desenho no painel e no link do cliente. */
export function FormatTag({ badge, className = "" }: { badge: FormatBadge; className?: string }) {
  return (
    <span className={`fmt-tag fmt-tag--${badge} ${className}`}>
      <FormatIcon badge={badge} />
      {FORMAT_LABEL[badge]}
    </span>
  );
}

export function FormatIcon({ badge }: { badge: FormatBadge }) {
  const paths: Record<FormatBadge, React.ReactNode> = {
    post: <rect x="4" y="4" width="16" height="16" rx="2" />,
    carousel: (
      <>
        <rect x="3" y="6" width="13" height="13" rx="2" />
        <path d="M8 3h11a2 2 0 0 1 2 2v11" />
      </>
    ),
    reels: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <path d="M3 8h18M8 3l3 5M14 3l3 5M10 12v5l4.5-2.5L10 12z" />
      </>
    ),
    story: (
      <>
        <circle cx="12" cy="12" r="9" strokeDasharray="3 2.2" />
        <path d="M12 8v8M8 12h8" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" className="fmt-icon" aria-hidden>
      {paths[badge]}
    </svg>
  );
}

/**
 * Bandeja de Stories no topo do link do cliente, como no Instagram: um
 * círculo por Story. O anel diz o estado — gradiente enquanto pendente,
 * verde aprovado, vermelho reprovado.
 */
export function StoryTray({
  stories,
  onOpen,
}: {
  stories: Pick<Post, "id" | "assets" | "status" | "format">[];
  onOpen: (index: number) => void;
}) {
  if (!stories.length) return null;
  const pending = stories.filter((s) => s.status === "pending").length;
  return (
    <div className="story-tray">
      <div className="story-tray__head">
        <span>Stories</span>
        <span className="story-tray__hint">
          {pending ? `${pending} para avaliar · toque para assistir` : "todos avaliados"}
        </span>
      </div>
      <div className="story-tray__row">
        {stories.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`story-ring is-${s.status as PostStatus}`}
            onClick={() => onOpen(i)}
            aria-label={`Abrir Story ${i + 1}`}
          >
            <span className="story-ring__inner">
              <span className="story-ring__photo">
                {s.assets[0] && <MediaView asset={s.assets[0]} sizes="64px" />}
              </span>
            </span>
            <span className="story-ring__label">
              {i + 1}
              {s.assets.length > 1 ? ` · ${s.assets.length}` : ""}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export { formatBadge };
