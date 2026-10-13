"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AccountType } from "@/lib/model/types";
import { RESULT_LABEL } from "@/lib/performance/model";
import { BR_REGIONS, BR_REGION_NAME, BR_REGION_PATHS } from "@/lib/performance/br-map";
import { AGES, type DemoAgg, type DemographicsData, type Gender } from "@/lib/performance/demographics";
import { Icon } from "../icon";

/**
 * Demografia da aba Performance: mapa do Brasil por região, a tabela das
 * regiões e as barras de idade e gênero. Lida ao vivo da Meta, carrega
 * sozinha (rota própria) e só quando a seção aparece na tela.
 *
 * A Meta não cruza região com idade/gênero: o filtro de gênero recorta as
 * barras de idade e o de idade recorta a barra de gênero; o mapa responde
 * só à métrica.
 */

type Metric = "results" | "spend" | "cpr";
type GenderFilter = "todos" | "female" | "male";

const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const brl2 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const pct = (n: number) => `${Math.round(n * 100)}%`;

const valueOf = (m: Metric, a: DemoAgg): number | null =>
  m === "results" ? a.results : m === "spend" ? a.spend : a.results > 0 ? (a.resultSpend || a.spend) / a.results : null;

const fmt = (m: Metric, v: number | null) => (v === null ? "—" : m === "results" ? int(v) : m === "spend" ? brl0(v) : brl2(v));

const sum = (list: DemoAgg[]): DemoAgg =>
  list.reduce((a, b) => ({ spend: a.spend + b.spend, results: a.results + b.results, resultSpend: a.resultSpend + b.resultSpend }), {
    spend: 0,
    results: 0,
    resultSpend: 0,
  });

/** Tom do mapa: do mais fraco (#333) ao mais forte (#EAEAEA), como no desenho. */
function shade(t: number) {
  const a = 0x33;
  const b = 0xea;
  const v = Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));
  const h = v.toString(16).padStart(2, "0");
  return `#${h}${h}${h}`;
}

