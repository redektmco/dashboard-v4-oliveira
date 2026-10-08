import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSessionUser } from "@/lib/auth";
import { isStorageConfigured } from "@/lib/social/storage";
import { CHURN_FOLDER, EVIDENCE_TYPES, MAX_EVIDENCE_BYTES } from "@/lib/churn/storage";

/**
 * Token de upload das evidências do churn. O arquivo vai do navegador direto
 * ao Blob; aqui só se autoriza quem está logado, para a pasta do churn, nos
 * formatos aceitos (PDF, PNG, JPG, EML) e até 10 MB.
 */
export async function POST(req: Request) {
  if (!isStorageConfigured())
    return NextResponse.json({ error: "Armazenamento de arquivos não configurado (BLOB_READ_WRITE_TOKEN)." }, { status: 503 });

  const body = (await req.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  const user = await getSessionUser();

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!user) throw new Error("Sessão expirada. Entre de novo para continuar.");
        if (!pathname.startsWith(`${CHURN_FOLDER}/`)) throw new Error("Destino inválido.");
        return {
          allowedContentTypes: EVIDENCE_TYPES,
          maximumSizeInBytes: MAX_EVIDENCE_BYTES,
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
