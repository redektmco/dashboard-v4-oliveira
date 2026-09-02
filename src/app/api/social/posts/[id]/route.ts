import { NextResponse } from "next/server";
import { canManageSocial, getSessionUser } from "@/lib/auth";
import { deletePost, getPost, updatePost } from "@/lib/social/db";
import type { PostStatus } from "@/lib/social/types";

type Ctx = { params: Promise<{ id: string }> };

async function guard() {
  const u = await getSessionUser();
  return u && canManageSocial(u) ? u : null;
}

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await guard())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const post = await getPost(id);
  if (!post) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const patch: Parameters<typeof updatePost>[1] = {};

  if (typeof body.caption === "string") patch.caption = body.caption;

  if (typeof body.status === "string") {
    const status = body.status as PostStatus;
    const now = new Date().toISOString();
    patch.status = status;
    patch.decidedAt = status === "pending" ? null : now;
    patch.history = [...post.history, { status, at: now, by: "admin" as const }];
    // Ao tirar de aprovado, cancela agendamento pendente.
    if (status !== "approved" && post.publishStatus === "scheduled") {
      patch.publishStatus = "draft";
      patch.scheduledAt = null;
    }
  }

  // Agendamento: só posts aprovados podem ser agendados.
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
          { error: "Só criativos aprovados podem ser agendados." },
          { status: 400 },
        );
      patch.scheduledAt = when.toISOString();
      patch.publishStatus = "scheduled";
      patch.publishError = null;
    }
  }

  const updated = await updatePost(id, patch);
  return NextResponse.json({ post: updated });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await guard())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await deletePost(id);
  return NextResponse.json({ ok: true });
}
