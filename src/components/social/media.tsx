"use client";

import Image from "next/image";
import type { Ref } from "react";
import { assetKind } from "@/lib/social/media";
import type { Asset } from "@/lib/social/types";

/**
 * Uma mídia do criativo — imagem ou vídeo — preenchendo o contêiner pai
 * (que precisa ser `position: relative` com tamanho definido).
 *
 * Arte já no Blob passa pelo otimizador do Next (AVIF/WebP no tamanho da
 * tela). Arte local, ainda no navegador (`blob:` do preview antes de enviar),
 * vai direto num <img>: não há o que otimizar e o otimizador não a alcança.
 */
export function MediaView({
  asset,
  sizes = "(max-width: 480px) 100vw, 440px",
  fit = "cover",
  priority = false,
  videoRef,
  playing = false,
  muted = true,
  loop = true,
  controls = false,
  onEnded,
  onReady,
  className,
}: {
  asset: Pick<Asset, "url" | "name" | "kind" | "contentType">;
  sizes?: string;
  fit?: "cover" | "contain";
  priority?: boolean;
  videoRef?: Ref<HTMLVideoElement>;
  /** Vídeo toca sozinho (mudo). Sem isto mostra só o primeiro quadro. */
  playing?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  onEnded?: () => void;
  /** A mídia está pronta para exibir (imagem carregada / vídeo com quadro). */
  onReady?: () => void;
  className?: string;
}) {
  const style = { objectFit: fit } as const;
  if (assetKind(asset) === "video") {
    return (
      <video
        ref={videoRef}
        // `#t=0.1` faz o navegador pintar o primeiro quadro como capa.
        src={playing ? asset.url : `${asset.url}#t=0.1`}
        className={`absolute inset-0 h-full w-full ${className ?? ""}`}
        style={style}
        muted={muted}
        autoPlay={playing}
        loop={loop}
        playsInline
        controls={controls}
        preload="metadata"
        onEnded={onEnded}
        onLoadedData={onReady}
        onError={onReady}
        draggable={false}
      />
    );
  }
  if (asset.url.startsWith("blob:")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={asset.url}
        alt={asset.name}
        className={`absolute inset-0 h-full w-full ${className ?? ""}`}
        style={style}
        draggable={false}
        onLoad={onReady}
        onError={onReady}
      />
    );
  }
  return (
    <Image
      src={asset.url}
      alt={asset.name}
      fill
      sizes={sizes}
      quality={75}
      priority={priority}
      draggable={false}
      className={className}
      style={style}
      onLoad={onReady}
      onError={onReady}
    />
  );
}
