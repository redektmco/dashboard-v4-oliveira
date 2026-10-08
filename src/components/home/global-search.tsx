"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../icon";

type Result = {
  clients: { id: number; name: string; sub: string }[];
  plans: { id: number; clientId: number; title: string; sub: string }[];
};

/**
 * Busca global do cabeçalho ("Buscar cliente, tarefa…"). ⌘K / Ctrl+K foca o
 * campo de qualquer lugar da página. Clientes pelo nome e planos pelo título,
 * via /api/search.
 */
export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    const click = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("mousedown", click);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("mousedown", click);
    };
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal });
        if (r.ok) setRes(await r.json());
      } catch {
        /* busca cancelada ou sem rede: mantém o resultado anterior */
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const term = q.trim();
  const shown = term.length >= 2 ? res : null;
  const empty = shown && shown.clients.length === 0 && shown.plans.length === 0;
  const close = () => {
    setOpen(false);
    setQ("");
    setRes(null);
  };

  return (
    <div ref={box} className="relative w-full sm:w-[260px]">
      <label className="relative block">
        <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
        <span className="sr-only">Buscar cliente ou tarefa</span>
        <input
          ref={input}
          className="field h-9 pl-9 pr-12"
          placeholder="Buscar cliente, tarefa…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              close();
              input.current?.blur();
            }
          }}
          autoComplete="off"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-[5px] border border-[var(--border-strong)] bg-ink-850 px-1.5 py-0.5 text-[11px] font-medium text-ink-500 sm:block">
          ⌘K
        </kbd>
      </label>

      {open && term.length >= 2 && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-full min-w-[300px] overflow-hidden rounded-lg border border-[var(--border-strong)] bg-ink-900 shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
          {!shown && <p className="px-3 py-3 text-[13px] text-ink-400">Buscando…</p>}
          {empty && <p className="px-3 py-3 text-[13px] text-ink-400">Nada encontrado para “{term}”.</p>}
          {shown && shown.clients.length > 0 && (
            <div className="py-1">
              <p className="label px-3 py-1.5">Clientes</p>
              {shown.clients.map((c) => (
                <Link key={c.id} href={`/clientes/${c.id}`} onClick={close} className="block px-3 py-2 hover:bg-ink-850">
                  <span className="block truncate text-[13px] font-medium text-ink-100">{c.name}</span>
                  <span className="block truncate text-[11.5px] text-ink-500">{c.sub}</span>
                </Link>
              ))}
            </div>
          )}
          {shown && shown.plans.length > 0 && (
            <div className="border-t border-[var(--border-hair)] py-1">
              <p className="label px-3 py-1.5">Planos de ação</p>
              {shown.plans.map((p) => (
                <Link key={p.id} href={`/clientes/${p.clientId}`} onClick={close} className="block px-3 py-2 hover:bg-ink-850">
                  <span className="block truncate text-[13px] font-medium text-ink-100">{p.title}</span>
                  <span className="block truncate text-[11.5px] text-ink-500">{p.sub}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
