/** Curva do score com as faixas das bandas ao fundo (briefing 6). */
export function ScoreChart({
  points,
  height = 180,
}: {
  points: { day: string; score: number | null }[];
  height?: number;
}) {
  const data = points.filter((p) => p.score !== null) as { day: string; score: number }[];
  if (data.length < 2)
    return (
      <div className="px-4 py-10 text-center text-sm text-ink-400">
        Série curta demais — o recompute diário vai construir a curva.
      </div>
    );

  const W = 900;
  const H = height;
  const pad = { l: 30, r: 10, t: 8, b: 20 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const y = (v: number) => pad.t + ih - (v / 100) * ih;
  const x = (i: number) => pad.l + (i / (data.length - 1)) * iw;

  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.score).toFixed(1)}`).join(" ");
  const area = `${line} L${x(data.length - 1).toFixed(1)},${(pad.t + ih).toFixed(1)} L${pad.l},${(pad.t + ih).toFixed(1)} Z`;
  const last = data[data.length - 1];
  const stroke =
    last.score >= 75 ? "var(--color-verde)" : last.score >= 55 ? "var(--color-amarelo)" : "var(--color-vermelho)";

  const ticks = data.filter((_, i) => i % Math.ceil(data.length / 7) === 0);

  return (
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
    </svg>
  );
}
