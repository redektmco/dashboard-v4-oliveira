import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { today } from "@/lib/repo";
import { parsePeriod } from "@/lib/ficha-period";
import { performanceFor } from "@/lib/performance/live";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Aba Performance da ficha: Meta e Google lidos ao vivo no período da URL
 * (`?periodo=30d` ou `?de=…&ate=…`, o mesmo filtro da ficha). Fica fora da
 * página porque as APIs levam alguns segundos — a ficha abre na hora e a
 * aba carrega quando alguém a abre.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Sessão expirada. Entre de novo para continuar." }, { status: 401 });
  const clientId = Number((await params).id);
  if (!Number.isInteger(clientId)) return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const data = await performanceFor(clientId, parsePeriod(sp, today()));
  if (!data) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  return NextResponse.json({ data });
}
