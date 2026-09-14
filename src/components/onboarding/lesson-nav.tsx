"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ProgressStatus } from "@/lib/onboarding/types";
import { StatusDot } from "./progress";

/** Forma leve que a sidebar precisa — sem o corpo das aulas. */
export type NavModule = {
  id: number;
  title: string;
  lessons: { id: number; title: string; progressStatus: ProgressStatus }[];
};

/**
 * Índice de aulas da categoria. A navegação entre aulas é client-side
 * (`<Link>`) — a moldura não recarrega, só o conteúdo troca. A aula atual
 * é destacada comparando com o pathname.
 */
export function LessonNav({ categorySlug, modules }: { categorySlug: string; modules: NavModule[] }) {
  const path = usePathname();
  return (
    <nav className="space-y-4" aria-label="Aulas da categoria">
      {modules.map((m, mi) => (
        <div key={m.id}>
          <div className="eyebrow px-0.5 pb-1.5">
            {String(mi + 1).padStart(2, "0")} · {m.title}
          </div>
          <ul className="space-y-0.5">
            {m.lessons.map((l) => {
              const href = `/onboarding/${categorySlug}/${l.id}`;
              const active = path === href;
              return (
                <li key={l.id}>
                  <Link href={href} prefetch className="ob-lesson-link" aria-current={active ? "page" : undefined}>
                    <StatusDot status={l.progressStatus} />
                    <span className="min-w-0 flex-1 truncate">{l.title}</span>
                  </Link>
                </li>
              );
            })}
            {m.lessons.length === 0 && (
              <li className="px-2 py-1 text-[12px] text-ink-600">Sem aulas ainda.</li>
            )}
          </ul>
        </div>
      ))}
    </nav>
  );
}
