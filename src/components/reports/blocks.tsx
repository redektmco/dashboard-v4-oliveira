import { blockRect } from "@/lib/reports/layout";
import {
  autoTarget,
  channelSeries,
  deltaPct,
  deltaTone,
  fillVariables,
  formatDelta,
  formatValue,
  METRICS,
  metricOf,
  metricValue,
  parseGrid,
  parsePairs,
  sourceFor,
  totalsOf,
  weeklySeries,
  shortDay,
} from "@/lib/reports/metrics";
import {
  PAGE,
  SOURCE_LABEL,
  type Block,
  type ChartBlock,
  type FunnelBlock,
  type GoalBlock,
  type KpiBlock,
  type Page,
  type ReportData,
  type ReportFormat,
  type ScoreBlock,
  type Surface,
  type TableBlock,
  type Theme,
} from "@/lib/reports/types";
import { BarChart, CHANNEL_COLOR, DonutChart, LineChart, NoData } from "./report-charts";

/**
 * Desenho de uma página do relatório em px fixos da página (794×1123 no A4,
 * 1280×720 no slide). Quem mostra (editor, link, apresentação, PDF) só
 * escala por fora — o conteúdo é sempre o mesmo, pixel a pixel.
 */

export type RenderCtx = { data: ReportData; format: ReportFormat; today: string; theme: Theme };

/** Variáveis de cor do tema, aplicadas na raiz de cada página. */
export function themeVars(theme: Theme): React.CSSProperties {
  const dark = theme.mode === "dark";
  return {
    "--rp-accent": theme.accent,
    "--rp-bg": dark ? "#0d0d0d" : "#ffffff",
    "--rp-surface": dark ? "#0d0d0d" : "#ffffff",
    "--rp-card": dark ? "#1a1a1a" : "#f4f4f5",
    "--rp-fg": dark ? "#ffffff" : "#141414",
    "--rp-muted": dark ? "#9a9a9a" : "#5f5f66",
    "--rp-line": dark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)",
    "--rp-grid": dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
    "--rp-axis": dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.2)",
    "--rp-good": dark ? "#7fdf83" : "#1f8a2c",
    "--rp-bad": dark ? "#ff5560" : "#c40812",
    "--rp-warn": dark ? "#ffd05b" : "#a86b00",
    "--rp-series-1": dark ? "#3987e5" : "#2a78d6",
    "--rp-series-2": dark ? "#d95926" : "#eb6834",
  } as React.CSSProperties;
}

