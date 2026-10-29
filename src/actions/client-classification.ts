"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { classifyClient } from "@/lib/client-classification";
import { validateClassification } from "@/lib/client-lifecycle";
import { getClient } from "@/lib/repo";
import { logChange } from "@/lib/audit";
import type { ActionResult } from "@/lib/action";

export async function saveClientClassification(_: ActionResult, form: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const id = Number(form.get("id"));
  const client = Number.isInteger(id) && id > 0 ? await getClient(id) : null;
  if (!client) return { error: "Cliente não encontrado." };
  const input = {
    status: String(form.get("lifecycle_status") ?? ""), revenueModel: String(form.get("revenue_model") ?? ""),
    mrr: String(form.get("mrr") ?? "").trim() === "" ? NaN : Number(String(form.get("mrr")).replace(",", ".")),
    source: String(form.get("source") ?? ""), confirmed: form.get("confirmed") === "on",
  };
  const error = validateClassification(input);
  if (error) return { error };
  await classifyClient(id, me.id, input);
  await logChange(me, "cliente", `Situação/receita conferidas: ${client.name}. Fonte: ${input.source.trim()}`, { clientId: id });
  for (const path of ["/", "/clientes", `/clientes/${id}`, "/gt", "/account", "/config"]) revalidatePath(path);
  return { ok: "Cadastro atualizado. A classificação anterior e a fonte foram preservadas no histórico." };
}
