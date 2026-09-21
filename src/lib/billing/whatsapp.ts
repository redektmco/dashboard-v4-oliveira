// ============================================================
// Envio de fatura por WhatsApp — Meta Cloud API (Business Platform),
// via fetch. Opt-in: sem WHATSAPP_TOKEN, WHATSAPP_PHONE_ID e
// WHATSAPP_TEMPLATE_NAME configurados, o canal é pulado no disparo.
//
// Mensagem iniciada pela empresa fora da janela de 24h exige um template
// pré-aprovado no Meta Business Manager (não dá para mandar texto livre).
// O template precisa de 3 variáveis de corpo nesta ordem: nome do cliente,
// descrição da cobrança, valor formatado, vencimento formatado — ajuste
// `WHATSAPP_TEMPLATE_NAME`/`WHATSAPP_TEMPLATE_LANG` para o que foi aprovado.
// ============================================================

export function isWhatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID && process.env.WHATSAPP_TEMPLATE_NAME);
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBR = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR");

/** Telefone em E.164 sem o `+` (formato exigido pela Cloud API). */
function toWaId(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

/** Manda a fatura por WhatsApp via Meta Cloud API. No-op (com erro explicado) se não configurado. */
export async function sendInvoiceWhatsapp(input: {
  to: string;
  clientName: string;
  description: string;
  amount: number;
  dueDate: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!isWhatsappConfigured()) {
    return { ok: false, error: "WHATSAPP_TOKEN/WHATSAPP_PHONE_ID/WHATSAPP_TEMPLATE_NAME não configurados" };
  }
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const template = process.env.WHATSAPP_TEMPLATE_NAME;
  const lang = process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR";
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toWaId(input.to),
        type: "template",
        template: {
          name: template,
          language: { code: lang },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: input.clientName },
                { type: "text", text: input.description },
                { type: "text", text: brl(input.amount) },
                { type: "text", text: dateBR(input.dueDate) },
              ],
            },
          ],
        },
      }),
    });
    if (!res.ok) return { ok: false, error: `whatsapp cloud api respondeu ${res.status}: ${(await res.text()).slice(0, 300)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
