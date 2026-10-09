"use client";

import { useEffect, useRef, useState } from "react";
import { COLUMNS, OPTIONAL_COLUMNS, type ColumnId } from "@/lib/crm/columns";
import { activeFilterCount, EMPTY_FILTERS, type Filters } from "@/lib/crm/views";
import { STAGE_LABEL, type Stage } from "@/lib/model/types";
import { FilterSelect } from "../churn/controls";
import { Icon } from "../icon";

/**
 * Barra de filtros. Os cinco primeiros ficam à vista porque são os que o
 * time usa toda semana; o resto mora em "Mais filtros" para a barra não
 * virar um painel. Todos se combinam — quem decide isso é `matchesFilters`.
 */

export function CrmFilters({
  filters,
  onChange,
  accounts,
  gts,
  columns,
  onColumns,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  accounts: string[];
  gts: string[];
  columns: ColumnId[];
  onColumns: (c: ColumnId[]) => void;
}) {
  const [more, setMore] = useState(false);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });
  const extra = [filters.source, filters.targets, filters.billing, filters.entry, filters.interaction].filter(Boolean).length;

  const people = (list: string[]) => [{ value: "", label: "Todos" }, ...list.map((n) => ({ value: n, label: n }))];

  return (
    <div className="flex flex-col gap-2">
      <div className="no-scrollbar -mx-4 flex items-center gap-2 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
        <label className="relative h-8 w-[200px] shrink-0 lg:w-[240px]">
          <Icon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500" />
          <input
            value={filters.q}
            onChange={(e) => set("q", e.target.value)}
            placeholder="Buscar empresa…"
            aria-label="Buscar empresa"
            className="field h-8 w-full pl-8 text-[13px]"
          />
          {filters.q && (
            <button
              type="button"
              onClick={() => set("q", "")}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-100"
            >
              <Icon name="x" size={13} />
            </button>
          )}
        </label>

        <FilterSelect
          icon="user"
          label="Account"
          value={filters.account}
          onChange={(v) => set("account", v)}
          options={people(accounts)}
          active={Boolean(filters.account)}
        />
        <FilterSelect
          icon="target"
          label="GT"
          value={filters.gt}
          onChange={(v) => set("gt", v)}
          options={people(gts)}
          active={Boolean(filters.gt)}
        />
        <FilterSelect
          icon="handshake"
          label="Etapa"
          value={filters.stage}
          onChange={(v) => set("stage", v as Stage | "")}
          options={[
            { value: "", label: "Todas" },
            ...(Object.keys(STAGE_LABEL) as Stage[]).map((s) => ({ value: s, label: STAGE_LABEL[s] })),
          ]}
          active={Boolean(filters.stage)}
        />
        <FilterSelect
          icon="webhook"
          label="Fonte"
          value={filters.source}
          onChange={(v) => set("source", v)}
          options={[
            { value: "" as const, label: "Todas" },
            { value: "com" as const, label: "Conectada" },
            { value: "sem" as const, label: "Sem fonte" },
          ]}
          active={Boolean(filters.source)}
        />

        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors ${
            more || extra ? "border-[var(--border-strong)] bg-ink-800 text-ink-100" : "border-[var(--border-hair)] text-ink-300 hover:bg-ink-850"
          }`}
        >
          <Icon name="filter" size={13} />
          Mais filtros
          {extra > 0 && <span className="tnum rounded-full bg-v4-red px-1.5 text-[10px] font-semibold text-ink-100">{extra}</span>}
        </button>

        <span className="flex-1" />

        {activeFilterCount(filters) > 0 || filters.q ? (
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_FILTERS })}
            className="shrink-0 text-[12px] text-ink-400 hover:text-ink-100"
          >
            Limpar filtros
          </button>
        ) : null}

        <ColumnPicker columns={columns} onChange={onColumns} />
      </div>

      {more && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-hair)] bg-ink-950 p-2.5">
          <FilterSelect
            icon="target"
            label="Forecast"
            value={filters.targets}
            onChange={(v) => set("targets", v)}
            options={[
              { value: "" as const, label: "Todas" },
              { value: "definidas" as const, label: "Definidas" },
              { value: "pendentes" as const, label: "Pendentes" },
            ]}
            active={Boolean(filters.targets)}
          />
          <FilterSelect
            icon="receipt"
            label="Cobrança"
            value={filters.billing}
            onChange={(v) => set("billing", v)}
            options={[
              { value: "" as const, label: "Todas" },
              { value: "com" as const, label: "Com parcela ativa" },
              { value: "sem" as const, label: "Sem cobrança" },
              { value: "sem_canal" as const, label: "Não sai por nenhum canal" },
            ]}
            active={Boolean(filters.billing)}
          />
          <FilterSelect
            icon="calendar"
            label="Entrada"
            value={filters.entry}
            onChange={(v) => set("entry", v)}
            options={[
              { value: "" as const, label: "Qualquer data" },
              { value: "30" as const, label: "Últimos 30 dias" },
              { value: "90" as const, label: "Últimos 90 dias" },
              { value: "365" as const, label: "Último ano" },
            ]}
            active={Boolean(filters.entry)}
          />
          <FilterSelect
            icon="messageCircle"
            label="Última interação"
            value={filters.interaction}
            onChange={(v) => set("interaction", v)}
            options={[
              { value: "" as const, label: "Qualquer" },
              { value: "7" as const, label: "Até 7 dias" },
              { value: "30" as const, label: "Até 30 dias" },
              { value: "60" as const, label: "Até 60 dias" },
              { value: "nunca" as const, label: "Sem registro" },
            ]}
            active={Boolean(filters.interaction)}
          />
        </div>
      )}
    </div>
  );
}

/* --------------------- personalizar colunas ------------------------ */

function ColumnPicker({ columns, onChange }: { columns: ColumnId[]; onChange: (c: ColumnId[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (id: ColumnId, on: boolean) =>
    onChange(on ? [...columns, id] : columns.filter((c) => c !== id));

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Personalizar colunas"
        className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--border-hair)] text-ink-400 transition-colors hover:bg-ink-850 hover:text-ink-100"
      >
        <Icon name="sliders" size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-[232px] rounded-lg border border-[var(--border-strong)] bg-ink-800 p-1.5 shadow-[var(--shadow-2)]">
          <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-500">Colunas adicionais</p>
          {OPTIONAL_COLUMNS.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-ink-200 hover:bg-ink-850">
              <input
                type="checkbox"
                checked={columns.includes(c.id)}
                onChange={(e) => toggle(c.id, e.target.checked)}
                className="h-4 w-4 shrink-0 cursor-pointer appearance-none rounded border border-[var(--border-strong)] bg-ink-950 checked:border-v4-red checked:bg-v4-red"
              />
              {c.label}
            </label>
          ))}
          <div className="my-1 h-px bg-[var(--border-hair)]" />
          <button
            type="button"
            onClick={() => onChange(COLUMNS.filter((c) => c.core).map((c) => c.id))}
            className="w-full rounded-md px-2 py-1.5 text-left text-[12px] text-ink-400 hover:bg-ink-850 hover:text-ink-100"
          >
            Voltar ao padrão
          </button>
        </div>
      )}
    </div>
  );
}
