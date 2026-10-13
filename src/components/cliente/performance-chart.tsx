"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Channel } from "@/lib/performance/model";

/**
 * Investimento diário, Meta e Google empilhados. Desenhado em pixels reais
 * (mede a largura do cartão) para o texto não escalar. Cores validadas para
 * daltonismo contra o fundo escuro (azul mais escuro, roxo mais claro: os
 * tons do design falhavam na separação protan).
 */
export const CHANNEL_COLOR: Record<Channel, string> = { meta: "#3366dd", google: "#a07ae6" };

type Day = { day: string; meta: number; google: number; results: number };

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const dayLabel = (d: string) => `${d.slice(8, 10)} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const money2 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Teto "redondo" do eixo e 4 marcas. */
function niceMax(v: number) {
  if (v <= 0) return 100;
  const step = 10 ** Math.floor(Math.log10(v / 3));
  const n = Math.ceil(v / 3 / step);
  const nice = [1, 2, 2.5, 4, 5, 10].find((m) => m >= n) ?? 10;
  return nice * step * 3;
}

export function DailySpendChart({
  days,
  channels,
  resultLabel,
}: {
  days: Day[];
  channels: Channel[];
  resultLabel: string | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 300;
  const pad = { l: 56, r: 8, t: 12, b: 28 };
  const plotW = width - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  const totals = days.map((d) => channels.reduce((a, c) => a + d[c], 0));
  const max = niceMax(Math.max(0, ...totals));
  const ticks = [0, 1, 2, 3].map((i) => (max / 3) * i);
  const slot = plotW / Math.max(days.length, 1);
  const barW = Math.max(2, Math.min(28, slot - (days.length > 60 ? 1 : 4)));
  const y = (v: number) => pad.t + plotH - (v / max) * plotH;

  // Rótulos do eixo X: ~5, sempre o primeiro e o último.
  const labelIdx = useMemo(() => {
    const n = days.length;
    if (n <= 1) return new Set([0]);
    const step = Math.max(1, Math.round((n - 1) / 4));
    const s = new Set<number>();
    let last = 0;
    for (let i = 0; i < n; i += step) s.add((last = i));
    // O último dia sempre aparece; o rótulo anterior sai se ficar colado nele.
    if (last !== n - 1 && n - 1 - last < step / 2) s.delete(last);
    s.add(n - 1);
    return s;
  }, [days.length]);

  const h = hover !== null ? days[hover] : null;

  return (
    <div ref={wrap} className="relative w-full" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={H} role="img" aria-label="Investimento diário por canal" className="block">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" />
            <text x={0} y={y(t) + 4} className="fill-ink-500 font-mono text-[11px]">
              {t === 0 ? "0" : money(t)}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = pad.l + i * slot + (slot - barW) / 2;
          let base = 0;
          const segs = channels
            .map((c) => ({ c, v: d[c] }))
            .filter((s) => s.v > 0)
            .map((s) => {
              const y0 = y(base);
              base += s.v;
              return { ...s, y0, y1: y(base) };
            });
          return (
            <g key={d.day} opacity={hover === null || hover === i ? 1 : 0.55}>
              {segs.map((s, k) => {
                const top = k === segs.length - 1;
                // 2px de fundo entre os segmentos empilhados.
                const y1 = s.y1;
                const hgt = Math.max(0, s.y0 - s.y1 - (k > 0 ? 2 : 0));
                const r = top ? Math.min(4, barW / 2, hgt) : 0;
                return top ? (
                  <path
                    key={s.c}
                    d={`M${x},${y1 + hgt} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + barW - r} Q${x + barW},${y1} ${x + barW},${y1 + r} V${y1 + hgt} Z`}
                    fill={CHANNEL_COLOR[s.c]}
                  />
                ) : (
                  <rect key={s.c} x={x} y={y1} width={barW} height={hgt} fill={CHANNEL_COLOR[s.c]} />
                );
              })}
              {/* Alvo do mouse: a coluna inteira, maior que a barra. */}
              <rect
                x={pad.l + i * slot}
                y={pad.t}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                tabIndex={0}
                aria-label={`${dayLabel(d.day)}: ${money2(totals[i])}`}
              />
            </g>
          );
        })}
        {days.map((d, i) =>
          labelIdx.has(i) ? (
            <text
              key={d.day}
              x={Math.min(Math.max(pad.l + i * slot + slot / 2, pad.l + 14), width - pad.r - 14)}
              y={H - 8}
              textAnchor="middle"
              className="fill-ink-500 font-mono text-[11px]"
            >
              {dayLabel(d.day)}
            </text>
          ) : null,
        )}
      </svg>

      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 flex min-w-[170px] flex-col gap-1.5 rounded-lg border border-[var(--border-strong)] bg-ink-800 px-3 py-2.5 shadow-[var(--shadow-2)]"
          style={{
            left: Math.min(Math.max(pad.l + hover * slot + slot / 2 - 85, 0), width - 180),
          }}
        >
          <span className="text-[11px] font-medium text-ink-400">{dayLabel(h.day)}</span>
          {channels.map((c) => (
            <span key={c} className="flex items-center justify-between gap-4 text-[12px]">
              <span className="flex items-center gap-1.5 text-ink-300">
                <span className="h-2 w-2 rounded-sm" style={{ background: CHANNEL_COLOR[c] }} />
                {c === "meta" ? "Meta Ads" : "Google Ads"}
              </span>
              <span className="font-mono font-semibold text-ink-100">{money2(h[c])}</span>
            </span>
          ))}
          {channels.length > 1 && (
            <span className="flex items-center justify-between gap-4 border-t border-[var(--border-hair)] pt-1.5 text-[12px]">
              <span className="text-ink-400">Total</span>
              <span className="font-mono font-semibold text-ink-100">{money2(totals[hover])}</span>
            </span>
          )}
          {resultLabel && (
            <span className="flex items-center justify-between gap-4 text-[12px]">
              <span className="text-ink-400">{resultLabel}</span>
              <span className="font-mono text-ink-100">{h.results.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
