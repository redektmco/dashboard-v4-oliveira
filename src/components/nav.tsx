"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/actions/auth";
import type { Aviso } from "@/lib/repo";
import { dateBRFull, nextQuarterStart } from "@/lib/quarter";
import { ActionMenu } from "./action-menu";
import { Icon, type IconName } from "./icon";

type SubLink = { href: string; label: string; admin?: boolean };
type NavLink = { href: string; label: string; hint: string; icon: IconName; children?: SubLink[] };
type NavGroup = { label: string; items: NavLink[] };

/**
 * Navegação principal = o que o time faz toda semana, em grupos. Cadastro,
 * calibração, acesso e integrações moram em Configurações, que tem moldura
 * própria (menu de seções e "Voltar para a carteira").
 *
 * Seções com `children` abrem sozinhas quando você está dentro delas.
 */
const GROUPS: NavGroup[] = [
  {
    label: "Operação",
    items: [
      { href: "/", label: "Carteira", hint: "Saúde da carteira e triagem", icon: "briefcase" },
      { href: "/gt", label: "Performance", hint: "GT · ritual semanal", icon: "chart" },
      { href: "/account", label: "Check-in", hint: "Account · depois da call", icon: "calendarCheck" },
    ],
  },
  {
    label: "Conteúdo",
    items: [
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
    ],
  },
  {
    label: "Sistema",
    items: [{ href: "/config", label: "Configurações", hint: "Clientes, calibração, usuários e integrações", icon: "settings" }],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);
const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path.startsWith(href));

const ROLE_LABEL: Record<string, string> = {
  gt: "GT",
  account: "Account Manager",
  coord: "Coordenação",
  social: "Social Media",
};

type Perfil = { name: string; isAdmin: boolean; role: string };

/* ------------------------------------------------------------------ */
/* Breadcrumb da barra superior                                        */
/* ------------------------------------------------------------------ */

export type Crumb = { label: string; href?: string };
const CrumbCtx = createContext<{ crumbs: Crumb[] | null; set: (c: Crumb[] | null) => void } | null>(null);

