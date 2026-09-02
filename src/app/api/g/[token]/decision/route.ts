import { NextResponse } from "next/server";
import { getPost, getProjectByToken, updatePost } from "@/lib/social/db";
import type { PostStatus } from "@/lib/social/types";

type Ctx = { params: Promise<{ token: string }> };

const VALID: PostStatus[] = ["approved", "rejected", "pending"];

/**
 * Decisão do cliente (guest, sem login). Autenticada pelo token do projeto
 * na URL — 144 bits, não-adivinhável. Rota liberada no proxy.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  const project = await getProjectByToken(token);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const postId = String(body.postId || "");
  const status = body.status as PostStatus;
  const feedback =
    typeof body.feedback === "string" ? body.feedback.slice(0, 500) : undefined;

  if (!VALID.includes(status))
    return NextResponse.json({ error: "invalid status" }, { status: 400 });

  const post = await getPost(postId);
  if (!post || post.projectId !== project.id)
    return NextResponse.json({ error: "post not found" }, { status: 404 });

  const now = new Date().toISOString();
  const updated = await updatePost(postId, {
    status,
    decidedAt: status === "pending" ? null : now,
    feedback: status === "rejected" ? feedback ?? null : null,
    history: [...post.history, { status, at: now, by: "client" }],
    // Reprovar/voltar a pendente desmarca um agendamento pendente.
    ...(status !== "approved" && post.publishStatus === "scheduled"
      ? { publishStatus: "draft" as const, scheduledAt: null }
      : {}),
  });

  return NextResponse.json({ post: updated });
}
