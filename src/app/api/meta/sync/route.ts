import { NextResponse } from "next/server";
import { recomputeRange } from "@/lib/repo";
import { metaConfigured } from "@/lib/meta/graph";
import { syncMeta } from "@/lib/meta/sync";

export const maxDuration = 300;

/**
 * Sincronização diária do Meta Ads (cron da Vercel, antes do recompute).
 * Mesma proteção do /api/recompute: `Authorization: Bearer $CRON_SECRET` do
 * cron ou `x-recompute-token`. `?weeks=12` refaz um histórico maior.
 */
export async function POST(req: Request) {
  const token = process.env.RECOMPUTE_TOKEN;
  const cronSecret = process.env.CRON_SECRET;
  const fromCron = Boolean(cronSecret) && req.headers.get("authorization") === `Bearer ${cronSecret}`;
  if (token && !fromCron && req.headers.get("x-recompute-token") !== token) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  if (!metaConfigured()) {
    return NextResponse.json({ ok: false, skipped: "META_ACCESS_TOKEN não configurado" });
  }

  const weeks = Number(new URL(req.url).searchParams.get("weeks") ?? 3) || 3;
  const result = await syncMeta({ weeks });
  // Semanas fechadas podem ter mudado — refaz a série que elas alcançam.
  const recompute = await recomputeRange(Math.min(weeks * 7 + 7, 120));
  return NextResponse.json({ ...result, synced: result.ok, ok: result.failed.length === 0, recompute });
}

export async function GET(req: Request) {
  return POST(req);
}
