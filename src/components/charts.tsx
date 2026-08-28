import type { Band, DimensionResult, FieldResult } from "@/lib/model/types";
import { BAND_STYLE, bandFg } from "./ui";

/**
 * Gráficos da análise do cliente.
 *
 * Regra que atravessa o arquivo: o verde/amarelo/vermelho da marca NÃO é
 * separável por quem tem daltonismo (verde↔amarelo ΔE 4.3 em protanopia).
 * Os hexadecimais são da marca e não mudam — então nada aqui é identificado
 * só pela cor: toda barra, célula e faixa carrega o número e/ou o rótulo em
 * texto ao lado. Cor é reforço, nunca o único canal.
 */

export const bandOf = (v: number): Band => (v >= 75 ? "verde" : v >= 55 ? "amarelo" : "vermelho");

const bandVar = (b: Band | null) =>
  b === "verde"
    ? "var(--color-verde)"
    : b === "amarelo"
      ? "var(--color-amarelo)"
      : b === "vermelho"
        ? "var(--color-vermelho)"
        : "var(--color-ink-600)";

/* ------------------------------------------------------------------ */
/* Trilho horizontal com as réguas 55 e 75 marcadas                    */
/* ------------------------------------------------------------------ */

/**
 * Barra 0–100 com as duas linhas de corte do modelo desenhadas no trilho.
 * Ver a régua junto do valor é o que transforma "72" em "faltam 3 pro verde".
 */
