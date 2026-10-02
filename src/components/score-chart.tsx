"use client";

import { useRef, useState } from "react";

/**
 * Curva do score com as faixas das bandas ao fundo (briefing 6).
 *
 * Tem camada de hover: crosshair + tooltip com data e nota. Um gráfico em
 * SVG na tela é interativo por natureza — deixar o leitor sem conseguir ler
 * um ponto específico é jogar fora informação que já está desenhada.
 */
export function ScoreChart({
  points,
  height = 200,
}: {
  points: { day: string; score: number | null }[];
  height?: number;
}) {
  const data = points.filter((p) => p.score !== null) as { day: string; score: number }[];
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  if (data.length < 2)
    return (
      <div className="px-4 py-10 text-center text-sm text-ink-400">
        Série curta demais — o recompute diário vai construir a curva.
      </div>
    );

  const W = 900;
  const H = height;
  const pad = { l: 30, r: 12, t: 10, b: 22 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const y = (v: number) => pad.t + ih - (v / 100) * ih;
  const x = (i: number) => pad.l + (i / (data.length - 1)) * iw;

  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.score).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${pad.l},${(pad.t + ih).toFixed(1)} Z`;
  const last = data[data.length - 1];
  const colorOf = (v: number) =>
    v >= 75 ? "var(--color-verde)" : v >= 55 ? "var(--color-amarelo)" : "var(--color-vermelho)";
  const stroke = colorOf(last.score);

  const ticks = data.filter((_, i) => i % Math.ceil(data.length / 7) === 0);

  // A conversão usa a largura renderizada, não a do viewBox: o SVG escala.
  const onMove = (e: React.MouseEvent) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    const rel = (e.clientX - box.left) / box.width; // 0–1 na largura visível
    const inner = (rel * W - pad.l) / iw;
    const i = Math.round(inner * (data.length - 1));
    setHover(i >= 0 && i < data.length ? i : null);
  };

  const h = hover === null ? null : data[hover];
  const hx = hover === null ? 0 : x(hover);

  return (
    <div
      ref={wrap}
      className="relative"
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Curva do health score">
        {/* faixas das bandas */}
        <rect x={pad.l} y={y(100)} width={iw} height={y(75) - y(100)} fill="var(--color-verde)" opacity={0.07} />
        <rect x={pad.l} y={y(75)} width={iw} height={y(55) - y(75)} fill="var(--color-amarelo)" opacity={0.07} />
        <rect x={pad.l} y={y(55)} width={iw} height={y(0) - y(55)} fill="var(--color-vermelho)" opacity={0.07} />

        {[0, 55, 75, 100].map((v) => (
          <g key={v}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--color-ink-800)"
              strokeDasharray={v === 55 || v === 75 ? "3 3" : undefined}
            />
            <text x={4} y={y(v) + 3.5} fill="var(--color-ink-600)" fontSize={10}>
              {v}
            </text>
          </g>
        ))}

        <path d={area} fill={stroke} opacity={0.1} />
        <path d={line} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(data.length - 1)} cy={y(last.score)} r={3.5} fill={stroke} />

        {ticks.map((t) => {
          const i = data.indexOf(t);
          return (
            <text key={t.day} x={x(i)} y={H - 5} fill="var(--color-ink-600)" fontSize={10} textAnchor="middle">
              {t.day.slice(8, 10)}/{t.day.slice(5, 7)}
            </text>
          );
        })}

        {h && (
          <g pointerEvents="none">
            <line x1={hx} x2={hx} y1={pad.t} y2={pad.t + ih} stroke="var(--color-ink-600)" strokeDasharray="2 3" />
            {/* Anel na cor da superfície: o ponto não some sobre a curva. */}
            <circle cx={hx} cy={y(h.score)} r={5.5} fill="var(--color-ink-900)" />
            <circle cx={hx} cy={y(h.score)} r={4} fill={colorOf(h.score)} />
          </g>
        )}
      </svg>

      {h && (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-md border border-[var(--border-strong)] bg-ink-800 px-2.5 py-1.5 shadow-[var(--shadow-2)]"
          style={{ left: `${(hx / W) * 100}%` }}
        >
          <div className="tnum font-mono text-[10px] text-ink-400">
            {h.day.slice(8, 10)}/{h.day.slice(5, 7)}/{h.day.slice(0, 4)}
          </div>
          <div className="tnum font-display text-[15px] font-bold" style={{ color: colorOf(h.score) }}>
            {Math.round(h.score)}
            <span className="ml-1 font-sans text-[10px] font-semibold text-ink-400">
              {h.score >= 75 ? "saudável" : h.score >= 55 ? "atenção" : "crítico"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
