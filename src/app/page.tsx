import Link from "next/link";
import { lastRecompute, listOpenPlans, mediaWeeks, portfolio, portfolioSummary, today } from "@/lib/repo";
import { lateSteps } from "@/lib/playbook/db";
import { configSnapshot } from "@/lib/config-status";
import { recentWeeks } from "@/lib/meta/sync";
import { topPriorities, type PriorityAction } from "@/lib/priorities";
import { ACCOUNT_TYPE_LABEL } from "@/lib/model/types";
import { daysBetween } from "@/lib/model/scoring";
import { BAND_STYLE, brl } from "@/components/ui";
import { Icon, type IconName } from "@/components/icon";
import { GlobalSearch } from "@/components/home/global-search";
import { Portfolio, type Row } from "@/components/home/portfolio";
import { requireUser } from "@/lib/auth";
import { PageHead } from "@/components/page-head";

export const dynamic = "force-dynamic";

const ACTION: Record<PriorityAction, { label: string; icon: IconName }> = {
  criar_plano: { label: "Criar plano", icon: "listTodo" },
  cobrar_plano: { label: "Cobrar plano", icon: "clock" },
  cobrar_playbook: { label: "Ver playbook", icon: "listCheck" },
  revisar: { label: "Revisar", icon: "eye" },
  ver_conta: { label: "Ver conta", icon: "arrowRight" },
};

