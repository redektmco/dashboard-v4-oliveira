"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClient, today } from "@/lib/repo";
import { createReport, deleteReport, getReport } from "@/lib/reports/db";
import { validPeriod } from "@/lib/reports/input";
import { clonePage, emptyDoc } from "@/lib/reports/layout";
import { presetRange, PRESET_LABEL, type PeriodPreset } from "@/lib/reports/metrics";
import { STARTERS } from "@/lib/reports/starters";
import type { ReportDoc, ReportFormat } from "@/lib/reports/types";
import type { ActionResult } from "@/lib/action";

const str = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() ?? "";

/** Cópia funda do documento com ids novos — duas cópias nunca dividem bloco. */
const copyDoc = (d: ReportDoc): ReportDoc => ({ ...d, theme: { ...d.theme }, pages: d.pages.map(clonePage) });

const formatOf = (raw: string): ReportFormat => (raw === "slide" ? "slide" : "a4");

/**
 * Ponto de partida do documento: em branco, um modelo pronto da V4
 * (`starter:<id>`), um modelo salvo pela unidade (`tpl:<id>`) ou em branco
 * num formato (`blank:a4`, `blank:slide`). O formato
 * vem do modelo — um modelo de slides não vira A4.
 */
async function baseDoc(base: string, fallback: ReportFormat): Promise<{ doc: ReportDoc; format: ReportFormat } | null> {
  if (base.startsWith("starter:")) {
    const s = STARTERS.find((x) => x.id === base.slice(8));
    return s ? { doc: s.build(), format: s.format } : null;
  }
  if (base.startsWith("tpl:")) {
    const t = await getReport(base.slice(4));
    return t && t.kind === "template" ? { doc: copyDoc(t.doc), format: t.format } : null;
  }
  if (base.startsWith("blank:")) return { doc: emptyDoc(), format: formatOf(base.slice(6)) };
  return { doc: emptyDoc(), format: fallback };
}

/** Novo relatório de um cliente. Abre o editor direto. */
export async function createReportAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const clientId = Number(str(formData, "clientId")) || null;
  const client = clientId ? await getClient(clientId) : null;
  if (!client) return { error: "Escolha o cliente." };

  const preset = str(formData, "preset");
  const period =
    preset && preset !== "custom" && preset in PRESET_LABEL
      ? presetRange(preset as PeriodPreset, today())
      : validPeriod(str(formData, "start"), str(formData, "end"));
  if (!period) return { error: "Informe um período válido (início antes do fim, até 13 meses)." };

  const base = await baseDoc(str(formData, "base"), formatOf(str(formData, "format")));
  if (!base) return { error: "Modelo não encontrado." };

  const title = str(formData, "title").slice(0, 140) || `Relatório ${client.name}`;
  const id = await createReport({
    kind: "report",
    clientId: client.id,
    title,
    format: base.format,
    periodStart: period.start,
    periodEnd: period.end,
    doc: base.doc,
    createdBy: me.id,
  });
  revalidatePath("/relatorios");
  redirect(`/relatorios/${id}`);
}

/** Novo modelo da unidade (em branco ou a partir de um pronto). */
export async function createTemplateAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const title = str(formData, "title").slice(0, 140);
  if (!title) return { error: "Dê um nome ao modelo." };
  const base = await baseDoc(str(formData, "base"), formatOf(str(formData, "format")));
  if (!base) return { error: "Modelo não encontrado." };
  const id = await createReport({
    kind: "template",
    clientId: null,
    title,
    format: base.format,
    periodStart: null,
    periodEnd: null,
    doc: base.doc,
    createdBy: me.id,
  });
  revalidatePath("/relatorios");
  redirect(`/relatorios/${id}`);
}

/** Salva o relatório (ou modelo) atual como um modelo novo da unidade. */
export async function saveAsTemplateAction(id: string, title: string): Promise<ActionResult> {
  const me = await requireUser();
  const r = await getReport(id);
  if (!r) return { error: "Relatório não encontrado." };
  const name = title.trim().slice(0, 140);
  if (!name) return { error: "Dê um nome ao modelo." };
  await createReport({
    kind: "template",
    clientId: null,
    title: name,
    format: r.format,
    periodStart: null,
    periodEnd: null,
    doc: copyDoc(r.doc),
    createdBy: me.id,
  });
  revalidatePath("/relatorios");
  return { ok: `Modelo "${name}" salvo. Ele aparece em Relatórios › Modelos.` };
}

/** Duplica e abre a cópia. O link público não vai junto. */
export async function duplicateReportAction(id: string): Promise<ActionResult> {
  const me = await requireUser();
  const r = await getReport(id);
  if (!r) return { error: "Relatório não encontrado." };
  const copy = await createReport({
    kind: r.kind,
    clientId: r.clientId,
    title: `${r.title} (cópia)`.slice(0, 140),
    format: r.format,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    doc: copyDoc(r.doc),
    createdBy: me.id,
  });
  revalidatePath("/relatorios");
  redirect(`/relatorios/${copy}`);
}

export async function deleteReportAction(id: string): Promise<ActionResult> {
  await requireUser();
  const r = await getReport(id);
  if (!r) return { error: "Relatório não encontrado." };
  await deleteReport(id);
  revalidatePath("/relatorios");
  return { ok: r.kind === "template" ? "Modelo excluído." : "Relatório excluído. O link público parou de abrir." };
}
