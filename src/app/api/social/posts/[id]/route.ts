import { NextResponse, after } from "next/server";
import { canManageSocial, getSessionUser } from "@/lib/auth";
import { deletePost, getPost, updatePost } from "@/lib/social/db";
import { deleteAssets } from "@/lib/social/storage";
import type { PostStatus } from "@/lib/social/types";

type Ctx = { params: Promise<{ id: string }> };

const STATUSES: PostStatus[] = ["pending", "approved", "rejected"];

async function guard() {
  const u = await getSessionUser();
  return u && canManageSocial(u) ? u : null;
}

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await guard())) return NextResponse.json({ error: "Sessão expirada ou sem permissão." }, { status: 401 });
  const { id } = await params;
  const post = await getPost(id);
  if (!post) return NextResponse.json({ error: "Criativo não encontrado." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: Parameters<typeof updatePost>[1] = {};

  if (typeof body.caption === "string") patch.caption = body.caption.slice(0, 2200);

  if (typeof body.status === "string") {
    if (!STATUSES.includes(body.status))
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    const status = body.status as PostStatus;
    const now = new Date().toISOString();
    patch.status = status;
    patch.decidedAt = status === "pending" ? null : now;
    patch.history = [...post.history, { status, at: now, by: "admin" as const }];
    if (status !== "rejected") patch.feedback = null;
    // Ao tirar de aprovado, a data sai do calendário.
    if (status !== "approved" && post.publishStatus === "scheduled") {
      patch.publishStatus = "draft";
      patch.scheduledAt = null;
    }
  }

  // Data no calendário: só criativos aprovados entram no planejamento.
  if ("scheduledAt" in body) {
    const raw = body.scheduledAt;
    if (raw == null || raw === "") {
      patch.scheduledAt = null;
      patch.publishStatus = "draft";
      patch.publishError = null;
    } else {
      const when = new Date(String(raw));
      if (Number.isNaN(when.getTime()))
        return NextResponse.json({ error: "Data inválida." }, { status: 400 });
      const status = (patch.status ?? post.status) as PostStatus;
      if (status !== "approved")
        return NextResponse.json(
          { error: "Só criativos aprovados podem ir para o calendário." },
          { status: 400 },
        );
      patch.scheduledAt = when.toISOString();
      patch.publishStatus = "scheduled";
      patch.publishError = null;
    }
  }

  // Postagem é manual: o time marca quando publicou no Instagram.
  if (typeof body.published === "boolean") {
    patch.publishStatus = body.published ? "published" : post.scheduledAt ? "scheduled" : "draft";
    patch.publishedAt = body.published ? new Date().toISOString() : null;
  }

  const updated = await updatePost(id, patch);
  return NextResponse.json({ post: updated });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await guard())) return NextResponse.json({ error: "Sessão expirada ou sem permissão." }, { status: 401 });
  const { id } = await params;
  const urls = await deletePost(id);
  // Arquivo sem post é custo e lixo: some do Blob depois da resposta.
  after(() => deleteAssets(urls));
  return NextResponse.json({ ok: true });
}
