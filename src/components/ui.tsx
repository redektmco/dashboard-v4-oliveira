import Link from "next/link";
import type { Band, Confidence } from "@/lib/model/types";
import { Icon } from "./icon";

/* Mapa de status do design system: saudável / em risco / crítico. */
export const BAND_STYLE: Record<Band, { chip: string; fg: string; dot: string; label: string }> = {
  verde: {
    chip: "bg-verde-dim text-verde-fg",
    fg: "text-verde-fg",
    dot: "bg-verde",
    label: "Saudável",
  },
  amarelo: {
    chip: "bg-amarelo-dim text-amarelo-fg",
    fg: "text-amarelo-fg",
    dot: "bg-amarelo",
    label: "Em risco",
  },
  vermelho: {
    chip: "bg-vermelho-dim text-vermelho-fg",
    fg: "text-vermelho-fg",
    dot: "bg-vermelho",
    label: "Crítico",
  },
};

export const bandFg = (band: Band | null) => (band ? BAND_STYLE[band].fg : "text-ink-400");

export function BandChip({ band, children }: { band: Band | null; children?: React.ReactNode }) {
  const s = band ? BAND_STYLE[band] : null;
  return (
    <span
      className={`tnum inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        s ? s.chip : "bg-ink-800 text-ink-300"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s ? s.dot : "bg-ink-500"}`} />
      {children ?? s?.label ?? "sem dado"}
    </span>
  );
}

const CONF: Record<Confidence, { text: string; cls: string; title: string }> = {
  alta: {
    text: "Confiança alta",
    cls: "text-verde-fg",
    title: "Performance da semana e check-in do mês presentes.",
  },
  media: {
    text: "Confiança média",
    cls: "text-amarelo-fg",
    title: "Uma das duas origens está desatualizada.",
  },
  baixa: {
    text: "Confiança baixa",
    cls: "text-vermelho-fg",
    title: "Ambas as origens velhas ou faltando — não aja cego sobre este número.",
  },
};