export function Demographics({ clientId, query, type }: { clientId: number; query: string; type: AccountType }) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<{ q: string; data?: DemographicsData; error?: string } | null>(null);
  const hasResults = type !== "branding";
  const [metric, setMetric] = useState<Metric>(hasResults ? "results" : "spend");
  const [gender, setGender] = useState<GenderFilter>("todos");
  const [age, setAge] = useState<string>("todas");

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
    fetch(`/api/clientes/${clientId}/demografia${query ? `?${query}` : ""}`)
      .then(async (r) => {
        const body = (await r.json().catch(() => ({}))) as { data?: DemographicsData; error?: string };
        if (gone) return;
        if (!r.ok || !body.data) setState({ q: query, error: body.error ?? `Não deu para carregar (${r.status}).` });
        else setState({ q: query, data: body.data });
      })
      .catch(() => !gone && setState({ q: query, error: "Sem conexão com o servidor." }));
    return () => {
      gone = true;
    };
  }, [visible, clientId, query]);

  const data = state?.q === query ? state.data : undefined;
  const label = RESULT_LABEL[type];
  const metricName: Record<Metric, string> = { results: label.one, spend: "Investimento", cpr: label.cost };
  const metrics: Metric[] = hasResults ? ["results", "spend", "cpr"] : ["spend"];

  const view = useMemo(() => {
    if (!data) return null;
    const regs = BR_REGIONS.map((r) => ({ r, agg: data.regions[r], v: valueOf(metric, data.regions[r]) }));
    const total = sum(regs.map((x) => x.agg));
    const vals = regs.map((x) => x.v).filter((v): v is number => v !== null && v > 0);
    const max = Math.max(0, ...vals);
    const min = Math.min(...vals);
    const tone = (v: number | null) => {
      if (v === null || v <= 0 || !max) return "#262626";
      // CPL: quanto menor, melhor — o mais barato fica mais claro.
      if (metric === "cpr") return shade(max === min ? 1 : 1 - (v - min) / (max - min) * 0.85);
      return shade(v / max);
    };
    const sorted = [...regs].sort((a, b) => (metric === "cpr" ? (a.v ?? Infinity) - (b.v ?? Infinity) : (b.v ?? 0) - (a.v ?? 0)));

    // Idade (recortada pelo gênero) e gênero (recortado pela idade).
    const byAge = AGES.map((a) => ({
      age: a,
      agg: sum(data.ageGender.filter((x) => x.age === a && (gender === "todos" || x.gender === gender)).map((x) => x.agg)),
    }));
    const ageBase = byAge.reduce((n, x) => n + Math.max(0, valueOf(metric === "cpr" ? "results" : metric, x.agg) ?? 0), 0);
    const g = (gd: Gender) => sum(data.ageGender.filter((x) => x.gender === gd && (age === "todas" || x.age === age)).map((x) => x.agg));
    const women = g("female");
    const men = g("male");
    return { regs, sorted, total, tone, byAge, ageBase, women, men };
  }, [data, metric, gender, age]);

  const share = (m: Metric, a: DemoAgg, total: DemoAgg) => {
    const base = m === "spend" ? total.spend : total.results;
    const v = m === "spend" ? a.spend : a.results;
    return base > 0 ? v / base : 0;
  };

  return (
    <section ref={ref} className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h3 className="font-display text-[15px] font-semibold text-ink-100">Demografia</h3>
        <span className="text-[12px] text-ink-400">
          {view ? `${hasResults ? `${int(view.total.results)} ${label.one.toLowerCase()}` : brl0(view.total.spend)} · por região · Meta Ads` : "Meta Ads"}
        </span>
        <span className="flex-1" />
        <div className="flex gap-0.5 rounded-lg border border-[var(--border-hair)] bg-ink-900 p-[3px]" role="radiogroup" aria-label="Métrica da demografia">
          {metrics.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={metric === m}
              onClick={() => setMetric(m)}
              className={`flex h-[26px] items-center rounded-[5px] px-2.5 text-[12px] font-semibold transition-colors ${
                metric === m ? "bg-ink-800 text-ink-100" : "text-ink-400 hover:text-ink-100"
              }`}
            >
              {metricName[m]}
            </button>
          ))}
        </div>
        <Select label="Gênero" value={gender} onChange={(v) => setGender(v as GenderFilter)} options={[["todos", "Todos"], ["female", "Mulheres"], ["male", "Homens"]]} />
        <Select label="Idade" value={age} onChange={setAge} options={[["todas", "Todas"], ...AGES.map((a) => [a, a.replace("-", "–")] as [string, string])]} />
      </header>

      {!state || state.q !== query ? (
        <div className="h-[300px] animate-pulse rounded-xl bg-ink-900" />
      ) : state.error ? (
        <p className="flex items-center gap-2 rounded-xl border border-[var(--border-hair)] px-5 py-6 text-[13px] text-ink-400">
          <Icon name="alertCircle" size={15} className="text-vermelho-fg" />
          {state.error}
        </p>
      ) : view && view.total.spend === 0 ? (
        <p className="rounded-xl border border-[var(--border-hair)] px-5 py-10 text-center text-[13px] text-ink-400">Sem investimento na Meta no período.</p>
      ) : view ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_minmax(0,360px)]">
          {/* mapa */}
          <svg viewBox="0 0 300 300" className="mx-auto w-full max-w-[300px]" role="img" aria-label={`Mapa do Brasil por região: ${metricName[metric]}`}>
            {view.regs.map(({ r, v }) => (
              <g key={r} fill={view.tone(v)}>
                <title>{`${BR_REGION_NAME[r]}: ${fmt(metric, v)}`}</title>
                {BR_REGION_PATHS[r].map((p, i) => (
                  <path key={i} d={p.d} transform={`translate(${p.x} ${p.y})`} stroke="#1a1a1a" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            ))}
          </svg>

          {/* regiões */}
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center border-b border-[var(--border-hair)] pb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-500">
              <span className="flex-1">Região</span>
              <span className="w-16 text-right">{hasResults ? label.one : "Invest."}</span>
              <span className="w-16 text-right">Part.</span>
              <span className="w-[88px] text-right">{hasResults ? label.cost : "Invest."}</span>
            </div>
            {view.sorted.map(({ r, agg, v }) => (
              <div key={r} className="flex items-center border-b border-[var(--border-hair)] py-2.5 text-[13px] last:border-0">
                <span className="flex flex-1 items-center gap-2 text-ink-100">
                  <span className="h-2 w-2 rounded-sm" style={{ background: view.tone(v) }} />
                  {BR_REGION_NAME[r]}
                </span>
                <span className="tnum w-16 text-right font-mono text-[12px] text-ink-100">{hasResults ? int(agg.results) : brl0(agg.spend)}</span>
                <span className="tnum w-16 text-right font-mono text-[12px] text-ink-300">{pct(share(hasResults ? "results" : "spend", agg, view.total))}</span>
                <span className="tnum w-[88px] text-right font-mono text-[12px] text-ink-300">{hasResults ? fmt("cpr", valueOf("cpr", agg)) : brl0(agg.spend)}</span>
              </div>
            ))}
            {(data?.otherRegion.spend ?? 0) > 0 && (
              <p className="pt-2 text-[11px] text-ink-500">
                {brl0(data!.otherRegion.spend)} em regiões fora do Brasil ou não informadas pela Meta ficaram fora do mapa.
              </p>
            )}
          </div>

          {/* idade e gênero */}
          <div className="flex min-w-0 flex-col gap-3 lg:col-span-2 xl:col-span-1">
            <GenderBar women={view.women} men={view.men} metric={metric === "cpr" ? "results" : metric} />
            <div className="flex flex-col gap-2">
              {view.byAge.map(({ age: a, agg }) => {
                const v = valueOf(metric, agg);
                const part = metric === "cpr" ? null : view.ageBase > 0 ? (v ?? 0) / view.ageBase : 0;
                const maxCpr = Math.max(0, ...view.byAge.map((x) => valueOf("cpr", x.agg) ?? 0));
                const w = metric === "cpr" ? (v && maxCpr ? v / maxCpr : 0) : (part ?? 0);
                return (
                  <div key={a} className="flex items-center gap-3 text-[12px]">
                    <span className="w-12 shrink-0 font-mono text-ink-400">{a.replace("-", "–")}</span>
                    <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-ink-850">
                      <span className="absolute inset-y-0 left-0 rounded-full bg-ink-300" style={{ width: `${Math.round(w * 100)}%` }} />
                    </span>
                    <span className="tnum w-16 shrink-0 text-right font-mono text-ink-100">{metric === "cpr" ? fmt("cpr", v) : pct(part ?? 0)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      {data && data.errors.length > 0 && (
        <p className="flex items-start gap-2 text-[12px] text-ink-300">
          <Icon name="alert" size={14} className="mt-px shrink-0 text-amarelo-fg" />
          {data.errors.map((e) => `${e.account}: ${e.error}`).join(" · ")}
        </p>
      )}
    </section>
  );
}

function GenderBar({ women, men, metric }: { women: DemoAgg; men: DemoAgg; metric: "results" | "spend" }) {
  const w = valueOf(metric, women) ?? 0;
  const m = valueOf(metric, men) ?? 0;
  const t = w + m;
  const pw = t > 0 ? w / t : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between text-[12px]">
        <span className="flex items-center gap-1.5 text-ink-300">
          <span className="h-2 w-2 rounded-sm bg-ink-100" />
          Mulheres <span className="tnum font-mono text-ink-100">{t ? pct(pw) : "—"}</span>
        </span>
        <span className="flex items-center gap-1.5 text-ink-300">
          Homens <span className="tnum font-mono text-ink-100">{t ? pct(1 - pw) : "—"}</span>
          <span className="h-2 w-2 rounded-sm bg-ink-500" />
        </span>
      </span>
      <span className="flex h-2 overflow-hidden rounded-full bg-ink-850">
        {t > 0 && (
          <>
            <span className="bg-ink-100" style={{ width: `${pw * 100}%` }} />
            <span className="flex-1 bg-ink-500" />
          </>
        )}
      </span>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-hair)] bg-ink-900 px-2.5 text-[12px]">
      <span className="text-ink-400">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent font-medium text-ink-100 outline-none">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
