"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ConfigBadges } from "@/lib/config-status";
import type { IconName } from "./icon";
import { Icon } from "./icon";
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
      { href: "/config/cobranca", label: "Cobrança", short: "Cobrança", icon: "receipt", admin: true, badge: (b) => n(b.cobranca, "amarelo") },
    ],
  },
  {
    label: "Score",
    items: [{ href: "/config/modelo", label: "Modelo e calibração", short: "Modelo e calibração", icon: "sliders" }],
  },
  {
    label: "Equipe",
    items: [{ href: "/config/usuarios", label: "Usuários e acesso", short: "Usuários", icon: "userCog", admin: true }],
  },
];

/**
 * Moldura de Configurações: a navegação do app (rail no desktop, abas e conta
 * no celular) fica a cargo do `AppFrame`; aqui entra o cabeçalho da seção
 * (ícone, título e descrição) e o menu de seções em abas com ícone, com os
 * contadores do que falta em cada uma.
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
    .map((i) => ({ href: i.href, label: i.short, exact: i.exact, icon: i.icon, badge: i.badge?.(badges) ?? null }));
  return (
    <>
      <SectionTabs
        tabs={tabs}
        label="Seções de Configurações"
        header={{
          icon: "settings",
          title: "Configurações",
          description: "Cadastro da carteira, cobrança, calibração do modelo e acesso do time.",
        }}
      />
      {children}
    </>
  );
}

export type SectionTab = {
  href: string;
  label: string;
  exact?: boolean;
  icon?: IconName;
  badge?: { tone: Tone; text: string } | null;
};

/**
 * Faixa de abas de uma seção (Configurações, Performance), com o contador do
 * que falta em cada aba. Com `header`, vira o "Settings Header" do design:
 * ícone + título e descrição em cima, abas com ícone sobre a linha fina.
 */
export function SectionTabs({
  tabs,
  label,
  header,
}: {
  tabs: SectionTab[];
  label: string;
  header?: { icon: IconName; title: string; description: string };
}) {
  const path = usePathname();
  const activeTab = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeTab.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [path]);

  const links = tabs.map((t) => {
    const active = t.exact ? path === t.href : path.startsWith(t.href);
    return (
      <Link
        key={t.href}
        ref={active ? activeTab : undefined}
        href={t.href}
        aria-current={active ? "page" : undefined}
        className={
          header
            ? `-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 pb-3 pt-2.5 text-[13px] transition-colors ${
                active ? "border-v4-red font-medium text-ink-100" : "border-transparent text-ink-300 hover:text-ink-100"
              }`
            : `flex h-[44px] shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-[13px] ${
                active ? "border-v4-red font-semibold text-ink-100" : "border-transparent text-ink-300 hover:text-ink-100"
              }`
        }
      >
        {t.icon && <Icon name={t.icon} size={15} className={active ? "text-ink-100" : "text-ink-500"} />}
        {t.label}
        {t.badge && <CountBadge tone={t.badge.tone}>{t.badge.text}</CountBadge>}
      </Link>
    );
  });

  if (header)
    return (
      <SettingsHeader icon={header.icon} title={header.title} description={header.description} label={label}>
        {links}
      </SettingsHeader>
    );

  return (
    <div className="border-b border-[var(--border-hair)]">
      <nav className="no-scrollbar mx-auto flex w-full max-w-[1328px] gap-1 overflow-x-auto px-4 lg:px-10" aria-label={label}>
        {links}
      </nav>
    </div>
  );
}

/**
 * Cabeçalho de seção (componente "Settings Header" do design): ícone +
 * título, descrição e, logo abaixo, a fileira de abas sobre a linha fina.
 */
export function SettingsHeader({
  icon,
  title,
  description,
  label,
  children,
}: {
  icon: IconName;
  title: string;
  description: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1272px] flex-col gap-5 px-4 pt-5 lg:px-10 lg:pt-9">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <Icon name={icon} size={22} stroke={1.75} className="text-ink-300" />
          <p className="font-display text-[22px] font-semibold tracking-[-0.6px] text-ink-100 lg:text-[26px]">{title}</p>
        </div>
        <p className="text-[13px] text-ink-300 lg:text-[14px]">{description}</p>
      </div>
      <nav className="no-scrollbar flex w-full gap-1 overflow-x-auto border-b border-[var(--border-hair)]" aria-label={label}>
        {children}
      </nav>
    </div>
  );
}

/** Área de conteúdo de uma página de Configurações, com o respiro do layout. */
export function ConfigPage({ children, wide = false, className = "" }: { children: React.ReactNode; wide?: boolean; className?: string }) {
  return (
    <div
      className={`mx-auto flex w-full flex-col gap-5 px-4 pb-10 pt-5 lg:gap-6 lg:pb-14 lg:pt-8 ${wide ? "max-w-[1328px] lg:px-14" : "max-w-[1272px] lg:px-10"} ${className}`}
    >
      {children}
    </div>
  );
}
