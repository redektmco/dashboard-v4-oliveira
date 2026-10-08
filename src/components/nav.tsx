"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/actions/auth";
import type { Aviso } from "@/lib/repo";
import { ActionMenu } from "./action-menu";
import { Icon, type IconName } from "./icon";

type SubLink = { href: string; label: string; admin?: boolean };
type NavLink = { href: string; label: string; hint: string; icon: IconName; children?: SubLink[] };

/**
 * Navegação principal = o que o time faz toda semana. Cadastro, calibração,
 * acesso e integrações são configuração: moram dentro de Configurações, com
 * sub-abas, em vez de competir com as jornadas no menu.
 *
 * Seções com `children` abrem sozinhas quando você está dentro delas — o
 * segundo nível fica à vista no rail em vez de esperar a página carregar.
 */
const MAIN: NavLink[] = [
  { href: "/", label: "Carteira", hint: "Saúde da carteira e triagem", icon: "grid" },
  { href: "/gt", label: "Performance", hint: "GT · ritual semanal", icon: "chart" },
  { href: "/account", label: "Check-in", hint: "Account · depois da call", icon: "users" },
  {
    href: "/social",
    label: "Social media",
    hint: "Aprovação e calendário",
    icon: "image",
    children: [
      { href: "/social", label: "Projetos" },
      { href: "/social/planejamento", label: "Planejamento" },
    ],
  },
  {
    href: "/onboarding",
    label: "Onboarding",
    hint: "Portal de aprendizagem do time",
    icon: "book",
    children: [
      { href: "/onboarding", label: "Trilhas" },
      { href: "/onboarding/admin", label: "Conteúdo", admin: true },
    ],
  },
];
const SETTINGS: NavLink = {
  href: "/config",
  label: "Configurações",
  hint: "Clientes, calibração, usuários e integrações",
  icon: "settings",
  children: [
    { href: "/config", label: "Pendências" },
    { href: "/config/clientes", label: "Clientes" },
    { href: "/config/cobranca", label: "Cobrança", admin: true },
    { href: "/config/modelo", label: "Modelo e calibração" },
    { href: "/config/integracoes", label: "Integrações", admin: true },
    { href: "/config/canais", label: "Canais de envio", admin: true },
    { href: "/config/usuarios", label: "Usuários", admin: true },
  ],
};

const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path.startsWith(href));

/** Título da rota atual — usado no cabeçalho mobile e na topbar. */
function currentLabel(path: string) {
  return (
    [...MAIN, SETTINGS].find((l) => isActive(l.href, path))?.label ??
    (path.startsWith("/clientes") ? "Cliente" : "Health Score")
  );
}

const ROLE_LABEL: Record<string, string> = {
  gt: "GT",
  account: "Account Manager",
  coord: "Coordenação",
  social: "Social Media",
};

type Perfil = { name: string; isAdmin: boolean; role: string };

