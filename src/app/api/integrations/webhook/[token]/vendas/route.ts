import { NextResponse } from "next/server";
import { getIntegrationByToken, persistScore, scoreFor, today } from "@/lib/repo";
import { recordSaleReceipt } from "@/lib/crm/sale-receipt";
import { ritualWeekEnd } from "@/lib/week";
import { readBody, saleDedup, saleValue } from "@/lib/crm/webhook";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Webhook de vendas do CRM — a URL irmã da de leads, com o mesmo token.
 * No CRM, o gatilho é "negócio ganho" (ou "venda realizada"): cada POST conta
 * uma venda na semana-ritual corrente com o valor do payload (`valor`,
 * `value`, `price`, `amount`…, em qualquer nível, JSON ou formulário). A soma
 * vira Faturamento, ROAS e ROI no score e o score do dia é recalculado.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  const integration = await getIntegrationByToken(token);
  if (!integration || !integration.active) {
    return NextResponse.json({ error: "integração inválida ou inativa" }, { status: 404 });
  }

  const bag = await readBody(req);
  const value = saleValue(bag);
  if (value === null) {
    // Sem valor não há faturamento a somar: avisa o CRM em vez de contar zero calado.
    return NextResponse.json(
      { error: "venda sem valor — mande o valor em 'valor', 'value', 'price' ou 'amount'" },
      { status: 422 },
    );
  }

  const refDate = ritualWeekEnd(today());
  const receipt = await recordSaleReceipt(integration.client_id, refDate, saleDedup(bag), value, bag);

  const r = await scoreFor(integration.client_id);
  if (r) await persistScore(integration.client_id, today(), r);

  return NextResponse.json({
    ok: true, counted: receipt.counted, value: receipt.value, ref_date: receipt.refDate,
    received_at: receipt.receivedAt, received_date: receipt.receivedDate,
    reference_week_end: receipt.refDate,
  });
}

/** Validação de URL que alguns CRMs fazem antes de ativar — responde sem contar. */
export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  const integration = await getIntegrationByToken(token);
  if (!integration) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, ready: Boolean(integration.active), kind: "vendas" });
}
