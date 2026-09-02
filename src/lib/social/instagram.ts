// ============================================================
// Publicação no Instagram — Graph API (Content Publishing).
//
// Seam pronto para plugar: cada projeto guarda o id da conta IG
// Business (`ig_user_id`) e um token de longa duração
// (`ig_access_token`). O worker (/api/social/publish) chama
// `publishPost` quando o horário agendado chega.
//
// Fluxo oficial da Graph API:
//   1. Cria um container de mídia por imagem (POST /{ig-user}/media).
//      - Post simples: image_url + caption.
//      - Carrossel: um container filho por arte (is_carousel_item=true),
//        depois um container pai (media_type=CAROUSEL, children=...).
//   2. Publica o container (POST /{ig-user}/media_publish).
//
// Requisitos externos (fornecidos pelo cliente/agência):
//   - App Meta com Instagram Graph API + conta IG Business/Creator
//     ligada a uma Página do Facebook.
//   - As imagens precisam estar em URL pública (o Blob já cobre isso).
// ============================================================
import type { Asset } from "./types";

const GRAPH = "https://graph.facebook.com/v21.0";

export interface IgCredentials {
  igUserId: string;
  accessToken: string;
}

export interface PublishResult {
  ok: boolean;
  mediaId?: string;
  error?: string;
}

/** Há credenciais mínimas para tentar publicar? */
export function hasCredentials(
  c: { igUserId: string | null; igAccessToken: string | null } | null,
): c is { igUserId: string; igAccessToken: string } {
  return Boolean(c && c.igUserId && c.igAccessToken);
}

async function graphPost(
  path: string,
  token: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json.error as { message?: string } | undefined)?.message;
    throw new Error(err || `Graph API ${res.status}`);
  }
  return json;
}

async function createContainer(
  cred: IgCredentials,
  params: Record<string, string>,
): Promise<string> {
  const json = await graphPost(`${cred.igUserId}/media`, cred.accessToken, params);
  const id = json.id as string | undefined;
  if (!id) throw new Error("Graph API não retornou o id do container.");
  return id;
}

/**
 * Publica um post no feed do Instagram. Suporta imagem única e carrossel.
 * Vídeos/Reels não são cobertos aqui (exigem status polling assíncrono).
 */
export async function publishPost(
  cred: IgCredentials,
  post: { caption: string; assets: Asset[] },
): Promise<PublishResult> {
  try {
    const images = post.assets.filter((a) => a.url);
    if (images.length === 0) return { ok: false, error: "Post sem artes." };

    let containerId: string;

    if (images.length === 1) {
      containerId = await createContainer(cred, {
        image_url: images[0].url,
        caption: post.caption ?? "",
      });
    } else {
      // Carrossel: um filho por arte, depois o container pai.
      const children: string[] = [];
      for (const asset of images.slice(0, 10)) {
        const childId = await createContainer(cred, {
          image_url: asset.url,
          is_carousel_item: "true",
        });
        children.push(childId);
      }
      containerId = await createContainer(cred, {
        media_type: "CAROUSEL",
        children: children.join(","),
        caption: post.caption ?? "",
      });
    }

    const published = await graphPost(
      `${cred.igUserId}/media_publish`,
      cred.accessToken,
      { creation_id: containerId },
    );
    const mediaId = published.id as string | undefined;
    return { ok: true, mediaId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao publicar." };
  }
}