export function CrumbProvider({ children }: { children: React.ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[] | null>(null);
  const path = usePathname();
  // Trocou de rota: o caminho da página anterior não vale mais.
  const [lastPath, setLastPath] = useState(path);
  if (lastPath !== path) {
    setLastPath(path);
    setCrumbs(null);
  }
  return <CrumbCtx.Provider value={{ crumbs, set: setCrumbs }}>{children}</CrumbCtx.Provider>;
}

/** A página diz onde está ("Carteira / Brazil Keratin"); sem isso vale o menu. */
export function PageCrumbs({ items }: { items: Crumb[] }) {
  const ctx = useContext(CrumbCtx);
  const key = JSON.stringify(items);
  useEffect(() => {
    ctx?.set(JSON.parse(key));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function useCrumbs(path: string): Crumb[] {
  const ctx = useContext(CrumbCtx);
  if (ctx?.crumbs) return ctx.crumbs;
  const here = ALL.find((l) => isActive(l.href, path));
  return [{ label: here?.label ?? "Health Score" }];
}

/* ------------------------------------------------------------------ */
/* Rail lateral                                                        */
/* ------------------------------------------------------------------ */

function Monogram({ size = 30 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center bg-ink-100 font-bold text-ink-950"
      style={{ width: size, height: size, borderRadius: size > 28 ? 7 : 6, fontSize: size > 28 ? 12 : 11 }}
      aria-hidden
    >
      O&amp;
    </span>
  );
}

function NavItem({ l, path, isAdmin, compact }: { l: NavLink; path: string; isAdmin: boolean; compact?: boolean }) {
  const active = isActive(l.href, path);
  const subs = (l.children ?? []).filter((c) => !c.admin || isAdmin);
  const open = active && subs.length > 0 && !compact;
  return (
    <>
      <Link
        href={l.href}
        title={compact ? l.label : l.hint}
        aria-label={l.label}
        aria-current={active ? "page" : undefined}
        className={`nav-item ${compact ? "nav-item--icon" : ""}`}
      >
        <Icon name={l.icon} size={16} stroke={1.75} />
        {!compact && <span className="min-w-0 flex-1 truncate">{l.label}</span>}
      </Link>
      {open && (
        <div className="nav-sub">
          {subs.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              aria-current={(c.href === l.href ? path === c.href : path.startsWith(c.href)) ? "page" : undefined}
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function NavGroups({ path, isAdmin, compact }: { path: string; isAdmin: boolean; compact?: boolean }) {
  return (
    <nav className={`flex flex-col ${compact ? "items-center gap-6" : "gap-6"}`} aria-label="Navegação principal">
      {GROUPS.map((g) => (
        <div key={g.label} className={`flex flex-col ${compact ? "items-center gap-1" : "gap-0.5"}`}>
          {!compact && <div className="nav-group-label">{g.label}</div>}
          {g.items.map((l) => (
            <NavItem key={l.href} l={l} path={path} isAdmin={isAdmin} compact={compact} />
          ))}
        </div>
      ))}
    </nav>
  );
}

function RecalibrationCard() {
  return (
    <Link href="/config/modelo" className="block rounded-lg bg-ink-900 p-3 hover:bg-ink-850">
      <span className="block text-[12px] font-semibold text-ink-100">Recalibração trimestral</span>
      <span className="mt-1 block text-[12px] text-ink-400">Próxima revisão em {dateBRFull(nextQuarterStart())}</span>
    </Link>
  );
}

function UserRow({ user, compact }: { user: Perfil; compact?: boolean }) {
  const out = useSignOut();
  const items = [
    {
      label: user.name,
      hint: `${ROLE_LABEL[user.role] ?? user.role}${user.isAdmin ? " · administrador" : ""}`,
      icon: (user.isAdmin ? "shield" : "users") as IconName,
      disabled: true,
    },
    "separator" as const,
    { label: "Configurações", icon: "settings" as IconName, href: "/config" },
    { label: "Sair", icon: "logout" as IconName, onSelect: out.run },
  ];
  if (compact)
    return (
      <div className="flex justify-center border-t border-[var(--border-hair)] pt-3">
        <ActionMenu label={`Conta de ${user.name}`} items={items} trigger={<Avatar name={user.name} size={30} />} />
      </div>
    );
  return (
    <div className="flex items-center gap-2.5 border-t border-[var(--border-hair)] px-1.5 pt-3">
      <Avatar name={user.name} size={30} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[13px] font-medium text-ink-100">{user.name}</span>
        <span className="mt-px block truncate text-[11px] text-ink-400">
          {ROLE_LABEL[user.role] ?? user.role}
          {user.isAdmin ? " · admin" : ""}
        </span>
      </span>
      <ActionMenu
        label={`Conta de ${user.name}`}
        items={items}
        trigger={
          <span className="flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-ink-850 hover:text-ink-100">
            {out.pending ? <span className="spinner" aria-hidden /> : <Icon name="settings" size={16} stroke={1.75} />}
          </span>
        }
      />
    </div>
  );
}

/**
 * Rail lateral. Aberto (232px) a partir de 1440px; entre 1024 e 1440 vira
 * coluna de ícones (64px) para devolver largura ao conteúdo.
 */
export function Sidebar({ user }: { user: Perfil }) {
  const path = usePathname();
  return (
    <>
      <aside className="sidebar sidebar--full">
        <Link href="/" title="Oliveira & Co — Health Score" className="flex items-center gap-2.5 px-1.5">
          <Monogram />
          <span className="leading-tight">
            <span className="block font-display text-[14px] font-semibold text-ink-100">Oliveira &amp; Co</span>
            <span className="mt-px block text-[11px] text-ink-400">Gestão de contas</span>
          </span>
        </Link>
        <div className="-mr-1 min-h-0 flex-1 overflow-y-auto pr-1">
          <NavGroups path={path} isAdmin={user.isAdmin} />
        </div>
        <RecalibrationCard />
        <UserRow user={user} />
      </aside>
      <aside className="sidebar sidebar--compact">
        <Link href="/" title="Oliveira & Co — Health Score">
          <Monogram />
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavGroups path={path} isAdmin={user.isAdmin} compact />
        </div>
        <UserRow user={user} compact />
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Barra superior: onde estou, busca e avisos                          */
/* ------------------------------------------------------------------ */

export function TopBar({ avisos }: { avisos: Aviso[] }) {
  const path = usePathname();
  const crumbs = useCrumbs(path);
  const back = crumbs.length > 1 ? crumbs[0] : null;
  return (
    <header className="topbar">
      <nav className="flex min-w-0 items-center gap-1.5 text-[13px]" aria-label="Você está em">
        {back?.href ? (
          <Link href={back.href} className="flex items-center gap-1.5 text-ink-300 hover:text-ink-100">
            <Icon name="arrowLeft" size={15} />
            {back.label}
          </Link>
        ) : back ? (
          <span className="text-ink-300">{back.label}</span>
        ) : null}
        {crumbs.slice(back ? 1 : 0).map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            {(back || i > 0) && <span className="text-ink-500">/</span>}
            {c.href ? (
              <Link href={c.href} className="truncate text-ink-400 hover:text-ink-100">
                {c.label}
              </Link>
            ) : (
              <span className={`truncate ${back ? "text-ink-400" : "text-ink-300"}`}>{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex shrink-0 items-center gap-3">
        <SearchBox />
        <Avisos avisos={avisos} />
      </div>
    </header>
  );
}

type SearchResult = {
  clients: { id: number; name: string; sub: string }[];
  plans: { id: number; clientId: number; title: string; sub: string }[];
};

function useSearch(q: string) {
  const [res, setRes] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setRes(j))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 160);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);
  return { res: q.trim().length < 2 ? null : res, loading };
}

function SearchResults({ q, res, loading, onPick }: { q: string; res: SearchResult | null; loading: boolean; onPick: (href: string) => void }) {
  const pages = ALL.filter((l) => l.label.toLowerCase().includes(q.trim().toLowerCase()));
  const empty = res && !res.clients.length && !res.plans.length && !pages.length;
  return (
    <div className="search-results" role="listbox">
      {q.trim().length < 2 ? (
        <p className="px-3 py-2.5 text-[12px] text-ink-400">Digite ao menos 2 letras do cliente ou da tarefa.</p>
      ) : loading && !res ? (
        <p className="flex items-center gap-2 px-3 py-2.5 text-[12px] text-ink-400">
          <span className="spinner" aria-hidden /> Buscando…
        </p>
      ) : empty ? (
        <p className="px-3 py-2.5 text-[12px] text-ink-400">Nada encontrado para “{q.trim()}”.</p>
      ) : (
        <>
          {!!res?.clients.length && <div className="search-group">Clientes</div>}
          {res?.clients.map((c) => (
            <button key={`c${c.id}`} type="button" className="search-item" onClick={() => onPick(`/clientes/${c.id}`)}>
              <span className="search-letter">{c.name.charAt(0).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink-100">{c.name}</span>
                <span className="block truncate text-[11px] text-ink-400">{c.sub}</span>
              </span>
            </button>
          ))}
          {!!res?.plans.length && <div className="search-group">Planos de ação</div>}
          {res?.plans.map((p) => (
            <button key={`p${p.id}`} type="button" className="search-item" onClick={() => onPick(`/clientes/${p.clientId}#plano`)}>
              <Icon name="listTodo" size={15} className="shrink-0 text-ink-400" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink-100">{p.title}</span>
                <span className="block truncate text-[11px] text-ink-400">{p.sub}</span>
              </span>
            </button>
          ))}
          {!!pages.length && <div className="search-group">Páginas</div>}
          {pages.map((l) => (
            <button key={l.href} type="button" className="search-item" onClick={() => onPick(l.href)}>
              <Icon name={l.icon} size={15} className="shrink-0 text-ink-400" />
              <span className="text-[13px] text-ink-100">{l.label}</span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

function SearchBox() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { res, loading } = useSearch(q);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, []);

  const pick = (href: string) => {
    setOpen(false);
    setQ("");
    input.current?.blur();
    router.push(href);
  };

  return (
    <div ref={wrap} className="relative">
      <label className="search-box">
        <Icon name="search" size={14} className="shrink-0 text-ink-400" />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              input.current?.blur();
            }
            if (e.key === "Enter" && res?.clients[0]) pick(`/clientes/${res.clients[0].id}`);
          }}
          placeholder="Buscar cliente, tarefa…"
          aria-label="Buscar cliente ou tarefa"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink-100 outline-none placeholder:text-ink-400"
        />
        <kbd className="text-[11px] text-ink-400">⌘K</kbd>
      </label>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[360px]">
          <SearchResults q={q} res={res} loading={loading} onPick={pick} />
        </div>
      )}
    </div>
  );
}

/**
 * Sino: o que a unidade está devendo agora (leitura vencida, número da
 * semana em falta, plano de ação atrasado). Cada aviso leva para a tela
 * onde ele se resolve — e o sino só ganha marcador quando há o que fazer.
 */
function Avisos({ avisos }: { avisos: Aviso[] }) {
  const total = avisos.reduce((a, v) => a + v.count, 0);
  return (
    <ActionMenu
      label={total ? `Avisos (${total})` : "Avisos"}
      trigger={
        <span className="relative flex h-8 w-8 items-center justify-center rounded-md text-ink-300 hover:bg-ink-850 hover:text-ink-100">
          <Icon name="bell" size={18} stroke={1.75} />
          {total > 0 && (
            <span
              className="tnum absolute right-0.5 top-0.5 min-w-[15px] rounded-full bg-v4-red px-1 text-center text-[9px] font-bold leading-[15px] text-white"
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
      className="flex shrink-0 items-center justify-center rounded-full bg-ink-800 font-semibold text-ink-300"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.37) }}
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

function useLockScroll(on: boolean, close: () => void) {
  useEffect(() => {
    if (!on) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener("keydown", onKey);
    };
  }, [on, close]);
}

/**
 * Abaixo de `lg` o rail vira gaveta: cabeçalho fino com menu, marca, busca
 * e avisos. O menu abre o mesmo rail do desktop por cima da página.
 */
export function MobileNav({ user, avisos }: { user: Perfil; avisos: Aviso[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const closeSearch = useCallback(() => setSearching(false), []);
  useLockScroll(open, close);
  useLockScroll(searching, closeSearch);

  return (
    <>
      <header className="mobile-header">
        <div className="flex h-[55px] items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setOpen(true)} aria-label="Abrir menu" aria-haspopup="dialog" className="-ml-1 p-1 text-ink-100">
              <Icon name="menu" size={20} stroke={1.75} />
            </button>
            <Link href="/" className="flex items-center gap-2.5">
              <Monogram size={26} />
              <span className="font-display text-[14px] font-semibold text-ink-100">Oliveira &amp; Co</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSearching(true)} aria-label="Buscar" className="p-1.5 text-ink-100">
              <Icon name="search" size={18} stroke={1.75} />
            </button>
            <Avisos avisos={avisos} />
          </div>
        </div>
      </header>

      {open && (
        <>
          <div className="drawer-backdrop" onClick={close} aria-hidden />
          <div className="nav-drawer" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="flex items-center justify-between px-1.5">
              <Link href="/" onClick={close} className="flex items-center gap-2.5">
                <Monogram />
                <span className="leading-tight">
                  <span className="block font-display text-[14px] font-semibold text-ink-100">Oliveira &amp; Co</span>
                  <span className="mt-px block text-[11px] text-ink-400">Gestão de contas</span>
                </span>
              </Link>
              <button type="button" onClick={close} aria-label="Fechar menu" className="flex h-9 w-9 items-center justify-center rounded-md text-ink-400">
                <Icon name="x" size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <NavGroups path={path} isAdmin={user.isAdmin} />
            </div>
            <RecalibrationCard />
            <UserRow user={user} />
          </div>
          <NavCloser path={path} onChange={close} />
        </>
      )}

      {searching && <MobileSearch onClose={closeSearch} />}
    </>
  );
}

/** Fecha a gaveta quando a rota muda (link do menu clicado). */
function NavCloser({ path, onChange }: { path: string; onChange: () => void }) {
  const first = useRef(path);
  useEffect(() => {
    if (path !== first.current) onChange();
  }, [path, onChange]);
  return null;
}

function MobileSearch({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const { res, loading } = useSearch(q);
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-ink-950" role="dialog" aria-modal="true" aria-label="Buscar">
      <div className="flex h-[55px] items-center gap-2 border-b border-[var(--border-hair)] px-4">
        <Icon name="search" size={16} className="text-ink-400" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente, tarefa…"
          className="min-w-0 flex-1 bg-transparent text-[16px] text-ink-100 outline-none placeholder:text-ink-400"
        />
        <button type="button" onClick={onClose} className="text-[13px] font-medium text-ink-300">
          Cancelar
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <SearchResults
          q={q}
          res={res}
          loading={loading}
          onPick={(href) => {
            onClose();
            router.push(href);
          }}
        />
      </div>
    </div>
  );
}

/** Duas letras para o avatar: primeiro e último nome, sem partícula. */
export function iniciais(nome: string) {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 2);
  if (partes.length === 0) return nome.slice(0, 2).toUpperCase();
  const primeiro = partes[0][0];
  const ultimo = partes.length > 1 ? partes[partes.length - 1][0] : partes[0][1] ?? "";
  return (primeiro + ultimo).toUpperCase();
}
