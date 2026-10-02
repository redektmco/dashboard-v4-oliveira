import {
  advanceRecurring,
  chargesDueToday,
  finalizeDispatch,
  newTrackToken,
  reserveDispatch,
} from "./db";
import { isEmailConfigured, sendInvoiceEmail } from "./email";
import { isWhatsappConfigured, sendInvoiceWhatsapp } from "./whatsapp";
import type { DispatchSummary } from "./types";

/**
 * Roda o disparo do dia: para cada parcela ativa vencendo hoje, tenta
 * e-mail e WhatsApp (cada canal só se tiver contato do cliente e a
 * integração estiver configurada) e, se a parcela for recorrente, avança o
 * vencimento (1, 3 ou 12 meses). Compartilhado pelo cron (`/api/billing/dispatch`) e
 * pelo botão "Testar disparo agora" do painel.
 *
 * Idempotente no dia: `reserveDispatch` usa o índice único
 * (charge_id, due_date, channel) — uma segunda chamada no mesmo dia não
 * manda de novo o que já foi tentado.
 */
export async function runDailyDispatch(baseUrl: string): Promise<DispatchSummary> {
  const due = await chargesDueToday();
  const summary: DispatchSummary = { checked: due.length, sent: 0, failed: 0, skipped: 0 };

  for (const charge of due) {
    let anyRecurrenceTrigger = false;

    if (charge.billingEmail && isEmailConfigured()) {
      const token = newTrackToken();
      const logId = await reserveDispatch({
        chargeId: charge.id,
        clientId: charge.clientId,
        dueDate: charge.dueDate,
        amount: charge.amount,
        channel: "email",
        trackingToken: token,
      });
      if (logId) {
        anyRecurrenceTrigger = true;
        const r = await sendInvoiceEmail({
          to: charge.billingEmail,
          clientName: charge.clientName,
          description: charge.description,
          amount: charge.amount,
          dueDate: charge.dueDate,
          trackingPixelUrl: `${baseUrl}/api/billing/track/${token}`,
        });
        await finalizeDispatch(logId, r.ok ? "sent" : "failed", r.error ?? null);
        if (r.ok) summary.sent++;
        else summary.failed++;
      }
    } else if (charge.billingEmail) {
      summary.skipped++;
    }

    if (charge.billingPhone && isWhatsappConfigured()) {
      const logId = await reserveDispatch({
        chargeId: charge.id,
        clientId: charge.clientId,
        dueDate: charge.dueDate,
        amount: charge.amount,
        channel: "whatsapp",
        trackingToken: null,
      });
      if (logId) {
        anyRecurrenceTrigger = true;
        const r = await sendInvoiceWhatsapp({
          to: charge.billingPhone,
          clientName: charge.clientName,
          description: charge.description,
          amount: charge.amount,
          dueDate: charge.dueDate,
        });
        await finalizeDispatch(logId, r.ok ? "sent" : "failed", r.error ?? null);
        if (r.ok) summary.sent++;
        else summary.failed++;
      }
    } else if (charge.billingPhone) {
      summary.skipped++;
    }

    // Recorrente: só avança se algum canal foi de fato tentado hoje (evita
    // pular o mês quando a parcela não tinha nenhum contato configurado).
    if (charge.recurrence !== "unica" && anyRecurrenceTrigger) {
      await advanceRecurring(charge.id, charge.recurrence);
    }
  }

  return summary;
}
