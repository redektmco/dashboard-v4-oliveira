import { NextResponse } from "next/server";
import { recomputeAll, recomputeRange, today } from "@/lib/repo";
import { applyScheduledInactivations } from "@/lib/churn/db";

/**
 * Job diário via HTTP, para quem prefere agendar fora do host (briefing 7).
 * Protegido por token simples — sem token configurado, só aceita chamada local.
 */
export async function POST(req: Request) {
  const token = process.env.RECOMPUTE_TOKEN;
  // O cron da Vercel não manda `x-recompute-token`: ele se identifica com
  // `Authorization: Bearer $CRON_SECRET`. Sem aceitar os dois, definir o
  // RECOMPUTE_TOKEN silenciava o job diário com 401.
  const cronSecret = process.env.CRON_SECRET;
  const fromCron = Boolean(cronSecret) && req.headers.get("authorization") === `Bearer ${cronSecret}`;
  if (token && !fromCron && req.headers.get("x-recompute-token") !== token) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  // Cancelamento com data efetiva alcançada: o cliente sai da carteira antes do recálculo.
  await applyScheduledInactivations(today());
  const days = Number(new URL(req.url).searchParams.get("days") ?? 0);
  const result = days > 0 ? await recomputeRange(days) : await recomputeAll();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return POST(req);
}
