import { NextResponse, after } from "next/server";
import { revalidatePath } from "next/cache";
import { canManageSocial, getSessionUser } from "@/lib/auth";
import { COVER_FOLDER, isValidClientKey } from "@/lib/social/clients";
import { clearClientCover, getClientCover, setClientCover } from "@/lib/social/db";
import { deleteAssets, isOwnBlobUrl } from "@/lib/social/storage";

/**
 * Capa do cliente na grade da aba Projetos.
 *
 * `PUT { key, imageUrl }` grava; `imageUrl: null` remove. A arte já subiu
 * direto ao Blob por `/api/social/upload` ({ cover: true }) — aqui só
 * guardamos a URL, depois de confirmar que ela é do nosso store e da pasta
 * das capas: sem isso qualquer URL cairia na tela do painel. A capa
 * substituída é apagada do Blob depois da resposta, para não deixar órfão.
 */
export async function PUT(req: Request) {
  const user = await getSessionUser();
  if (!user || !canManageSocial(user))
    return NextResponse.json({ error: "Sessão expirada ou sem permissão." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { key?: unknown; imageUrl?: unknown };
  if (!isValidClientKey(body.key))
    return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });

  const previous = await getClientCover(body.key);

  if (body.imageUrl == null) {
    await clearClientCover(body.key);
  } else {
    // `isOwnBlobUrl(url, COVER_FOLDER)` exige o prefixo `/social/clientes/`.
    if (typeof body.imageUrl !== "string" || !isOwnBlobUrl(body.imageUrl, COVER_FOLDER))
      return NextResponse.json({ error: "Imagem inválida." }, { status: 400 });
    await setClientCover(body.key, body.imageUrl, user.id);
  }

  if (previous && previous !== body.imageUrl) after(() => deleteAssets([previous]));
  revalidatePath("/social");
  return NextResponse.json({ imageUrl: body.imageUrl ?? null });
}
