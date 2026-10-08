"use client";

import { Icon, type IconName } from "../icon";

/**
 * Filtro "chave: valor ▾" das listas do churn — um `<select>` nativo
 * vestido de pílula (acessível e bom no celular).
 */
export function FilterSelect<T extends string>({
  icon,
  label,
  value,
  options,
  onChange,
  active,
}: {
  icon?: IconName;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  /** Destaca o filtro quando ele está aplicado. */
  active?: boolean;
}) {
  const current = options.find((o) => o.value === value)?.label ?? "";
  return (
    <label
      className={`relative flex h-8 min-w-0 max-w-full shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors ${
        active ? "border-[var(--border-strong)] bg-ink-800" : "border-[var(--border-hair)] hover:bg-ink-850"
      }`}
    >
      {icon && <Icon name={icon} size={13} className="text-ink-500" />}
      <span className="shrink-0 text-ink-500">{label}</span>
      <span className={`truncate ${active ? "text-ink-100" : "text-ink-300"}`}>{current}</span>
      <Icon name="chevronDown" size={12} className="text-ink-500" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="absolute inset-0 cursor-pointer opacity-0"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Chip de filtro rápido com contador. */
export function CountChip({
  active,
  onClick,
  label,
  count,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  dot?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-[30px] shrink-0 items-center gap-1.5 rounded-lg px-[11px] text-[13px] transition-colors ${
        active ? "bg-ink-800 text-ink-100" : "text-ink-300 hover:bg-ink-850 hover:text-ink-100"
      }`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {label}
      <span className="tnum text-ink-500">{count}</span>
    </button>
  );
}

/** Interruptor compacto (28×16). */
export function Switch({
  checked,
  onChange,
  label,
  name,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  name?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${checked ? "bg-ink-100" : "bg-ink-700"}`}
    >
      {name && checked && <input type="hidden" name={name} value="on" />}
      <span
        className={`absolute top-0.5 h-3 w-3 rounded-full transition-all ${checked ? "left-[14px] bg-ink-950" : "left-0.5 bg-ink-300"}`}
      />
    </button>
  );
}

/** Exporta linhas como CSV (separador ;, abre direto no Excel em pt-BR). */
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
