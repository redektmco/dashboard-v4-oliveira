"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MAX_PERIOD_DAYS, PRESETS, daysBetween, periodQuery, rangeLabel, type PeriodKey } from "@/lib/ficha-period";
import { Icon } from "../icon";

/**
 * Filtro de período da ficha. Grava na URL (`?periodo=` ou `?de=&ate=`) e o
 * servidor refaz a ficha no novo recorte — todas as abas leem o mesmo
 * período. A aba aberta (fragmento `#performance`) é mantida.
 */
export function PeriodPicker({
  value,
  today,
  full = false,
}: {
  value: { key: PeriodKey; label: string; range: string; since: string; until: string };
  today: string;
  full?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [de, setDe] = useState(value.since);
  const [ate, setAte] = useState(value.until);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (p: { key: PeriodKey; since: string; until: string }) => {
    const q = new URLSearchParams(search.toString());
    q.delete("periodo");
    q.delete("de");
    q.delete("ate");
    for (const [k, v] of new URLSearchParams(periodQuery(p))) q.set(k, v);
    const qs = q.toString();
    setOpen(false);
    start(() => router.push(`${pathname}${qs ? `?${qs}` : ""}${window.location.hash}`, { scroll: false }));
  };

  const customError =
    !de || !ate
      ? "Escolha as duas datas."
      : de > ate
        ? "A data inicial vem depois da final."
        : ate > today
          ? "O período não pode terminar no futuro."
          : daysBetween(de, ate) > MAX_PERIOD_DAYS
            ? `No máximo ${MAX_PERIOD_DAYS} dias.`
            : null;

  return (
    <div ref={box} className={`relative ${full ? "w-full" : "w-fit min-w-[260px] max-w-full"}`}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center gap-2.5 rounded-lg border border-[var(--border-strong)] bg-ink-800 px-3 text-left transition-colors hover:bg-ink-700/60"
      >
        <Icon name={pending ? "refresh" : "calendar"} size={16} className={`shrink-0 text-ink-300 ${pending ? "animate-spin" : ""}`} />
        <span className="shrink-0 whitespace-nowrap text-[13px] font-medium text-ink-100">{value.label}</span>
        <span className="min-w-0 flex-1 truncate whitespace-nowrap font-mono text-[12px] text-ink-400">{value.range}</span>
        <Icon name="chevronDown" size={15} className="shrink-0 text-ink-400" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Período"
          className="absolute right-0 top-[calc(100%+6px)] z-40 flex w-[300px] max-w-[calc(100vw-32px)] flex-col gap-1 rounded-xl border border-[var(--border-strong)] bg-ink-800 p-1.5 shadow-[var(--shadow-2)]"
        >
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => go({ key: p.value, since: "", until: "" })}
              className={`flex h-9 items-center justify-between rounded-md px-2.5 text-left text-[13px] transition-colors hover:bg-ink-700/60 ${
                value.key === p.value ? "font-medium text-ink-100" : "text-ink-300"
              }`}
            >
              {p.label}
              {value.key === p.value && <Icon name="check" size={14} className="text-ink-100" />}
            </button>
          ))}
          <div className="mt-1 flex flex-col gap-2 border-t border-[var(--border-hair)] px-2.5 pb-1.5 pt-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.8px] text-ink-400">Personalizado</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                aria-label="De"
                value={de}
                max={today}
                onChange={(e) => setDe(e.target.value)}
                className="field h-8 min-w-0 flex-1 px-2 text-[12px] [color-scheme:dark]"
              />
              <span className="text-[12px] text-ink-500">até</span>
              <input
                type="date"
                aria-label="Até"
                value={ate}
                max={today}
                onChange={(e) => setAte(e.target.value)}
                className="field h-8 min-w-0 flex-1 px-2 text-[12px] [color-scheme:dark]"
              />
            </div>
            {customError ? (
              <span className="text-[11px] text-ink-500">{customError}</span>
            ) : (
              <span className="font-mono text-[11px] text-ink-400">
                {rangeLabel(de, ate)} · {daysBetween(de, ate)} {daysBetween(de, ate) === 1 ? "dia" : "dias"}
              </span>
            )}
            <button
              type="button"
              disabled={Boolean(customError)}
              onClick={() => go({ key: "custom", since: de, until: ate })}
              className="btn btn-light h-8 justify-center disabled:opacity-40"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
