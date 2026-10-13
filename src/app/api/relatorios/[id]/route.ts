import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { getClient } from "@/lib/repo";
import { getReport, updateReport, type ReportPatch } from "@/lib/reports/db";
import { validPeriod } from "@/lib/reports/input";
import { sanitizeDoc } from "@/lib/reports/layout";

type Ctx = { params: Promise<{ id: string }> };

/** Documento salvo inteiro: ~60 páginas de blocos cabem folgadas aqui. */
const MAX_DOC_BYTES = 1_500_000;

/**
 * Salvamento automático do editor: título, cliente, período e o documento.
 * Cada campo é opcional — o editor manda só o que mudou.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sessão expirada. Entre de novo para continuar." }, { status: 401 });
  const { id } = await params;
  const report = await getReport(id);
  if (!report) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });

  const raw = await req.text();
  if (raw.length > MAX_DOC_BYTES) return NextResponse.json({ error: "Relatório grande demais para salvar." }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const patch: ReportPatch = {};
  if (typeof body.title === "string") {
    const title = body.title.trim().slice(0, 140);
    if (!title) return NextResponse.json({ error: "Informe o título." }, { status: 400 });
    patch.title = title;
  }
  if ("clientId" in body) {
    const clientId = body.clientId == null || body.clientId === "" ? null : Number(body.clientId);
    if (clientId !== null && !(await getClient(clientId)))
      return NextResponse.json({ error: "Cliente não encontrado." }, { status: 400 });
    if (clientId === null && report.kind === "report")
      return NextResponse.json({ error: "Relatório precisa de um cliente." }, { status: 400 });
    patch.clientId = clientId;
  }
  if ("periodStart" in body || "periodEnd" in body) {
    const p = validPeriod(body.periodStart, body.periodEnd);
    if (!p) return NextResponse.json({ error: "Período inválido." }, { status: 400 });
    patch.periodStart = p.start;
    patch.periodEnd = p.end;
  }
  if (body.doc !== undefined) patch.doc = sanitizeDoc(body.doc, report.format);

  await updateReport(id, patch, me.id);
  if (patch.title !== undefined || patch.clientId !== undefined || patch.periodStart !== undefined)
    revalidatePath("/relatorios");
  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
}
