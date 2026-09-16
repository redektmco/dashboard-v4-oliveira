import { NextResponse, after } from "next/server";
import { countByStatus, getPost, getProjectByToken, updatePost } from "@/lib/social/db";
import { notifyProjectEvaluated } from "@/lib/social/notify";
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
  if (!project) return NextResponse.json({ error: "Link de aprovação inválido ou arquivado." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const postId = String(body.postId || "");
  const status = body.status as PostStatus;
  const feedback =
    typeof body.feedback === "string" && body.feedback.trim() ? body.feedback.trim().slice(0, 1000) : null;

  if (!VALID.includes(status))
    return NextResponse.json({ error: "Decisão inválida." }, { status: 400 });

  const post = await getPost(postId);
  if (!post || post.projectId !== project.id)
    return NextResponse.json({ error: "Criativo não encontrado." }, { status: 404 });
  // Rascunho nunca foi para o link: não existe decisão a tomar sobre ele, e
  // responder 404 evita confirmar que o id existe.
  if (post.status === "draft")
    return NextResponse.json({ error: "Criativo não encontrado." }, { status: 404 });

  const now = new Date().toISOString();
  const updated = await updatePost(postId, {
    status,
    decidedAt: status === "pending" ? null : now,
    // O comentário vale para aprovar com ressalva e para reprovar.
    feedback: status === "pending" ? null : feedback,
    history: [...post.history, { status, at: now, by: "client" }],
    // Reprovar/voltar a pendente tira a data do calendário.
    ...(status !== "approved" && post.publishStatus === "scheduled"
      ? { publishStatus: "draft" as const, scheduledAt: null }
      : {}),
  });

  // Avisa a equipe quando esta decisão foi a que fechou a avaliação: o post
  // saiu de "pendente" e não sobrou nenhum pendente no projeto. Depois da
  // resposta — o cliente não espera o webhook.
  if (post.status === "pending" && status !== "pending") {
    after(async () => {
      const summary = await countByStatus(project.id);
      if (summary.total > 0 && summary.pending === 0) await notifyProjectEvaluated(project, summary);
    });
  }

  return NextResponse.json({ post: updated });
}
