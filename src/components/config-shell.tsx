"use client";

import type { ConfigBadges } from "@/lib/config-status";
import type { IconName } from "./icon";
import type { Tone } from "./kit";
import { SectionProvider } from "./page-head";

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
 * no celular) fica a cargo do `AppFrame`; aqui entra a seção e as abas com
 * ícone e o contador do que falta em cada uma — o `PageHead` de cada página
 * desenha tudo junto do título.
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
    <SectionProvider section="Configurações" href="/config" tabs={tabs}>
      {children}
    </SectionProvider>
  );
}

/**
 * Pilha de conteúdo de uma página com cabeçalho e seções. A largura e o
 * respiro são os da moldura do app (`AppFrame`), iguais em toda tela.
 */
export function ConfigPage({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex w-full flex-col gap-5 lg:gap-6 ${className}`}>{children}</div>;
}
