import Link from "next/link";
import type { ChurnTone } from "@/lib/churn/types";
import { Icon, type IconName } from "../icon";

/**
 * Peças visuais do módulo de Churn. Mesma linguagem do resto do redesign
 * (painel escuro, borda fina, raio 12), com dois tons a mais para os status
 * do processo: azul (em análise) e roxo (cancelamento agendado).
 */

export const TONE: Record<ChurnTone, { text: string; dot: string; bg: string }> = {
  cinza: { text: "text-ink-300", dot: "bg-ink-500", bg: "bg-ink-800" },
  azul: { text: "text-azul-fg", dot: "bg-azul", bg: "bg-azul-dim" },
  amarelo: { text: "text-amarelo-fg", dot: "bg-amarelo", bg: "bg-amarelo-dim" },
  roxo: { text: "text-roxo-fg", dot: "bg-roxo", bg: "bg-roxo-dim" },
  verde: { text: "text-verde-fg", dot: "bg-verde", bg: "bg-verde-dim" },
  vermelho: { text: "text-vermelho-fg", dot: "bg-vermelho", bg: "bg-vermelho-dim" },
};

export function TonePill({ tone, children, className = "" }: { tone: ChurnTone; children: React.ReactNode; className?: string }) {
  const t = TONE[tone];
  return (
    <span
      className={`inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-[9px] py-1 text-[12px] font-medium leading-none ${t.bg} ${t.text} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      {children}
    </span>
  );
}

export function Dot({ tone, size = 6 }: { tone: ChurnTone; size?: number }) {
  return <span className={`shrink-0 rounded-full ${TONE[tone].dot}`} style={{ width: size, height: size }} aria-hidden />;
}

/** Superfície padrão: painel escuro com borda fina. */
export function Box({ children, className = "", ...rest }: { children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={`rounded-xl border border-[var(--border-hair)] bg-ink-900 ${className}`} {...rest}>
      {children}
    </section>
  );
}

/** Cabeçalho de cartão: título 14–15px, subtítulo e ação à direita, com linha embaixo. */
export function BoxHead({
  title,
  subtitle,
  action,
  border = true,
  size = "md",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  border?: boolean;
  size?: "md" | "sm";
}) {
  return (
    <header
      className={`flex flex-wrap items-center justify-between gap-3 ${size === "md" ? "px-5 py-4" : "px-[18px] py-3.5"} ${
        border ? "border-b border-[var(--border-hair)]" : ""
      }`}
    >
      <div className="min-w-0 space-y-[3px]">
        <h2 className={`${size === "md" ? "text-[15px]" : "text-[14px]"} font-semibold text-ink-100`}>{title}</h2>
        {subtitle && <p className="text-[12px] text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/** Título de página: breadcrumb opcional, título 26px (+ pílula), descrição e ações. */
export function ChurnHeader({
  crumbs,
  title,
  pill,
  description,
  actions,
}: {
  crumbs?: { href?: string; label: string }[];
  title: React.ReactNode;
  pill?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0 space-y-2">
        {crumbs && (
          <nav className="flex flex-wrap items-center gap-1.5 text-[12px]" aria-label="Caminho">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <Icon name="chevronRight" size={12} className="text-ink-600" />}
                {c.href ? (
                  <Link href={c.href} className="text-ink-500 hover:text-ink-100">
                    {c.label}
                  </Link>
                ) : (
                  <span className="text-ink-300">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[22px] font-semibold tracking-[-0.6px] text-ink-100 lg:text-[26px]">{title}</h1>
          {pill}
        </div>
        {description && <p className="text-[13px] text-ink-300 lg:text-[14px]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 xl:shrink-0 xl:flex-nowrap">{actions}</div>}
    </header>
  );
}

/** Rótulo de seção em caixa alta (10px). */
export function Caps({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-500 ${className}`}>{children}</p>;
}

/** Linha chave → valor dos cartões laterais. */
export function KRow({ k, v, cls = "text-ink-100" }: { k: React.ReactNode; v: React.ReactNode; cls?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px]">
      <span className="text-ink-500">{k}</span>
      <span className={`text-right ${cls}`}>{v}</span>
    </div>
  );
}

export function IconBox({ icon, size = 28, round = false }: { icon: IconName; size?: number; round?: boolean }) {
  return (
    <span
      className={`grid shrink-0 place-items-center bg-ink-850 text-ink-300 ${round ? "rounded-full" : "rounded-[7px]"}`}
      style={{ width: size, height: size }}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </span>
  );
}

/** Faixa de contexto (cliente + metadados separados por divisórias). */
export function ContextStrip({ items }: { items: React.ReactNode[] }) {
  return (
    <Box className="flex flex-col gap-4 px-5 py-[18px] lg:flex-row lg:items-center lg:gap-7 lg:px-6">
      {items.map((it, i) => (
        <div key={i} className="flex min-w-0 items-center gap-7">
          {i > 0 && <span className="hidden h-10 w-px bg-[var(--border-hair)] lg:block" aria-hidden />}
          {it}
        </div>
      ))}
    </Box>
  );
}

export function Meta({ k, v, cls = "text-ink-100" }: { k: string; v: React.ReactNode; cls?: string }) {
  return (
    <div className="flex flex-col gap-[5px]">
      <span className="text-[12px] text-ink-500">{k}</span>
      <span className={`text-[14px] ${cls}`}>{v}</span>
    </div>
  );
}

export function ClientBadge({ name, sub }: { name: string; sub: React.ReactNode }) {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 1);
  const ini = ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || name.slice(0, 2).toUpperCase();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-ink-800 text-[13px] font-semibold text-ink-100">{ini}</span>
      <div className="min-w-0 space-y-[3px]">
        <p className="truncate text-[15px] font-medium text-ink-100">{name}</p>
        <p className="truncate text-[12px] text-ink-500">{sub}</p>
      </div>
    </div>
  );
}
