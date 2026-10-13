import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getReport, setShare } from "@/lib/reports/db";

type Ctx = { params: Promise<{ id: string }> };

/** Liga ou desliga o link público `/r/<token>` do relatório. */
export async function POST(req: Request, { params }: Ctx) {
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Sessão expirada. Entre de novo para continuar." }, { status: 401 });
  const { id } = await params;
  const report = await getReport(id);
  if (!report) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });
  if (report.kind !== "report") return NextResponse.json({ error: "Modelo não tem link público." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { on?: boolean };
  const token = await setShare(id, Boolean(body.on));
  return NextResponse.json({ token });
}
