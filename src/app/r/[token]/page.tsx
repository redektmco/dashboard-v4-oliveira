import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getClient, today } from "@/lib/repo";
import { getReportByToken, reportData } from "@/lib/reports/db";
import { periodLabel } from "@/lib/reports/metrics";
import { ReportViewer } from "@/components/reports/viewer";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const report = await getReportByToken(token);
  // Link privado do cliente: fora de buscadores, e link inválido não vaza nada.
  if (!report) return { title: "Relatório — V4 Oliveira & Co", robots: { index: false, follow: false } };
  const period = report.periodStart && report.periodEnd ? periodLabel(report.periodStart, report.periodEnd) : "";
  return {
    title: `${report.title}${report.clientName ? ` · ${report.clientName}` : ""}`,
    description: `Relatório de resultados${period ? ` de ${period}` : ""} preparado pela V4 Oliveira & Co.`,
    robots: { index: false, follow: false },
  };
}

/**
 * O que o cliente abre: o relatório com os números do painel na hora (o
 * link acompanha o sync de Meta e Google), modo apresentação e PDF.
 */
export default async function PublicReportPage({ params }: Props) {
  const { token } = await params;
  const report = await getReportByToken(token);
  if (!report || !report.clientId || !report.periodStart || !report.periodEnd) notFound();
  // Cliente excluído: sem ele, `reportData` cairia nos números de exemplo — o link não abre.
  const client = await getClient(report.clientId);
  if (!client) notFound();
  const data = await reportData({ id: client.id, name: client.name, leadSource: client.lead_source }, report.periodStart, report.periodEnd, report.live);

  return <ReportViewer title={report.title} pages={report.doc.pages} ctx={{ data, format: report.format, today: today(), theme: report.doc.theme }} />;
}
