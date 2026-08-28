"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/actions/auth";
import { Icon, type IconName } from "./icon";

const LINKS: { href: string; label: string; hint: string; icon: IconName; admin?: boolean }[] = [
  { href: "/", label: "Carteira", hint: "Coordenação", icon: "grid" },
  { href: "/gt", label: "Performance", hint: "GT · semanal", icon: "chart" },
  { href: "/account", label: "Check-in", hint: "Account · por contato", icon: "users" },
  { href: "/modelo", label: "Modelo", hint: "Pesos e réguas", icon: "target" },
  { href: "/config", label: "Configuração", hint: "Clientes, metas, calibração", icon: "settings" },
  { href: "/usuarios", label: "Usuários", hint: "Acesso do time", icon: "shield", admin: true },
];

/** Rail lateral persistente — padrão do BI da unidade. */
export function Sidebar({
  counts,
  isAdmin = false,
}: {
  counts?: Record<string, number>;
  isAdmin?: boolean;
}) {
  const path = usePathname();
  return (
    <aside className="sticky top-0 flex h-screen w-[228px] shrink-0 flex-col border-r border-[var(--border-hair)] bg-black px-3.5 py-4">
      <Link href="/" className="mb-3.5 flex items-center gap-2.5 border-b border-[var(--border-hair)] px-2 pb-4">
        <Image src="/brand/v4-simbolo.webp" alt="V4 Company" width={26} height={26} priority />
        <span className="leading-tight">
          <span className="block font-display text-[13px] font-bold tracking-tight text-ink-100">
            Oliveira &amp; Co
          </span>
          <span className="eyebrow block">Health Score</span>
        </span>
      </Link>

      <nav className="flex flex-col gap-0.5">
        {LINKS.filter((l) => !l.admin || isAdmin).map((l) => {
          const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
          const count = counts?.[l.href];
          return (
            <Link
              key={l.href}
              href={l.href}
              title={l.hint}
              className={`relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-semibold transition-colors duration-[120ms] ${
                active
                  ? "bg-[rgba(229,9,20,0.10)] text-ink-100 before:absolute before:-left-3.5 before:bottom-2 before:top-2 before:w-0.5 before:rounded-r before:bg-v4-red before:content-['']"
                  : "text-ink-300 hover:bg-ink-850 hover:text-ink-100"
              }`}
            >
              <Icon name={l.icon} size={18} stroke={1.75} />
              {l.label}
              {count ? (
                <span
                  className={`tnum ml-auto rounded-sm px-1.5 py-0.5 font-mono text-[11px] ${
                    count > 0 ? "bg-vermelho-dim text-vermelho-fg" : "bg-ink-850 text-ink-400"
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-[var(--border-hair)] pt-3.5">
        <p className="text-[11px] leading-relaxed text-ink-500">
          Input 100% manual. Snapshot datado, nunca sobrescrito. Recompute diário.
        </p>
      </div>
    </aside>
  );
}

/** Topbar fixa: onde estou + quem sou + ação rápida. */
export function Topbar({ user }: { user?: { name: string; isAdmin: boolean } }) {
  const path = usePathname();
  const here =
    LINKS.find((l) => (l.href === "/" ? path === "/" : path.startsWith(l.href)))?.label ??
    (path.startsWith("/clientes") ? "Cliente" : "Health Score");
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3.5 border-b border-[var(--border-hair)] bg-[rgba(13,13,13,0.85)] px-7 py-3.5 backdrop-blur-xl">
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
