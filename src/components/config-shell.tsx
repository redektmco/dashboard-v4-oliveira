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
    label: "Conexões",
    items: [
      { href: "/config/integracoes", label: "Integrações", short: "Integrações", icon: "plug", admin: true, badge: (b) => n(b.integracoes, "vermelho") },
      { href: "/config/canais", label: "Canais de envio", short: "Canais", icon: "send", admin: true, badge: (b) => (b.canais ? { tone: "amarelo", text: "!" } : null) },
    ],
  },
  {
    label: "Equipe",
    items: [{ href: "/config/usuarios", label: "Usuários e acesso", short: "Usuários", icon: "userCog", admin: true }],
  },
];

const isActive = (i: Item, path: string) => (i.exact ? path === i.href : path.startsWith(i.href));

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
  const path = usePathname();
  const tabs = GROUPS.flatMap((g) => g.items).filter((i) => !i.admin || isAdmin);
  const activeTab = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeTab.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [path]);

  return (
    <>
      <SettingsHeader>
        {tabs.map((t) => {
          const active = isActive(t, path);
          const b = t.badge?.(badges);
          return (
            <Link
              key={t.href}
              ref={active ? activeTab : undefined}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3.5 pb-3 pt-2.5 text-[13px] transition-colors ${
                active ? "border-v4-red font-medium text-ink-100" : "border-transparent text-ink-300 hover:text-ink-100"
              }`}
            >
              <Icon name={t.icon} size={15} className={active ? "text-ink-100" : "text-ink-500"} />
              {t.short}
              {b && <CountBadge tone={b.tone}>{b.text}</CountBadge>}
            </Link>
          );
        })}
      </SettingsHeader>
      {children}
    </>
  );
}

/**
 * Cabeçalho de Configurações (componente "Settings Header" do design):
 * ícone + título, descrição e, logo abaixo, a fileira de abas sobre a linha
 * fina. As abas entram como filhos — cada uma é um link de seção.
 */
export function SettingsHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[1272px] flex-col gap-5 px-4 pt-5 lg:px-10 lg:pt-9">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <Icon name="settings" size={22} stroke={1.75} className="text-ink-300" />
          <p className="font-display text-[22px] font-semibold tracking-[-0.6px] text-ink-100 lg:text-[26px]">Configurações</p>
        </div>
        <p className="text-[13px] text-ink-300 lg:text-[14px]">
          Cadastro da carteira, calibração do modelo, acesso do time e integrações.
        </p>
      </div>
      <nav
        className="no-scrollbar flex w-full gap-1 overflow-x-auto border-b border-[var(--border-hair)]"
        aria-label="Seções de Configurações"
      >
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