export function ConfidenceTag({ c, compact = false }: { c: Confidence; compact?: boolean }) {
  const v = CONF[c];
  const n = c === "alta" ? 3 : c === "media" ? 2 : 1;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${v.cls}`} title={v.title}>
      <span className="inline-flex items-end gap-[2px]" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={`w-[3px] rounded-[1px] ${i <= n ? "bg-current" : "bg-ink-700"}`}
            style={{ height: `${3 + i * 2}px` }}
          />
        ))}
      </span>
      {compact ? c : v.text}
    </span>
  );
}

/** Delta em pill mono, como no kit BI. */
export function Delta({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  if (value === null)
    return <span className="tnum text-xs text-ink-500">—{suffix}</span>;
  if (value === 0)
    return (
      <span className="tnum inline-flex items-center rounded-full bg-ink-850 px-1.5 py-0.5 font-mono text-[11px] font-bold text-ink-400">
        0,0{suffix}
      </span>
    );
  const up = value > 0;
  return (
    <span
      className={`tnum inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[11px] font-bold ${
        up ? "bg-verde-dim text-verde-fg" : "bg-vermelho-dim text-vermelho-fg"
      }`}
    >
      <Icon name={up ? "arrowUp" : "arrowDown"} size={10} stroke={3} />
      {Math.abs(value).toFixed(1).replace(".", ",")}
      {suffix}
    </span>
  );
}

/** Anel radial do health score — componente-assinatura do BI da unidade. */
export function HealthRing({
  score,
  band,
  size = 104,
  stroke = 8,
}: {
  score: number | null;
  band: Band | null;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score ?? 0)) / 100;
  const color =
    band === "verde"
      ? "var(--color-verde)"
      : band === "amarelo"
        ? "var(--color-amarelo)"
        : band === "vermelho"
          ? "var(--color-vermelho)"
          : "var(--color-ink-600)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="tnum font-display text-[28px] font-bold leading-none"
          style={{ color: score === null ? "var(--color-ink-400)" : color }}
        >
          {score === null ? "—" : Math.round(score)}
        </span>
        <span className="mt-0.5 font-mono text-[10px] text-ink-500">/ 100</span>
      </div>
    </div>
  );
}

/** Sparkline do score na tabela da carteira. */
export function Sparkline({
  points,
  width = 108,
  height = 28,
}: {
  points: (number | null)[];
  width?: number;
  height?: number;
}) {
  const vals = points.filter((p): p is number => p !== null);
  if (vals.length < 2) return <span className="text-xs text-ink-600">sem série</span>;
  const min = Math.min(...vals, 40);
  const max = Math.max(...vals, 90);
  const span = Math.max(max - min, 1);
  const step = width / (vals.length - 1);
  const d = vals
    .map(
      (v, i) =>
        `${i ? "L" : "M"}${(i * step).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`,
    )
    .join(" ");
  const last = vals[vals.length - 1];
  const stroke = last >= vals[0] ? "var(--color-verde)" : "var(--color-vermelho)";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={height - ((last - min) / span) * height} r={2.5} fill={stroke} />
    </svg>
  );
}

export function ScoreBar({ value }: { value: number | null }) {
  if (value === null) return <div className="h-1.5 rounded-full bg-ink-850" />;
  const band: Band = value >= 75 ? "verde" : value >= 55 ? "amarelo" : "vermelho";
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-ink-850">
      <div
        className={`h-full rounded-full ${BAND_STYLE[band].dot}`}
        style={{ width: `${Math.max(value, 2)}%` }}
      />
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  right,
  children,
  className = "",
  critical = false,
  collapsible = false,
  defaultOpen = true,
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  critical?: boolean;
  /** Vira um `<details>`: o cabeçalho abre/fecha o corpo, sem JS. Usado
   *  para reduzir quanto vai visível de cara em telas com muitos blocos
   *  repetidos (ex.: decomposição do score por dimensão). */
  collapsible?: boolean;
  /** Só importa com `collapsible` — normalmente aberto só onde há algo a
   *  fazer (amarelo/vermelho) e fechado onde já está tudo bem (verde). */
  defaultOpen?: boolean;
}) {
  const headInner = (title || right) && (
    <>
      <div className="min-w-0">
        {title && (
          <h2 className="font-display text-[16px] font-semibold text-ink-100 sm:text-[17px]">
            {title}
          </h2>
        )}
        {subtitle && <p className="mt-1 text-[12.5px] text-ink-400 sm:text-[13px]">{subtitle}</p>}
      </div>
      {right}
    </>
  );

  if (collapsible) {
    return (
      <details
        className={`panel group ${critical ? "panel-critico" : ""} ${className}`}
        open={defaultOpen}
      >
        <summary className="flex list-none items-start gap-3 border-b border-[var(--border-hair)] px-4 py-3.5 cursor-pointer sm:px-5 sm:py-4 [&::-webkit-details-marker]:hidden">
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            {headInner}
          </div>
          <Icon
            name="chevronDown"
            size={16}
            className="mt-0.5 shrink-0 text-ink-500 transition-transform duration-200 group-open:rotate-180"
          />
        </summary>
        {children}
      </details>
    );
  }

  return (
    <section className={`panel ${critical ? "panel-critico" : ""} ${className}`}>
      {headInner && (
        /* No celular o slot `right` (busca, score, botão) desce para baixo
           do título em vez de disputar a mesma linha com ele. */
        <header className="flex flex-col gap-3 border-b border-[var(--border-hair)] px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-5 sm:py-4">
          {headInner}
        </header>
      )}
      {children}
    </section>
  );
}

/** KPI tile do kit BI. `accent` reserva o vermelho ao número que manda no dia. */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  accent = false,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "verde" | "amarelo" | "vermelho";
  accent?: boolean;
}) {
  const tones = {
    default: "text-ink-100",
    verde: "text-verde-fg",
    amarelo: "text-amarelo-fg",
    vermelho: "text-vermelho-fg",
  };
  return (
    <div
      className={`panel px-3.5 py-3 sm:px-[18px] sm:py-4 ${
        accent ? "border-[rgba(229,9,20,0.25)] bg-black" : ""
      }`}
    >
      <div className="eyebrow">{label}</div>
      <div
        className={`tnum mt-1.5 font-display text-[22px] font-bold leading-none sm:mt-2 sm:text-[28px] ${tones[tone]}`}
      >
        {value}
      </div>
      {/* A dica é o "por quê" do número; no celular ela sobrevive menor,
          porque some justo quando a tela é a única fonte de contexto. */}
      {hint && (
        <div className="mt-1.5 text-[11px] leading-snug text-ink-400 sm:mt-2 sm:text-xs">{hint}</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Responsivo                                                          */
/* ------------------------------------------------------------------ */

/**
 * Envelope obrigatório de toda `table.data-table`. Sem ele a linha mais
 * larga estica o `<main>` e a página inteira passa a rolar na
 * horizontal — o jeito mais rápido de quebrar um layout no celular.
 */
export function TableScroll({ children }: { children: React.ReactNode }) {
  return <div className="table-scroll">{children}</div>;
}

/**
 * Cabeçalho de página. No celular o título encolhe e as ações viram uma
 * linha rolável de largura cheia, em vez de espremer três botões de
 * 36px lado a lado.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
      <div className="min-w-0">
        {back && (
          <Link
            href={back.href}
            className="inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-100"
          >
            <Icon name="arrowLeft" size={12} />
            {back.label}
          </Link>
        )}
        {eyebrow && <span className="eyebrow block">{eyebrow}</span>}
        <h1
          className={`font-display text-[22px] font-bold leading-tight tracking-tight sm:text-[26px] lg:text-[28px] ${
            back || eyebrow ? "mt-1.5" : ""
          }`}
        >
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-3xl text-[13px] text-ink-400 sm:text-sm">{description}</p>
        )}
      </div>
      {actions && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:overflow-visible lg:px-0 lg:pb-0">
          {actions}
        </div>
      )}
    </div>
  );
}

/**
 * Lista em cartões — o que substitui a tabela abaixo de `lg`. Não é a
 * tabela encolhida: é a mesma linha reescrita para uma coluna só, com a
 * identidade no topo e a ação de largura cheia no pé.
 */
export function CardList({ children }: { children: React.ReactNode }) {
  return <div className="lg:hidden">{children}</div>;
}

export function CardRow({
  critical = false,
  children,
}: {
  critical?: boolean;
  children: React.ReactNode;
}) {
  return <div className={`card-row ${critical ? "card-row-critico" : ""}`}>{children}</div>;
}

/** Pares rótulo/valor em duas colunas — as colunas da tabela, empilhadas. */
export function CardMeta({
  items,
}: {
  items: { label: string; value: React.ReactNode; className?: string }[];
}) {
  return (
    <dl className="card-meta">
      {items.map((i) => (
        <div key={i.label}>
          <dt>{i.label}</dt>
          <dd className={i.className}>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Estado vazio compartilhado por tabela e lista de cartões. */
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-8 text-center text-sm text-ink-400">{children}</div>;
}

export function ClientLink({ id, name }: { id: number; name: string }) {
  return (
    <Link
      href={`/clientes/${id}`}
      className="font-semibold text-ink-100 transition-colors duration-[120ms] hover:text-v4-red"
    >
      {name}
    </Link>
  );
}

export const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const dateBR = (s: string | null) =>
  s ? new Date(s + (s.length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";
