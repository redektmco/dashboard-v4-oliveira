"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Band } from "@/lib/model/types";
import { Icon, type IconName } from "../icon";
import { SectionHead, Segmented } from "../kit";

export type ChartEvent = { day: string; kind: "checkin" | "meta" | "queda" | "plano"; title: string; detail: string };

type Period = "7" | "30" | "90" | "365";
const PERIODS: { value: Period; label: string }[] = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "12 meses" },
];

const EVENT: Record<ChartEvent["kind"], { icon: IconName; cls: string; legend: string; short: string }> = {
  checkin: { icon: "message", cls: "text-ink-300", legend: "Check-in", short: "Check-in" },
  meta: { icon: "target", cls: "text-amarelo-fg", legend: "Alteração de forecast", short: "Forecast alterado" },
  queda: { icon: "trendingDown", cls: "text-vermelho-fg", legend: "Queda de performance", short: "Queda de performance" },
  plano: { icon: "listTodo", cls: "text-verde-fg", legend: "Plano de ação criado", short: "Plano criado" },
};
const PRIORITY: ChartEvent["kind"][] = ["queda", "meta", "plano", "checkin"];

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const fmt1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * "Evolução da conta": Health Score diário, as linhas das faixas e os
 * eventos que mexeram na conta (check-in, meta, queda, plano). Desenhado em
 * pixels reais (mede a largura do cartão) para o texto não escalar.
 */
