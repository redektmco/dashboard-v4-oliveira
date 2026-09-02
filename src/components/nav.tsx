"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/actions/auth";
import { Icon, type IconName } from "./icon";

const LINKS: { href: string; label: string; hint: string; icon: IconName; admin?: boolean }[] = [
  { href: "/", label: "Carteira", hint: "Coordenação", icon: "grid" },
  { href: "/gt", label: "Performance", hint: "GT · semanal", icon: "chart" },
  { href: "/account", label: "Check-in", hint: "Account · por contato", icon: "users" },
  { href: "/social", label: "Social media", hint: "Aprovação e planejamento", icon: "image" },
  { href: "/modelo", label: "Modelo", hint: "Pesos e réguas", icon: "target" },
  { href: "/config", label: "Configuração", hint: "Clientes, metas, calibração", icon: "settings" },
  { href: "/usuarios", label: "Usuários", hint: "Acesso do time", icon: "shield", admin: true },
];

/** As três jornadas diárias ficam no polegar; o resto vai para a gaveta. */
const TAB_HREFS = ["/", "/gt", "/account"];

const isActive = (href: string, path: string) =>
  href === "/" ? path === "/" : path.startsWith(href);

/** Título da rota atual — usado no cabeçalho mobile e na topbar. */
function currentLabel(path: string) {
  return (
    LINKS.find((l) => isActive(l.href, path))?.label ??
    (path.startsWith("/clientes") ? "Cliente" : "Health Score")
  );
}

/* ------------------------------------------------------------------ */
/* Preferência de menu recolhido                                       */
/* ------------------------------------------------------------------ */
/**
 * Vive no localStorage e é lida por `useSyncExternalStore`: o servidor não
 * conhece a preferência, então o snapshot do servidor é sempre "expandido" e
 * o React troca no hydrate sem divergência de marcação. Ler em `useEffect`
 * daria o mesmo resultado com um render extra — e cascata de setState.
 */
const COLLAPSE_KEY = "healthscore.sidebar.colapsado";

const listeners = new Set<() => void>();

