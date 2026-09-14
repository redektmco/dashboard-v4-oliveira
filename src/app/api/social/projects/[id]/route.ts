import { NextResponse, after } from "next/server";
import { revalidatePath } from "next/cache";
import { canManageSocial, getSessionUser } from "@/lib/auth";
import { getClient } from "@/lib/repo";
import { deleteProject, getProject, listPosts, updateProject } from "@/lib/social/db";
import { deleteAssets } from "@/lib/social/storage";

type Ctx = { params: Promise<{ id: string }> };

async function guard() {
  const u = await getSessionUser();
  return u && canManageSocial(u) ? u : null;
}

export async function GET(_req: Request, { params }: Ctx) {
  if (!(await guard())) return NextResponse.json({ error: "Sessão expirada ou sem permissão." }, { status: 401 });
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  const posts = await listPosts(id);
  return NextResponse.json({ project, posts });
}

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await guard())) return NextResponse.json({ error: "Sessão expirada ou sem permissão." }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const patch: Parameters<typeof updateProject>[1] = {};
  if (typeof body.title === "string") {
    if (!body.title.trim()) return NextResponse.json({ error: "Informe o título." }, { status: 400 });
    patch.title = body.title.trim().slice(0, 120);
  }
  if (typeof body.igHandle === "string") patch.igHandle = body.igHandle.trim().replace(/^@/, "").slice(0, 60);
  if (typeof body.archived === "boolean") patch.archived = body.archived;
  if ("clientId" in body) {
    const clientId = body.clientId == null || body.clientId === "" ? null : Number(body.clientId);
    patch.clientId = clientId;
    // O nome exibido acompanha o cliente da carteira.
    if (clientId) {
      const client = await getClient(clientId);
      if (!client) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 400 });
      patch.clientName = client.name;
    }
  }
  if (typeof body.clientName === "string" && body.clientName.trim()) patch.clientName = body.clientName.trim();

  const project = await updateProject(id, patch);
  if (!project) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  revalidatePath("/social");
  return NextResponse.json({ project });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await guard())) return NextResponse.json({ error: "Sessão expirada ou sem permissão." }, { status: 401 });
  const { id } = await params;
  const urls = await deleteProject(id);
  after(() => deleteAssets(urls));
  revalidatePath("/social");
  return NextResponse.json({ ok: true });
}
