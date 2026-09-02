// ============================================================
// Armazenamento das artes — Vercel Blob.
//
// Em serverless o filesystem é efêmero, então as imagens vão para
// o Blob (público). Requer BLOB_READ_WRITE_TOKEN no ambiente
// (provisionado pelo `vercel blob store add` / Marketplace).
// ============================================================
import { put } from "@vercel/blob";
import { newId } from "./id";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

export interface SavedImage {
  url: string;
  name: string;
}

function extFor(originalName: string, contentType: string): string {
  if (EXT_BY_TYPE[contentType]) return EXT_BY_TYPE[contentType];
  const dot = originalName.lastIndexOf(".");
  return dot >= 0 ? originalName.slice(dot).toLowerCase() : ".bin";
}

/** Persiste uma imagem enviada e devolve a URL pública + nome original. */
export async function saveImage(
  buffer: Buffer,
  originalName: string,
  contentType: string,
): Promise<SavedImage> {
  const key = `social/${Date.now()}-${newId()}${extFor(originalName, contentType)}`;
  const { url } = await put(key, buffer, {
    access: "public",
    contentType: contentType || "application/octet-stream",
  });
  return { url, name: originalName };
}

export function isImageType(type: string): boolean {
  return type.startsWith("image/");
}

/** Blob configurado? Usado para dar erro claro em vez de estourar no `put`. */
export function isStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}
