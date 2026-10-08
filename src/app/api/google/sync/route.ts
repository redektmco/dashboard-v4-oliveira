import { NextResponse } from "next/server";
import { recomputeRange } from "@/lib/repo";
import { googleAdsConfigured } from "@/lib/google/ads";
import { syncGoogle } from "@/lib/google/sync";

export const maxDuration = 300;

/**
 * Sincronização diária do Google Ads (cron da Vercel, antes do recompute).
 * Mesma proteção do /api/meta/sync: `Authorization: Bearer $CRON_SECRET` do
 * cron ou `x-recompute-token`. `?weeks=12` refaz um histórico maior.
 */
export async function POST(req: Request) {
  const token = process.env.RECOMPUTE_TOKEN;
  const cronSecret = process.env.CRON_SECRET;
  const fromCron = Boolean(cronSecret) && req.headers.get("authorization") === `Bearer ${cronSecret}`;
  const byToken = Boolean(token) && req.headers.get("x-recompute-token") === token;
  if ((token || cronSecret) && !fromCron && !byToken) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  if (!googleAdsConfigured()) {
    return NextResponse.json({ ok: false, skipped: "Google Ads não configurado (GOOGLE_ADS_DEVELOPER_TOKEN / GOOGLE_SA_*)" });
  }

  const weeks = Number(new URL(req.url).searchParams.get("weeks") ?? 3) || 3;
  const result = await syncGoogle({ weeks });
  const recompute = await recomputeRange(Math.min(weeks * 7 + 7, 120));
  return NextResponse.json({ ...result, synced: result.ok, ok: result.failed.length === 0, recompute });
}

export async function GET(req: Request) {
  return POST(req);
}