export function PageView({
  page,
  ctx,
  children,
  className = "",
  style,
  ...rest
}: {
  page: Page;
  ctx: RenderCtx;
  children?: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const { w, h } = PAGE[ctx.format];
  return (
    <div
      className={`rp-page ${className}`}
      style={{ ...themeVars(ctx.theme), width: w, height: h, background: page.background || "var(--rp-bg)", ...style }}
      {...rest}
    >
      {children ??
        page.blocks.map((b) => (
          <div key={b.id} className="rp-block" style={blockRect(ctx.format, b)}>
            <BlockView block={b} ctx={ctx} />
          </div>
        ))}
    </div>
  );
}

const resolveColor = (c: string | undefined) => (!c ? undefined : c === "accent" ? "var(--rp-accent)" : c);

function SurfaceBox({ surface, children, pad = true, className = "" }: { surface: Surface; children: React.ReactNode; pad?: boolean; className?: string }) {
  return (
    <div
      className={`rp-surface h-full w-full overflow-hidden ${className}`}
      data-surface={surface}
      style={{ padding: surface === "none" || !pad ? 0 : 16 }}
    >
      {children}
    </div>
  );
}

/** Texto com **negrito** simples — o que dá para escrever sem editor rico. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : p))}
    </>
  );
}

export const HEADING_PX = { xl: 52, lg: 32, md: 24, sm: 18 } as const;
export const TEXT_PX = { sm: 13, md: 16, lg: 20 } as const;

/** Espaço útil dentro do bloco (px), descontado o respiro do cartão. */
function inner(rect: { width: number; height: number }, surface: Surface) {
  const pad = surface === "none" ? 0 : 32;
  return { width: Math.max(10, rect.width - pad), height: Math.max(10, rect.height - pad) };
}

export function BlockView({ block: b, ctx }: { block: Block; ctx: RenderCtx }) {
  const rect = blockRect(ctx.format, b);
  switch (b.type) {
    case "heading":
      return (
        <SurfaceBox surface={b.surface}>
          <div
            className="flex h-full items-center font-display font-bold"
            style={{
              fontSize: HEADING_PX[b.size],
              lineHeight: 1.08,
              letterSpacing: b.size === "xl" ? "-0.02em" : "-0.01em",
              justifyContent: b.align === "center" ? "center" : b.align === "right" ? "flex-end" : "flex-start",
              textAlign: b.align,
              color: resolveColor(b.color) ?? "inherit",
            }}
          >
            <span className="w-full whitespace-pre-wrap">{fillVariables(b.text, ctx.data, ctx.today)}</span>
          </div>
        </SurfaceBox>
      );
    case "text":
      return (
        <SurfaceBox surface={b.surface}>
          <div
            className="whitespace-pre-wrap"
            style={{ fontSize: TEXT_PX[b.size], lineHeight: 1.5, textAlign: b.align, color: resolveColor(b.color) ?? "inherit" }}
          >
            <RichText text={fillVariables(b.text, ctx.data, ctx.today)} />
          </div>
        </SurfaceBox>
      );
    case "kpi":
      return <Kpi b={b} ctx={ctx} rect={rect} />;
    case "chart":
      return <Chart b={b} ctx={ctx} rect={rect} />;
    case "table":
      return <Table b={b} ctx={ctx} rect={rect} />;
    case "funnel":
      return <Funnel b={b} ctx={ctx} rect={rect} />;
    case "goal":
      return <Goal b={b} ctx={ctx} />;
    case "score":
      return <Score b={b} ctx={ctx} rect={rect} />;
    case "image":
      return b.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagem do relatório precisa sair igual no PDF
        <img src={b.url} alt="" className="h-full w-full" style={{ objectFit: b.fit, borderRadius: b.radius }} draggable={false} />
      ) : (
        <div className="rp-placeholder h-full w-full" style={{ borderRadius: b.radius }}>
          Imagem
        </div>
      );
    case "logo":
      return (
        <div className="flex h-full w-full items-center" style={{ justifyContent: b.align === "center" ? "center" : b.align === "right" ? "flex-end" : "flex-start" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- marca no PDF sem otimizador */}
          <img
            src={b.variant === "full" ? "/brand/v4-logo-completa.webp" : "/brand/v4-simbolo.webp"}
            alt="V4 Company"
            className="h-full max-w-full object-contain"
            draggable={false}
          />
        </div>
      );
    case "shape":
      return (
        <div
          className="h-full w-full"
          style={{ background: resolveColor(b.color) ?? "var(--rp-accent)", borderRadius: b.radius, opacity: b.opacity }}
        />
      );
  }
}

/* ------------------------------ números ------------------------------ */

function metricLabel(metric: KpiBlock["metric"], source: KpiBlock["source"]) {
  const def = METRICS[metric];
  const src = sourceFor(metric, source);
  return def.only || src === "all" ? def.label : `${def.label} · ${SOURCE_LABEL[src]}`;
}

function DeltaTag({ delta, lowerIsBetter }: { delta: number | null; lowerIsBetter?: boolean }) {
  const tone = deltaTone(delta, lowerIsBetter);
  const color = tone === "up" ? "var(--rp-good)" : tone === "down" ? "var(--rp-bad)" : "var(--rp-muted)";
  const arrow = delta === null || Math.abs(delta) < 0.5 ? "" : delta > 0 ? "▲ " : "▼ ";
  return (
    <span className="tnum font-semibold" style={{ color }}>
      {arrow}
      {formatDelta(delta)}
    </span>
  );
}

function Kpi({ b, ctx, rect }: { b: KpiBlock; ctx: RenderCtx; rect: { width: number; height: number } }) {
  const manual = b.mode === "manual";
  const def = METRICS[b.metric];
  const cur = manual ? b.manual.value : metricValue(ctx.data, b.metric, b.source);
  const prev = manual ? b.manual.previous : metricValue(ctx.data, b.metric, b.source, "previous");
  const format = manual ? b.manual.format : def.format;
  const text = formatValue(cur, format, { compact: rect.width < 200 });
  const box = inner(rect, b.surface);
  const valuePx = Math.round(Math.max(18, Math.min(box.height * 0.42, (box.width / Math.max(4, text.length)) * 1.65, 54)));
  const label = b.label || (manual ? "Indicador" : metricLabel(b.metric, b.source));

  return (
    <SurfaceBox surface={b.surface}>
      <div className="flex h-full flex-col justify-between gap-1">
        <div className="rp-eyebrow truncate">{label}</div>
        <div className="tnum font-display font-bold leading-none" style={{ fontSize: valuePx, letterSpacing: "-0.02em" }}>
          {text}
        </div>
        {b.showDelta ? (
          <div className="flex min-w-0 items-baseline gap-1.5 text-[12px]">
            <DeltaTag delta={deltaPct(cur, prev)} lowerIsBetter={!manual && def.lowerIsBetter} />
            <span className="truncate" style={{ color: "var(--rp-muted)" }}>
              vs {formatValue(prev, format, { compact: true })} antes
            </span>
          </div>
        ) : (
          <span />
        )}
      </div>
    </SurfaceBox>
  );
}

function BlockTitle({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 truncate font-display text-[14px] font-semibold leading-tight">{children}</div>;
}

function Chart({ b, ctx, rect }: { b: ChartBlock; ctx: RenderCtx; rect: { width: number; height: number } }) {
  const manual = b.mode === "manual";
  const def = METRICS[b.metric];
  const format = manual ? b.manualFormat : def.format;
  const byChannel = !manual && b.by === "channel" && !def.only;
  const points = manual
    ? parsePairs(b.manualText)
    : byChannel
      ? channelSeries(ctx.data, b.metric)
      : weeklySeries(ctx.data, b.metric, b.source);
  const title = b.title || (manual ? "" : `${metricLabel(b.metric, byChannel ? "all" : b.source)}${byChannel ? " por canal" : " por semana"}`);
  const box = inner(rect, b.surface);
  const size = { width: box.width, height: box.height - (title ? 26 : 0) };
  const colors = byChannel ? [CHANNEL_COLOR.meta, CHANNEL_COLOR.google] : undefined;
  const donutColors = colors ?? ["var(--rp-accent)", "var(--rp-series-1)", "var(--rp-series-2)", "var(--rp-muted)"];

  return (
    <SurfaceBox surface={b.surface}>
      {title && <BlockTitle>{title}</BlockTitle>}
      {b.kind === "donut" ? (
        <div style={{ height: size.height }}>
          <DonutChart points={points} format={format} size={size} colors={donutColors} />
        </div>
      ) : b.kind === "line" ? (
        <LineChart points={points} format={format} size={size} />
      ) : (
        <BarChart points={points} format={format} size={size} colors={colors} />
      )}
    </SurfaceBox>
  );
}

function Table({ b, ctx, rect }: { b: TableBlock; ctx: RenderCtx; rect: { width: number; height: number } }) {
  const box = inner(rect, b.surface);
  let head: string[];
  let body: string[][];
  let foot: string[] | null = null;

  if (b.mode === "manual") {
    const grid = parseGrid(b.manualText);
    head = grid[0] ?? [];
    body = grid.slice(1);
  } else {
    const metrics = b.metrics.length ? b.metrics : (["spend", "leads", "cpl"] as const);
    const fmt = (t: ReturnType<typeof totalsOf>, m: (typeof metrics)[number]) => formatValue(metricOf(t, m), METRICS[m].format);
    head = [b.rows === "channel" ? "Canal" : "Semana", ...metrics.map((m) => METRICS[m].label)];
    if (b.rows === "channel") {
      body = (["meta", "google"] as const).map((c) => [SOURCE_LABEL[c], ...metrics.map((m) => fmt(totalsOf(ctx.data.weeks, c), m))]);
      foot = ["Total", ...metrics.map((m) => fmt(totalsOf(ctx.data.weeks, sourceFor(m, "all")), m))];
    } else {
      body = ctx.data.weeks.map((w) => [
        `Sem. ${shortDay(w.ref)}`,
        ...metrics.map((m) => fmt(totalsOf([w], sourceFor(m, b.source)), m)),
      ]);
      foot = ["Total", ...metrics.map((m) => fmt(totalsOf(ctx.data.weeks, sourceFor(m, b.source)), m))];
    }
  }

  const title = b.title || (b.mode === "auto" ? (b.rows === "channel" ? "Resultado por canal" : `Semana a semana · ${SOURCE_LABEL[b.source]}`) : "");
  const rowH = 27;
  const fit = Math.max(0, Math.floor((box.height - (title ? 26 : 0) - rowH * (foot ? 2 : 1)) / rowH));
  const shown = body.length > fit ? body.slice(-fit) : body;

  if (!head.length) return <SurfaceBox surface={b.surface}><NoData /></SurfaceBox>;
  return (
    <SurfaceBox surface={b.surface}>
      {title && <BlockTitle>{title}</BlockTitle>}
      {body.length === 0 && b.mode === "auto" ? (
        <NoData size={{ width: box.width, height: box.height - 26 }} />
      ) : (
        <table className="rp-table w-full">
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i}>
                {head.map((_, j) => (
                  <td key={j}>{r[j] ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {foot && (
            <tfoot>
              <tr>
                {foot.map((c, i) => (
                  <td key={i}>{c}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      )}
      {shown.length < body.length && (
        <div className="mt-1 text-[11px]" style={{ color: "var(--rp-muted)" }}>
          Últimas {shown.length} de {body.length} linhas — aumente o bloco para ver todas.
        </div>
      )}
    </SurfaceBox>
  );
}

function Funnel({ b, ctx, rect }: { b: FunnelBlock; ctx: RenderCtx; rect: { width: number; height: number } }) {
  const steps =
    b.mode === "manual"
      ? parsePairs(b.manualText).map((p) => ({ label: p.label, value: p.value, format: "int" as const }))
      : b.steps.map((m) => ({ label: METRICS[m].label, value: metricValue(ctx.data, m, b.source), format: METRICS[m].format }));
  const box = inner(rect, b.surface);
  const avail = box.height - (b.title ? 26 : 0);
  const stepH = Math.max(28, Math.min(64, avail / Math.max(1, steps.length) - 6));

  return (
    <SurfaceBox surface={b.surface}>
      {b.title && <BlockTitle>{fillVariables(b.title, ctx.data, ctx.today)}</BlockTitle>}
      {steps.length === 0 ? (
        <NoData />
      ) : (
        <div className="flex flex-col gap-1.5">
          {steps.map((s, i) => {
            // Forma de funil (largura pela etapa, não pelo valor): impressões
            // são centenas de vezes os leads e espremeriam o resto. O número
            // e a taxa de passagem é que contam a história.
            const pct = steps.length > 1 ? 100 - (i * 55) / (steps.length - 1) : 100;
            const prev = i > 0 ? steps[i - 1].value : null;
            const rate = prev && s.value !== null ? (s.value / prev) * 100 : null;
            return (
              <div key={i} className="flex items-center gap-3" style={{ height: stepH }}>
                <div className="flex h-full flex-1 justify-center">
                  <div className="flex h-full items-center justify-center rounded-md px-2" style={{ width: `${pct}%`, background: "var(--rp-accent)" }}>
                    <span className="tnum truncate text-[13px] font-bold text-white">{formatValue(s.value, s.format, { compact: true })}</span>
                  </div>
                </div>
                <div className="w-[40%] min-w-0 leading-tight">
                  <div className="truncate text-[12px] font-semibold">{s.label}</div>
                  {rate !== null && (
                    <div className="tnum truncate text-[11px]" style={{ color: "var(--rp-muted)" }}>
                      {formatValue(rate, "percent")} da etapa anterior
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SurfaceBox>
  );
}

function Goal({ b, ctx }: { b: GoalBlock; ctx: RenderCtx }) {
  const def = METRICS[b.metric];
  const value = metricValue(ctx.data, b.metric, b.source);
  const target = b.targetMode === "manual" ? b.target : autoTarget(ctx.data, b.metric);
  const lower = Boolean(def.lowerIsBetter);
  const ratio = value === null || !target ? null : lower ? (value > 0 ? target / value : 1) : value / target;
  const hit = ratio !== null && ratio >= 1;
  const tone = ratio === null ? "var(--rp-muted)" : hit ? "var(--rp-good)" : ratio >= 0.8 ? "var(--rp-warn)" : "var(--rp-bad)";
  const status = ratio === null ? "Sem meta" : hit ? "Meta batida" : ratio >= 0.8 ? "Perto da meta" : "Abaixo da meta";
  const label = b.label || metricLabel(b.metric, b.source);

  return (
    <SurfaceBox surface={b.surface}>
      <div className="flex h-full flex-col justify-between gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="rp-eyebrow truncate">{label}</span>
          <span className="shrink-0 text-[11px] font-semibold" style={{ color: tone }}>
            {status}
          </span>
        </div>
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="tnum shrink-0 whitespace-nowrap font-display text-[26px] font-bold leading-none">{formatValue(value, def.format, { compact: true })}</span>
          <span className="tnum truncate text-[12px]" style={{ color: "var(--rp-muted)" }}>
            {lower ? "teto" : "meta"} {formatValue(target, def.format, { compact: true })}
            {ratio !== null && value !== null && target ? ` · ${goalNote(value, target, lower)}` : ""}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--rp-line)" }}>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, (ratio ?? 0) * 100)}%`, background: tone }} />
        </div>
      </div>
    </SurfaceBox>
  );
}

/** "147% da meta"; para custo, quanto ficou abaixo (ou acima) do teto. */
function goalNote(value: number, target: number, lower: boolean) {
  if (!lower) return `${Math.round((value / target) * 100)}% da meta`;
  const diff = Math.round(Math.abs(1 - value / target) * 100);
  return value <= target ? `${diff}% abaixo do teto` : `${diff}% acima do teto`;
}

const BAND_LABEL = { verde: "Saudável", amarelo: "Atenção", vermelho: "Crítico" } as const;

function Score({ b, ctx, rect }: { b: ScoreBlock; ctx: RenderCtx; rect: { width: number; height: number } }) {
  const { value, band } = ctx.data.score;
  const box = inner(rect, b.surface);
  const d = Math.max(48, Math.min(box.width * 0.55, box.height - 44));
  const sw = Math.max(6, d * 0.09);
  const r = d / 2 - sw / 2;
  const circ = 2 * Math.PI * r;
  const color = band === "verde" ? "var(--rp-good)" : band === "amarelo" ? "var(--rp-warn)" : band === "vermelho" ? "var(--rp-bad)" : "var(--rp-muted)";

  return (
    <SurfaceBox surface={b.surface}>
      <div className="flex h-full flex-col items-center justify-between gap-1">
        <div className="rp-eyebrow w-full truncate text-center">{b.label || "Health Score"}</div>
        <div className="relative" style={{ width: d, height: d }}>
          <svg width={d} height={d} viewBox={`0 0 ${d} ${d}`} role="img" aria-label={`Health Score ${value ?? "sem dado"}`}>
            <circle cx={d / 2} cy={d / 2} r={r} fill="none" stroke="var(--rp-line)" strokeWidth={sw} />
            {value !== null && (
              <circle
                cx={d / 2}
                cy={d / 2}
                r={r}
                fill="none"
                stroke={color}
                strokeWidth={sw}
                strokeLinecap="round"
                strokeDasharray={`${(Math.min(100, value) / 100) * circ} ${circ}`}
                transform={`rotate(-90 ${d / 2} ${d / 2})`}
              />
            )}
          </svg>
          <div className="tnum absolute inset-0 flex items-center justify-center font-display font-bold" style={{ fontSize: d * 0.3 }}>
            {value === null ? "—" : Math.round(value)}
          </div>
        </div>
        <div className="text-[12px] font-semibold" style={{ color }}>
          {band ? BAND_LABEL[band] : "Sem score no período"}
        </div>
      </div>
    </SurfaceBox>
  );
}
