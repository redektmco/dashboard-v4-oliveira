// ============================================================
// Envio de fatura por e-mail — Resend, via fetch (sem dependência extra,
// mesma decisão do resto do projeto). Opt-in: sem RESEND_API_KEY e
// BILLING_FROM_EMAIL configurados, `isEmailConfigured()` é falso e o
// disparo pula o canal — nenhuma mensagem sai sem essas envs no ambiente.
// ============================================================

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.BILLING_FROM_EMAIL);
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBR = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");

function invoiceHtml(input: {
  clientName: string;
  description: string;
  amount: number;
  dueDate: string;
  trackingPixelUrl: string | null;
}): string {
  const pixel = input.trackingPixelUrl
    ? `<img src="${input.trackingPixelUrl}" width="1" height="1" alt="" style="display:block;border:0" />`
    : "";
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#f4f4f5;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5;">
      <tr>
        <td style="background:#e50914;padding:20px 28px;">
          <span style="color:#fff;font-size:16px;font-weight:700;">V4 Oliveira &amp; Co</span>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <p style="margin:0 0 12px;font-size:14px;">Olá, ${input.clientName},</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.5;">
            Segue a fatura referente a <strong>${input.description}</strong>.
          </p>
          <table role="presentation" width="100%" style="background:#f9f9f9;border-radius:8px;">
            <tr>
              <td style="padding:16px 20px;font-size:13px;color:#666;">Valor</td>
              <td style="padding:16px 20px;font-size:18px;font-weight:700;text-align:right;">${brl(input.amount)}</td>
            </tr>
            <tr>
              <td style="padding:0 20px 16px;font-size:13px;color:#666;">Vencimento</td>
              <td style="padding:0 20px 16px;font-size:13px;font-weight:600;text-align:right;">${dateBR(input.dueDate)}</td>
            </tr>
          </table>
          <p style="margin:20px 0 0;font-size:12px;color:#888;line-height:1.5;">
            Em caso de dúvida sobre esta cobrança, responda este e-mail ou fale com o seu Account.
          </p>
        </td>
      </tr>
    </table>
    ${pixel}
  </body>
</html>`;
}

/** Manda a fatura por e-mail via Resend. No-op (com erro explicado) se não configurado. */
export async function sendInvoiceEmail(input: {
  to: string;
  clientName: string;
  description: string;
  amount: number;
  dueDate: string;
  trackingPixelUrl: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) return { ok: false, error: "RESEND_API_KEY/BILLING_FROM_EMAIL não configurados" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.BILLING_FROM_EMAIL,
        to: [input.to],
        subject: `Fatura ${input.clientName} — vencimento ${dateBR(input.dueDate)}`,
        html: invoiceHtml(input),
      }),
    });
    if (!res.ok) return { ok: false, error: `resend respondeu ${res.status}: ${(await res.text()).slice(0, 300)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
