import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getClient } from "@/lib/repo";
import { reportData } from "@/lib/reports/db";
import { validPeriod } from "@/lib/reports/input";

/**
 * Números de um cliente num período — o editor busca de novo quando o
 * cliente ou o período do relatório mudam. Sem `client`, números de exemplo.
 */
export async function GET(req: Request) {
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Sessão expirada. Entre de novo para continuar." }, { status: 401 });
  const url = new URL(req.url);
  const period = validPeriod(url.searchParams.get("start"), url.searchParams.get("end"));
  if (!period) return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  const clientId = Number(url.searchParams.get("client")) || null;
  const client = clientId ? await getClient(clientId) : null;
  if (clientId && !client) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  const data = await reportData(client ? { id: client.id, name: client.name, leadSource: client.lead_source } : null, period.start, period.end);
  return NextResponse.json({ data });
}
