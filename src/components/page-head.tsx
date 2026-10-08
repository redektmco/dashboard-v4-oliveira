"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icon";
import { CountBadge, type Tone } from "./kit";

export type HeadTab = {
  href: string;
  label: string;
  exact?: boolean;
  icon?: IconName;
  badge?: { tone: Tone; text: string } | null;
};

export type Crumb = { href?: string; label: string };

type Section = { crumbs: Crumb[]; tabs: HeadTab[]; label: string };

const SectionContext = createContext<Section | null>(null);

/**
 * Seção com abas (Configurações, Performance, Social media, Churn): o layout
 * declara o nome e as abas uma vez; cada página só diz o próprio título, e o
 * `PageHead` dela põe a seção em cima e as abas embaixo.
 */
export function SectionProvider({
  section,
  href,
  tabs,
  label,
  children,
}: {
  section: string;
  href?: string;
  tabs: HeadTab[];
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <SectionContext.Provider value={{ crumbs: [{ href, label: section }], tabs, label: label ?? `Seções de ${section}` }}>
      {children}
    </SectionContext.Provider>
  );
}

/**
 * Cabeçalho único do app: o caminho em caixa alta (seção › página), o
 * título com um selo opcional, uma linha de contexto, as ações à direita e,
 * quando a seção tem, as abas sobre a linha fina. Sem ícone decorativo e sem
 * repetir o nome da tela.
 */
export function PageHead({
  title,
  adornment,
  description,
  actions,
  crumbs,
  tabs,
  tabsLabel,
}: {
  title: React.ReactNode;
  /** Selo ao lado do título (faixa do score, status). */
  adornment?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Caminho acima do título; dentro de uma seção, a seção já entra sozinha. */
  crumbs?: Crumb[];
  tabs?: HeadTab[];
  tabsLabel?: string;
}) {
  const section = useContext(SectionContext);
  // O caminho mostra só de onde se veio: o último degrau sem link é a
  // própria página, que o título já diz.
  const all = [...(section?.crumbs ?? []), ...(crumbs ?? [])];
  const path = all.length > 1 && !all[all.length - 1].href ? all.slice(0, -1) : all;
  const allTabs = tabs ?? section?.tabs ?? [];

  return (
    <header className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          {path.length > 0 && (
            <nav aria-label="Caminho" className="flex min-w-0 flex-wrap items-center gap-1.5">
              {path.map((c, i) => (
                <span key={i} className="flex min-w-0 items-center gap-1.5">
                  {i > 0 && <Icon name="chevronRight" size={11} className="shrink-0 text-ink-600" />}
                  {c.href ? (
                    <Link href={c.href} className="eyebrow truncate transition-colors hover:text-ink-100">
                      {c.label}
                    </Link>
                  ) : (
                    <span className="eyebrow truncate">{c.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="min-w-0 font-display text-[24px] font-semibold leading-[1.15] tracking-[-0.6px] text-ink-100 lg:text-[28px]">
              {title}
            </h1>
            {adornment}
          </div>
          {description && <div className="max-w-[78ch] text-[13px] leading-[1.5] text-ink-300 lg:text-[14px]">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:flex-nowrap">{actions}</div>}
      </div>
      {allTabs.length > 0 && <HeadTabs tabs={allTabs} label={tabsLabel ?? section?.label ?? "Seções"} />}
    </header>
  );
}

function HeadTabs({ tabs, label }: { tabs: HeadTab[]; label: string }) {
  const path = usePathname();
  const activeTab = useRef<HTMLAnchorElement>(null);

  // No celular a fileira rola: a aba ativa entra em vista.
  useEffect(() => {
    activeTab.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [path]);

  return (
    <nav
      className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-[var(--border-hair)] px-4 lg:mx-0 lg:px-0"
      aria-label={label}
    >
      {tabs.map((t) => {
        const active = t.exact ? path === t.href : path === t.href || path.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            ref={active ? activeTab : undefined}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 pb-3 pt-1 text-[13px] transition-colors ${
              active ? "border-v4-red font-medium text-ink-100" : "border-transparent text-ink-400 hover:text-ink-100"
            }`}
          >
            {t.icon && <Icon name={t.icon} size={15} className={active ? "text-ink-100" : "text-ink-500"} />}
            {t.label}
            {t.badge && <CountBadge tone={t.badge.tone}>{t.badge.text}</CountBadge>}
          </Link>
        );
      })}
    </nav>
  );
}