export function TrackBar({
  value,
  height = 10,
  thresholds = true,
}: {
  value: number | null;
  height?: number;
  thresholds?: boolean;
}) {
  const b = value === null ? null : bandOf(value);
  return (
    <div
      className="relative w-full overflow-hidden rounded-full bg-ink-850"
      style={{ height }}
      role="img"
      aria-label={value === null ? "sem dado" : `${Math.round(value)} de 100`}
    >
      {value !== null && (
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out)]"
          style={{ width: `${Math.max(value, 1.5)}%`, background: bandVar(b) }}
        />
      )}
      {thresholds &&
        [55, 75].map((t) => (
          <span
            key={t}
            className="absolute top-0 h-full w-px bg-ink-950/70"
            style={{ left: `${t}%` }}
          />
        ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panorama: as cinco dimensões lado a lado                            */
/* ------------------------------------------------------------------ */

/**
 * Comparação de magnitude entre dimensões → barras horizontais, uma escala
 * só (0–100). Cada barra é rotulada direto com o número e a banda em texto;
 * não há legenda porque não há séries a distinguir.
 */
export function DimensionBars({ dimensions }: { dimensions: DimensionResult[] }) {
  return (
    <div className="space-y-3 px-5 py-5">
      <div className="flex items-center justify-between text-[11px] text-ink-600">
        <span>0</span>
        <span className="text-amarelo-fg">55 · piso do amarelo</span>
        <span className="text-verde-fg">75 · piso do verde</span>
        <span>100</span>
      </div>
      {dimensions.map((d) => {
        const b = d.score === null ? null : bandOf(d.score);
        return (
          <div key={d.key} className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[13px] font-semibold text-ink-100">{d.label}</span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="text-[11px] text-ink-500">peso {d.effectiveWeight}%</span>
                <span className={`tnum font-display text-[15px] font-bold ${bandFg(b)}`}>
                  {d.score === null ? "—" : Math.round(d.score)}
                </span>
                <span className={`w-[52px] text-right text-[10px] font-semibold ${bandFg(b)}`}>
                  {b ? BAND_STYLE[b].label : "sem dado"}
                </span>
              </span>
            </div>
            <TrackBar value={d.score} />
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Onde o score se perde                                               */
/* ------------------------------------------------------------------ */

/**
 * Cada dimensão devolve `peso × (100 − nota)` pontos ao score cheio. A soma
 * das perdas é exatamente `100 − score`, então a barra empilhada fecha a
 * conta sozinha — é a leitura de "aja na causa" em uma linha.
 */
export function LossBreakdown({
  dimensions,
  score,
}: {
  dimensions: DimensionResult[];
  score: number | null;
}) {
  const losses = dimensions
    .filter((d) => d.score !== null)
    .map((d) => ({
      key: d.key,
      label: d.label,
      lost: (d.effectiveWeight / 100) * (100 - d.score!),
      score: d.score!,
    }))
    .sort((a, b) => b.lost - a.lost);

  const totalLost = losses.reduce((a, l) => a + l.lost, 0);
  if (!losses.length || totalLost < 0.05)
    return (
      <div className="px-5 py-8 text-center text-sm text-ink-400">
        Nada a recuperar: todas as dimensões com dado estão em 100.
      </div>
    );

  return (
    <div className="space-y-4 px-5 py-5">
      <div className="flex items-baseline gap-2">
        <span className="tnum font-display text-[30px] font-bold leading-none text-vermelho-fg">
          −{totalLost.toFixed(1).replace(".", ",")}
        </span>
        <span className="text-[13px] text-ink-400">
          pontos abaixo de 100 {score !== null && `· score em ${Math.round(score)}`}
        </span>
      </div>

      {/* Composição da perda: um segmento por dimensão, 2px de respiro
          entre eles para que a divisa não dependa da cor. */}
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-ink-850">
        {losses.map((l) => (
          <span
            key={l.key}
            title={`${l.label}: −${l.lost.toFixed(1)} pts`}
            style={{
              width: `${(l.lost / Math.max(totalLost, 0.01)) * 100}%`,
              background: bandVar(bandOf(l.score)),
              opacity: 0.55 + 0.45 * (l.lost / Math.max(losses[0].lost, 0.01)),
            }}
          />
        ))}
      </div>

      <ul className="space-y-2">
        {losses.map((l) => (
          <li key={l.key} className="grid grid-cols-[1fr_auto] items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: bandVar(bandOf(l.score)) }}
                aria-hidden
              />
              <span className="truncate text-[13px] text-ink-200">{l.label}</span>
              <span className="shrink-0 text-[11px] text-ink-600">nota {Math.round(l.score)}</span>
            </div>
            <span className="tnum font-mono text-[12px] font-bold text-ink-300">
              −{l.lost.toFixed(1).replace(".", ",")} pts
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Campos de uma dimensão                                              */
/* ------------------------------------------------------------------ */

/** Barras dos campos dentro de um bloco: mesma escala 0–100, valor cru ao lado. */
export function FieldBars({ fields }: { fields: FieldResult[] }) {
  const present = fields.filter((f) => f.score !== null);
  const absent = fields.filter((f) => f.score === null);
  return (
    <div className="space-y-3 px-5 py-4">
      {present.map((f) => {
        const b = bandOf(f.score!);
        return (
          <div key={f.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[12px] text-ink-200" title={f.label}>
                {f.label}
              </span>
              <span className="flex shrink-0 items-baseline gap-2 text-[11px]">
                <span className="tnum text-ink-500">{f.raw}</span>
                <span className="text-ink-600">{f.effectiveWeight}%</span>
                <span className={`tnum w-7 text-right font-mono font-bold ${bandFg(b)}`}>
                  {Math.round(f.score!)}
                </span>
              </span>
            </div>
            <TrackBar value={f.score} height={6} thresholds={false} />
          </div>
        );
      })}
      {absent.map((f) => (
        <div key={f.key} className="flex items-baseline justify-between gap-3 text-[12px]">
          <span className="truncate text-ink-500">{f.label}</span>
          <span className="shrink-0 text-[11px] text-ink-600">
            fora do cálculo{f.note ? ` · ${f.note}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mapa dos check-ins                                                  */
/* ------------------------------------------------------------------ */

const NOTE_BG: Record<number, string> = {
  5: "var(--color-verde)",
  4: "rgba(82,204,90,0.55)",
  3: "var(--color-ink-700)",
  2: "rgba(229,9,20,0.55)",
  1: "var(--color-vermelho)",
};

/**
 * Pergunta × data. Cada célula mostra a nota escrita — a cor é redundante
 * de propósito, para o mapa continuar legível em daltonismo e impressão.
 */
export function CheckinHeatmap({
  rows,
  snapshots,
}: {
  rows: { key: string; short: string; label: string }[];
  snapshots: { id: number; ref_date: string; data: Record<string, unknown> }[];
}) {
  const cols = [...snapshots].reverse(); // mais antigo → mais recente
  if (!cols.length)
    return <div className="px-5 py-8 text-center text-sm text-ink-400">Relação sem leitura.</div>;

  return (
    <div className="overflow-x-auto px-5 py-5">
      <div
        className="grid min-w-fit gap-1"
        style={{ gridTemplateColumns: `minmax(150px, max-content) repeat(${cols.length}, 40px)` }}
      >
        <span />
        {cols.map((c) => (
          <span key={c.id} className="tnum text-center text-[10px] text-ink-500">
            {c.ref_date.slice(8, 10)}/{c.ref_date.slice(5, 7)}
          </span>
        ))}

        {rows.map((r) => (
          <div key={r.key} className="contents">
            <span className="truncate pr-2 text-[12px] text-ink-300" title={r.label}>
              {r.short}
            </span>
            {cols.map((c) => {
              const n = Number(c.data[r.key]) || 0;
              return (
                <span
                  key={c.id}
                  title={`${r.label} — ${c.ref_date}: ${n || "sem nota"}`}
                  className="tnum flex h-8 items-center justify-center rounded-md font-mono text-[12px] font-bold text-ink-100"
                  style={{ background: NOTE_BG[n] ?? "var(--color-ink-850)" }}
                >
                  {n || "—"}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-ink-600">
        Notas de 1 a 5 respondidas pelo cliente na call. 1–2 puxam o score para baixo, 3 é neutro,
        4–5 sustentam.
      </p>
    </div>
  );
}
