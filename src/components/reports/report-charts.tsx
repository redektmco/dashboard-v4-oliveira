import { formatValue } from "@/lib/reports/metrics";
import type { NumberFormat } from "@/lib/reports/types";

/**
 * Gráficos dos blocos, em SVG puro: o tamanho vem do retângulo do bloco na
 * página (px fixos), então o servidor, a tela, o slide e o PDF desenham igual.
 * Marcas finas, ponta arredondada só no topo da barra, grade recessiva; o
 * texto usa a tinta do tema, nunca a cor da série. Passar o mouse mostra o
 * valor (`<title>`), o que vale também no link público.
 */

export type Point = { label: string; value: number | null };
type Size = { width: number; height: number };

/** Meta e Google: as duas primeiras cores categóricas da paleta validada (azul, laranja). */
export const CHANNEL_COLOR = { meta: "var(--rp-series-1)", google: "var(--rp-series-2)" };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** Topo arredondado (4px), base reta no eixo. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** Rótulos do eixo X: no máximo ~8, para não encavalar em períodos longos. */
const labelEvery = (n: number) => Math.max(1, Math.ceil(n / 8));

export function BarChart({ points, format, size, colors }: { points: Point[]; format: NumberFormat; size: Size; colors?: string[] }) {
  const { width, height } = size;
  if (!points.length) return <NoData size={size} />;
  const padL = 4;
  const padB = 22;
  const padT = 20;
  const plotH = Math.max(10, height - padB - padT);
  const max = niceMax(Math.max(0, ...points.map((p) => p.value ?? 0)));
  const slot = (width - padL) / points.length;
  const bw = Math.max(4, Math.min(56, slot * 0.62));
  const every = labelEvery(points.length);
  // Valor em cima de cada barra só quando cabe — senão fica no hover.
  const showValues = points.length <= 8 && slot > 38;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" className="block">
      {[0.5, 1].map((t) => (
        <line key={t} x1={0} x2={width} y1={padT + plotH * (1 - t)} y2={padT + plotH * (1 - t)} stroke="var(--rp-grid)" strokeWidth={1} />
      ))}
      <line x1={0} x2={width} y1={padT + plotH} y2={padT + plotH} stroke="var(--rp-axis)" strokeWidth={1} />
      {points.map((p, i) => {
        const v = p.value ?? 0;
        const h = (v / max) * plotH;
        const x = padL + slot * i + (slot - bw) / 2;
        const y = padT + plotH - h;
        return (
          <g key={i}>
            <rect x={padL + slot * i} y={padT} width={slot} height={plotH} fill="transparent">
              <title>{`${p.label}: ${formatValue(p.value, format)}`}</title>
            </rect>
            {h > 0 && (
              <path d={barPath(x, y, bw, h)} fill={colors?.[i % colors.length] ?? "var(--rp-accent)"} pointerEvents="none" />
            )}
            {showValues && (
              <text x={x + bw / 2} y={y - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--rp-fg)">
                {formatValue(p.value, format, { compact: true })}
              </text>
            )}
            {i % every === 0 && (
              <text x={x + bw / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--rp-muted)">
                {p.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function LineChart({ points, format, size }: { points: Point[]; format: NumberFormat; size: Size }) {
  const { width, height } = size;
  if (!points.length) return <NoData size={size} />;
  const padX = 10;
  const padB = 22;
  const padT = 22;
  const plotH = Math.max(10, height - padB - padT);
  const max = niceMax(Math.max(0, ...points.map((p) => p.value ?? 0)));
  const step = points.length > 1 ? (width - padX * 2) / (points.length - 1) : 0;
  const xy = points.map((p, i) => ({
    x: points.length > 1 ? padX + step * i : width / 2,
    y: padT + plotH - ((p.value ?? 0) / max) * plotH,
    p,
  }));
  const line = xy.map((q, i) => `${i ? "L" : "M"}${q.x},${q.y}`).join("");
  const area = `${line}L${xy[xy.length - 1].x},${padT + plotH}L${xy[0].x},${padT + plotH}Z`;
  const every = labelEvery(points.length);
  // Rótulo direto só no último ponto e no maior: o resto vai pelo hover.
  const peak = xy.reduce((a, b) => ((b.p.value ?? 0) > (a.p.value ?? 0) ? b : a), xy[0]);
  const last = xy[xy.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" className="block">
      {[0.5, 1].map((t) => (
        <line key={t} x1={0} x2={width} y1={padT + plotH * (1 - t)} y2={padT + plotH * (1 - t)} stroke="var(--rp-grid)" strokeWidth={1} />
      ))}
      <line x1={0} x2={width} y1={padT + plotH} y2={padT + plotH} stroke="var(--rp-axis)" strokeWidth={1} />
      <path d={area} fill="var(--rp-accent)" opacity={0.12} />
      <path d={line} fill="none" stroke="var(--rp-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {xy.map((q, i) => (
        <g key={i}>
          <circle cx={q.x} cy={q.y} r={4} fill="var(--rp-accent)" stroke="var(--rp-surface)" strokeWidth={2} />
          <circle cx={q.x} cy={q.y} r={Math.max(10, step / 2)} fill="transparent">
            <title>{`${q.p.label}: ${formatValue(q.p.value, format)}`}</title>
          </circle>
          {i % every === 0 && (
            <text x={q.x} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--rp-muted)">
              {q.p.label}
            </text>
          )}
        </g>
      ))}
      {[...new Set([peak, last])].map((q, i) => (
        <text
          key={i}
          x={Math.min(width - 4, Math.max(4, q.x))}
          y={q.y - 10}
          textAnchor={q.x > width - 40 ? "end" : q.x < 40 ? "start" : "middle"}
          fontSize={11}
          fontWeight={600}
          fill="var(--rp-fg)"
        >
          {formatValue(q.p.value, format, { compact: true })}
        </text>
      ))}
    </svg>
  );
}

/** Rosca com legenda ao lado (rótulo + valor + %): identidade nunca só pela cor. */
export function DonutChart({ points, format, size, colors }: { points: Point[]; format: NumberFormat; size: Size; colors: string[] }) {
  const { width, height } = size;
  const total = points.reduce((a, p) => a + Math.max(0, p.value ?? 0), 0);
  if (!points.length || total <= 0) return <NoData size={size} />;
  const side = width > height * 1.5;
  const d = Math.max(40, Math.min(side ? height : height - 22 * points.length - 8, side ? width * 0.5 : width));
  const r = d / 2;
  const stroke = Math.max(10, r * 0.32);
  const rr = r - stroke / 2;
  const circ = 2 * Math.PI * rr;
  const legend = points.map((p, i) => ({ ...p, color: colors[i % colors.length], pct: (Math.max(0, p.value ?? 0) / total) * 100 }));
  // Onde cada fatia começa: soma das anteriores.
  const starts = legend.map((_, i) => legend.slice(0, i).reduce((a, p) => a + (p.pct / 100) * circ, 0));

  return (
    <div className={`flex h-full w-full items-center gap-4 ${side ? "flex-row" : "flex-col justify-center"}`}>
      <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`} className="shrink-0" role="img">
        <g transform={`rotate(-90 ${r} ${r})`}>
          {legend.map((p, i) => {
            const len = (p.pct / 100) * circ;
            // 2px de respiro entre as fatias.
            const dash = `${Math.max(0, len - 2)} ${circ}`;
            const off = -starts[i];
            return (
              <circle key={i} cx={r} cy={r} r={rr} fill="none" stroke={p.color} strokeWidth={stroke} strokeDasharray={dash} strokeDashoffset={off}>
                <title>{`${p.label}: ${formatValue(p.value, format)} (${p.pct.toFixed(0)}%)`}</title>
              </circle>
            );
          })}
        </g>
      </svg>
      <ul className="min-w-0 space-y-1.5">
        {legend.map((p, i) => (
          <li key={i} className="flex items-center gap-2 text-[12px] leading-tight">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
            <span className="min-w-0 truncate" style={{ color: "var(--rp-muted)" }}>
              {p.label}
            </span>
            <span className="tnum ml-auto pl-2 font-semibold" style={{ color: "var(--rp-fg)" }}>
              {formatValue(p.value, format, { compact: true })} · {p.pct.toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NoData({ size, children }: { size?: Size; children?: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-center text-center text-[12px]"
      style={{ width: size?.width ?? "100%", height: size?.height ?? "100%", color: "var(--rp-muted)" }}
    >
      {children ?? "Sem dados no período"}
    </div>
  );
}
