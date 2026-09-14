"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/onboarding/admin", label: "Visão geral", icon: "grid" },
  { href: "/onboarding/admin/conteudo", label: "Conteúdo", icon: "layers" },
];

/** Sub-navegação do CMS. Inline (Tailwind), sem depender de classe global. */
export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 border-b border-[var(--border-hair)]" aria-label="Seções do CMS">
      {TABS.map((t) => {
        const active = t.href === "/onboarding/admin" ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center gap-2 px-3 py-2.5 text-[13px] font-semibold transition-colors duration-[120ms] ${
              active
                ? "text-ink-100 after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:rounded-t after:bg-v4-red after:content-['']"
                : "text-ink-400 hover:text-ink-100"
            }`}
          >
            <Icon name={t.icon} size={15} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