export function EvolutionSection({
  points,
  events,
  greenFloor,
  yellowFloor,
  band,
  at,
  compact = false,
}: {
  points: { day: string; score: number | null }[];
  events: ChartEvent[];
  greenFloor: number;
  yellowFloor: number;
  band: Band | null;
  at: string;
  compact?: boolean;
}) {
  const [period, setPeriod] = useState<Period>("30");
  const from = addDays(at, -Number(period) + 1);
  const data = useMemo(
    () => points.filter((p): p is { day: string; score: number } => p.score !== null && p.day >= from && p.day <= at),
    [points, from, at],
  );
  const evs = useMemo(() => events.filter((e) => e.day >= from && e.day <= at), [events, from, at]);

  const legendKinds = Object.keys(EVENT) as ChartEvent["kind"][];

  return (
    <section className="flex flex-col gap-4">
      {compact ? (
        <>
          <h2 className="pt-2 font-display text-[16px] font-semibold tracking-[-0.2px] text-ink-100">Evolução da conta</h2>
          <Segmented value={period} options={PERIODS} onChange={setPeriod} full />
        </>
      ) : (
        <SectionHead
          title="Evolução da conta"
          subtitle="Health Score diário e eventos que impactaram a conta."
          action={<Segmented value={period} options={PERIODS} onChange={setPeriod} />}
        />
      )}
      <div className={`rounded-xl border border-[var(--border-hair)] bg-ink-900 ${compact ? "p-4" : "p-5"}`}>
        {data.length < 2 ? (
          <p className="py-12 text-center text-[13px] text-ink-400">Série curta demais neste período — o recompute diário vai construir a curva.</p>
        ) : (
          <Plot data={data} events={evs} greenFloor={greenFloor} yellowFloor={yellowFloor} band={band} compact={compact} period={period} />
        )}
        <div className={`mt-4 border-t border-[var(--border-hair)] pt-3 ${compact ? "grid grid-cols-2 gap-2" : "flex flex-wrap items-center gap-x-5 gap-y-2"}`}>
          {!compact && (
            <>
              <LegendLine cls="bg-ink-200" label="Health Score" />
              <LegendLine cls="bg-verde/60" label={`Saudável ≥ ${greenFloor}`} />
              <LegendLine cls="bg-vermelho/60" label={`Crítico < ${yellowFloor}`} />
              <span className="h-3.5 w-px bg-ink-700" aria-hidden />
            </>
          )}
          {legendKinds.map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-[12px] text-ink-300">
              <Icon name={EVENT[k].icon} size={compact ? 12 : 13} className={EVENT[k].cls} />
              {compact ? EVENT[k].short : EVENT[k].legend}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function LegendLine({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-ink-300">
      <span className={`h-0.5 w-3.5 ${cls}`} aria-hidden />
      {label}
    </span>
  );
}

function Plot({
  data,
  events,
  greenFloor,
  yellowFloor,
  band,
  compact,
  period,
}: {
  data: { day: string; score: number }[];
  events: ChartEvent[];
  greenFloor: number;
  yellowFloor: number;
  band: Band | null;
  compact: boolean;
  period: Period;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(compact ? 324 : 1088);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = compact ? 180 : 236;
  const pad = compact ? { l: 24, r: 8, t: 30, b: 30 } : { l: 36, r: 12, t: 36, b: 36 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  const scores = data.map((d) => d.score);
  let lo = Math.floor((Math.min(...scores, yellowFloor) - 5) / 10) * 10;
  let hi = Math.ceil((Math.max(...scores, greenFloor) + 5) / 10) * 10;
  lo = Math.max(0, lo);
  hi = Math.min(100, Math.max(hi, lo + 20));
  const step = compact ? Math.max(10, Math.ceil((hi - lo) / 2 / 10) * 10) : 10;
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);

  const y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo)) * ih;
  const first = data[0].day;
  const last = data[data.length - 1].day;
  const span = Math.max(1, (Date.parse(last) - Date.parse(first)) / 86_400_000);
  const xDay = (d: string) => pad.l + ((Date.parse(d) - Date.parse(first)) / 86_400_000 / span) * iw;

  const line = data.map((d, i) => `${i ? "L" : "M"}${xDay(d.day).toFixed(1)},${y(d.score).toFixed(1)}`).join(" ");

  // Eventos por dia: uma etiqueta por dia, com o ícone mais importante.
  const byDay = new Map<string, ChartEvent[]>();
  for (const e of events) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  const tags = [...byDay.entries()].map(([day, list]) => ({
    day,
    list: [...list].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind)),
  }));

  const nTicks = compact ? 3 : 7;
  const xTicks = Array.from({ length: nTicks }, (_, i) => data[Math.round((i * (data.length - 1)) / (nTicks - 1))]);
  const xLabel = (d: string) => (period === "365" ? `${MONTHS[Number(d.slice(5, 7)) - 1]}/${d.slice(2, 4)}` : ddmm(d));

  const cur = data[data.length - 1];
  const curColor = band === "vermelho" ? "var(--color-vermelho)" : band === "amarelo" ? "var(--color-amarelo)" : "var(--color-verde)";

  const onMove = (e: React.MouseEvent) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    const px = e.clientX - box.left;
    let best = 0;
    let dist = Infinity;
    data.forEach((d, i) => {
      const dd = Math.abs(xDay(d.day) - px);
      if (dd < dist) {
        dist = dd;
        best = i;
      }
    });
    setHover(best);
  };

  const h = hover === null ? null : data[hover];
  const hEvents = h ? (byDay.get(h.day) ?? []) : [];
  const hx = h ? xDay(h.day) : 0;
  const tipW = 200;
  const tipLeft = Math.min(Math.max(hx - tipW - 12 > pad.l ? hx - tipW - 12 : hx + 12, 0), W - tipW);
  const tag = compact ? 20 : 22;

  return (
    <div ref={wrap} className="relative select-none" style={{ height: H }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg width={W} height={H} className="block" role="img" aria-label="Evolução do Health Score">
        {ticks.map((v, i) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={i === 0 ? "var(--color-ink-700)" : "var(--border-hair)"} />
            <text x={pad.l - (compact ? 6 : 10)} y={y(v) + 3.5} textAnchor="end" fill="var(--color-ink-400)" fontSize={compact ? 10 : 11}>
              {v}
            </text>
          </g>
        ))}
        {[
          { v: greenFloor, c: "var(--color-verde)" },
          { v: yellowFloor, c: "var(--color-vermelho)" },
        ]
          .filter((l) => l.v > lo && l.v < hi)
          .map((l) => (
            <line key={l.v} x1={pad.l} x2={W - pad.r} y1={y(l.v)} y2={y(l.v)} stroke={l.c} strokeOpacity={0.55} strokeDasharray="4 4" />
          ))}
        {tags.map((t) => (
          <line
            key={t.day}
            x1={xDay(t.day)}
            x2={xDay(t.day)}
            y1={(compact ? 2 : 4) + tag + 4}
            y2={pad.t + ih}
            stroke="var(--color-ink-600)"
            strokeDasharray="3 3"
          />
        ))}
        <path d={line} fill="none" stroke="var(--color-ink-200)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        {h && hover !== data.length - 1 && <circle cx={hx} cy={y(h.score)} r={4} fill="var(--color-ink-900)" stroke={curColor} strokeWidth={2} />}
        <circle cx={xDay(cur.day)} cy={y(cur.score)} r={9} fill={curColor} opacity={0.2} />
        <circle cx={xDay(cur.day)} cy={y(cur.score)} r={4} fill={curColor} />
        {xTicks.map((d, i) => (
          <text
            key={`${d.day}-${i}`}
            x={xDay(d.day)}
            y={H - (compact ? 8 : 12)}
            textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
            fill="var(--color-ink-400)"
            fontSize={compact ? 10 : 11}
          >
            {xLabel(d.day)}
          </text>
        ))}
      </svg>

      {tags.map((t) => {
        const e = EVENT[t.list[0].kind];
        return (
          <span
            key={t.day}
            className="absolute flex items-center justify-center rounded-md border border-[var(--border-strong)] bg-ink-850"
            style={{ width: tag, height: tag, left: xDay(t.day) - tag / 2, top: compact ? 2 : 4 }}
            title={t.list.map((x) => x.title).join(" · ")}
          >
            <Icon name={e.icon} size={compact ? 11 : 12} className={e.cls} />
          </span>
        );
      })}

      {h && (
        <div
          className="pointer-events-none absolute z-10 flex flex-col gap-1.5 rounded-lg border border-[var(--border-strong)] bg-ink-850 p-3 shadow-[var(--shadow-2)]"
          style={{ left: tipLeft, top: compact ? 26 : 34, width: tipW }}
        >
          <div className="flex justify-between text-[12px]">
            <span className="text-ink-400">{ddmm(h.day)}</span>
            <span className="tnum font-semibold text-ink-100">{fmt1(h.score)}</span>
          </div>
          {hEvents.map((e, i) => (
            <div key={i} className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-ink-100">
                <Icon name={EVENT[e.kind].icon} size={13} className={EVENT[e.kind].cls} />
                {e.title}
              </span>
              {e.detail && <span className="text-[12px] text-ink-300">{e.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
