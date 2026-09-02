"use client";

import { useState } from "react";
import type { Asset } from "@/lib/social/types";

/**
 * Mock fiel de post do Instagram no feed: header, mídia (com dots do
 * carrossel), linha de ações e a legenda com o @handle em negrito + "ver mais".
 */
export default function InstagramPreview({
  handle,
  assets,
  caption,
  avatarUrl = "/brand/v4-simbolo.webp",
  interactive = true,
}: {
  handle: string;
  assets: Asset[];
  caption: string;
  avatarUrl?: string;
  interactive?: boolean;
}) {
  const [idx, setIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const safeAssets = assets.length ? assets : [];
  const current = safeAssets[Math.min(idx, safeAssets.length - 1)];

  const advance = (e: React.MouseEvent) => {
    if (!interactive || safeAssets.length < 2) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const goNext = e.clientX - rect.left > rect.width / 2;
    setIdx((i) =>
      goNext ? Math.min(i + 1, safeAssets.length - 1) : Math.max(i - 1, 0),
    );
  };

  const captionIsLong = caption.length > 90 || caption.includes("\n");

  return (
    <div className="ig">
      <div className="ig__head">
        <img className="ig__avatar" src={avatarUrl} alt="" />
        <div className="ig__handle">{handle}</div>
        <svg className="ig__dots" viewBox="0 0 24 24" aria-hidden>
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </div>

      <div className="ig__media" onClick={advance}>
        {current ? (
          <img src={current.url} alt={current.name} draggable={false} />
        ) : (
          <div className="ig__placeholder">sem arte</div>
        )}
        {safeAssets.length > 1 && (
          <div className="ig__count">
            {idx + 1}/{safeAssets.length}
          </div>
        )}
      </div>

      {safeAssets.length > 1 && (
        <div className="ig__pager">
          {safeAssets.map((a, i) => (
            <span key={a.id} className={i === idx ? "on" : ""} />
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
