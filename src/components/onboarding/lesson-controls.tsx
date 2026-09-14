"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icon";
import { markLessonComplete, openLessonAction, saveChecklistState } from "@/actions/onboarding";
import type { ChecklistItem } from "@/lib/onboarding/types";

/**
 * Marca de aberta em segundo plano: ao montar a aula, registra "em andamento"
 * sem bloquear nada. Idempotente no banco (ON CONFLICT DO NOTHING). Não
 * renderiza UI.
 */
export function OpenOnMount({ lessonId }: { lessonId: number }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void openLessonAction(lessonId);
  }, [lessonId]);
  return null;
}

/**
 * Botão "marcar como concluído" com resposta imediata (otimista): o estado
 * vira na hora e a persistência acontece em transição, sem travar o clique.
 */
export function MarkComplete({
  lessonId,
  categorySlug,
  initialDone,
}: {
  lessonId: number;
  categorySlug: string;
  initialDone: boolean;
}) {
  const [done, setDone] = useState(initialDone);
  const [pending, start] = useTransition();

  const toggle = () => {
    const next = !done;
    setDone(next); // otimista
    start(() => markLessonComplete(lessonId, next, categorySlug));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={done}
      className={done ? "btn btn-primary" : "btn"}
      style={done ? { background: "var(--color-verde)", color: "#0d0d0d" } : undefined}
    >
      <Icon name={done ? "checkCircle" : "check"} size={16} />
      {done ? "Concluída" : "Marcar como concluída"}
      {pending && <span className="spinner" aria-hidden />}
    </button>
  );
}

/**
 * Checklist da aula. Marca/desmarca com resposta imediata e persiste o
 * conjunto em transição. O estado marcado é por funcionário.
 */
export function LessonChecklist({
  lessonId,
  items,
  initialChecked,
}: {
  lessonId: number;
  items: ChecklistItem[];
  initialChecked: string[];
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(initialChecked));
  const [, start] = useTransition();

  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChecked(next);
    start(() => saveChecklistState(lessonId, [...next]));
  };

  const doneCount = items.filter((i) => checked.has(i.id)).length;

  return (
    <div className="space-y-2">
      <div className="eyebrow">
        {doneCount} de {items.length} concluídos
      </div>
      <ul className="space-y-1.5">
        {items.map((it) => {
          const on = checked.has(it.id);
          return (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => toggle(it.id)}
                aria-pressed={on}
                className="flex w-full items-start gap-2.5 rounded-md border border-[var(--border-hair)] bg-ink-900 px-3 py-2.5 text-left text-[13px] transition-colors duration-[120ms] hover:bg-ink-850"
              >
                <span
                  className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border ${
                    on ? "border-transparent bg-verde text-ink-950" : "border-[var(--border-strong)] text-transparent"
                  }`}
                  style={{ width: 18, height: 18 }}
                >
                  <Icon name="check" size={12} stroke={3} />
                </span>
                <span className={on ? "text-ink-400 line-through" : "text-ink-200"}>{it.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
