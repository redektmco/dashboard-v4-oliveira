import { NextResponse } from "next/server";
import { runDailyDispatch } from "@/lib/billing/dispatch";

/**
 * Job diário de cobrança — dispara às 0h de São Paulo (`vercel.json`,
 * `0 3 * * *` UTC). Mesma proteção do `/api/recompute`: aceita o cron da
 * Vercel (`Authorization: Bearer $CRON_SECRET`) ou `x-billing-token` quando
 * `BILLING_DISPATCH_TOKEN` estiver configurado; sem nenhum dos dois, só
 * aceita chamada local (sem token nenhum configurado).
 */
export async function POST(req: Request) {
  const token = process.env.BILLING_DISPATCH_TOKEN;
  const cronSecret = process.env.CRON_SECRET;
  const fromCron = Boolean(cronSecret) && req.headers.get("authorization") === `Bearer ${cronSecret}`;
  if (token && !fromCron && req.headers.get("x-billing-token") !== token) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app.v4oliveira.com.br";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const summary = await runDailyDispatch(`${proto}://${host}`);
  return NextResponse.json({ ok: true, ...summary });
}

export async function GET(req: Request) {
  return POST(req);
}