const pct = (n: number, of: number) => (of > 0 ? (n / of) * 100 : 0);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export default async function CarteiraPage() {
  await requireUser();
  const at = today();
  const [rows, plans, meta, config, stamp, late] = await Promise.all([
    portfolio(at),
    listOpenPlans(),
    mediaWeeks(),
    configSnapshot(),
    lastRecompute(),
    lateSteps(),
  ]);
  const playbookLate = new Map(late.map((l) => [l.client_id, Number(l.n)]));
  const summary = portfolioSummary(rows);

  const total = rows.length;
  const evaluated = total - summary.byBand.sem_dado;
  const atRisk = summary.byBand.vermelho + summary.byBand.amarelo;
  const unscored = rows.filter((r) => !r.score.band);
  const unscoredMrr = unscored.reduce((a, r) => a + r.client.mrr, 0);
  const neverFilled = rows.filter((r) => r.score.provenance.performance.ageDays === null).length;

  // Mídia parada: conta com Meta vinculado e zero de verba na última semana
  // fechada (a em curso vem parcial e engana).
  const [, closedWeek] = recentWeeks(2, at);
  const activeIds = new Set(rows.map((r) => r.client.id));
  const stopped = new Set(
    [...meta].filter(([id, weeks]) => activeIds.has(id) && (weeks.get(closedWeek)?.week.spend ?? 0) === 0).map(([id]) => id),
  );

  const lateDays = new Map<number, number>();
  for (const p of plans) {
    if (!p.due_date || p.due_date >= at) continue;
    lateDays.set(p.client_id, Math.max(lateDays.get(p.client_id) ?? 0, daysBetween(p.due_date, at)));
  }

  const priorities = topPriorities(
    rows.map((r) => ({
      id: r.client.id,
      name: r.client.name,
      band: r.score.band,
      score: r.score.score,
      delta7: r.delta7,
      mrr: r.client.mrr,
      owner: r.client.gt_name ?? r.client.account_name,
      overrides: r.score.overrides.map((o) => o.trigger),
      openPlans: r.openPlans,
      planLateDays: lateDays.get(r.client.id) ?? 0,
      renewalIn: r.client.renewal_date ? daysBetween(at, r.client.renewal_date) : null,
      spendStopped: stopped.has(r.client.id),
      playbookLate: playbookLate.get(r.client.id) ?? 0,
    })),
  );

  const view: Row[] = rows.map((r) => ({
    id: r.client.id,
    name: r.client.name,
    type: ACCOUNT_TYPE_LABEL[r.client.account_type],
    typeKey: r.client.account_type,
    gt: r.client.gt_name ?? "—",
    account: r.client.account_name ?? "—",
    mrr: r.client.mrr,
    renewal: r.client.renewal_date,
    renewalIn: r.client.renewal_date ? daysBetween(at, r.client.renewal_date) : null,
    score: r.score.score,
    band: r.score.band,
    confidence: r.score.confidence,
    delta7: r.delta7,
  }));

  const updated = stamp
    ? new Date(stamp.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="space-y-6 pb-10">
      <PageHead
        crumbs={[{ label: "Carteira" }]}
        title="Saúde da carteira"
        description={<>{total} contas ativas · Unidade Oliveira &amp; Co</>}
        actions={
          <>
            <GlobalSearch />
            <Link href="/config/modelo" className="btn btn-ghost">
              <Icon name="alertCircle" size={15} />
              Como o score é calculado
            </Link>
          </>
        }
      />

      {/* ---------------------------- Saúde ---------------------------- */}
      <section className="panel space-y-7 p-5 sm:p-7" aria-label="Saúde da carteira">
        <div className="grid gap-6 sm:grid-cols-3 sm:gap-8">
          <Kpi label="Contas em risco">
            <div className="flex items-baseline gap-2">
              <span className="tnum font-display text-[30px] font-semibold leading-none text-ink-100">{atRisk}</span>
              <span className="text-[14px] text-ink-500">de {evaluated} avaliadas</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              <Dot cls={BAND_STYLE.vermelho.dot}>
                {summary.byBand.vermelho} {plural(summary.byBand.vermelho, "crítica", "críticas")}
              </Dot>
              <Dot cls={BAND_STYLE.amarelo.dot}>{summary.byBand.amarelo} em atenção</Dot>
            </div>
          </Kpi>
          <Kpi label="MRR em risco">
            <span className="tnum font-display text-[30px] font-semibold leading-none text-ink-100">{brl(summary.mrrAtRisk)}</span>
            <p className="text-[13px] text-ink-400">
              {pct(summary.mrrAtRisk, summary.mrrTotal).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% dos {brl(summary.mrrTotal)} da carteira
            </p>
          </Kpi>
          <Kpi label="Contas avaliadas">
            <div className="flex items-baseline gap-2">
              <span className="tnum font-display text-[30px] font-semibold leading-none text-ink-100">{evaluated}</span>
              <span className="text-[14px] text-ink-500">de {total}</span>
            </div>
            <p className={`text-[13px] ${unscored.length ? "text-amarelo-fg" : "text-ink-400"}`}>
              {unscored.length ? `${unscored.length} sem score — ${brl(unscoredMrr)} fora da leitura` : "Toda a carteira pontua"}
            </p>
          </Kpi>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
            <p className="text-[13px] text-ink-400">Distribuição das {evaluated} contas avaliadas</p>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {(["vermelho", "amarelo", "verde"] as const).map((b) => (
                <span key={b} className="inline-flex items-center gap-1.5 text-[13px] text-ink-400">
                  <span className={`h-[7px] w-[7px] rounded-full ${BAND_STYLE[b].dot}`} />
                  {BAND_STYLE[b].label}
                  <strong className="tnum font-semibold text-ink-100">{summary.byBand[b]}</strong>
                </span>
              ))}
            </div>
          </div>
          <div className="flex h-2 gap-1" role="img" aria-label={`${summary.byBand.vermelho} críticas, ${summary.byBand.amarelo} em atenção, ${summary.byBand.verde} saudáveis`}>
            {evaluated === 0 ? (
              <span className="flex-1 rounded bg-ink-800" />
            ) : (
              (["vermelho", "amarelo", "verde"] as const)
                .filter((b) => summary.byBand[b] > 0)
                .map((b) => (
                  <span key={b} className={`rounded ${BAND_STYLE[b].dot}`} style={{ flexGrow: summary.byBand[b], flexBasis: 0 }} />
                ))
            )}
          </div>
        </div>
      </section>

      {/* -------------------- Prioridades + qualidade dos dados -------------------- */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-4" aria-labelledby="prioridades-title">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div>
              <h2 id="prioridades-title" className="font-display text-[17px] font-semibold text-ink-100">
                Prioridades de hoje
              </h2>
              <p className="mt-1 text-[13px] text-ink-400">Qual conta precisa de atenção, por quê e qual a próxima ação.</p>
            </div>
            {updated && <span className="text-[12px] text-ink-500">Atualizado {updated}</span>}
          </div>

          {priorities.length === 0 ? (
            <div className="panel px-5 py-8 text-center text-[13px] text-ink-400">Nenhuma conta pede ação hoje.</div>
          ) : (
            <ol className="space-y-2">
              {priorities.map((p, i) => {
                const s = p.band ? BAND_STYLE[p.band] : null;
                const a = ACTION[p.action];
                return (
                  <li key={p.id} className="panel flex flex-col gap-3 rounded-[10px] p-4 sm:flex-row sm:items-center sm:gap-4">
                    <span className="tnum hidden w-3.5 shrink-0 text-[13px] font-semibold text-ink-500 sm:block">{i + 1}</span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <Link href={`/clientes/${p.id}`} className="text-[15px] font-semibold text-ink-100 hover:underline">
                          {p.name}
                        </Link>
                        {s && (
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium ${s.chip}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                            {s.label}
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] leading-[19px] text-ink-400">{p.why}</p>
                      <p className="text-[12px] text-ink-500">{p.meta}</p>
                    </div>
                    <Link
                      href={
                        p.action === "criar_plano"
                          ? `/clientes/${p.id}?plano=novo`
                          : p.action === "cobrar_playbook"
                            ? `/clientes/${p.id}#playbook`
                            : `/clientes/${p.id}`
                      }
                      className="btn shrink-0 self-start sm:self-center"
                    >
                      <Icon name={a.icon} size={15} />
                      {a.label}
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}

        </section>

        <aside className="panel space-y-5 self-start p-5" aria-labelledby="qualidade-title">
          <div>
            <h2 id="qualidade-title" className="font-display text-[16px] font-semibold text-ink-100">
              Qualidade dos dados
            </h2>
            <p className="mt-1.5 text-[13px] leading-5 text-ink-400">
              Contas sem score ficam fora da distribuição — não significa que estão saudáveis.
            </p>
          </div>
          <div className="space-y-2.5">
            <div className="flex items-baseline gap-2">
              <span className={`tnum font-display text-[30px] font-semibold leading-none ${unscored.length ? "text-amarelo-fg" : "text-ink-100"}`}>
                {unscored.length}
              </span>
              <span className="text-[14px] text-ink-500">{plural(unscored.length, "conta sem score", "contas sem score")}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-[3px] bg-ink-800" role="img" aria-label={`${evaluated} de ${total} contas avaliadas`}>
              <div className="h-full bg-ink-300" style={{ width: `${pct(evaluated, total)}%` }} />
            </div>
            <p className="text-[12px] leading-[17px] text-ink-500">
              {evaluated} de {total} avaliadas · {brl(unscoredMrr)} de MRR fora da leitura
            </p>
          </div>
          <dl className="space-y-3 text-[13px]">
            {[
              ["Sem forecast cadastrado", config.semMeta.length],
              ["Sem fonte de leads", config.semFonte.length],
              ["Sem dado de performance", neverFilled],
            ].map(([label, n]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <dt className="text-ink-400">{label}</dt>
                <dd className="tnum font-semibold text-ink-100">{n}</dd>
              </div>
            ))}
          </dl>
          <Link href="/config" className="btn w-full">
            <Icon name="wrench" size={15} />
            Resolver pendências
          </Link>
        </aside>
      </div>

      <Portfolio rows={view} mrrTotal={summary.mrrTotal} />
    </div>
  );
}

function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[13px] text-ink-400">{label}</p>
      {children}
    </div>
  );
}

function Dot({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-400">
      <span className={`h-[7px] w-[7px] rounded-full ${cls}`} />
      {children}
    </span>
  );
}
