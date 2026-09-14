import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSessionUser } from "@/lib/auth";

/**
 * Client upload do Vercel Blob para banners de categoria e thumbnails de aula.
 * O navegador pede aqui um token de curta duração e envia o arquivo direto ao
 * Blob — o arquivo nunca atravessa esta função nem o proxy. Só admin, só a
 * pasta `onboarding/`, só imagem dentro do limite. Requer BLOB_READ_WRITE_TOKEN.
 */

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // banners/thumbs são leves de propósito

export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN)
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
      onBeforeGenerateToken: async (pathname) => {
        if (!user || !user.is_admin) throw new Error("Sem permissão para enviar mídias.");
        if (!pathname.startsWith("onboarding/")) throw new Error("Destino inválido.");
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
    return NextResponse.json(
      { error: (e as Error).message || "Falha ao autorizar o envio." },
      { status: 400 },
    );
  }
}
