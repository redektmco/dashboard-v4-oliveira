
import { ModularScreen } from "@/components/workspace/modular-screen";
import "@/components/reports/reports.css";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listClients, today } from "@/lib/repo";
import { listReports } from "@/lib/reports/db";
import { blankData, periodLabel, presetRange, sampleData } from "@/lib/reports/metrics";
import { STARTERS } from "@/lib/reports/starters";
import { FORMAT_LABEL, type Report, type ReportDoc, type ReportFormat } from "@/lib/reports/types";
import { PageHead } from "@/components/page-head";
import { Icon } from "@/components/icon";
import { Pill } from "@/components/kit";
import { dateBR } from "@/components/ui";
import { NewReportButton, NewTemplateButton, type BaseOpt } from "@/components/reports/new-report";
import { Thumb } from "@/components/reports/thumb";
import type { RenderCtx } from "@/components/reports/blocks";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  await requireUser();
  const { aba } = await searchParams;
  const tab = aba === "modelos" ? "modelos" : "relatorios";
  const [reports, templates, clients] = await Promise.all([listReports("report"), listReports("template"), listClients()]);
  const day = today();
  const sample = (() => {
    const p = presetRange("last_month", day);
    return sampleData(p.start, p.end);
  })();

  const bases: BaseOpt[] = [
    ...STARTERS.map((s) => ({ value: `starter:${s.id}`, label: `${s.title} · ${s.format === "slide" ? "16:9" : "A4"}`, group: "Modelos da V4" as const })),
    ...templates.map((t) => ({ value: `tpl:${t.id}`, label: `${t.title} · ${t.format === "slide" ? "16:9" : "A4"}`, group: "Modelos da unidade" as const })),
    { value: "blank:a4", label: "Em branco · Relatório A4", group: "Em branco" as const },
    { value: "blank:slide", label: "Em branco · Apresentação 16:9", group: "Em branco" as const },
  ];
  const clientOpts = clients.map((c) => ({ id: c.id, name: c.name }));
  const ctxOf = (format: ReportFormat, doc: ReportDoc, data = sample): RenderCtx => ({ data, format, today: day, theme: doc.theme });

  return (
    <div className="space-y-6 pb-10">
      <PageHead
        title="Relatórios"
        description="Monte relatórios e apresentações arrastando blocos. Os números vêm do painel; o cliente recebe um link, a apresentação em tela cheia ou o PDF."
        actions={
          <>
            <NewTemplateButton bases={bases} />
            <NewReportButton clients={clientOpts} bases={bases} />
          </>
        }
      />

      <ModularScreen screen="relatorios" modules={[
{ id: "filters", label: "Relatórios e modelos", kind: "filters", defaultWidth: 'full' as const, content: <><nav className="flex gap-1 border-b border-[var(--border-hair)]" aria-label="Seções de Relatórios">
        {(
          [
            ["relatorios", "Relatórios", reports.length],
            ["modelos", "Modelos", templates.length + STARTERS.length],
          ] as const
        ).map(([k, label, n]) => (
          <Link
            key={k}
            href={k === "modelos" ? "/relatorios?aba=modelos" : "/relatorios"}
            aria-current={tab === k ? "page" : undefined}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 pb-3 pt-1 text-[13px] ${tab === k ? "border-v4-red font-medium text-ink-100" : "border-transparent text-ink-400 hover:text-ink-100"}`}
          >
            {label}
            <span className="tnum rounded-full bg-ink-800 px-[7px] py-px text-[11px] font-semibold text-ink-300">{n}</span>
          </Link>
        ))}
      </nav></> },
{ id: "reports", label: "Documentos", kind: "list", defaultWidth: 'full' as const, content: <>{tab === "relatorios" ? (
        reports.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-strong)] px-6 py-14 text-center">
            <Icon name="fileText" size={30} className="mx-auto text-ink-500" stroke={1.4} />
            <h2 className="mt-3 font-display text-[17px] font-semibold">Nenhum relatório ainda</h2>
            <p className="mx-auto mt-1 max-w-[460px] text-[13px] text-ink-400">
              Comece por um modelo da V4 — o relatório mensal em A4 ou a apresentação de resultados em slides — e ajuste do seu jeito.
            </p>
            <div className="mt-5 flex justify-center">
              <NewReportButton clients={clientOpts} bases={bases} />
            </div>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {reports.map((r) => (
              <ReportCard key={r.id} r={r} ctx={ctxOf(r.format, r.doc, blankData(r.clientId ? { id: r.clientId, name: r.clientName ?? "" } : null, r.periodStart ?? day, r.periodEnd ?? day))} />
            ))}
          </ul>
        )
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="label">Modelos da V4</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {STARTERS.map((s) => {
                const doc = s.build();
                return (
                  <TemplateCard
                    key={s.id}
                    title={s.title}
                    description={s.description}
                    format={s.format}
                    ctx={ctxOf(s.format, doc)}
                    doc={doc}
                    action={<NewReportButton clients={clientOpts} bases={bases} initialBase={`starter:${s.id}`} label="Usar" className="btn-sm" />}
                  />
                );
              })}
            </ul>
          </section>
          <section className="space-y-3">
            <h2 className="label">Modelos da unidade</h2>
            {templates.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border-strong)] px-5 py-8 text-center text-[13px] text-ink-400">
                Nenhum modelo salvo. Em qualquer relatório, use <strong className="text-ink-200">⋯ › Salvar como modelo</strong>, ou crie um em <strong className="text-ink-200">Novo modelo</strong>.
              </p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {templates.map((t) => (
                  <TemplateCard
                    key={t.id}
                    title={t.title}
                    description={`${t.doc.pages.length} ${t.doc.pages.length === 1 ? "página" : "páginas"} · atualizado em ${dateBR(t.updatedAt)}${t.createdByName ? ` · ${t.createdByName}` : ""}`}
                    format={t.format}
                    ctx={ctxOf(t.format, t.doc)}
                    doc={t.doc}
                    href={`/relatorios/${t.id}`}
                    action={<NewReportButton clients={clientOpts} bases={bases} initialBase={`tpl:${t.id}`} label="Usar" className="btn-sm" />}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}</> }
]} />
    </div>
  );
}

function Preview({ format, ctx, doc }: { format: ReportFormat; ctx: RenderCtx; doc: ReportDoc }) {
  return (
    <div className="flex h-[176px] items-center justify-center overflow-hidden rounded-t-xl bg-[#111]">
      <div className="rp-shadow">
        <Thumb page={doc.pages[0]} ctx={ctx} width={format === "slide" ? 270 : 118} />
      </div>
    </div>
  );
}

function ReportCard({ r, ctx }: { r: Report; ctx: RenderCtx }) {
  return (
    <li>
      <Link href={`/relatorios/${r.id}`} className="group block overflow-hidden rounded-xl border border-[var(--border-hair)] bg-ink-900 transition-colors hover:border-[var(--border-strong)]">
        <Preview format={r.format} ctx={ctx} doc={r.doc} />
        <div className="space-y-1.5 border-t border-[var(--border-hair)] px-4 py-3">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate font-display text-[14px] font-semibold group-hover:text-white">{r.title}</h3>
            {r.shareToken && <Pill tone="verde">Link ativo</Pill>}
          </div>
          <p className="truncate text-[12px] text-ink-300">
            {r.clientName ?? "Sem cliente"}
            {r.periodStart && r.periodEnd ? ` · ${periodLabel(r.periodStart, r.periodEnd)}` : ""}
          </p>
          <p className="text-[11px] text-ink-500">
            {FORMAT_LABEL[r.format]} · {r.doc.pages.length} {r.doc.pages.length === 1 ? "página" : "páginas"} · {dateBR(r.updatedAt)}
          </p>
        </div>
      </Link>
    </li>
  );
}

function TemplateCard({
  title,
  description,
  format,
  ctx,
  doc,
  href,
  action,
}: {
  title: string;
  description: string;
  format: ReportFormat;
  ctx: RenderCtx;
  doc: ReportDoc;
  href?: string;
  action: React.ReactNode;
}) {
  return (
    <li className="overflow-hidden rounded-xl border border-[var(--border-hair)] bg-ink-900">
      <Preview format={format} ctx={ctx} doc={doc} />
      <div className="space-y-2 border-t border-[var(--border-hair)] px-4 py-3">
        <h3 className="truncate font-display text-[14px] font-semibold">{title}</h3>
        <p className="line-clamp-2 min-h-[34px] text-[12px] leading-snug text-ink-400">{description}</p>
        <div className="flex items-center gap-2">
          <span className="mr-auto text-[11px] text-ink-500">{format === "slide" ? "Slides 16:9" : "A4 em pé"}</span>
          {href && (
            <Link href={href} className="btn btn-sm">
              <Icon name="pencil" size={13} />
              Editar
            </Link>
          )}
          {action}
        </div>
      </div>
    </li>
  );
}
