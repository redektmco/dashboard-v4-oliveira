"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSocial } from "@/lib/auth";
import { getClient } from "@/lib/repo";
import { createProject } from "@/lib/social/db";
import { newId, newToken } from "@/lib/social/id";

const str = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() ?? "";

/** Cria um projeto de aprovação, opcionalmente ligado a um cliente da carteira. */
export async function createSocialProject(formData: FormData) {
  const me = await requireSocial();

  const title = str(formData, "title");
  const clientIdRaw = str(formData, "clientId");
  const clientId = clientIdRaw ? Number(clientIdRaw) : null;

  let clientName = str(formData, "clientName");
  if (clientId) {
    const client = await getClient(clientId);
    if (client) clientName = client.name;
  }

  if (!title || !clientName) {
    redirect(`/social?erro=${encodeURIComponent("Informe o título e o cliente.")}`);
  }

  const igHandle =
    str(formData, "igHandle").replace(/^@/, "") ||
    clientName.toLowerCase().replace(/\s+/g, "");

  const id = newId("prj_");
  await createProject({
    id,
    clientId,
    title,
    clientName,
    igHandle,
    guestToken: newToken(),
    createdBy: me.id,
  });

  revalidatePath("/social");
  redirect(`/social/projetos/${id}`);
}
