import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { canManageSocial, getSessionUser } from "@/lib/auth";
import { getProject } from "@/lib/social/db";
import { IMAGE_TYPES, MAX_VIDEO_BYTES, VIDEO_TYPES } from "@/lib/social/media";
import { deleteAssets, isOwnBlobUrl, isStorageConfigured } from "@/lib/social/storage";

/**
 * Client upload do Vercel Blob. O navegador pede aqui um token de curta
 * duração e envia o arquivo direto ao Blob — o arquivo nunca atravessa esta
 * função nem o proxy do Next (que truncava o corpo em 10 MB e quebrava o lote).
 *
 * O token só sai para quem opera Social media, só para a pasta do projeto
 * (`social/<projectId>/...`) e só para imagem/vídeo dentro do limite.
 */
export async function POST(req: Request) {
  if (!isStorageConfigured())
    return NextResponse.json(
      { error: "Armazenamento de mídias não configurado (BLOB_READ_WRITE_TOKEN)." },
      { status: 503 },
    );

  const body = (await req.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  const user = await getSessionUser();

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!user || !canManageSocial(user)) throw new Error("Sem permissão para enviar mídias.");
        const { projectId } = JSON.parse(clientPayload || "{}") as { projectId?: string };
        if (!projectId || !(await getProject(projectId))) throw new Error("Projeto não encontrado.");
        if (!pathname.startsWith(`social/${projectId}/`)) throw new Error("Destino inválido.");
        return {
          allowedContentTypes: [...IMAGE_TYPES, ...VIDEO_TYPES],
          maximumSizeInBytes: MAX_VIDEO_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ projectId, userId: user.id }),
        };
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Falha ao autorizar o envio." }, { status: 400 });
  }
}

/**
 * Limpeza de órfãos: o arquivo subiu mas o post não foi criado (o usuário
 * descartou o envio, ou a criação falhou). Melhor esforço.
 */
export async function DELETE(req: Request) {
  const user = await getSessionUser();
  if (!user || !canManageSocial(user)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { urls } = (await req.json().catch(() => ({}))) as { urls?: unknown };
  const list = Array.isArray(urls) ? urls.filter((u): u is string => typeof u === "string" && isOwnBlobUrl(u)) : [];
  await deleteAssets(list.slice(0, 100));
  return NextResponse.json({ ok: true, removed: list.length });
}
