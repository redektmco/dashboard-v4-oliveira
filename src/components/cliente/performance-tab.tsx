"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AccountType } from "@/lib/model/types";
import {
  CHANNELS,
  CHANNEL_NAME,
  RESULT_LABEL,
  STATUS_LABEL,
  convRate,
  cpc,
  cpm,
  cpr,
  ctr,
  dailyMetricSeries,
  dailyMetricsFor,
  delta,
  frequency,
  mergeDaily,
  roas,
  sumTotals,
  type Campaign,
  type CampaignStatus,
  type Channel,
  type DailyMetric,
  type DailyMetricDef,
  type PerformanceData,
  type Totals,
} from "@/lib/performance/model";
import { Icon } from "../icon";
import { Card, Segmented } from "../kit";
import { CHANNEL_COLOR, DailyMetricChart, DailySpendChart } from "./performance-chart";
import { Demographics } from "./demographics";

/**
 * Aba Performance da ficha: Meta e Google lidos ao vivo no período da ficha.
 * Carrega só quando a aba aparece na tela (as APIs levam alguns segundos) e
 * de novo quando o período muda.
 */

type ChannelFilter = "todos" | Channel;
type StatusFilter = "todas" | "ativas" | "pausadas";
type SortKey = "spend" | "impressions" | "ctr" | "clicks" | "results" | "cpr";

/* ---------------------------- formatos ---------------------------- */

