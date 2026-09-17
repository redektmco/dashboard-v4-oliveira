import { NextResponse } from "next/server";
import { canManageSocial, getSessionUser } from "@/lib/auth";
import { duplicatePost, listPosts } from "@/lib/social/db";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Duplica o criativo como rascunho no mesmo projeto. Serve para partir de
 * algo que já existe — variação de legenda, reaproveitar a arte depois de uma
 * reprova — sem subir a mídia de novo.
 *
 * A cópia nasce em rascunho de propósito: nada aparece para o cliente antes
 * de alguém revisar e enviar.
 */
export async function POST(_req: Request, { params }: Ctx) {
  const u = await getSessionUser();
  if (!u || !canManageSocial(u))
    return NextResponse.json({ error: "Sessão expirada ou sem permissão." }, { status: 401 });

  const { id } = await params;
  const copy = await duplicatePost(id);
  if (!copy) return NextResponse.json({ error: "Criativo não encontrado." }, { status: 404 });

  return NextResponse.json({ post: copy, posts: await listPosts(copy.projectId) }, { status: 201 });
}
