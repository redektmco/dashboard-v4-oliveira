/**
 * Evidências do churn (prints, e-mails, documentos) no Vercel Blob, na pasta
 * `churn/<clientId>/`. O navegador envia direto ao Blob com um token curto
 * pedido em `/api/churn/upload` — mesmo caminho das mídias de Social media.
 */

export const CHURN_FOLDER = "churn";
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const EVIDENCE_TYPES = ["application/pdf", "image/png", "image/jpeg", "message/rfc822", "application/octet-stream"];
export const EVIDENCE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.eml";

/** A URL é um arquivo do nosso store, dentro da pasta do churn? */
export function isOwnChurnBlob(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || !u.hostname.endsWith(".public.blob.vercel-storage.com")) return false;
  const parts = (process.env.BLOB_READ_WRITE_TOKEN ?? "").split("_");
  const prefix = parts.length >= 5 && parts[3] ? parts[3].toLowerCase() + "." : null;
  if (prefix && !u.hostname.startsWith(prefix)) return false;
  return u.pathname.startsWith(`/${CHURN_FOLDER}/`);
}
