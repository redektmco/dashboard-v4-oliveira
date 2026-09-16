"use client";

import { useState } from "react";
import type { Asset } from "@/lib/social/types";
import { MediaView } from "./media";

/**
 * Mock fiel de post do Instagram no feed: header, mídia (com setas e dots do
 * carrossel), linha de ações e a legenda com o @handle em negrito + "ver mais".
 */
export default function InstagramPreview({
  handle,
  assets,
  caption,
  avatarUrl = "/brand/v4-simbolo.webp",
  interactive = true,
  priority = false,
  onExpand,
}: {
  handle: string;
  assets: Asset[];
  caption: string;
  avatarUrl?: string;
  interactive?: boolean;
  /** Carrega a mídia imediatamente (carta do topo). O resto entra sob demanda. */
  priority?: boolean;
  /** Abre a arte em tela cheia; sem isto o botão de expandir não aparece. */
  onExpand?: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const safeAssets = assets.length ? assets : [];
  const current = safeAssets[Math.min(idx, safeAssets.length - 1)];
  const many = safeAssets.length > 1;

  const go = (delta: number) =>
    setIdx((i) => Math.min(Math.max(i + delta, 0), safeAssets.length - 1));

  const advance = (e: React.MouseEvent) => {
    if (!interactive || !many) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    go(e.clientX - rect.left > rect.width / 2 ? 1 : -1);
  };

  const captionIsLong = caption.length > 90 || caption.includes("\n");

  return (
    <div className="ig">
      <div className="ig__head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="ig__avatar"
          src={avatarUrl}
          alt=""
          width={30}
          height={30}
          decoding="async"
        />
        <div className="ig__handle">{handle}</div>
        <svg className="ig__dots" viewBox="0 0 24 24" aria-hidden>
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </div>

      <div className="ig__media" onClick={advance}>
        {current ? (
          <MediaView
            asset={current}
            sizes="(max-width: 480px) 100vw, 440px"
            priority={priority && idx === 0}
            playing={interactive}
          />
        ) : (
          <div className="ig__placeholder">sem arte</div>
        )}

        {/* Setas de verdade: o carrossel não depende de adivinhar o toque. */}
        {many && (
          <>
            <button
              type="button"
              className="ig__nav ig__nav--prev"
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
              disabled={idx === 0}
              aria-label="Arte anterior"
            >
              <svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <button
              type="button"
              className="ig__nav ig__nav--next"
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
              disabled={idx === safeAssets.length - 1}
              aria-label="Próxima arte"
            >
              <svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
            </button>
            <div className="ig__count">
              {idx + 1}/{safeAssets.length}
            </div>
          </>
        )}

        {onExpand && (
          <button
            type="button"
            className="ig__expand"
            onClick={(e) => {
              e.stopPropagation();
              onExpand();
            }}
            aria-label="Ver em tela cheia"
          >
            <svg viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
          </button>
        )}
      </div>

      {many && (
        <div className="ig__pager">
          {safeAssets.map((a, i) => (
            <button
              key={a.id}
              type="button"
              className={i === idx ? "on" : ""}
              onClick={() => setIdx(i)}
              aria-label={`Ir para a arte ${i + 1}`}
            />
          ))}
        </div>
      )}

      <div className="ig__actions">
        <div className="ig__actions-left">
          <IgIcon name="heart" />
          <IgIcon name="comment" />
          <IgIcon name="send" />
        </div>
        <IgIcon name="bookmark" />
      </div>

      <div className="ig__caption">
        <button
          className="ig__caption-text"
          type="button"
          onClick={() => setExpanded((v) => !v)}
          data-expanded={expanded}
        >
          <span className="ig__caption-handle">{handle}</span>{" "}
          {caption || <span className="ig__caption-empty">sem legenda</span>}
        </button>
        {captionIsLong && !expanded && (
          <button className="ig__more" type="button" onClick={() => setExpanded(true)}>
            ver mais
          </button>
        )}
      </div>
    </div>
  );
}

function IgIcon({ name }: { name: "heart" | "comment" | "send" | "bookmark" }) {
  const paths: Record<string, React.ReactNode> = {
    heart: (
      <path d="M19.5 4.5c-1.7-1.5-4.3-1.2-6 .5L12 6.5l-1.5-1.5c-1.7-1.7-4.3-2-6-.5-2 1.7-2.1 4.8-.2 6.7L12 20l7.7-8.8c1.9-1.9 1.8-5-.2-6.7z" />
    ),
    comment: (
      <path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z" />
    ),
    send: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />,
    bookmark: <path d="M6 3h12v18l-6-4-6 4V3z" />,
  };
  return (
    <svg className="ig__icon" viewBox="0 0 24 24" aria-hidden>
      {paths[name]}
    </svg>
  );
}
