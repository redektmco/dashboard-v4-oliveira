import type { Band } from "@/lib/model/types";
import { Icon, type IconName } from "./icon";
import { PageHead } from "./page-head";

/**
 * Peças visuais do redesign (ficha do cliente e Configurações). Cores e
 * fontes são as do design system da unidade; medidas e hierarquia seguem
 * o layout aprovado.
 */

export type Tone = Band | "neutro";

export const TONE: Record<Tone, { text: string; dot: string; bg: string; bar: string }> = {
  verde: { text: "text-verde-fg", dot: "bg-verde", bg: "bg-verde-dim", bar: "bg-verde" },
  amarelo: { text: "text-amarelo-fg", dot: "bg-amarelo", bg: "bg-amarelo-dim", bar: "bg-amarelo" },
  vermelho: { text: "text-vermelho-fg", dot: "bg-vermelho", bg: "bg-vermelho-dim", bar: "bg-vermelho" },
  neutro: { text: "text-ink-300", dot: "bg-ink-300", bg: "bg-ink-800", bar: "bg-ink-300" },
};

export const BAND_TEXT: Record<Band, string> = { verde: "Saudável", amarelo: "Atenção", vermelho: "Crítico" };

/** Pílula de status: ponto + rótulo sobre o fundo da cor. */
export function Pill({ tone, children, className = "" }: { tone: Tone; children: React.ReactNode; className?: string }) {
  const t = TONE[tone];
  return (
    <span className={`inline-flex h-fit w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-[9px] py-1 text-[12px] font-medium leading-none ${t.bg} ${t.text} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {children}
    </span>
  );
}

export function BandPill({ band }: { band: Band | null }) {
  return band ? <Pill tone={band}>{BAND_TEXT[band]}</Pill> : <Pill tone="neutro">Sem dado</Pill>;
}

/** Ponto + rótulo, sem fundo (linhas de status em lista). */
export function DotLabel({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const t = TONE[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${t.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {children}
    </span>
  );
}

/** Contador de menu (ex.: "10" em vermelho sobre o fundo da cor). */
export function CountBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const t = TONE[tone];
  return (
    <span className={`tnum rounded-full px-[7px] py-px text-[11px] font-semibold ${t.bg} ${t.text}`}>{children}</span>
  );
}

/** Cartão base: superfície do painel, borda fina, raio 12. */
export function Card({
  children,
  className = "",
  as: As = "div",
  ...rest
}: { children: React.ReactNode; className?: string; as?: "div" | "section" | "article" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <As className={`rounded-xl border border-[var(--border-hair)] bg-ink-900 ${className}`} {...rest}>
      {children}
    </As>
  );
}

/** Cabeçalho de seção: título 17px, subtítulo e ação à direita. */
export function SectionHead({
  title,
  subtitle,
  action,
  id,
  size = "md",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  id?: string;
  size?: "md" | "sm";
}) {
  return (
    <div id={id} className="flex scroll-mt-20 flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 className={`font-display font-semibold tracking-[-0.2px] text-ink-100 ${size === "md" ? "text-[16px] lg:text-[17px]" : "text-[15px]"}`}>
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-[13px] text-ink-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Título de página de Configurações: 24px, descrição 14px. */
/** Título de página — o cabeçalho único do app (ver `PageHead`). */
export function PageTitle({
  title,
  description,
  aside,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return <PageHead title={title} description={description} actions={aside} />;
}

/** Trilho de progresso de 4px (ou 3px). `value` de 0 a 100. */
export function Bar({ value, tone = "neutro", thin = false, className = "" }: { value: number; tone?: Tone; thin?: boolean; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={`relative w-full overflow-hidden rounded-sm bg-ink-800 ${thin ? "h-[3px]" : "h-1"} ${className}`}>
      <div className={`absolute inset-y-0 left-0 rounded-sm ${TONE[tone].bar}`} style={{ width: `${v}%` }} />
    </div>
  );
}

/** Par chave/valor empilhado (11px cinza em cima, 13px forte embaixo). */
export function KV({ k, v, tone, className = "" }: { k: React.ReactNode; v: React.ReactNode; tone?: Tone; className?: string }) {
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <span className="text-[11px] text-ink-400">{k}</span>
      <span className={`tnum text-[13px] font-semibold ${tone ? TONE[tone].text : "text-ink-100"}`}>{v}</span>
    </div>
  );
}

/** Rótulo de coluna das listas densas (11px, caixa alta, espaçado). */
export function ColLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-400 ${className}`}>{children}</span>;
}

export function Initials({ name, size = 22 }: { name: string | null; size?: number }) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const ini = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "—").slice(0, 2);
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-ink-800 font-semibold uppercase text-ink-300"
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)) }}
      aria-hidden
    >
      {ini}
    </span>
  );
}

/** Quadrado com a inicial do cliente (lista de Clientes e Integrações). */
export function Letter({ name }: { name: string }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-ink-800 text-[12px] font-semibold text-ink-300" aria-hidden>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Ícone em caixa colorida (pendências). */
export function IconBox({ icon, tone, size = 36 }: { icon: IconName; tone: Tone; size?: number }) {
  const t = TONE[tone];
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-lg ${t.bg} ${t.text}`} style={{ width: size, height: size }}>
      <Icon name={icon} size={size > 32 ? 17 : 15} stroke={1.9} />
    </span>
  );
}

/** Controle segmentado compacto (7 dias / 30 dias / …). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  full = false,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  full?: boolean;
  size?: "md" | "sm";
}) {
  return (
    <div className={`flex gap-0.5 rounded-lg border border-[var(--border-hair)] bg-ink-900 p-[3px] ${full ? "w-full" : "w-fit"}`} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`flex items-center justify-center rounded-md px-3 text-[12px] transition-colors ${size === "sm" ? "h-[26px] px-2.5" : "h-7"} ${
            full ? "flex-1" : ""
          } ${o.value === value ? "bg-ink-800 font-medium text-ink-100" : "text-ink-400 hover:text-ink-100"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
