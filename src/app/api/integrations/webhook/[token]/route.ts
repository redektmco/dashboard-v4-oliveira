import { NextResponse } from "next/server";
import { getIntegrationByToken, persistScore, recordLead, scoreFor, today } from "@/lib/repo";
import { ritualWeekEnd } from "@/lib/week";
import { dedupFrom, readBody } from "@/lib/crm/webhook";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Webhook genérico de leads do CRM. Autenticado pelo token do cliente na URL
 * (144 bits, não-adivinhável) — rota liberada no proxy. Cada POST recebido
 * conta um lead na semana-ritual corrente e recalcula o score do dia, de modo
 * que a contagem entra direto no cálculo sem passar pelo preenchimento do GT.
 */
async function ingest(req: Request, token: string) {
  const integration = await getIntegrationByToken(token);
  if (!integration || !integration.active) {
    return NextResponse.json({ error: "integração inválida ou inativa" }, { status: 404 });
  }

  const bag = await readBody(req);

  const refDate = ritualWeekEnd(today());
  const counted = await recordLead(integration.client_id, refDate, dedupFrom(bag), bag);

  // Leads entram direto no score: recalcula e grava o snapshot do dia.
  const r = await scoreFor(integration.client_id);
  if (r) await persistScore(integration.client_id, today(), r);

  return NextResponse.json({ ok: true, counted, ref_date: refDate });
}

export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  return ingest(req, token);
}

/** Muitos CRMs validam a URL com um GET antes de ativar — respondemos sem contar. */
export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  const integration = await getIntegrationByToken(token);
  if (!integration) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, ready: Boolean(integration.active) });
}
