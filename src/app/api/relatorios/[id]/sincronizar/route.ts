import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { getClient } from "@/lib/repo";
import { getReport, reportData, saveLive, updateReport } from "@/lib/reports/db";
import { validPeriod } from "@/lib/reports/input";
import { NoAccountsError, syncLive } from "@/lib/reports/live";

type Ctx = { params: Promise<{ id: string }> };

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Botão "Sincronizar" do editor: lê Meta e Google ao vivo para o cliente e o
 * período pedidos e devolve os números prontos para os blocos. Num relatório,
 * grava a leitura (é ela que o link público mostra) junto com o cliente e o
 * período; num modelo, só devolve — a prévia não fica presa a ninguém.
 */
export async function POST(req: Request, { params }: Ctx) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sessão expirada. Entre de novo para continuar." }, { status: 401 });
  const { id } = await params;
  const report = await getReport(id);
  if (!report) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { clientId?: unknown; start?: unknown; end?: unknown };
  const clientId = Number(body.clientId ?? report.clientId) || null;
  const period = validPeriod(body.start ?? report.periodStart, body.end ?? report.periodEnd);
  if (!period) return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  const client = clientId ? await getClient(clientId) : null;
  if (!client) return NextResponse.json({ error: "Escolha o cliente para sincronizar." }, { status: 400 });

  let snap;
  try {
    snap = await syncLive(client.id, period.start, period.end);
  } catch (e) {
    const status = e instanceof NoAccountsError ? 400 : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Não foi possível ler a Meta e o Google." }, { status });
  }

  if (report.kind === "report") {
    await updateReport(id, { clientId: client.id, periodStart: period.start, periodEnd: period.end }, me.id);
    await saveLive(id, snap);
    revalidatePath("/relatorios");
  }
  const data = await reportData({ id: client.id, name: client.name, leadSource: client.lead_source }, period.start, period.end, snap);
  return NextResponse.json({ data });
}
