"use client";

import { useState } from "react";
import { Icon } from "@/components/icon";
import type { VideoEmbed as Embed } from "@/lib/onboarding/video";

/**
 * Player de vídeo com facade: até o clique mostramos só a capa (imagem leve
 * ou gradiente). O iframe — pesado, com o script do provedor — só é montado
 * quando o funcionário decide assistir, preservando o carregamento da aula.
 * A normalização da URL (YouTube/Vimeo/Loom) acontece no servidor.
 */
export function VideoEmbed({ embed, title }: { embed: Embed; title: string }) {
  const [playing, setPlaying] = useState(false);

  if (playing)
    return (
      <div className="ob-video">
        <iframe
          src={`${embed.embedUrl}${embed.embedUrl.includes("?") ? "&" : "?"}autoplay=1`}
          title={title}
          allow="accelerator; autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    );

  return (
    <div className="ob-video">
      <button
        type="button"
        className="ob-video-cover"
        onClick={() => setPlaying(true)}
        aria-label={`Reproduzir vídeo: ${title}`}
      >
        {embed.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- thumbnail externa do provedor (domínio não previsível)
          <img src={embed.thumbUrl} alt="" loading="lazy" />
        ) : (
          <span className="absolute inset-0 bg-gradient-to-br from-ink-800 to-ink-950" />
        )}
        <span className="ob-play">
          <Icon name="play" size={26} />
        </span>
      </button>
    </div>
  );
}
