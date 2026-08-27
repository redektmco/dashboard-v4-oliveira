import { NextResponse } from "next/server";
import { recomputeAll, recomputeRange } from "@/lib/repo";

/**
 * Job diário via HTTP, para quem prefere agendar fora do host (briefing 7).
 * Protegido por token simples — sem token configurado, só aceita chamada local.
 */
export async function POST(req: Request) {
  const token = process.env.RECOMPUTE_TOKEN;
  if (token && req.headers.get("x-recompute-token") !== token) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const days = Number(new URL(req.url).searchParams.get("days") ?? 0);
  const result = days > 0 ? await recomputeRange(days) : await recomputeAll();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return POST(req);
}
