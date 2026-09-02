import { NextResponse } from "next/server";
import {
  getProjectCredentials,
  listDuePosts,
  updatePost,
} from "@/lib/social/db";
import { hasCredentials, publishPost } from "@/lib/social/instagram";

/**
 * Worker de publicação automática. Roda no cron (vercel.json) e publica no
 * Instagram os posts aprovados cujo horário agendado já chegou.
 *
 * Protegido pelo mesmo token do recompute (opcional em dev). A rota está
 * liberada no proxy (não exige sessão) — só o token a protege em produção.
 */
export async function POST(req: Request) {
  const token = process.env.RECOMPUTE_TOKEN;
  if (token && req.headers.get("x-recompute-token") !== token) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const due = await listDuePosts(10);
  const results: { id: string; status: string; error?: string }[] = [];

  for (const post of due) {
    const cred = await getProjectCredentials(post.projectId);

    if (!hasCredentials(cred)) {
      // Ready-to-wire: mantém agendado e registra o motivo. Assim que as
      // credenciais IG do projeto entrarem, o próximo ciclo publica.
      await updatePost(post.id, {
        publishError: "Conta Instagram do projeto ainda não configurada.",
      });
      results.push({ id: post.id, status: "aguardando_credenciais" });
      continue;
    }

    // Trava otimista: sai da fila de 'scheduled' antes de chamar a API.
    await updatePost(post.id, { publishStatus: "publishing", publishError: null });

    const r = await publishPost(
      { igUserId: cred.igUserId, accessToken: cred.igAccessToken },
      { caption: post.caption, assets: post.assets },
    );

    if (r.ok) {
      await updatePost(post.id, {
        publishStatus: "published",
        publishedAt: new Date().toISOString(),
        igMediaId: r.mediaId ?? null,
        publishError: null,
      });
      results.push({ id: post.id, status: "published" });
    } else {
      await updatePost(post.id, {
        publishStatus: "failed",
        publishError: r.error ?? "Falha ao publicar.",
      });
      results.push({ id: post.id, status: "failed", error: r.error });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}

export async function GET(req: Request) {
  return POST(req);
}
