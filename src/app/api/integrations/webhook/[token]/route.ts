import { NextResponse } from "next/server";
import { getIntegrationByToken, persistScore, recordLead, scoreFor, today } from "@/lib/repo";
import { ritualWeekEnd } from "@/lib/week";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Chave de dedup tirada do payload, quando o CRM manda algo estável (id do
 * lead, e-mail, telefone). Sem ela cada POST conta um lead — o que também é o
 * comportamento certo para um CRM que só dispara "lead novo". Aceita os campos
 * no topo ou aninhados em `lead`/`data`/`contact`, cobrindo os formatos comuns.
 */
function dedupFrom(bag: Record<string, unknown>): string | null {
  const nested = (k: string) => (bag[k] as Record<string, unknown> | undefined) ?? {};
  const lead = nested("lead");
  const data = nested("data");
  const contact = nested("contact");
  const cand =
    bag.id ??
    bag.lead_id ??
    bag.leadId ??
    bag.uuid ??
    bag.email ??
    bag.phone ??
    lead.id ??
    lead.email ??
    data.email ??
    contact.email;
  const s = cand == null ? "" : String(cand).trim().toLowerCase();
  return s ? s.slice(0, 200) : null;
}

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

  const body = await req.json().catch(() => ({}));
  const bag = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

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
