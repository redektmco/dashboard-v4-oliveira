import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClient, listClients, today } from "@/lib/repo";
import { getReport, reportData } from "@/lib/reports/db";
import { presetRange } from "@/lib/reports/metrics";
import { ReportEditor } from "@/components/reports/editor";

export const dynamic = "force-dynamic";

/** O construtor: tela inteira, fora da moldura do painel (ver AppFrame). */
export default async function ReportEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const report = await getReport(id);
  if (!report) notFound();

  const day = today();
  // Modelo não tem período próprio: a prévia usa o mês passado.
  const fallback = presetRange("last_month", day);
  const start = report.periodStart ?? fallback.start;
  const end = report.periodEnd ?? fallback.end;
  const [client, clients] = await Promise.all([report.clientId ? getClient(report.clientId) : null, listClients()]);
  const data = await reportData(client ? { id: client.id, name: client.name } : null, start, end);

  return (
    <ReportEditor
      report={report}
      initialData={data}
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      today={day}
    />
  );
}