function SideLink({ l, path, isAdmin }: { l: NavLink; path: string; isAdmin: boolean }) {
  const active = isActive(l.href, path);
  const subs = (l.children ?? []).filter((c) => !c.admin || isAdmin);
  const open = active && subs.length > 0;
  return (
    <>
      <Link
        href={l.href}
        title={l.hint}
        aria-label={l.label}
        aria-current={active ? "page" : undefined}
        className="side-link"
      >
        <Icon name={l.icon} size={18} stroke={1.75} />
        <span className="min-w-0 flex-1 truncate">{l.label}</span>
        {subs.length > 0 && (
          <Icon
            name={open ? "chevronDown" : "chevronRight"}
            size={13}
            className="shrink-0 text-ink-600"
          />
        )}
      </Link>
      {open && (
        <div className="side-sub">
          {subs.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              aria-current={
                (c.href === l.href ? path === c.href : path.startsWith(c.href)) ? "page" : undefined
              }
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Rail lateral persistente — a espinha do console.
 *
 * A conta mora aqui embaixo, junto do botão de recolher: a faixa da topbar
 * que ela ocupava virou área útil, e o caminho ("onde estou") passa a ser
 * dito pelo próprio cabeçalho da página.
 */
export function Sidebar({ user, avisos }: { user: Perfil; avisos: Aviso[] }) {
  const path = usePathname();
  const out = useSignOut();
  const pendencias = avisos.reduce((a, v) => a + v.count, 0);

  return (
    <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col border-r border-[var(--border-hair)] bg-black px-3 py-3.5 lg:flex">
      <Link
        href="/"
        title="Health Score — Oliveira &amp; Co"
        className="mb-3 flex items-center gap-2.5 border-b border-[var(--border-hair)] px-1.5 pb-3.5"
      >
        <Image src="/brand/v4-simbolo.webp" alt="V4 Company" width={26} height={26} priority />
        <span className="leading-tight">
          <span className="block font-display text-[13px] font-bold tracking-tight text-ink-100">
            Oliveira &amp; Co
          </span>
          <span className="eyebrow block">Health Score</span>
        </span>
      </Link>

      <nav
        className="-mr-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-1"
        aria-label="Navegação principal"
      >
        {MAIN.map((l) => (
          <SideLink key={l.href} l={l} path={path} isAdmin={user.isAdmin} />
        ))}
        <div className="my-2 h-px shrink-0 bg-[var(--border-hair)]" />
        <SideLink l={SETTINGS} path={path} isAdmin={user.isAdmin} />
      </nav>

      {/* Conta + avisos, no rodapé do rail. */}
      <div className="mt-2 flex shrink-0 items-center gap-1 border-t border-[var(--border-hair)] pt-2.5">
        <ActionMenu
          label={`Conta de ${user.name}`}
          trigger={
            <span className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-ink-850" title={user.name}>
              <Avatar name={user.name} size={30} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[12.5px] font-semibold text-ink-100">
                  {user.name}
                </span>
                <span className="block truncate text-[11px] text-ink-500">
                  {ROLE_LABEL[user.role] ?? user.role}
                  {user.isAdmin ? " · admin" : ""}
                </span>
              </span>
              {out.pending ? (
                <span className="spinner" aria-hidden />
              ) : (
                <Icon name="chevronDown" size={13} className="shrink-0 text-ink-600" />
              )}
            </span>
          }
          items={[
            {
              label: user.name,
              hint: `${ROLE_LABEL[user.role] ?? user.role}${user.isAdmin ? " · administrador" : ""}`,
              icon: user.isAdmin ? "shield" : "users",
              disabled: true,
            },
            "separator",
            { label: "Configurações", icon: "settings", href: "/config" },
            { label: "Sair", icon: "logout", onSelect: out.run },
          ]}
        />
        <Avisos avisos={avisos} total={pendencias} />
      </div>
    </aside>
  );
}

/**
 * Sino do rail: o que a unidade está devendo agora (leitura vencida, número
 * da semana em falta, plano de ação atrasado). Cada aviso leva para a tela
 * onde ele se resolve — e o sino só ganha marcador quando há o que fazer.
 */
function Avisos({ avisos, total }: { avisos: Aviso[]; total: number }) {
  return (
    <ActionMenu
      label={total ? `Avisos (${total})` : "Avisos"}
      trigger={
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-400 hover:bg-ink-850 hover:text-ink-100">
          <Icon name="bell" size={17} stroke={1.8} />
          {total > 0 && (
            <span
              className="tnum absolute right-1 top-1 min-w-[15px] rounded-full bg-v4-red px-1 font-mono text-[9px] font-bold leading-[15px] text-white"
              aria-hidden
            >
              {total > 99 ? "99+" : total}
            </span>
          )}
        </span>
      }
      items={
        avisos.length
          ? [
              { label: "Pendências da unidade", icon: "bell", disabled: true },
              "separator",
              ...avisos.map((a) => ({
                label: `${a.count} ${a.label}`,
                icon: a.id === "planos" ? ("flag" as const) : ("clock" as const),
                href: a.href,
              })),
            ]
          : [{ label: "Nada pendente por aqui", icon: "checkCircle", disabled: true }]
      }
    />
  );
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-ink-850 font-display font-bold text-ink-200"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden
    >
      {iniciais(name)}
    </span>
  );
}

function useSignOut() {
  const [pending, start] = useTransition();
  return { pending, run: () => start(() => signOut()) };
}

/* ------------------------------------------------------------------ */
/* Moldura do celular                                                  */
/* ------------------------------------------------------------------ */
/**
 * Abaixo de `lg` o rail some e a navegação se divide: cabeçalho fino no topo
 * (onde estou + conta) e barra de abas no rodapé com as quatro jornadas.
 * Configurações e sair ficam na gaveta da conta, aberta pelo avatar — é para
 * onde se vai uma vez por semana, não o dia inteiro.
 */
export function MobileNav({ user }: { user: Perfil }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const here = currentLabel(path);
  const out = useSignOut();

  // Enquanto aberta, o fundo não rola e Esc fecha.
  useEffect(() => {
    if (!open) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <header className="mobile-header">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <Link href="/" aria-label="Carteira" className="shrink-0">
            <Image src="/brand/v4-simbolo.webp" alt="V4 Company" width={24} height={24} priority />
          </Link>
          <div className="min-w-0 flex-1">
            <span className="eyebrow block">Oliveira &amp; Co</span>
            <span className="block truncate font-display text-[15px] font-bold leading-tight tracking-tight text-ink-100">
              {here}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Conta de ${user.name}`}
            aria-haspopup="dialog"
            className={`rounded-full ${isActive(SETTINGS.href, path) ? "ring-2 ring-v4-red" : ""}`}
          >
            <Avatar name={user.name} size={36} />
          </button>
        </div>
      </header>

      <nav className="tabbar" aria-label="Navegação principal">
        {MAIN.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            data-active={isActive(l.href, path) ? "" : undefined}
            aria-current={isActive(l.href, path) ? "page" : undefined}
          >
            <Icon name={l.icon} size={20} stroke={isActive(l.href, path) ? 2.2 : 1.75} />
            {l.label === "Social media" ? "Social" : l.label}
          </Link>
        ))}
      </nav>

      {open && (
        <>
          <div className="drawer-backdrop" onClick={() => setOpen(false)} aria-hidden />
          <div className="drawer-sheet" role="dialog" aria-modal="true" aria-label="Conta e configurações">
            <div className="drawer-grip" aria-hidden />

            <div className="flex items-center gap-3 px-5 py-3.5">
              <Avatar name={user.name} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink-100">{user.name}</div>
                <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
                  {user.isAdmin && <Icon name="shield" size={11} className="text-v4-red" />}
                  {ROLE_LABEL[user.role] ?? user.role}
                  {user.isAdmin ? " · administrador" : ""}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="flex h-9 w-9 items-center justify-center rounded-md text-ink-400"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <nav className="border-t border-[var(--border-hair)] px-2.5 py-2">
              <Link
                href={SETTINGS.href}
                /* A gaveta fecha aqui, na própria navegação: fechá-la num
                   efeito que observa o pathname custaria um render em
                   cascata a cada troca de rota. */
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold ${
                  isActive(SETTINGS.href, path) ? "bg-[rgba(229,9,20,0.10)] text-ink-100" : "text-ink-200"
                }`}
              >
                <Icon name={SETTINGS.icon} size={19} stroke={1.75} />
                <span className="min-w-0 flex-1">
                  {SETTINGS.label}
                  <span className="block text-[11px] font-normal text-ink-500">{SETTINGS.hint}</span>
                </span>
                <Icon name="chevronRight" size={15} className="text-ink-600" />
              </Link>
            </nav>

            <div className="border-t border-[var(--border-hair)] px-5 py-3.5">
              <button className="btn w-full justify-center" onClick={out.run} disabled={out.pending} aria-busy={out.pending}>
                {out.pending ? <span className="spinner" aria-hidden /> : <Icon name="logout" size={15} />}
                Sair
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/** Duas letras para o avatar: primeiro e último nome, sem partícula. */
function iniciais(nome: string) {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 2);
  if (partes.length === 0) return nome.slice(0, 2).toUpperCase();
  const primeiro = partes[0][0];
  const ultimo = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeiro + ultimo).toUpperCase();
}
