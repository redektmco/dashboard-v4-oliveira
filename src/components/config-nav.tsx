"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icon";

const TABS: { href: string; label: string; icon: IconName; admin?: boolean }[] = [
  { href: "/config", label: "Clientes", icon: "grid" },
  { href: "/config/calibracao", label: "Calibração", icon: "target" },
  { href: "/config/usuarios", label: "Usuários", icon: "shield", admin: true },
  { href: "/config/integracoes", label: "Integrações", icon: "plug", admin: true },
  { href: "/config/modelo", label: "Modelo do score", icon: "layers" },
];

/** Abas de rota da área de Configurações. Admin-only some para quem não é. */
export function ConfigNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  return (
    <nav className="subnav" aria-label="Seções de configuração">
      {TABS.filter((t) => !t.admin || isAdmin).map((t) => {
        const active = t.href === "/config" ? path === "/config" : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}>
            <Icon name={t.icon} size={14} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
