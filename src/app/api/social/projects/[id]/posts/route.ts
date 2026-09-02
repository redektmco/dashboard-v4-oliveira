import { NextResponse } from "next/server";
import { canManageSocial, getSessionUser } from "@/lib/auth";
import { createPosts, getProject, nextOrder } from "@/lib/social/db";
import { newId } from "@/lib/social/id";
import { isImageType, isStorageConfigured, saveImage } from "@/lib/social/storage";
import { matchCaptionsToFiles, parseBatchCaptions } from "@/lib/social/batch";
import type { Asset } from "@/lib/social/types";

type Ctx = { params: Promise<{ id: string }> };

async function fileToAsset(file: File): Promise<Asset> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const saved = await saveImage(buffer, file.name, file.type);
  return { id: newId("ast_"), url: saved.url, name: saved.name };
}

export async function POST(req: Request, { params }: Ctx) {
  const u = await getSessionUser();
  if (!u || !canManageSocial(u))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!isStorageConfigured())
    return NextResponse.json(
      { error: "Armazenamento de imagens não configurado (BLOB_READ_WRITE_TOKEN)." },
      { status: 503 },
    );

  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid form" }, { status: 400 });

  const mode = String(form.get("mode") || "single");
  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (files.length === 0)
    return NextResponse.json({ error: "Envie ao menos uma arte." }, { status: 400 });

  for (const f of files) {
    if (!isImageType(f.type))
      return NextResponse.json({ error: `Arquivo não é imagem: ${f.name}` }, { status: 400 });
  }

  let order = await nextOrder(id);
  const posts: { id: string; projectId: string; order: number; caption: string; assets: Asset[] }[] = [];

  if (mode === "batch") {
    const captionsRaw = String(form.get("captionsRaw") || "");
    const blocks = parseBatchCaptions(captionsRaw);
    const captions = matchCaptionsToFiles(blocks, files.map((f) => f.name));
    for (let i = 0; i < files.length; i++) {
      const asset = await fileToAsset(files[i]);
      posts.push({
        id: newId("pst_"),
        projectId: id,
        order: order++,
        caption: captions[i] ?? "",
        assets: [asset],
      });
    }
  } else {
    // Post único = uma legenda, uma ou mais artes (carrossel).
    const caption = String(form.get("caption") || "");
    const assets: Asset[] = [];
    for (const f of files) assets.push(await fileToAsset(f));
    posts.push({ id: newId("pst_"), projectId: id, order: order++, caption, assets });
  }

  await createPosts(posts);
  return NextResponse.json({ count: posts.length }, { status: 201 });
}