const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brl2 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const pct = (n: number | null, d = 2) => (n === null ? "—" : `${n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`);
const money = (n: number | null) => (n === null ? "—" : brl2(n));
/** "392,4 mil", "1,2 mi". */
function compact(n: number | null) {
  if (n === null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (n >= 10_000) return `${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return int(n);
}
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/* ---------------------------- container ---------------------------- */

export function PerformanceTab({
  clientId,
  clientName,
  query,
  periodLabel,
  compact: mobile = false,
}: {
  clientId: number;
  clientName: string;
  /** Query do período (`periodo=30d`, `de=…&ate=…` ou vazio). */
  query: string;
  periodLabel: string;
  compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<{ q: string; data?: PerformanceData; error?: string } | null>(null);
  const [reload, setReload] = useState(0);

  // Painel escondido (`hidden`) não cruza a tela: só busca quando a aba abre.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let gone = false;
    fetch(`/api/clientes/${clientId}/performance${query ? `?${query}` : ""}`)
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as { data?: PerformanceData; error?: string };
        if (gone) return;
        if (!r.ok || !body.data) setState({ q: query, error: body.error ?? `Não deu para carregar (${r.status}).` });
        else setState({ q: query, data: body.data });
      })
      .catch(() => !gone && setState({ q: query, error: "Sem conexão com o servidor." }));
    return () => {
      gone = true;
    };
  }, [visible, clientId, query, reload]);

  const loading = !state || state.q !== query;

  return (
    <div ref={ref} className="flex min-h-[40px] flex-col gap-6">
      {loading ? (
        <Skeleton label={periodLabel} />
      ) : state.error ? (
        <Card className="flex flex-col items-center gap-3 px-5 py-10 text-center">
          <Icon name="alertCircle" size={20} className="text-vermelho-fg" />
          <p className="text-[13px] text-ink-300">{state.error}</p>
          <button type="button" className="btn h-8" onClick={() => { setState(null); setReload((n) => n + 1); }}>
            Tentar de novo
          </button>
        </Card>
      ) : (
        <PerformanceView data={state.data!} clientName={clientName} mobile={mobile} clientId={clientId} query={query} />
      )}
    </div>
  );
}

function Skeleton({ label }: { label: string }) {
  return (
    <>
      <p className="flex items-center gap-2 text-[13px] text-ink-400">
        <Icon name="refresh" size={14} className="animate-spin" />
        Buscando Meta Ads e Google Ads · {label}
      </p>
      <div className="h-[118px] animate-pulse rounded-xl bg-ink-900" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="h-[320px] animate-pulse rounded-xl bg-ink-900" />
        <div className="h-[320px] animate-pulse rounded-xl bg-ink-900" />
      </div>
    </>
  );
}

/* ------------------------------ visão ------------------------------ */

/** Rótulo da métrica no seletor e no gráfico. */
function metricLabel(m: DailyMetric, type: AccountType) {
  const r = RESULT_LABEL[type];
  const labels: Record<DailyMetric, string> = {
    results: r.one,
    cpr: r.cost,
    revenue: "Receita",
    roas: "ROAS",
    clicks: "Cliques",
    impressions: "Impressões",
    ctr: "CTR",
    cpc: "CPC",
    cpm: "CPM",
  };
  return labels[m];
}

const metricFormat = (d: DailyMetricDef) => (n: number) =>
  d.format === "money"
    ? n >= 1000
      ? brl0(n)
      : brl2(n)
    : d.format === "pct"
      ? pct(n)
      : d.format === "x"
        ? `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`
        : compact(n);

function PerformanceView({ data, clientName, mobile, clientId, query }: { data: PerformanceData; clientName: string; mobile: boolean; clientId: number; query: string }) {
  const [channel, setChannel] = useState<ChannelFilter>("todos");
  const [compare, setCompare] = useState(true);
  const metricOptions = dailyMetricsFor(data.accountType);
  // Gráficos abaixo do investimento: o resultado da conta aberto por padrão.
  const [metrics, setMetrics] = useState<DailyMetric[]>(() => [metricOptions[0].id]);
  const toggleMetric = (m: DailyMetric) =>
    setMetrics((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m].slice(-3)));
  const linked = CHANNELS.filter((c) => data.channels[c].linked);
  const sel = channel === "todos" ? linked : linked.filter((c) => c === channel);
  const label = RESULT_LABEL[data.accountType];

  const totals = useMemo(() => sumTotals(sel.map((c) => data.channels[c].totals)), [sel, data]);
  const previous = useMemo(() => {
    const prev = sel.map((c) => data.channels[c].previous);
    return prev.length && prev.every(Boolean) ? sumTotals(prev as Totals[]) : null;
  }, [sel, data]);
  const days = useMemo(
    () => mergeDaily(data.since, data.until, Object.fromEntries(sel.map((c) => [c, data.channels[c].daily]))),
    [sel, data],
  );
  const campaigns = useMemo(() => sel.flatMap((c) => data.channels[c].campaigns), [sel, data]);
  const errors = linked.flatMap((c) =>
    data.channels[c].accounts.filter((a) => a.error).map((a) => ({ channel: c, ...a })),
  );

  if (!linked.length)
    return (
      <Card className="flex flex-col items-center gap-2 px-5 py-10 text-center">
        <Icon name="plug" size={20} className="text-ink-500" />
        <p className="text-[14px] font-medium text-ink-100">Nenhuma conta de mídia vinculada</p>
        <p className="max-w-[440px] text-[13px] text-ink-400">
          Vincule a conta do Meta Ads ou do Google Ads deste cliente para ver investimento, resultados e campanhas aqui.
        </p>
        <Link href={`/gt?c=${clientId}`} className="btn mt-2 h-8">
          <Icon name="plug" size={14} />
          Vincular em Performance › Metas
        </Link>
      </Card>
    );

  return (
    <>
      {/* Filtros da aba (o período fica no topo da ficha). */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex gap-0.5 rounded-lg border border-[var(--border-hair)] bg-ink-900 p-[3px]" role="radiogroup" aria-label="Canal">
          {(["todos", ...linked] as ChannelFilter[]).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={channel === c}
              onClick={() => setChannel(c)}
              className={`flex h-7 items-center gap-1.5 rounded-[5px] px-3 text-[12px] font-semibold transition-colors ${
                channel === c ? "bg-ink-800 text-ink-100" : "text-ink-400 hover:text-ink-100"
              }`}
            >
              {c !== "todos" && <span className="h-[7px] w-[7px] rounded-full" style={{ background: CHANNEL_COLOR[c] }} />}
              {c === "todos" ? "Todos os canais" : CHANNEL_NAME[c]}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2.5">
          <input type="checkbox" className="peer sr-only" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
          <span
            aria-hidden
            className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ink-300 ${
              compare ? "justify-end bg-[var(--color-accent)]" : "justify-start bg-ink-700"
            }`}
          >
            <span className="h-4 w-4 rounded-full bg-ink-100" />
          </span>
          <span className="whitespace-nowrap text-[13px] text-ink-300">
            Comparar <span className="hidden font-mono text-[11px] text-ink-500 sm:inline">com {ddmm(data.previous.since)}–{ddmm(data.previous.until)}</span>
          </span>
        </label>
        <span className="hidden flex-1 lg:block" />
        {errors.length > 0 && (
          <span className="flex items-center gap-1.5 text-[12px] text-vermelho-fg" title={errors.map((e) => `${e.name}: ${e.error}`).join("\n")}>
            <span className="h-1.5 w-1.5 rounded-full bg-vermelho-fg" />
            {errors.length === 1 ? `${CHANNEL_NAME[errors[0].channel]} sem dados` : `${errors.length} contas sem dados`}
          </span>
        )}
        <button
          type="button"
          onClick={() => exportCsv(data, campaigns, totals, clientName)}
          className="flex h-9 items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-ink-850 px-4 text-[13px] font-semibold text-ink-100 transition-colors hover:bg-ink-800"
        >
          <Icon name="download" size={16} />
          Exportar
        </button>
      </div>

      <Kpis
        type={data.accountType}
        totals={totals}
        previous={compare ? previous : null}
        perChannel={sel.map((c) => ({ c, t: data.channels[c].totals }))}
        target={data.budgetTarget}
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col gap-4">
          <header className="flex items-center justify-between gap-3">
            <h3 className="font-display text-[15px] font-semibold text-ink-100">Investimento diário</h3>
            <span className="flex items-center gap-4">
              {sel.map((c) => (
                <span key={c} className="flex items-center gap-1.5 text-[12px] text-ink-400">
                  <span className="h-2 w-2 rounded-sm" style={{ background: CHANNEL_COLOR[c] }} />
                  {CHANNEL_NAME[c]}
                </span>
              ))}
            </span>
          </header>
          {totals.spend > 0 ? (
            <DailySpendChart days={days} channels={sel} resultLabel={data.accountType === "branding" ? null : label.one} />
          ) : (
            <p className="rounded-xl border border-[var(--border-hair)] px-5 py-10 text-center text-[13px] text-ink-400">
              Sem investimento no período.
            </p>
          )}
          {/* Seletor: cada métrica marcada vira um gráfico logo abaixo (até 3). */}
          {totals.spend > 0 && (
            <div className="flex flex-col gap-4 border-t border-[var(--border-hair)] pt-4">
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Métricas nos gráficos de baixo">
                <span className="mr-1 text-[12px] text-ink-400">Ver também</span>
                {metricOptions.map((m) => {
                  const on = metrics.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleMetric(m.id)}
                      className={`flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-semibold transition-colors ${
                        on ? "border-[var(--border-strong)] bg-ink-800 text-ink-100" : "border-[var(--border-hair)] text-ink-400 hover:text-ink-100"
                      }`}
                    >
                      {on && <Icon name="check" size={12} />}
                      {metricLabel(m.id, data.accountType)}
                    </button>
                  );
                })}
              </div>
              {metrics.map((id) => {
                const def = metricOptions.find((m) => m.id === id);
                if (!def) return null;
                const name = metricLabel(id, data.accountType);
                const series = dailyMetricSeries(data.since, data.until, Object.fromEntries(sel.map((c) => [c, data.channels[c].daily])), id);
                return (
                  <div key={id} className="flex flex-col gap-2">
                    <span className="flex items-center justify-between gap-3">
                      <h4 className="text-[13px] font-semibold text-ink-100">{name} por dia</h4>
                      <button type="button" onClick={() => toggleMetric(id)} aria-label={`Tirar ${name}`} className="text-ink-500 hover:text-ink-100">
                        <Icon name="x" size={14} />
                      </button>
                    </span>
                    {series.some((d) => d.total) ? (
                      <DailyMetricChart days={series} channels={sel} additive={def.additive} format={metricFormat(def)} label={name} />
                    ) : (
                      <p className="rounded-xl border border-[var(--border-hair)] px-5 py-6 text-center text-[12px] text-ink-400">Sem {name.toLowerCase()} no período.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {errors.map((e) => (
            <p key={e.id} className="flex items-start gap-2 text-[12px] text-ink-300">
              <Icon name="alert" size={14} className="mt-px shrink-0 text-amarelo-fg" />
              <span>
                {CHANNEL_NAME[e.channel]} · {e.name}: {e.error} — o investimento real pode estar subestimado.
              </span>
            </p>
          ))}
        </section>

        <ByChannel data={data} channels={linked.filter((c) => sel.includes(c))} />
      </div>

      {linked.includes("meta") && <Demographics clientId={clientId} query={query} type={data.accountType} />}

      <Campaigns
        type={data.accountType}
        campaigns={campaigns}
        totals={totals}
        mobile={mobile}
      />

      <p className="text-[11px] text-ink-500">
        Lido direto das APIs da Meta e do Google às{" "}
        {new Date(data.fetchedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}. Cliques = todos os cliques;
        {data.accountType === "lead_gen" && " leads = formulário, contato no site e conversas, conforme a regra de cada conta; CPL usa a verba das campanhas que geraram lead na Meta e a verba toda no Google (como no Google Ads);"}{" "}
        variação contra {ddmm(data.previous.since)}–{ddmm(data.previous.until)}.
      </p>
    </>
  );
}

/* ------------------------------- KPIs ------------------------------- */

type Kpi = {
  label: string;
  value: string;
  /** Variação em %; `good` diz se subir é bom. */
  change?: { pct: number | null; good: "up" | "down" | "neutral" };
  detail: string;
};

/** De onde sai a verba do CPL: só as campanhas de lead (Meta) ou a verba toda (Google). */
function cplBase(t: Totals) {
  const base = brl0(t.resultSpend || t.spend);
  return base === brl0(t.spend) ? `sobre a verba toda (${base})` : `sobre ${base} das campanhas de lead`;
}

function kpisFor(type: AccountType, t: Totals, p: Totals | null, perChannel: { c: Channel; t: Totals }[]): Kpi[] {
  const by = (f: (x: Totals) => number | null, fmt: (n: number | null) => string) =>
    perChannel.length > 1 ? perChannel.map(({ c, t: x }) => `${c === "meta" ? "Meta" : "Google"} ${fmt(f(x))}`).join(" · ") : "";
  const vs = (n: number, f: (n: number) => string) => (p ? `vs. ${f(n)} no período anterior` : "");
  const ctrK: Kpi = {
    label: "CTR",
    value: pct(ctr(t)),
    change: { pct: delta(ctr(t), p ? ctr(p) : null), good: "up" },
    detail: `${int(t.clicks)} cliques · CPC ${money(cpc(t))}`,
  };
  if (type === "ecommerce")
    return [
      { label: "Receita", value: brl0(t.revenue), change: { pct: delta(t.revenue, p?.revenue), good: "up" }, detail: vs(p?.revenue ?? 0, brl0) },
      { label: "ROAS", value: roas(t) === null ? "—" : `${roas(t)!.toFixed(2).replace(".", ",")}x`, change: { pct: delta(roas(t), p ? roas(p) : null), good: "up" }, detail: by(roas, (n) => (n === null ? "—" : `${n.toFixed(2).replace(".", ",")}x`)) },
      { label: "Compras", value: int(t.purchases), change: { pct: delta(t.purchases, p?.purchases), good: "up" }, detail: `custo por compra ${money(cpr(t))}` },
      ctrK,
    ];
  if (type === "branding")
    return [
      { label: "Alcance", value: compact(t.reach), change: { pct: delta(t.reach, p?.reach), good: "up" }, detail: `frequência ${frequency(t)?.toFixed(2).replace(".", ",") ?? "—"}` },
      { label: "CPM", value: money(cpm(t)), change: { pct: delta(cpm(t), p ? cpm(p) : null), good: "down" }, detail: by(cpm, money) },
      { label: "Impressões", value: compact(t.impressions), change: { pct: delta(t.impressions, p?.impressions), good: "up" }, detail: vs(p?.impressions ?? 0, compact) },
      ctrK,
    ];
  return [
    { label: "Leads", value: int(t.results), change: { pct: delta(t.results, p?.results), good: "up" }, detail: p ? vs(p.results, int) : `${int(t.leads)} de site/formulário · ${int(t.conversations)} conversas` },
    { label: "CPL", value: money(cpr(t)), change: { pct: delta(cpr(t), p ? cpr(p) : null), good: "down" }, detail: by(cpr, money) || cplBase(t) },
    ctrK,
    { label: "Taxa de conversão", value: pct(convRate(t)), change: { pct: delta(convRate(t), p ? convRate(p) : null), good: "up" }, detail: `${compact(t.impressions)} impressões · CPM ${money(cpm(t))}` },
  ];
}

function Change({ pct: v, good }: { pct: number | null; good: "up" | "down" | "neutral" }) {
  if (v === null || !Number.isFinite(v)) return null;
  const up = v > 0;
  const better = good === "neutral" ? null : (good === "up") === up;
  const cls = Math.abs(v) < 0.5 || better === null ? "text-ink-400" : better ? "text-verde-fg" : "text-vermelho-fg";
  return (
    <span className={`flex items-center gap-0.5 text-[12px] font-semibold ${cls}`}>
      <Icon name={up ? "trendingUp" : "trendingDown"} size={13} />
      {`${up ? "+" : "−"}${Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: Math.abs(v) < 10 ? 1 : 0 })}%`}
    </span>
  );
}

function Kpis({
  type,
  totals,
  previous,
  perChannel,
  target,
}: {
  type: AccountType;
  totals: Totals;
  previous: Totals | null;
  perChannel: { c: Channel; t: Totals }[];
  target: number | null;
}) {
  const items = kpisFor(type, totals, previous, perChannel);
  const base = Math.max(target ?? 0, totals.spend) || 1;
  return (
    <Card className="flex flex-col gap-5 px-6 py-5 lg:flex-row lg:items-center lg:gap-7">
      <div className="flex shrink-0 flex-col gap-2 lg:w-[260px]">
        <span className="text-[10px] font-semibold uppercase tracking-[0.8px] text-ink-400">Verba investida</span>
        <span className="flex flex-wrap items-end gap-x-2 gap-y-1">
          <span className="font-display text-[30px] font-bold leading-[30px] text-ink-100">{brl0(totals.spend)}</span>
          {target ? (
            <span className="text-[12px] text-ink-400">
              de {brl0(target)} · {Math.round((totals.spend / target) * 100)}%
            </span>
          ) : null}
          {previous && <Change pct={delta(totals.spend, previous.spend)} good="neutral" />}
        </span>
        <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-ink-800" aria-hidden>
          {perChannel.map(({ c, t }) => (
            <span key={c} className="h-full" style={{ width: `${(t.spend / base) * 100}%`, background: CHANNEL_COLOR[c] }} />
          ))}
        </span>
        <span className="flex flex-wrap gap-x-3 gap-y-1">
          {perChannel.map(({ c, t }) => (
            <span key={c} className="flex items-center gap-1.5 font-mono text-[12px] text-ink-300">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: CHANNEL_COLOR[c] }} />
              {c === "meta" ? "Meta" : "Google"} {brl0(t.spend)}
            </span>
          ))}
        </span>
      </div>
      <span className="hidden h-16 w-px shrink-0 bg-[var(--border-hair)] lg:block" />
      <div className="grid flex-1 grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
        {items.map((k) => (
          <div key={k.label} className="flex min-w-0 flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.8px] text-ink-400">{k.label}</span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-display text-[17px] font-bold text-ink-100">{k.value}</span>
              {previous && k.change && <Change {...k.change} />}
            </span>
            {k.detail && <span className="text-[12px] text-ink-400">{k.detail}</span>}
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ----------------------------- por canal ----------------------------- */

function ByChannel({ data, channels }: { data: PerformanceData; channels: Channel[] }) {
  const type = data.accountType;
  const label = RESULT_LABEL[type];
  const total = channels.reduce((a, c) => a + data.channels[c].totals.spend, 0);
  type Row = { label: string; f: (t: Totals) => string; best?: (t: Totals) => number | null; lowerBetter?: boolean; strong?: boolean };
  const rows: Row[] = [
    { label: "Investido", f: (t) => brl0(t.spend) },
    { label: "Participação", f: (t) => (total > 0 ? `${Math.round((t.spend / total) * 100)}%` : "—") },
    { label: "Impressões", f: (t) => compact(t.impressions) },
    { label: "Alcance", f: (t) => compact(t.reach) },
    { label: "Frequência", f: (t) => (frequency(t) === null ? "—" : frequency(t)!.toFixed(2).replace(".", ",")) },
    { label: "Cliques", f: (t) => int(t.clicks) },
    { label: "Cliques no link", f: (t) => (t.linkClicks === null ? "—" : int(t.linkClicks)) },
    { label: "CTR", f: (t) => pct(ctr(t)) },
    { label: "CPC", f: (t) => money(cpc(t)) },
    { label: "CPM", f: (t) => money(cpm(t)) },
  ];
  if (type === "lead_gen") {
    rows.push(
      { label: "Leads de site/formulário", f: (t) => int(t.leads) },
      { label: "Conversas iniciadas", f: (t) => int(t.conversations) },
      { label: label.one, f: (t) => int(t.results) },
      { label: "Taxa de conversão", f: (t) => pct(convRate(t), 1) },
      { label: label.cost, f: (t) => money(cpr(t)), best: cpr, lowerBetter: true, strong: true },
    );
  } else if (type === "ecommerce") {
    rows.push(
      { label: "Compras", f: (t) => int(t.purchases) },
      { label: "Custo por compra", f: (t) => money(cpr(t)), best: cpr, lowerBetter: true, strong: true },
      { label: "Receita", f: (t) => brl0(t.revenue) },
      { label: "ROAS", f: (t) => (roas(t) === null ? "—" : `${roas(t)!.toFixed(2).replace(".", ",")}x`), best: roas, strong: true },
    );
  }
  const winner = (r: Row) => {
    if (!r.best || channels.length < 2) return null;
    const vals = channels.map((c) => ({ c, v: r.best!(data.channels[c].totals) })).filter((x) => x.v !== null) as { c: Channel; v: number }[];
    if (vals.length < 2) return null;
    return vals.sort((a, b) => (r.lowerBetter ? a.v - b.v : b.v - a.v))[0].c;
  };

  return (
    <section className="flex min-w-0 flex-col">
      <h3 className="pb-3 font-display text-[15px] font-semibold text-ink-100">Por canal</h3>
      <div className="flex border-t border-[var(--border-hair)] py-2.5">
        <span className="flex-1" />
        {channels.map((c) => (
          <span key={c} className="flex w-[104px] items-center justify-end gap-1.5 text-[12px] font-medium text-ink-300">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: CHANNEL_COLOR[c] }} />
            {c === "meta" ? "Meta" : "Google"}
          </span>
        ))}
      </div>
      {rows.map((r) => {
        const w = winner(r);
        return (
          <div key={r.label} className="flex items-center border-t border-[var(--border-hair)] py-2.5">
            <span className={`flex-1 text-[13px] ${r.strong ? "font-semibold text-ink-100" : "text-ink-400"}`}>{r.label}</span>
            {channels.map((c) => (
              <span
                key={c}
                className={`w-[104px] text-right font-mono text-[12px] ${w === c ? "font-semibold text-verde-fg" : r.strong ? "font-semibold text-ink-100" : "text-ink-200"}`}
              >
                {r.f(data.channels[c].totals)}
              </span>
            ))}
          </div>
        );
      })}
    </section>
  );
}

/* ----------------------------- campanhas ----------------------------- */

const STATUS_DOT: Record<CampaignStatus, string> = {
  ativa: "bg-verde",
  pausada: "bg-ink-500",
  encerrada: "bg-ink-600",
  problema: "bg-vermelho-fg",
};
const STATUS_TEXT: Record<CampaignStatus, string> = {
  ativa: "text-verde-fg",
  pausada: "text-ink-400",
  encerrada: "text-ink-500",
  problema: "text-vermelho-fg",
};

function Campaigns({
  type,
  campaigns,
  totals,
  mobile,
}: {
  type: AccountType;
  campaigns: Campaign[];
  totals: Totals;
  mobile: boolean;
}) {
  const [status, setStatus] = useState<StatusFilter>("todas");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "spend", desc: true });
  const label = RESULT_LABEL[type];
  const avgCost = cpr(totals);

  const list = useMemo(() => {
    const val = (c: Campaign): number | null =>
      sort.key === "ctr" ? ctr(c) : sort.key === "cpr" ? cpr(c) : (c[sort.key] as number);
    return campaigns
      .filter((c) => (status === "todas" ? true : status === "ativas" ? c.status === "ativa" : c.status === "pausada"))
      .sort((a, b) => {
        const va = val(a);
        const vb = val(b);
        if (va === null && vb === null) return b.spend - a.spend;
        if (va === null) return 1; // sem valor vai para o fim, nos dois sentidos
        if (vb === null) return -1;
        return sort.desc ? vb - va : va - vb;
      });
  }, [campaigns, status, sort]);

  const counts = {
    todas: campaigns.length,
    ativas: campaigns.filter((c) => c.status === "ativa").length,
    pausadas: campaigns.filter((c) => c.status === "pausada").length,
  };

  const cols: { key: SortKey; label: string; w: string }[] = [
    { key: "spend", label: "Investido", w: "w-[104px]" },
    { key: "impressions", label: "Impressões", w: "w-[92px]" },
    { key: "clicks", label: "Cliques", w: "w-[76px]" },
    { key: "ctr", label: "CTR", w: "w-[68px]" },
    { key: "results", label: label.one, w: "w-[80px]" },
    { key: "cpr", label: label.cost, w: "w-[100px]" },
  ];
  const head = (k: SortKey) =>
    setSort((s) => (s.key === k ? { key: k, desc: !s.desc } : { key: k, desc: k !== "cpr" }));
  const cell = (c: Totals, k: SortKey) =>
    k === "spend" ? brl0(c.spend) : k === "impressions" ? compact(c.impressions) : k === "clicks" ? int(c.clicks) : k === "ctr" ? pct(ctr(c)) : k === "results" ? (type === "branding" ? compact(c.results) : int(c.results)) : type === "branding" ? money(cpm(c)) : money(cpr(c));

  return (
    <section className="flex flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 pb-3">
        <h3 className="flex items-baseline gap-2 font-display text-[15px] font-semibold text-ink-100">
          Campanhas <span className="font-sans text-[12px] font-normal text-ink-500">{counts.todas}</span>
        </h3>
        <Segmented
          value={status}
          onChange={setStatus}
          size="sm"
          options={[
            { value: "todas", label: "Todas" },
            { value: "ativas", label: `Ativas · ${counts.ativas}` },
            { value: "pausadas", label: `Pausadas · ${counts.pausadas}` },
          ]}
        />
      </header>

      {!list.length ? (
        <p className="border-t border-[var(--border-hair)] py-8 text-center text-[13px] text-ink-400">Nenhuma campanha neste filtro.</p>
      ) : (
        <div className={`overflow-x-auto ${mobile ? "-mx-4 px-4" : ""}`}>
          <div className="min-w-[940px]">
            <div className="flex items-center gap-4 border-t border-[var(--border-hair)] py-3">
              <span className="flex-1 text-[10px] font-semibold uppercase tracking-[0.8px] text-ink-400">Campanha</span>
              <span className="w-[110px] text-[10px] font-semibold uppercase tracking-[0.8px] text-ink-400">Status</span>
              {cols.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => head(c.key)}
                  className={`${c.w} text-right text-[10px] font-semibold uppercase tracking-[0.8px] ${sort.key === c.key ? "text-ink-100" : "text-ink-400 hover:text-ink-200"}`}
                >
                  {c.label}
                  {sort.key === c.key ? (sort.desc ? " ↓" : " ↑") : ""}
                </button>
              ))}
            </div>
            {list.map((c) => {
              const cost = cpr(c);
              return (
                <div key={c.id} className="flex items-center gap-4 border-t border-[var(--border-hair)] py-3">
                  <span className="flex min-w-0 flex-1 items-stretch gap-2.5">
                    <span className="w-[3px] shrink-0 rounded-full" style={{ background: CHANNEL_COLOR[c.channel] }} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-[13px] font-medium text-ink-100" title={c.name}>
                        {c.name}
                      </span>
                      <span className="truncate text-[12px] text-ink-400">
                        {CHANNEL_NAME[c.channel]} · {c.kind}
                        {c.dailyBudget ? ` · ${brl0(c.dailyBudget)}/dia` : ""}
                      </span>
                    </span>
                  </span>
                  <span className={`flex w-[110px] items-center gap-1.5 text-[12px] ${STATUS_TEXT[c.status]}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[c.status]}`} />
                    {STATUS_LABEL[c.status]}
                  </span>
                  {cols.map((col) => (
                    <span
                      key={col.key}
                      className={`${col.w} text-right font-mono text-[12px] ${
                        col.key === "cpr" && type !== "branding" && cost !== null && avgCost !== null && cost <= avgCost
                          ? "font-semibold text-verde-fg"
                          : col.key === "cpr" || col.key === "spend"
                            ? "font-semibold text-ink-100"
                            : "text-ink-200"
                      }`}
                    >
                      {cell(c, col.key)}
                    </span>
                  ))}
                </div>
              );
            })}
            <div className="flex items-center gap-4 border-t border-[var(--border-strong)] py-3">
              <span className="flex-1 text-[13px] font-semibold text-ink-100">Total no período</span>
              <span className="w-[110px] text-[12px] text-ink-400">
                {counts.ativas} {counts.ativas === 1 ? "ativa" : "ativas"}
              </span>
              {cols.map((col) => (
                <span key={col.key} className={`${col.w} text-right font-mono text-[12px] font-semibold text-ink-100`}>
                  {cell(totals, col.key)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------ exportar ------------------------------ */

function exportCsv(data: PerformanceData, campaigns: Campaign[], totals: Totals, clientName: string) {
  const n = (v: number | null, d = 2) => (v === null ? "" : v.toFixed(d).replace(".", ","));
  const head = [
    "Canal", "Campanha", "Tipo/objetivo", "Status", "Orçamento diário", "Investido", "Impressões", "Alcance", "Frequência",
    "Cliques", "Cliques no link", "CTR %", "CPC", "CPM", "Leads site/formulário", "Conversas", "Compras", "Receita", "Resultados",
    "Custo por resultado", "ROAS",
  ];
  const row = (name: string, c: Totals & Partial<Campaign>) => [
    c.channel ? CHANNEL_NAME[c.channel] : "",
    name,
    c.kind ?? "",
    c.status ? STATUS_LABEL[c.status] : "",
    n(c.dailyBudget ?? null),
    n(c.spend),
    String(c.impressions),
    c.reach === null ? "" : String(c.reach),
    n(frequency(c)),
    String(c.clicks),
    c.linkClicks === null ? "" : String(c.linkClicks),
    n(ctr(c)),
    n(cpc(c)),
    n(cpm(c)),
    n(c.leads, 1),
    String(c.conversations),
    n(c.purchases, 1),
    n(c.revenue),
    n(c.results, 1),
    n(cpr(c)),
    n(roas(c)),
  ];
  const lines = [head, ...campaigns.map((c) => row(c.name, c)), row("Total no período", totals)];
  const csv = lines.map((l) => l.map((v) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(";")).join("\r\n");
  // BOM para o Excel abrir com acento.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const slug = clientName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  a.download = `performance-${slug}-${data.since}-a-${data.until}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
