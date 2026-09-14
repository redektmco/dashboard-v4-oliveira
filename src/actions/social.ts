"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSocial } from "@/lib/auth";
import { getClient } from "@/lib/repo";
import { createProject } from "@/lib/social/db";
import { newId, newToken } from "@/lib/social/id";
import type { ActionResult } from "@/lib/action";

const str = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() ?? "";

/**
 * Cria um projeto de aprovação, opcionalmente ligado a um cliente da carteira,
 * e abre o workspace dele. Chamado pelo modal "Novo projeto" (useActionState):
 * erro volta para o formulário; sucesso navega.
 */
export async function createSocialProject(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireSocial();

  const title = str(formData, "title");
  const clientIdRaw = str(formData, "clientId");
  const clientId = clientIdRaw ? Number(clientIdRaw) : null;

  let clientName = str(formData, "clientName");
  if (clientId) {
    const client = await getClient(clientId);
    if (client) clientName = client.name;
  }

  if (!title) return { error: "Informe o título do projeto." };
  if (!clientName) return { error: "Escolha o cliente da carteira ou informe o nome do cliente." };

  const igHandle =
    str(formData, "igHandle").replace(/^@/, "") || clientName.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9._]/g, "");

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
