import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSessionUser } from "@/lib/auth";

/**
 * Client upload do Vercel Blob para as imagens dos relatórios (print de
 * criativo, logo do cliente). O navegador pede aqui um token curto e envia o
 * arquivo direto ao Blob. Qualquer usuário logado, só a pasta `relatorios/`,
 * só imagem. Requer BLOB_READ_WRITE_TOKEN.
 */

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "image/svg+xml"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN)
    return NextResponse.json(
      { error: "Armazenamento de imagens não configurado (BLOB_READ_WRITE_TOKEN). Cole o endereço da imagem." },
      { status: 503 },
    );

  const body = (await req.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  const user = await getSessionUser();

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!user) throw new Error("Sessão expirada. Entre de novo para continuar.");
        if (!pathname.startsWith("relatorios/")) throw new Error("Destino inválido.");
        return {
          allowedContentTypes: IMAGE_TYPES,
          maximumSizeInBytes: MAX_IMAGE_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.id }),
        };
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Falha ao autorizar o envio." }, { status: 400 });
  }
}
