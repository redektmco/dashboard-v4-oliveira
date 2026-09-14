// ============================================================
// Armazenamento das mídias — Vercel Blob.
//
// O navegador envia o arquivo direto ao Blob (client upload, ver
// `/api/social/upload`): o arquivo não atravessa a função nem o proxy,
// então não há teto de corpo de requisição nem timeout de função no
// caminho. Aqui ficam só as garantias do lado do servidor: que uma URL
// recebida é mesmo do nosso store, e a limpeza do que ficou sem dono.
// Requer BLOB_READ_WRITE_TOKEN no ambiente.
// ============================================================
import { del } from "@vercel/blob";

/** Blob configurado? Usado para dar erro claro em vez de estourar no upload. */
export function isStorageConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Id do store, embutido no token (`vercel_blob_rw_<storeId>_<segredo>`). A URL
 * pública de cada blob é `https://<storeId>.public.blob.vercel-storage.com/...`.
 */
function storeHostPrefix(): string | null {
  const parts = (process.env.BLOB_READ_WRITE_TOKEN ?? "").split("_");
  return parts.length >= 5 && parts[3] ? parts[3].toLowerCase() + "." : null;
}

/**
 * A URL aponta para um arquivo do nosso store, dentro da pasta do projeto?
 * Sem esta checagem, qualquer um com acesso ao painel poderia gravar um post
 * apontando para uma URL arbitrária — e ela iria parar no link do cliente.
 */
export function isOwnBlobUrl(raw: string, projectId?: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || !u.hostname.endsWith(".public.blob.vercel-storage.com")) return false;
  const prefix = storeHostPrefix();
  if (prefix && !u.hostname.startsWith(prefix)) return false;
  const base = projectId ? `/social/${projectId}/` : "/social/";
  return u.pathname.startsWith(base);
}

/**
 * Remove mídias do store — melhor esforço. Chamado ao excluir post/projeto e
 * quando um upload deu certo mas o post não chegou a ser criado. Falha aqui
 * nunca deve travar a ação do usuário: o pior caso é um arquivo órfão.
 */
export async function deleteAssets(urls: string[]): Promise<void> {
  const own = urls.filter((u) => isOwnBlobUrl(u));
  if (!own.length || !isStorageConfigured()) return;
  try {
    await del(own);
  } catch (e) {
    console.error("[social] falha ao remover mídias do Blob:", e);
  }
}