function subscribeCollapsed(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

// Navegação privada e afins podem barrar o storage: cair para expandido.
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(v: boolean) {
  try {
    localStorage.setItem(COLLAPSE_KEY, v ? "1" : "0");
  } catch {
    /* preferência só não persiste */
  }
  listeners.forEach((l) => l());
}

/** Rail lateral persistente — padrão do BI da unidade. */
export function Sidebar({
  counts,
  isAdmin = false,
}: {
  counts?: Record<string, number>;
  isAdmin?: boolean;
}) {
  const path = usePathname();

  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const toggle = () => writeCollapsed(!collapsed);

  return (
    <aside
      data-collapsed={collapsed ? "" : undefined}
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-[var(--border-hair)] bg-black py-4 transition-[width] duration-200 ease-[var(--ease-out)] lg:flex ${
        collapsed ? "w-[68px] px-2.5" : "w-[228px] px-3.5"
      }`}
    >
      <Link
        href="/"
        title="Health Score — Oliveira &amp; Co"
        className={`mb-3.5 flex items-center gap-2.5 border-b border-[var(--border-hair)] pb-4 ${
          collapsed ? "justify-center px-0" : "px-2"
        }`}
      >
        <Image src="/brand/v4-simbolo.webp" alt="V4 Company" width={26} height={26} priority />
        {!collapsed && (
          <span className="leading-tight">
            <span className="block font-display text-[13px] font-bold tracking-tight text-ink-100">
              Oliveira &amp; Co
            </span>
            <span className="eyebrow block">Health Score</span>
          </span>
        )}
      </Link>

      <nav className="flex flex-col gap-0.5">
        {LINKS.filter((l) => !l.admin || isAdmin).map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          const count = counts?.[l.href];
          return (
            <Link
              key={l.href}
              href={l.href}
              title={collapsed ? `${l.label} — ${l.hint}` : l.hint}
              aria-label={l.label}
              className={`relative flex items-center rounded-md py-2 text-[13px] font-semibold transition-colors duration-[120ms] ${
                collapsed ? "justify-center px-0" : "gap-2.5 px-2.5"
              } ${
                active
                  ? `bg-[rgba(229,9,20,0.10)] text-ink-100 before:absolute before:bottom-2 before:top-2 before:w-0.5 before:rounded-r before:bg-v4-red before:content-[''] ${
                      collapsed ? "before:-left-2.5" : "before:-left-3.5"
                    }`
                  : "text-ink-300 hover:bg-ink-850 hover:text-ink-100"
              }`}
            >
              <Icon name={l.icon} size={18} stroke={1.75} />
              {!collapsed && l.label}
              {count ? (
                collapsed ? (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-vermelho" />
                ) : (
                  <span
                    className={`tnum ml-auto rounded-sm px-1.5 py-0.5 font-mono text-[11px] ${
                      count > 0 ? "bg-vermelho-dim text-vermelho-fg" : "bg-ink-850 text-ink-400"
                    }`}
                  >
                    {count}
                  </span>
                )
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 border-t border-[var(--border-hair)] pt-3.5">
        {!collapsed && (
          <p className="text-[11px] leading-relaxed text-ink-500">
            Input 100% manual. Snapshot datado, nunca sobrescrito. Recompute diário.
          </p>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          title={collapsed ? "Expandir menu" : "Recolher menu"}
          className={`flex w-full items-center rounded-md py-2 text-[12px] font-semibold text-ink-400 transition-colors duration-[120ms] hover:bg-ink-850 hover:text-ink-100 ${
            collapsed ? "justify-center px-0" : "gap-2.5 px-2.5"
          }`}
        >
          <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={16} stroke={2} />
          {!collapsed && "Recolher menu"}
        </button>
      </div>
    </aside>
  );
}

/** Topbar do desktop: onde estou + quem sou + ação rápida. */
export function Topbar({ user }: { user?: { name: string; isAdmin: boolean } }) {
  const path = usePathname();
  const here = currentLabel(path);
  return (
    <div className="sticky top-0 z-10 hidden items-center gap-3.5 border-b border-[var(--border-hair)] bg-[rgba(13,13,13,0.85)] px-7 py-3.5 backdrop-blur-xl lg:flex">
      <div className="flex items-center gap-2 text-[13px] text-ink-400">
        <span>Unidade Oliveira &amp; Co</span>
        <span className="text-ink-600">/</span>
        <span className="font-semibold text-ink-100">{here}</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Link href="/gt" className="btn btn-sm">
          <Icon name="chart" size={14} />
          Performance
        </Link>
        <Link href="/account" className="btn btn-sm btn-primary">
          <Icon name="plus" size={14} />
          Check-in
        </Link>
        {user && (
          <div className="ml-2 flex items-center gap-2 border-l border-[var(--border-hair)] pl-3">
            <span className="flex items-center gap-1.5 text-[13px] text-ink-300" title={user.isAdmin ? "Administrador" : undefined}>
              {user.isAdmin && <Icon name="shield" size={13} className="text-v4-red" />}
              {user.name}
            </span>
            <form action={signOut}>
              <button className="btn btn-sm" title="Sair">
                <Icon name="logout" size={14} />
                Sair
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Moldura do celular                                                  */
/* ------------------------------------------------------------------ */
/**
 * Abaixo de `lg` o rail de 228px comeria 60% de um iPhone, então some e
 * a navegação se divide em dois: cabeçalho fino no topo (onde estou) e
 * barra de abas no rodapé (para onde vou). As três jornadas diárias —
 * carteira, performance, check-in — ficam na altura do polegar; modelo,
 * configuração, usuários e sair moram na gaveta do "Mais", que é para
 * onde se vai uma vez por semana, não o dia inteiro.
 *
 * Cabeçalho e barra dividem o mesmo estado da gaveta, por isso vivem no
 * mesmo componente — a barra é `position: fixed`, então renderizar as
 * duas juntas não atrapalha o fluxo do documento.
 */
export function MobileNav({ user }: { user: { name: string; isAdmin: boolean } }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const here = currentLabel(path);
  const secundarios = LINKS.filter(
    (l) => !TAB_HREFS.includes(l.href) && (!l.admin || user.isAdmin),
  );
  // A gaveta conta como "estar em" qualquer rota que ela abriga.
  const emSecundario = secundarios.some((l) => isActive(l.href, path));

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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-ink-850 font-display text-[13px] font-bold text-ink-200"
          >
            {iniciais(user.name)}
          </button>
        </div>
      </header>

      <nav className="tabbar" aria-label="Navegação principal">
        {LINKS.filter((l) => TAB_HREFS.includes(l.href)).map((l) => (
          <Link
            key={l.href}
            href={l.href}
            data-active={isActive(l.href, path) ? "" : undefined}
            aria-current={isActive(l.href, path) ? "page" : undefined}
          >
            <Icon name={l.icon} size={20} stroke={isActive(l.href, path) ? 2.2 : 1.75} />
            {l.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-active={emSecundario || open ? "" : undefined}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <Icon name="dots" size={20} stroke={2} />
          Mais
        </button>
      </nav>

      {open && (
        <>
          <div className="drawer-backdrop" onClick={() => setOpen(false)} aria-hidden />
          <div className="drawer-sheet" role="dialog" aria-modal="true" aria-label="Mais opções">
            <div className="drawer-grip" aria-hidden />

            <div className="flex items-center gap-3 px-5 py-3.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-strong)] bg-ink-850 font-display text-sm font-bold text-ink-200">
                {iniciais(user.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink-100">{user.name}</div>
                <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
                  {user.isAdmin && <Icon name="shield" size={11} className="text-v4-red" />}
                  {user.isAdmin ? "Administrador" : "Unidade Oliveira & Co"}
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
              {secundarios.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  /* A gaveta fecha aqui, na própria navegação: fechá-la
                     num efeito que observa o pathname custaria um render
                     em cascata a cada troca de rota. */
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold ${
                    isActive(l.href, path)
                      ? "bg-[rgba(229,9,20,0.10)] text-ink-100"
                      : "text-ink-200"
                  }`}
                >
                  <Icon name={l.icon} size={19} stroke={1.75} />
                  <span className="min-w-0 flex-1">
                    {l.label}
                    <span className="block text-[11px] font-normal text-ink-500">{l.hint}</span>
                  </span>
                  <Icon name="chevronRight" size={15} className="text-ink-600" />
                </Link>
              ))}
            </nav>

            <div className="border-t border-[var(--border-hair)] px-5 py-3.5">
              <form action={signOut}>
                <button className="btn w-full justify-center">
                  <Icon name="logout" size={15} />
                  Sair
                </button>
              </form>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
                Input 100% manual. Snapshot datado, nunca sobrescrito. Recompute diário.
              </p>
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
