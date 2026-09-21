"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Asset, PublishStatus } from "@/lib/social/types";
import type { FormatBadge } from "@/lib/social/media";
import { Icon } from "@/components/icon";
import { downloadAssets } from "@/lib/social/download";
import { MediaView } from "./media";
import { FormatTag } from "./vertical-preview";

export type PlannedItem = {
  id: string;
  projectId: string;
  scheduledAt: string;
  caption: string;
  thumb: Pick<Asset, "url" | "name" | "kind" | "contentType"> | null;
  /** Mídias do criativo, para o botão de download (1 = post/reels, 2+ = carrossel/story). */
  assets: Pick<Asset, "url" | "name">[];
  format: FormatBadge;
  clientName: string;
  igHandle: string;
  projectTitle: string;
  publishStatus: PublishStatus;
};

const PUB: Record<PublishStatus, { label: string; cls: string; dot: string }> = {
  draft: { label: "Rascunho", cls: "bg-ink-800 text-ink-300", dot: "bg-ink-500" },
  scheduled: { label: "Agendado", cls: "bg-amarelo-dim text-amarelo-fg", dot: "bg-amarelo-fg" },
  publishing: { label: "Publicando", cls: "bg-amarelo-dim text-amarelo-fg", dot: "bg-amarelo-fg" },
  published: { label: "Publicado", cls: "bg-verde-dim text-verde-fg", dot: "bg-verde-fg" },
  failed: { label: "Falhou", cls: "bg-vermelho-dim text-vermelho-fg", dot: "bg-vermelho-fg" },
};

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const dayKeyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const timeBR = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const longDay = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

