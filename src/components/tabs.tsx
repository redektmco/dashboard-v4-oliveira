"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icon";

export type TabItem = { href: string; label: string; icon?: IconName; exact?: boolean };

/**
 * Abas de rota do console: a régua horizontal com sublinhado vermelho na
 * seção aberta. `plain` é o degrau de baixo (sub-abas), com peso menor.
 *
 * A comparação é por prefixo, menos quando `exact` — sem isso `/social`
 * ficaria aceso também dentro de `/social/planejamento`.
 */
export function RouteTabs({
  items,
  plain = false,
  label = "Seções",
}: {
  items: TabItem[];
  plain?: boolean;
  label?: string;
}) {
  const path = usePathname();
  return (
    <nav className={`subnav ${plain ? "subnav--plain" : ""}`} aria-label={label}>
      {items.map((t) => {
        const active = t.exact ? path === t.href : path === t.href || path.startsWith(`${t.href}/`);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}>
            {t.icon && <Icon name={t.icon} size={14} />}
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
