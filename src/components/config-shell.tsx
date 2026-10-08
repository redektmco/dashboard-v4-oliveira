"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ConfigBadges } from "@/lib/config-status";
import type { IconName } from "./icon";
import { CountBadge, type Tone } from "./kit";

type Item = {
  href: string;
  label: string;
  short: string;
  icon: IconName;
  admin?: boolean;
  exact?: boolean;
  badge?: (b: ConfigBadges) => { tone: Tone; text: string } | null;
};
type Group = { label: string | null; items: Item[] };

const n = (v: number, tone: Tone) => (v > 0 ? { tone, text: String(v) } : null);

/**
 * Seções de Configurações. Os contadores dizem o que está faltando em cada
 * uma — é o mesmo número da página de Pendências, visto de onde se resolve.
 */
const GROUPS: Group[] = [
  {
    label: null,
    items: [{ href: "/config", label: "Pendências", short: "Pendências", icon: "listCheck", exact: true, badge: (b) => n(b.pendencias, "vermelho") }],
  },
  {
    label: "Carteira",
    items: [
      { href: "/config/clientes", label: "Clientes", short: "Clientes", icon: "users", badge: (b) => n(b.clientes, "vermelho") },
      { href: "/config/cobranca", label: "Cobrança", short: "Cobrança", icon: "dollar", admin: true, badge: (b) => n(b.cobranca, "amarelo") },
    ],
  },
  {
    label: "Score",
    items: [{ href: "/config/modelo", label: "Modelo e calibração", short: "Modelo", icon: "gauge" }],
  },
  {
    label: "Equipe",
    items: [{ href: "/config/usuarios", label: "Usuários e acesso", short: "Usuários", icon: "user", admin: true }],
  },
];

/**
 * Moldura de Configurações: a navegação do app (rail no desktop, abas e conta
 * no celular) fica a cargo do `AppFrame`; aqui entra só o menu de seções, em
 * abas, com os contadores do que falta em cada uma.
 */
export function ConfigShell({
  isAdmin,
  badges,
  children,
}: {
  isAdmin: boolean;
  badges: ConfigBadges;
  children: React.ReactNode;
}) {
  const tabs = GROUPS.flatMap((g) => g.items)
    .filter((i) => !i.admin || isAdmin)
    .map((i) => ({ href: i.href, label: i.short, exact: i.exact, badge: i.badge?.(badges) ?? null }));
  return (
    <>
      <SectionTabs tabs={tabs} label="Seções de Configurações" />
      {children}
    </>
  );
}

export type SectionTab = { href: string; label: string; exact?: boolean; badge?: { tone: Tone; text: string } | null };

/**
 * Faixa de abas de ponta a ponta de uma seção (Configurações, Performance),
 * com o contador do que falta em cada aba.
 */
export function SectionTabs({ tabs, label }: { tabs: SectionTab[]; label: string }) {
  const path = usePathname();
  const activeTab = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeTab.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [path]);

  return (
    <div className="border-b border-[var(--border-hair)]">
      <nav
        className="no-scrollbar mx-auto flex w-full max-w-[1328px] gap-1 overflow-x-auto px-4 lg:px-10"
        aria-label={label}
      >
        {tabs.map((t) => {
          const active = t.exact ? path === t.href : path.startsWith(t.href);
          return (
            <Link
              key={t.href}
              ref={active ? activeTab : undefined}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-[44px] shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-[13px] ${
                active ? "border-v4-red font-semibold text-ink-100" : "border-transparent text-ink-300 hover:text-ink-100"
              }`}
            >
              {t.label}
              {t.badge && <CountBadge tone={t.badge.tone}>{t.badge.text}</CountBadge>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Área de conteúdo de uma página de Configurações, com o respiro do layout. */
export function ConfigPage({ children, wide = false, className = "" }: { children: React.ReactNode; wide?: boolean; className?: string }) {
  return (
    <div
      className={`mx-auto flex w-full flex-col gap-5 px-4 pb-10 pt-5 lg:gap-6 lg:pb-14 lg:pt-9 ${wide ? "max-w-[1328px] lg:px-14" : "max-w-[1272px] lg:px-10"} ${className}`}
    >
      {children}
    </div>
  );
}
