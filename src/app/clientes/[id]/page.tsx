import Link from "next/link";
import { notFound } from "next/navigation";
import {
  checkinSnapshots,
  getClient,
  getTargets,
  listPlans,
  perfSnapshots,
  scoreFor,
  scoreHistory,
  today,
} from "@/lib/repo";
import { ACCOUNT_TYPE_LABEL, type DimensionKey } from "@/lib/model/types";
import { DIMENSIONS, fieldByKey } from "@/lib/model/catalog";
import { daysBetween } from "@/lib/model/scoring";
import { addPlan, setPlanStatus } from "@/actions";
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
  Panel,
  bandFg,
  brl,
  dateBR,
} from "@/components/ui";
import { Icon } from "@/components/icon";
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

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { salvo } = await searchParams;
  const clientId = Number(id);
  const client = await getClient(clientId);
  if (!client) notFound();

  const at = today();
  const [s, histRows, perf, checkins, plans, targets] = await Promise.all([
    scoreFor(clientId, at),
    scoreHistory(clientId, 60),
    perfSnapshots(clientId, 8),
    checkinSnapshots(clientId, 8),
    listPlans(clientId),
    getTargets(clientId),
  ]);
  if (!s) notFound();
  const hist = histRows.map((h) => ({ day: h.ref_day, score: h.score })).reverse();
  const renewalIn = client.renewal_date ? daysBetween(at, client.renewal_date) : null;

  const openPlans = plans.filter((p) => p.status === "aberto" || p.status === "em_andamento");

  // Variação da série: primeiro ponto com dado vs último.
  const serie = hist.filter((h): h is { day: string; score: number } => h.score !== null);
  const delta = serie.length > 1 ? serie[serie.length - 1].score - serie[0].score : null;

  const heatRows = CHECKIN_ROWS.map((r) => ({
    ...r,
    label: fieldByKey(r.key)?.question ?? fieldByKey(r.key)?.label ?? r.short,
  }));

  return (
    <div className="space-y-5">
      {salvo && (
        <div className="flex items-center gap-2 rounded-lg bg-verde-dim px-4 py-2.5 text-sm font-semibold text-verde-fg">
          <Icon name="check" size={15} />
          {salvo === "performance" ? "Snapshot de performance" : "Check-in"} salvo e score recalculado.
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-100"
          >
            <Icon name="arrowLeft" size={12} />
            Carteira
          </Link>
          <h1 className="mt-1.5 font-display text-[28px] font-bold leading-tight tracking-tight">{client.name}</h1>
          <p className="mt-1 text-sm text-ink-400">
            {ACCOUNT_TYPE_LABEL[client.account_type]} · GT {client.gt_name ?? "—"} · Account{" "}
            {client.account_name ?? "—"} · {brl(client.mrr)}/mês
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/gt/${clientId}`} className="btn">
            Preencher performance
          </Link>
          <Link href={`/account/${clientId}`} className="btn">
            Registrar check-in
          </Link>
        </div>
      </div>

      {/* -------- cabeçalho do score -------- */}
      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <div className="panel p-5">
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

      {/* -------- panorama visual: onde está e onde dói -------- */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          title="Panorama das dimensões"
          subtitle="Mesma escala 0–100 para as cinco. As duas divisas no trilho são os pisos do amarelo e do verde."
        >
          <DimensionBars dimensions={s.dimensions} />
        </Panel>
        <Panel
          title="Onde o score se perde"
          subtitle="Peso × distância de 100. A soma das barras é exatamente o que falta para o score cheio — comece pela maior."
        >
          <LossBreakdown dimensions={s.dimensions} score={s.score} />
        </Panel>
      </div>

      {/* -------- decomposição: um container por dimensão -------- */}
      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-[20px] font-bold tracking-tight text-ink-100">
              Decomposição do score
            </h2>
            <p className="mt-1 text-[13px] text-ink-400">
              Um bloco por dimensão: os campos que a formam, o valor cru e o normalizado. Aja na
              causa, não no sintoma.
            </p>
          </div>
          <span className="text-[11px] text-ink-600">
            {s.dimensions.filter((d) => d.score !== null).length} de {s.dimensions.length} dimensões
            com dado
          </span>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          {s.dimensions.map((d) => {
            const def = DIMENSIONS.find((x) => x.key === (d.key as DimensionKey))!;
            const b = d.score === null ? null : bandOf(d.score);
            return (
              <Panel
                key={d.key}
                critical={b === "vermelho"}
                title={d.label}
                subtitle={`${def.source} · peso ${d.weight}%${
                  d.effectiveWeight !== d.weight && d.score !== null
                    ? ` · efetivo ${d.effectiveWeight}% (renormalizado)`
                    : ""
                }`}
                right={
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`tnum font-display text-[26px] font-bold leading-none ${bandFg(b)}`}>
                      {d.score === null ? "—" : Math.round(d.score)}
                    </span>
                    <BandChip band={b} />
                  </div>
                }
              >
                <FieldBars fields={d.fields} />
                <p className="border-t border-[var(--border-hair)] px-5 py-3 text-[11px] leading-relaxed text-ink-500">
                  {def.rationale}
                </p>
              </Panel>
            );
          })}
        </div>
      </div>

      {/* -------- mapa da relação -------- */}
      <Panel
        title="Mapa dos check-ins"
        subtitle="As seis perguntas do roteiro ao longo do tempo, do mais antigo ao mais recente. A linha que escurece é a que vira churn."
      >
        <CheckinHeatmap rows={heatRows} snapshots={checkins} />
      </Panel>

      {/* -------- planos -------- */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Panel
          title="Planos de ação"
          subtitle="Para cada risco: plano, dono e prazo. O loop fecha na revisão semanal."
        >
          {plans.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ink-400">Nenhum plano registrado.</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Risco / plano</th>
                  <th>Dono</th>
                  <th>Prazo</th>
                  <th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td className="max-w-[420px]">
                      <div className="font-medium text-ink-100">{p.risk}</div>
                      <div className="mt-0.5 text-xs text-ink-400">{p.plan}</div>
                      <a
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-v4-red hover:underline"
                        href={clickupUrl(client.name, p.risk, p.plan, p.due_date)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir tarefa no ClickUp
                        <Icon name="external" size={11} />
                      </a>
                    </td>
                    <td className="text-ink-300">{p.owner}</td>
                    <td className={p.due_date && p.due_date < at ? "text-vermelho-fg" : "text-ink-300"}>
                      {dateBR(p.due_date)}
                    </td>
                    <td className="text-right">
                      <form action={setPlanStatus} className="inline-flex items-center gap-1">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="client_id" value={clientId} />
                        <select name="status" defaultValue={p.status} className="field w-auto py-1 text-xs">
                          <option value="aberto">aberto</option>
                          <option value="em_andamento">em andamento</option>
                          <option value="concluido">concluído</option>
                          <option value="cancelado">cancelado</option>
                        </select>
                        <button className="btn py-1 text-xs">ok</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Novo plano" subtitle={`${openPlans.length} em aberto`}>
          <form action={addPlan} className="space-y-3 px-4 py-4">
            <input type="hidden" name="client_id" value={clientId} />
            <label className="block">
              <span className="label">Risco</span>
              <input
                name="risk"
                required
                className="field mt-1"
                placeholder="Ex.: CPL 40% acima da meta há 3 semanas"
              />
            </label>
            <label className="block">
              <span className="label">Plano</span>
              <textarea name="plan" required rows={3} className="field mt-1" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="label">Dono</span>
                <input
                  name="owner"
                  required
                  className="field mt-1"
                  defaultValue={client.gt_name ?? client.account_name ?? ""}
                />
              </label>
              <label className="block">
                <span className="label">Prazo</span>
                <input type="date" name="due_date" className="field mt-1" />
              </label>
            </div>
            <button className="btn btn-primary w-full justify-center">Registrar plano</button>
          </form>
        </Panel>
      </div>

      {/* -------- histórico dos dois inputs -------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Snapshots de performance" subtitle="GT · semanal, nunca sobrescrito">
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
        </Panel>

        <Panel title="Check-ins" subtitle="Account · a cada contato">
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
                      <div className="mt-1 text-[11px] text-vermelho-fg">
                        risco: {String(c.data.risk_note || "sim")}
                      </div>
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
        </Panel>
      </div>

      <Panel title="Metas vigentes" subtitle="Base das réguas A e B. Alteradas pelo GT ou no cadastro.">
        <div className="grid gap-x-8 gap-y-2 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(targets).length === 0 && (
            <span className="text-sm text-ink-400">Nenhuma meta cadastrada — sem meta não há régua.</span>
          )}
          {Object.entries(targets).map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between border-b border-[var(--border-hair)] pb-1">
              <span className="text-xs text-ink-400">{k}</span>
              <span className="tnum text-sm text-ink-100">
                {v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
              </span>
            </div>
          ))}
        </div>
      </Panel>
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

/** Risco vira tarefa (briefing 6). Sem API paga: abre o ClickUp já preenchido. */
function clickupUrl(client: string, risk: string, plan: string, due: string | null) {
  const base = process.env.NEXT_PUBLIC_CLICKUP_LIST_URL ?? "https://app.clickup.com/";
  const q = new URLSearchParams({
    name: `[Health Score] ${client} — ${risk}`,
    description: `${plan}${due ? `\n\nPrazo: ${due}` : ""}`,
  });
  return `${base}?${q}`;
}
