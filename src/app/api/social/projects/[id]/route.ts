import { NextResponse } from "next/server";
import { canManageSocial, getSessionUser } from "@/lib/auth";
import { deleteProject, getProject, listPosts, updateProject } from "@/lib/social/db";

type Ctx = { params: Promise<{ id: string }> };

async function guard() {
  const u = await getSessionUser();
  return u && canManageSocial(u) ? u : null;
}

export async function GET(_req: Request, { params }: Ctx) {
  if (!(await guard())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
  const posts = await listPosts(id);
  return NextResponse.json({ project, posts });
}

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await guard())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const patch: Parameters<typeof updateProject>[1] = {};
  if (typeof body.title === "string") patch.title = body.title.trim();
  if (typeof body.clientName === "string") patch.clientName = body.clientName.trim();
  if (typeof body.igHandle === "string") patch.igHandle = body.igHandle.trim().replace(/^@/, "");
  if (typeof body.archived === "boolean") patch.archived = body.archived;
  if ("clientId" in body) patch.clientId = body.clientId == null ? null : Number(body.clientId);
  if (typeof body.igUserId === "string") patch.igUserId = body.igUserId.trim() || null;
  if (typeof body.igAccessToken === "string")
    patch.igAccessToken = body.igAccessToken.trim() || null;

  const project = await updateProject(id, patch);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ project });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await guard())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await deleteProject(id);
  return NextResponse.json({ ok: true });
}