export default function PlanningCalendar({ items }: { items: PlannedItem[] }) {
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [cursor, setCursor] = useState(() => {
    const first = items[0]?.scheduledAt ? new Date(items[0].scheduledAt) : new Date();
    return new Date(first.getFullYear(), first.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string | null>(null);

  // agrupa por dia (YYYY-MM-DD)
  const byDay = useMemo(() => {
    const m = new Map<string, PlannedItem[]>();
    for (const it of items) {
      const k = dayKeyOf(new Date(it.scheduledAt));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    for (const list of m.values())
      list.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    return m;
  }, [items]);

  // matriz do mês (6 semanas × 7 dias)
  const weeks = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const start = new Date(year, month, 1);
    start.setDate(1 - start.getDay()); // volta pro domingo da 1ª semana
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      cells.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    }
    const out: Date[][] = [];
    for (let i = 0; i < 6; i++) out.push(cells.slice(i * 7, i * 7 + 7));
    return out;
  }, [cursor]);

  const todayKey = dayKeyOf(new Date());
  const monthLabel = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const step = (delta: number) =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));

  const selectedItems = selected ? (byDay.get(selected) ?? []) : [];

  return (
    <div className="space-y-4">
      {/* Barra de controle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => step(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-hair)] text-ink-300 transition-colors hover:bg-ink-850 hover:text-ink-100"
            aria-label="Mês anterior"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <div className="min-w-[168px] text-center text-sm font-semibold capitalize text-ink-100">
            {monthLabel}
          </div>
          <button
            type="button"
            onClick={() => step(1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-hair)] text-ink-300 transition-colors hover:bg-ink-850 hover:text-ink-100"
            aria-label="Próximo mês"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          </button>
          <button
            type="button"
            onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
            className="ml-1 rounded-lg border border-[var(--border-hair)] px-2.5 py-1.5 text-xs font-semibold text-ink-300 transition-colors hover:bg-ink-850 hover:text-ink-100"
          >
            Hoje
          </button>
        </div>

        <div className="flex rounded-lg border border-[var(--border-hair)] p-0.5">
          {(["calendar", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === v ? "bg-ink-800 text-ink-100" : "text-ink-400 hover:text-ink-200"
              }`}
            >
              {v === "calendar" ? "Calendário" : "Lista"}
            </button>
          ))}
        </div>
      </div>

      {view === "calendar" ? (
        <div className="overflow-hidden rounded-xl border border-[var(--border-hair)] bg-ink-900">
          {/* Cabeçalho de dias da semana */}
          <div className="grid grid-cols-7 border-b border-[var(--border-hair)] bg-ink-925">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                {w}
              </div>
            ))}
          </div>
          {/* Grade */}
          <div className="grid grid-cols-7">
            {weeks.flat().map((d, i) => {
              const key = dayKeyOf(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const dayItems = byDay.get(key) ?? [];
              const isToday = key === todayKey;
              return (
                <button
                  key={key + i}
                  type="button"
                  onClick={() => dayItems.length && setSelected(selected === key ? null : key)}
                  className={`group relative flex min-h-[92px] flex-col gap-1 border-b border-r border-[var(--border-hair)] p-1.5 text-left transition-colors [&:nth-child(7n)]:border-r-0 ${
                    inMonth ? "bg-ink-900" : "bg-ink-950/40"
                  } ${dayItems.length ? "cursor-pointer hover:bg-ink-850" : "cursor-default"} ${
                    selected === key ? "ring-1 ring-inset ring-[var(--v4-red-500,#e50914)]" : ""
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      isToday
                        ? "bg-vermelho-fg text-white"
                        : inMonth
                          ? "text-ink-200"
                          : "text-ink-600"
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  <div className="flex flex-1 flex-col gap-1 overflow-hidden">
                    {dayItems.slice(0, 3).map((it) => (
                      <span
                        key={it.id}
                        className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight ${PUB[it.publishStatus].cls}`}
                      >
                        <span className="tnum shrink-0 font-mono">{timeBR(it.scheduledAt)}</span>
                        <span className="truncate">@{it.igHandle}</span>
                      </span>
                    ))}
                    {dayItems.length > 3 && (
                      <span className="px-1 text-[10px] font-semibold text-ink-400">
                        +{dayItems.length - 3} mais
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <ListGrouped items={items} />
      )}

      {/* Detalhe do dia selecionado */}
      {view === "calendar" && selected && selectedItems.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[var(--border-hair)] bg-ink-900">
          <div className="border-b border-[var(--border-hair)] px-4 py-2.5 text-sm font-semibold capitalize text-ink-100">
            {longDay(selectedItems[0].scheduledAt)}
          </div>
          <div className="divide-y divide-[var(--border-hair)]">
            {selectedItems.map((p) => (
              <PlannedRow key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ListGrouped({ items }: { items: PlannedItem[] }) {
  const groups = useMemo(() => {
    const m = new Map<string, PlannedItem[]>();
    for (const p of items) {
      const k = longDay(p.scheduledAt);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return [...m.entries()];
  }, [items]);

  return (
    <div className="space-y-4">
      {groups.map(([day, list]) => (
        <div key={day} className="overflow-hidden rounded-xl border border-[var(--border-hair)] bg-ink-900">
          <div className="flex items-center justify-between border-b border-[var(--border-hair)] px-4 py-2.5">
            <span className="text-sm font-semibold capitalize text-ink-100">{day}</span>
            <span className="text-xs text-ink-500">{list.length} publicação(ões)</span>
          </div>
          <div className="divide-y divide-[var(--border-hair)]">
            {list.map((p) => (
              <PlannedRow key={p.id} p={p} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlannedRow({ p }: { p: PlannedItem }) {
  return (
    <Link
      href={`/social/projetos/${p.projectId}`}
      className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-ink-850"
    >
      <div className="tnum w-12 shrink-0 font-mono text-sm text-ink-200">{timeBR(p.scheduledAt)}</div>
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-ink-950">
        {p.thumb && <MediaView asset={p.thumb} sizes="44px" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-ink-200">
          {p.caption ? p.caption.replace(/\n/g, " ") : "— sem legenda —"}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[12px] text-ink-500">
          <FormatTag badge={p.format} />
          <span className="truncate">
            {p.clientName} · @{p.igHandle} · {p.projectTitle}
          </span>
        </div>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${PUB[p.publishStatus].cls}`}>
        {PUB[p.publishStatus].label}
      </span>
      {p.assets.length > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            downloadAssets(p.assets);
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-hair)] text-ink-300 transition-colors hover:bg-ink-850 hover:text-ink-100"
          aria-label={p.assets.length > 1 ? "Baixar mídias" : "Baixar mídia"}
          title={p.assets.length > 1 ? `Baixar ${p.assets.length} mídias` : "Baixar mídia"}
        >
          <Icon name="download" size={15} />
        </button>
      )}
    </Link>
  );
}
