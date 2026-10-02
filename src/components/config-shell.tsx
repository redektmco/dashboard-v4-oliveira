"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ConfigBadges } from "@/lib/config-status";
import { dateBRFull, nextQuarterStart } from "@/lib/quarter";
import { Icon, type IconName } from "./icon";
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
    label: "Conexões",
    items: [
      { href: "/config/integracoes", label: "Integrações", short: "Integrações", icon: "plug", admin: true, badge: (b) => n(b.integracoes, "vermelho") },
      { href: "/config/canais", label: "Canais de envio", short: "Canais", icon: "send", admin: true, badge: (b) => (b.canais ? { tone: "amarelo", text: "!" } : null) },
    ],
  },
  {
    label: "Equipe",
    items: [{ href: "/config/usuarios", label: "Usuários e acesso", short: "Usuários", icon: "user", admin: true }],
  },
];

const isActive = (i: Item, path: string) => (i.exact ? path === i.href : path.startsWith(i.href));

function SectionNav({ path, isAdmin, badges }: { path: string; isAdmin: boolean; badges: ConfigBadges }) {
  return (
    <nav className="flex flex-col gap-5" aria-label="Seções de Configurações">
      {GROUPS.map((g, gi) => {
        const items = g.items.filter((i) => !i.admin || isAdmin);
        if (!items.length) return null;
        return (
          <div key={gi} className="flex flex-col gap-0.5">
            {g.label && <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-400">{g.label}</div>}
            {items.map((i) => {
              const b = i.badge?.(badges);
              const active = isActive(i, path);
              return (
                <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className="nav-item nav-item--cfg">
                  <Icon name={i.icon} size={16} stroke={1.75} />
                  <span className="min-w-0 flex-1 truncate">{i.label}</span>
                  {b && <CountBadge tone={b.tone}>{b.text}</CountBadge>}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

const ORG = "Oliveira & Co · Unidade V4";

function Heading() {
  return (
    <div className="flex flex-col gap-[3px] px-2 pt-1">
      <span className="font-display text-[17px] font-semibold tracking-[-0.3px] text-ink-100">Configurações</span>
      <span className="text-[12px] text-ink-400">{ORG}</span>
    </div>
  );
}

function Recalibration() {
  return (
    <Link href="/config/modelo" className="block rounded-lg bg-ink-900 p-3 hover:bg-ink-850">
      <span className="block text-[12px] font-semibold text-ink-100">Recalibração trimestral</span>
      <span className="mt-1 block text-[12px] text-ink-400">Próxima revisão em {dateBRFull(nextQuarterStart())}</span>
    </Link>
  );
}

/**
 * Moldura de Configurações: fora da jornada do dia, com menu próprio e
 * "Voltar para a carteira". No celular vira barra com voltar + abas de seção.
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
  const [menu, setMenu] = useState(false);
  const close = useCallback(() => setMenu(false), []);
  const tabs = GROUPS.flatMap((g) => g.items).filter((i) => !i.admin || isAdmin);
  const activeTab = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    activeTab.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [path]);

  // Rota nova: a gaveta do menu fecha.
  const [lastPath, setLastPath] = useState(path);
  if (lastPath !== path) {
    setLastPath(path);
    setMenu(false);
  }

  useEffect(() => {
    if (!menu) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, close]);

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col gap-5 border-r border-[var(--border-hair)] bg-black px-3 py-4 lg:flex">
        <Link href="/" className="flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-ink-300 hover:bg-ink-900 hover:text-ink-100">
          <Icon name="arrowLeft" size={15} />
          Voltar para a carteira
        </Link>
        <Heading />
        <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
          <SectionNav path={path} isAdmin={isAdmin} badges={badges} />
        </div>
        <Recalibration />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="mobile-header">
          <div className="flex h-[55px] items-center gap-3 px-4">
            <Link href="/" aria-label="Voltar para a carteira" className="-ml-1 p-1 text-ink-100">
              <Icon name="arrowLeft" size={20} stroke={1.75} />
            </Link>
            <span className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold text-ink-100">Configurações</span>
            <button type="button" onClick={() => setMenu(true)} aria-label="Seções de Configurações" className="p-1 text-ink-100">
              <Icon name="menu" size={20} stroke={1.75} />
            </button>
          </div>
          <nav className="no-scrollbar flex gap-1 overflow-x-auto border-t border-[var(--border-hair)] px-4" aria-label="Seções">
            {tabs.map((t) => {
              const active = isActive(t, path);
              const b = t.badge?.(badges);
              return (
                <Link
                  key={t.href}
                  ref={active ? activeTab : undefined}
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-[39px] shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-[13px] ${
                    active ? "border-v4-red font-semibold text-ink-100" : "border-transparent text-ink-300"
                  }`}
                >
                  {t.short}
                  {b && <CountBadge tone={b.tone}>{b.text}</CountBadge>}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {menu && (
        <>
          <div className="drawer-backdrop" onClick={close} aria-hidden />
          <div className="nav-drawer" role="dialog" aria-modal="true" aria-label="Seções de Configurações">
            <div className="flex items-center justify-between">
              <Heading />
              <button type="button" onClick={close} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-md text-ink-400">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SectionNav path={path} isAdmin={isAdmin} badges={badges} />
            </div>
            <Recalibration />
            <Link href="/" className="flex h-10 items-center gap-2 rounded-md px-2 text-[13px] text-ink-300">
              <Icon name="arrowLeft" size={15} />
              Voltar para a carteira
            </Link>
          </div>
        </>
      )}
    </>
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
