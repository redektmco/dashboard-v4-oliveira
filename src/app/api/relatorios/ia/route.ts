import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getClient } from "@/lib/repo";
import { AiError, writeBlockText } from "@/lib/reports/ai";
import { getReport, reportData } from "@/lib/reports/db";
import { validPeriod } from "@/lib/reports/input";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * "Escrever com IA": o texto de um bloco a partir dos números do relatório.
 * Os números são recalculados aqui (com a última sincronização, se houver) —
 * o navegador manda só qual relatório, cliente, período e o bloco.
 */
export async function POST(req: Request) {
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Sessão expirada. Entre de novo para continuar." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const report = typeof body.reportId === "string" ? await getReport(body.reportId) : null;
  if (!report) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });
  const period = validPeriod(body.start, body.end);
  if (!period) return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  const clientId = Number(body.clientId) || null;
  const client = clientId ? await getClient(clientId) : null;

  const str = (k: string, max: number) => (typeof body[k] === "string" ? (body[k] as string).slice(0, max) : "");
  try {
    const data = await reportData(client ? { id: client.id, name: client.name, leadSource: client.lead_source } : null, period.start, period.end, report.live);
    const text = await writeBlockText({
      data,
      kind: body.kind === "heading" ? "heading" : "text",
      current: str("current", 4000),
      instruction: str("instruction", 1000),
      pageContext: str("pageContext", 4000),
      maxWords: Number(body.maxWords) || 120,
    });
    return NextResponse.json({ text });
  } catch (e) {
    if (e instanceof AiError) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error("relatorios/ia", e);
    return NextResponse.json({ error: "Não foi possível gerar o texto agora. Tente de novo." }, { status: 500 });
  }
}
