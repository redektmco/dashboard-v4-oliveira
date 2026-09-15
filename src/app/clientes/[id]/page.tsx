import Link from "next/link";
import { notFound } from "next/navigation";
import {
  checkinSnapshots,
  getClient,
  getTargets,
  listPlans,
  listUsers,
  perfSnapshots,
  scoreFor,
  scoreHistory,
  today,
} from "@/lib/repo";
import { ACCOUNT_TYPE_LABEL, type DimensionKey } from "@/lib/model/types";
import { DIMENSIONS, fieldByKey } from "@/lib/model/catalog";
import { daysBetween } from "@/lib/model/scoring";
import { ScoreChart } from "@/components/score-chart";
import {
  CheckinHeatmap,
  DimensionBars,
  FieldBars,
  LossBreakdown,
  bandOf,
} from "@/components/charts";
import {
  BandChip,
  ConfidenceTag,
  HealthRing,
  PageHeader,
  Panel,
  TableScroll,
  bandFg,
  brl,
  dateBR,
} from "@/components/ui";
import { Icon } from "@/components/icon";
import { PlansPanel } from "@/components/plans-panel";
import { ClientActions } from "@/components/client-actions";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Perguntas do check-in, na ordem do roteiro, com o rótulo curto do mapa. */
const CHECKIN_ROWS = [
  { key: "q1_satisfaction", short: "Satisfação" },
  { key: "q2_climate", short: "Relacionamento" },
  { key: "q3_trust", short: "Continuidade" },
  { key: "q4_lead_quality", short: "Qualidade de lead" },
  { key: "q5_engagement", short: "Ritmo do cliente" },
  { key: "q6_expectation", short: "Expectativa" },
];

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const clientId = Number(id);
  if (!Number.isInteger(clientId)) notFound();

  const at = today();
  // Tudo em paralelo: antes o cadastro vinha sozinho e só depois o resto,
  // somando um round-trip inteiro ao tempo de abrir a ficha.
  const [client, s, histRows, perf, checkins, plans, targets, users] = await Promise.all([
    getClient(clientId),
    scoreFor(clientId, at),
    scoreHistory(clientId, 60),
    perfSnapshots(clientId, 8),
    checkinSnapshots(clientId, 8),
    listPlans(clientId),
    getTargets(clientId),
    listUsers(),
  ]);
  if (!client || !s) notFound();
  const hist = histRows.map((h) => ({ day: h.ref_day, score: h.score })).reverse();
  const renewalIn = client.renewal_date ? daysBetween(at, client.renewal_date) : null;

  // Variação da série: primeiro ponto com dado vs último.
  const serie = hist.filter((h): h is { day: string; score: number } => h.score !== null);
  const delta = serie.length > 1 ? serie[serie.length - 1].score - serie[0].score : null;

  // A dimensão mais baixa com dado abre sozinha na decomposição.
  const worstKey = s.dimensions
    .filter((d) => d.score !== null)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0]?.key;

  const heatRows = CHECKIN_ROWS.map((r) => ({
    ...r,
    label: fieldByKey(r.key)?.question ?? fieldByKey(r.key)?.label ?? r.short,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/", label: "Carteira" }}
        title={client.name}
        description={`${ACCOUNT_TYPE_LABEL[client.account_type]} · GT ${client.gt_name ?? "—"} · Account ${client.account_name ?? "—"} · ${brl(client.mrr)}/mês${client.active ? "" : " · arquivado"}`}
        actions={
          <>
            <Link href={`/gt/${clientId}`} className="btn shrink-0">
              <Icon name="chart" size={14} />
              Preencher performance
            </Link>
            <Link href={`/account/${clientId}`} className="btn shrink-0">
              <Icon name="users" size={14} />
              Registrar check-in
            </Link>
            <ClientActions client={client} users={users} targets={targets} />
          </>
        }
      />

      {/* -------- cabeçalho do score -------- */}
      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <div className="panel p-4 sm:p-5">
          <div className="flex items-center gap-4">
            <HealthRing score={s.score} band={s.band} size={116} stroke={9} />
            <div className="space-y-2">
              <div className="eyebrow">Health score</div>
              <BandChip band={s.band} />
              {delta !== null && (
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-400">
                  <Icon
                    name={delta >= 0 ? "arrowUp" : "arrowDown"}
                    size={11}
                    stroke={3}
                    className={delta >= 0 ? "text-verde-fg" : "text-vermelho-fg"}
                  />
                  <span className={`tnum ${delta >= 0 ? "text-verde-fg" : "text-vermelho-fg"}`}>
                    {delta >= 0 ? "+" : "−"}
                    {Math.abs(delta).toFixed(1).replace(".", ",")}
                  </span>
                  <span>na série</span>
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <ConfidenceTag c={s.confidence} />
            {s.rawBand !== s.band && (
              <span className="text-[11px] text-ink-500">
                média daria {s.rawBand} · override rebaixou
              </span>
            )}
          </div>
          {s.confidence !== "alta" && (
            <p className="mt-3 rounded-md bg-ink-850 px-3 py-2 text-xs leading-relaxed text-ink-400">
              Confiança {s.confidence} não zera o score — avisa para não agir cego. Um {Math.round(s.score ?? 0)}{" "}
              aqui é um &ldquo;não sei&rdquo;, não um &ldquo;está tudo bem&rdquo;.
            </p>
          )}
          <dl className="mt-4 space-y-2 border-t border-[var(--border-hair)] pt-3 text-xs">
            <Prov
              label="Performance (GT)"
              date={s.provenance.performance.ref_date}
              by={s.provenance.performance.by}
              age={s.provenance.performance.ageDays}
              limit={10}
            />
            <Prov
              label="Check-in (Account)"
              date={s.provenance.checkin.ref_date}
              by={s.provenance.checkin.by}
              age={s.provenance.checkin.ageDays}
              limit={35}
            />
            <div className="flex justify-between">
              <dt className="text-ink-400">Renovação</dt>
              <dd className={renewalIn !== null && renewalIn <= 60 ? "text-amarelo-fg" : "text-ink-300"}>
                {dateBR(client.renewal_date)}
                {renewalIn !== null && ` · ${renewalIn}d`}
              </dd>
            </div>
          </dl>
        </div>

        <Panel
          title="Curva do score"
          subtitle="Recompute diário sobre a série de snapshots. Passe o mouse para ler um dia."
        >
          <div className="px-2 pb-2 pt-3">
            <ScoreChart points={hist} />
          </div>
        </Panel>
      </div>

      {s.overrides.length > 0 && (
        <div className="panel panel-critico p-5">
          <h2 className="font-display text-[15px] font-semibold text-vermelho-fg">
            Overrides ativos — a média não decide sozinha
          </h2>
          <ul className="mt-2 space-y-2">
            {s.overrides.map((o) => (
              <li key={o.trigger} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="rounded-sm bg-vermelho-dim px-1.5 py-0.5 text-[11px] font-semibold text-vermelho-fg">
                  {o.effect === "vermelho" ? "força vermelho" : "teto amarelo"}
                </span>
                <strong className="text-ink-100">{o.trigger}</strong>
                <span className="text-ink-400">— {o.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* -------- Análise do score: um bloco só, três leituras --------
          Antes eram três painéis competindo (Panorama · Perde · Decomposição).
          São perguntas diferentes — onde cada dimensão está, o que mais custa e
          o detalhe campo a campo — então nenhuma sai; elas passam a viver sob um
          cabeçalho único, com divisas de sub-seção, para ler como UMA análise em
          vez de uma pilha. */}
      <section className="panel">
        <header className="border-b border-[var(--border-hair)] px-4 py-3.5 sm:px-5 sm:py-4">
          <h2 className="font-display text-[16px] font-semibold text-ink-100 sm:text-[17px]">
            Análise do score
          </h2>
          <p className="mt-1 text-[12.5px] text-ink-400 sm:text-[13px]">
            Onde cada dimensão está, o que mais custa e o detalhe campo a campo. Comece pela maior perda.
          </p>
        </header>

        {/* Panorama + Onde se perde, lado a lado no desktop, com a hairline
            do grid `gap-px` fazendo a divisa — mesmo padrão da triagem. */}
        <div className="grid gap-px bg-[var(--border-hair)] lg:grid-cols-2">
          <div className="bg-ink-900">
            <div className="px-5 pt-4">
              <span className="label">Panorama das dimensões</span>
              <p className="mt-1 text-[12px] text-ink-500">
                Mesma escala 0–100 para as cinco. As divisas no trilho são os pisos do amarelo e do verde.
              </p>
            </div>
            <DimensionBars dimensions={s.dimensions} />
          </div>
          <div className="bg-ink-900">
            <div className="px-5 pt-4">
              <span className="label">Onde o score se perde</span>
              <p className="mt-1 text-[12px] text-ink-500">
                Peso × distância de 100. A soma das barras é o que falta para o score cheio.
              </p>
            </div>
            <LossBreakdown dimensions={s.dimensions} score={s.score} />
          </div>
        </div>

        {/* Decomposição: uma linha por dimensão, a pior já aberta. */}
        <div className="border-t border-[var(--border-hair)]">
          <div className="px-5 pb-1 pt-4">
            <span className="label">Decomposição · campo a campo</span>
          </div>
          <div className="divide-y divide-[var(--border-hair)]">
            {s.dimensions.map((d) => {
              const def = DIMENSIONS.find((x) => x.key === (d.key as DimensionKey))!;
              const b = d.score === null ? null : bandOf(d.score);
              return (
                <details key={d.key} className="group" open={worstKey === d.key}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-ink-850 sm:px-5">
                    <Icon name="chevronRight" size={14} className="shrink-0 text-ink-500 transition-transform group-open:rotate-90" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-ink-100">{d.label}</div>
                      <div className="text-[12px] text-ink-500">
                        {def.source} · peso {d.weight}%
                        {d.effectiveWeight !== d.weight && d.score !== null ? ` · efetivo ${d.effectiveWeight}%` : ""}
                      </div>
                    </div>
                    <span className={`tnum font-display text-[20px] font-bold leading-none ${bandFg(b)}`}>
                      {d.score === null ? "—" : Math.round(d.score)}
                    </span>
                    <BandChip band={b} />
                  </summary>
                  <div className="bg-ink-950/40">
                    <FieldBars fields={d.fields} />
                    <p className="border-t border-[var(--border-hair)] px-5 py-3 text-[11px] leading-relaxed text-ink-500">
                      {def.rationale}
                    </p>
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      </section>

      {/* -------- mapa da relação: drill-down temporal, abre sob demanda --------
          A leitura acionável (Panorama · Perde · Decomposição) já está aberta
          acima; o heatmap das seis perguntas ao longo do tempo é o aprofundamento
          qualitativo. Fica recolhido no mesmo padrão do Histórico para baixar a
          densidade da ficha sem esconder o sinal — o resumo diz o que há dentro. */}
      <details className="panel group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="font-display text-[16px] font-semibold text-ink-100">Mapa dos check-ins</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-400">
              As seis perguntas do roteiro ao longo do tempo — {checkins.length} leitura(s). A linha que
              escurece é a que vira churn.
            </p>
          </div>
          <Icon
            name="chevronDown"
            size={16}
            className="shrink-0 text-ink-400 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="border-t border-[var(--border-hair)]">
          <CheckinHeatmap rows={heatRows} snapshots={checkins} />
        </div>
      </details>

      <PlansPanel
        plans={plans}
        clientId={clientId}
        clientName={client.name}
        defaultOwner={client.gt_name ?? client.account_name ?? ""}
        today={at}
        clickupBase={process.env.NEXT_PUBLIC_CLICKUP_LIST_URL ?? "https://app.clickup.com/"}
      />

      {/* -------- histórico dos dois inputs: consulta, não tarefa -------- */}
      <details className="panel group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="font-display text-[16px] font-semibold text-ink-100">Histórico de inputs e metas</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-400">
              {perf.length} snapshot(s) de performance · {checkins.length} check-in(s) · {Object.keys(targets).length} meta(s) vigente(s)
            </p>
          </div>
          <Icon name="chevronDown" size={16} className="shrink-0 text-ink-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-px border-t border-[var(--border-hair)] bg-[var(--border-hair)] lg:grid-cols-2">
          <div className="bg-ink-900">
            <div className="px-4 pb-1 pt-3 sm:px-5">
              <span className="label">Performance · GT, semanal</span>
            </div>
            <TableScroll>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Semana</th>
                    <th>Principais números</th>
                    <th>Por</th>
                  </tr>
                </thead>
                <tbody>
                  {perf.map((p) => (
                    <tr key={p.id}>
                      <td className="tnum whitespace-nowrap">{dateBR(p.ref_date)}</td>
                      <td className="text-xs text-ink-300">{summarizePerf(p.data, client.account_type)}</td>
                      <td className="text-xs text-ink-500">{p.filler ?? "—"}</td>
                    </tr>
                  ))}
                  {perf.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-sm text-ink-400">
                        Nunca preenchido.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableScroll>
          </div>

          <div className="bg-ink-900">
            <div className="px-4 pb-1 pt-3 sm:px-5">
              <span className="label">Check-ins · Account</span>
            </div>
            <TableScroll>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Notas (1–5)</th>
                    <th>Por</th>
                  </tr>
                </thead>
                <tbody>
                  {checkins.map((c) => (
                    <tr key={c.id}>
                      <td className="tnum whitespace-nowrap">{dateBR(c.ref_date)}</td>
                      <td>
                        <div className="flex gap-1">
                          {CHECKIN_ROWS.map(({ key }) => {
                            const n = Number(c.data[key]) || 0;
                            return (
                              <span
                                key={key}
                                title={fieldByKey(key)?.question ?? fieldByKey(key)?.label}
                                className={`tnum flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${
                                  n >= 4
                                    ? "bg-verde-dim text-verde-fg"
                                    : n === 3
                                      ? "bg-ink-800 text-ink-300"
                                      : "bg-vermelho-dim text-vermelho-fg"
                                }`}
                              >
                                {n || "—"}
                              </span>
                            );
                          })}
                        </div>
                        {c.data.risk_flag ? (
                          <div className="mt-1 text-[11px] text-vermelho-fg">risco: {String(c.data.risk_note || "sim")}</div>
                        ) : null}
                      </td>
                      <td className="text-xs text-ink-500">{c.filler ?? "—"}</td>
                    </tr>
                  ))}
                  {checkins.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-sm text-ink-400">
                        Relação sem leitura.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableScroll>
          </div>

          <div className="bg-ink-900 lg:col-span-2">
            <div className="px-4 pb-1 pt-3 sm:px-5">
              <span className="label">Metas vigentes · base das réguas A e B</span>
            </div>
            <div className="grid gap-x-8 gap-y-2 px-4 pb-4 pt-2 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
              {Object.entries(targets).length === 0 && (
                <span className="text-sm text-ink-400">Nenhuma meta cadastrada — sem meta não há régua.</span>
              )}
              {Object.entries(targets).map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between border-b border-[var(--border-hair)] pb-1">
                  <span className="text-xs text-ink-400">{fieldByKey(k)?.label ?? k}</span>
                  <span className="tnum text-sm text-ink-100">{v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

function Prov({
  label,
  date,
  by,
  age,
  limit,
}: {
  label: string;
  date: string | null;
  by: string | null;
  age: number | null;
  limit: number;
}) {
  const stale = age === null || age > limit;
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-400">{label}</dt>
      <dd className={`text-right ${stale ? "text-vermelho-fg" : "text-ink-300"}`}>
        {date ? (
          <>
            {dateBR(date)} · {age}d
            <div className="text-[11px] text-ink-600">{by ?? "—"}</div>
          </>
        ) : (
          "nunca preenchido"
        )}
      </dd>
    </div>
  );
}

function summarizePerf(data: Record<string, unknown>, type: string) {
  const n = (k: string) =>
    data[k] === null || data[k] === undefined
      ? "—"
      : Number(data[k]).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  if (type === "lead_gen")
    return `${n("leads_real")}/${n("leads_meta")} leads · CPL ${n("cpl_real")} (meta ${n("cpl_meta")}) · MQL ${n("mql_real")}`;
  if (type === "ecommerce")
    return `Fat. ${n("revenue_real")}/${n("revenue_meta")} · ROAS ${n("roas_real")} (meta ${n("roas_meta")})`;
  return `Alcance ${n("reach_real")}/${n("reach_meta")} · Entregas ${n("deliveries_real")}/${n("deliveries_meta")}`;
}
