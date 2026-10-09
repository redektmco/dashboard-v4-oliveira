"use client";

import Link from "next/link";
import type { CrmRow } from "@/lib/crm/board";
import { gridTemplate, type Column } from "@/lib/crm/columns";
import type { SortDir, SortKey } from "@/lib/crm/views";
import { Icon } from "../icon";
import { Cell, ClientCell, Health, LastInteraction, NextActionCell, Pendencias, StageCell } from "./crm-cells";
import { brl } from "../ui";

/**
 * A tabela de clientes.
 *
 * Acima de 1024px é um grid cujas faixas saem das colunas visíveis; abaixo,
 * uma lista de cartões (é o que o design mostra no celular, e evita rolagem
 * horizontal numa tabela de treze colunas). As células em si vêm de
 * `crm-cells` — aqui só mora a estrutura.
 */

export function CrmTable({
  rows,
  columns,
  wide,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
  openId,
  sort,
  dir,
  onSort,
}: {
  rows: CrmRow[];
  columns: Column[];
  /** ≥1024px: desenha a tabela. Abaixo disso, cartões. */
  wide: boolean;
  selected: Set<number>;
  onToggle: (id: number, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onOpen: (id: number) => void;
  openId: number | null;
  sort: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someChecked = rows.some((r) => selected.has(r.id));

  if (!wide)
    return (
      <ul className="flex flex-col">
        {rows.map((r) => (
          <CrmCard key={r.id} row={r} checked={selected.has(r.id)} onToggle={onToggle} onOpen={onOpen} open={openId === r.id} />
        ))}
      </ul>
    );

  const template = gridTemplate(columns);
  return (
    <div>
      <div
        role="row"
        className="grid items-center gap-3 border-y border-[var(--border-hair)] bg-ink-950/40 px-4 py-2 sm:px-5"
        style={{ gridTemplateColumns: template }}
      >
        <Check checked={allChecked} indeterminate={!allChecked && someChecked} onChange={onToggleAll} label="Selecionar todos" />
        <ColHead label="Cliente e responsáveis" sortKey="nome" sort={sort} dir={dir} onSort={onSort} />
        {columns.map((c) => (
          <ColHead
            key={c.id}
            label={c.label}
            sortKey={c.sort}
            sort={sort}
            dir={dir}
            onSort={onSort}
            align={c.align}
          />
        ))}
        <span aria-hidden />
      </div>

      <ul>
        {rows.map((r) => {
          const checked = selected.has(r.id);
          const open = openId === r.id;
          return (
            <li key={r.id} className="relative border-b border-[var(--border-hair)] last:border-b-0">
              {open && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-v4-red" />}
              <div
                className={`grid items-center gap-3 px-4 transition-colors sm:px-5 ${
                  open ? "bg-ink-850" : checked ? "bg-ink-900" : "hover:bg-ink-850"
                }`}
                style={{ gridTemplateColumns: template }}
              >
                <Check checked={checked} onChange={(v) => onToggle(r.id, v)} label={`Selecionar ${r.name}`} />
                <button
                  type="button"
                  onClick={() => onOpen(r.id)}
                  className="flex min-w-0 items-center py-2.5 text-left"
                  aria-expanded={open}
                >
                  <ClientCell row={r} />
                </button>
                {columns.map((c) => (
                  <span key={c.id} className={`flex min-w-0 items-center ${c.align === "right" ? "justify-end" : ""}`}>
                    <Cell id={c.id} row={r} />
                  </span>
                ))}
                <Link
                  href={`/clientes/${r.id}`}
                  title="Abrir ficha completa"
                  className="grid h-7 w-7 place-items-center rounded-md text-ink-500 hover:bg-ink-800 hover:text-ink-100"
                >
                  <Icon name="chevronRight" size={16} />
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------------------------- cabeçalho ---------------------------- */

function ColHead({
  label,
  sortKey,
  sort,
  dir,
  onSort,
  align,
}: {
  label: string;
  sortKey?: SortKey;
  sort: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "right";
}) {
  const on = sortKey && sort === sortKey;
  const justify = align === "right" ? "justify-end" : "";
  const base = `flex min-w-0 items-center text-[10px] font-semibold uppercase tracking-[0.12em] ${justify}`;

  // `aria-sort` pertence ao columnheader, não ao botão dentro dele.
  if (!sortKey)
    return (
      <span role="columnheader" className={`${base} truncate text-ink-500`}>
        {label}
      </span>
    );
  return (
    <span role="columnheader" aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"} className={base}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`flex min-w-0 items-center gap-1 transition-colors ${on ? "text-ink-200" : "text-ink-500 hover:text-ink-300"}`}
      >
        <span className="truncate">{label}</span>
        <Icon name={on ? (dir === "asc" ? "chevronUp" : "chevronDown") : "chevronsUpDown"} size={11} />
      </button>
    </span>
  );
}

/* ---------------------------- checkbox ----------------------------- */

function Check({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = Boolean(indeterminate);
      }}
      onChange={(e) => onChange(e.target.checked)}
      className="h-[18px] w-[18px] shrink-0 cursor-pointer appearance-none rounded border border-[var(--border-strong)] bg-ink-950 transition-colors checked:border-v4-red checked:bg-v4-red indeterminate:border-v4-red indeterminate:bg-v4-red"
    />
  );
}

/* ------------------------------ cartão ----------------------------- */

function CrmCard({
  row,
  checked,
  onToggle,
  onOpen,
  open,
}: {
  row: CrmRow;
  checked: boolean;
  onToggle: (id: number, v: boolean) => void;
  onOpen: (id: number) => void;
  open: boolean;
}) {
  return (
    <li className={`relative border-b border-[var(--border-hair)] last:border-b-0 ${open ? "bg-ink-850" : ""}`}>
      {open && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-v4-red" />}
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="pt-2.5">
          <Check checked={checked} onChange={(v) => onToggle(row.id, v)} label={`Selecionar ${row.name}`} />
        </span>
        <button type="button" onClick={() => onOpen(row.id)} className="flex min-w-0 flex-1 flex-col gap-2 text-left">
          <ClientCell row={row} />
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Health row={row} />
            <span className="text-ink-700">·</span>
            <StageCell row={row} />
            <span className="text-ink-700">·</span>
            <span className="tnum text-[13px] font-medium text-ink-100">{brl(row.mrr)}</span>
            <Pendencias row={row} />
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
            <LastInteraction row={row} />
            <span className="text-ink-700">·</span>
            <NextActionCell row={row} />
          </span>
        </button>
      </div>
    </li>
  );
}

/* ------------------------------ estados ---------------------------- */

export function CrmSkeleton({ columns, wide }: { columns: Column[]; wide: boolean }) {
  const template = gridTemplate(columns);
  return (
    <ul aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="border-b border-[var(--border-hair)] last:border-b-0">
          {wide ? (
            <div className="grid items-center gap-3 px-4 py-3.5 sm:px-5" style={{ gridTemplateColumns: template }}>
              <span className="skeleton h-[18px] w-[18px] rounded" />
              <span className="flex items-center gap-2.5">
                <span className="skeleton h-8 w-8 rounded-lg" />
                <span className="flex flex-col gap-1.5">
                  <span className="skeleton h-3 w-32 rounded" />
                  <span className="skeleton h-2.5 w-24 rounded" />
                </span>
              </span>
              {columns.map((c) => (
                <span key={c.id} className="skeleton h-3 w-16 rounded" />
              ))}
              <span />
            </div>
          ) : (
            <div className="flex flex-col gap-2 px-4 py-3.5">
              <span className="skeleton h-4 w-40 rounded" />
              <span className="skeleton h-3 w-56 rounded" />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
