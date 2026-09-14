// ============================================================
// Regras de mídia do Social media — compartilhadas entre o navegador
// (validação antes de enviar) e o servidor (validação ao gravar).
// Sem dependência de Node: este arquivo roda nos dois lados.
// ============================================================
import type { Asset, Post, PostFormat } from "./types";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

export const MAX_IMAGE_BYTES = 30 * 1024 * 1024; // 30 MB
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB

/** Acima disto o upload vai em partes paralelas, com retry por parte. */
export const MULTIPART_FROM_BYTES = 8 * 1024 * 1024;

export type MediaKind = "image" | "video";

const EXT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

/** Content-type confiável: o do arquivo, ou o da extensão quando o SO não informa. */
export function contentTypeOf(file: { name: string; type: string }): string {
  if (file.type) return file.type.toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TYPES[ext] ?? "";
}

export function kindOfType(type: string): MediaKind | null {
  if (IMAGE_TYPES.includes(type)) return "image";
  if (VIDEO_TYPES.includes(type)) return "video";
  return null;
}

export function assetKind(a: Pick<Asset, "kind" | "url" | "contentType">): MediaKind {
  if (a.kind) return a.kind;
  if (a.contentType) return kindOfType(a.contentType) ?? "image";
  return /\.(mp4|m4v|mov|webm)(\?|$)/i.test(a.url) ? "video" : "image";
}

/** Quais mídias cada formato aceita. */
export const FORMAT_ACCEPTS: Record<PostFormat, MediaKind[]> = {
  feed: ["image", "video"],
  reels: ["video"],
  story: ["image", "video"],
};

export const FORMAT_ACCEPT_ATTR: Record<PostFormat, string> = {
  feed: [...IMAGE_TYPES, ...VIDEO_TYPES].join(","),
  reels: VIDEO_TYPES.join(","),
  story: [...IMAGE_TYPES, ...VIDEO_TYPES].join(","),
};

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

/**
 * Motivo para recusar um arquivo antes de gastar banda com ele, ou `null`.
 * A mensagem é a que o Social Media lê — diz o que fazer, não só o que houve.
 */
export function rejectReason(
  file: { name: string; type: string; size: number },
  format: PostFormat,
): string | null {
  const type = contentTypeOf(file);
  if (/image\/hei[cf]/.test(type) || /\.hei[cf]$/i.test(file.name))
    return "HEIC (foto do iPhone) não abre no navegador do cliente. Exporte como JPG ou PNG.";
  const kind = kindOfType(type);
  if (!kind) return "Formato não suportado. Use JPG, PNG, WebP, GIF, MP4, MOV ou WebM.";
  if (!FORMAT_ACCEPTS[format].includes(kind))
    return format === "reels" ? "Reels precisa ser um vídeo (MP4, MOV ou WebM)." : "Formato não aceito aqui.";
  if (file.size === 0) return "Arquivo vazio.";
  const max = kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > max) return `Arquivo de ${mb(file.size)} passa do limite de ${mb(max)} para ${kind === "video" ? "vídeo" : "imagem"}.`;
  return null;
}

/* ------------------------------ rótulos ------------------------------ */

export type FormatBadge = "post" | "carousel" | "reels" | "story";

export const FORMAT_LABEL: Record<FormatBadge, string> = {
  post: "Post",
  carousel: "Carrossel",
  reels: "Reels",
  story: "Story",
};

/** Rótulo que o time e o cliente enxergam: carrossel é derivado da quantidade. */
export function formatBadge(p: Pick<Post, "format" | "assets">): FormatBadge {
  if (p.format === "story") return "story";
  if (p.format === "reels") return "reels";
  return p.assets.length > 1 ? "carousel" : "post";
}

export const isVertical = (p: Pick<Post, "format">) => p.format === "story" || p.format === "reels";

/** Proporção que o formato espera e quão longe a mídia está dela. */
export function aspectWarning(format: PostFormat, a: Pick<Asset, "width" | "height">): string | null {
  if (!a.width || !a.height) return null;
  const r = a.width / a.height;
  if (format === "feed") {
    // Feed aceita de 1.91:1 (paisagem) a 4:5 (retrato).
    if (r < 0.79) return "Mais alta que 4:5 — o feed corta as bordas.";
    if (r > 1.92) return "Mais larga que 1.91:1 — o feed corta as laterais.";
    return null;
  }
  // Story e Reels: 9:16 (0,5625). Tolerância de ~6%.
  if (Math.abs(r - 9 / 16) > 0.035)
    return `Proporção ${a.width}×${a.height} — ${format === "story" ? "Stories" : "Reels"} usam 9:16 (1080×1920); vai aparecer com bordas.`;
  return null;
}
