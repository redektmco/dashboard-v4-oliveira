"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import type { ActionResult } from "@/lib/action";
import {
  createCharge,
  setBillingContact,
  setChargeActive,
  updateCharge,
} from "@/lib/billing/db";
import { runDailyDispatch } from "@/lib/billing/dispatch";
import type { BillingRecurrence } from "@/lib/billing/types";

const str = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() ?? "";
// `amount` vem do <NumberField> (input[type=number]): o DOM já entrega o
// valor com ponto decimal, nunca vírgula — diferente dos campos de texto
// livre do resto do app, que usam vírgula (BR) e por isso trocam "," por ".".
const numOrNull = (f: FormData, k: string) => {
  const v = str(f, k);
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Cria ou edita uma parcela — e, se preenchido, atualiza o contato de cobrança do cliente junto. */
export async function saveCharge(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();

  const id = str(formData, "id");
  const clientId = Number(str(formData, "client_id"));
  const description = str(formData, "description");
  const amount = numOrNull(formData, "amount");
  const dueDate = str(formData, "due_date");
  const recurrence = (str(formData, "recurrence") || "unica") as BillingRecurrence;
  const billingEmail = str(formData, "billing_email");
  const billingPhone = str(formData, "billing_phone");

  if (!clientId) return { error: "Escolha o cliente." };
  if (!description) return { error: "Descreva a cobrança." };
  if (amount === null || amount <= 0) return { error: "Informe um valor válido." };
  if (!dueDate) return { error: "Informe a data de vencimento." };
  if (recurrence !== "unica" && recurrence !== "mensal") return { error: "Recorrência inválida." };

  await setBillingContact(clientId, billingEmail || null, billingPhone || null);

  if (id) {
    await updateCharge(Number(id), { description, amount, dueDate, recurrence });
  } else {
    await createCharge({ clientId, description, amount, dueDate, recurrence, createdBy: me.id ?? null });
  }

  revalidatePath("/config/cobranca");
  return { ok: id ? "Cobrança atualizada." : "Cobrança cadastrada." };
}

export async function pauseCharge(id: number, active: boolean): Promise<ActionResult> {
  await requireAdmin();
  await setChargeActive(id, active);
  revalidatePath("/config/cobranca");
  return { ok: active ? "Cobrança reativada." : "Cobrança encerrada. O histórico de disparos continua guardado." };
}

/**
 * Roda o disparo do dia na hora, sem esperar o cron das 0h — útil para
 * testar a configuração de e-mail/WhatsApp antes do vencimento chegar.
 */
export async function testDispatchNow(): Promise<ActionResult> {
  await requireAdmin();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app.v4oliveira.com.br";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const summary = await runDailyDispatch(`${proto}://${host}`);
  revalidatePath("/config/cobranca");
  if (summary.checked === 0) return { ok: "Nenhuma cobrança vence hoje." };
  return {
    ok: `${summary.checked} cobrança(s) vencendo hoje — ${summary.sent} disparo(s) enviado(s), ${summary.failed} falharam, ${summary.skipped} sem canal configurado.`,
  };
}
