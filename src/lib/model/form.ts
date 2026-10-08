import { fieldsFor } from "./catalog";
import type { AccountType } from "./types";

export type Getter = (key: string) => string;

export function toNumber(raw: string): number | null {
  const v = raw.trim().replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

/**
 * Traduz o formulário do GT em um snapshot. Pura de propósito: é a
 * fronteira onde o input humano vira dado, então precisa ser testável.
 */
export function parsePerformanceForm(
  accountType: AccountType,
  get: Getter,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const f of fieldsFor(accountType, "gt")) {
    const i = f.input;
    if (i.kind === "pair") {
      data[i.realKey] = toNumber(get(i.realKey));
      data[i.metaKey] = toNumber(get(i.metaKey));
    } else if (i.kind === "number") {
      data[i.key] = toNumber(get(i.key));
    } else if (i.kind === "bool") {
      data[i.key] = get(i.key) === "sim";
    } else if (i.kind === "tri") {
      data[i.key] = get(i.key);
    }
  }
  data.note = get("note");
  return data;
}

/** Traduz o check-in do Account em um snapshot. */
export function parseCheckinForm(get: Getter): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  // Os campos do Account são iguais para todo tipo de conta.
  for (const f of fieldsFor("lead_gen", "account")) {
    const i = f.input;
    if (i.kind === "scale5") data[i.key] = toNumber(get(i.key));
    // "nv" = não verificado: fica em branco (sem nota), não vira "não".
    else if (i.kind === "bool") data[i.key] = get(i.key) === "nv" ? null : get(i.key) === "sim";
    else if (i.kind === "tri") data[i.key] = get(i.key);
    else if (i.kind === "date") data[i.key] = get(i.key) || null;
  }
  // "nao_sei": o Account não sabe dizer — não força banda nem descarta o risco.
  data.risk_flag = get("risk_flag") === "nao_sei" ? null : get("risk_flag") === "sim";
  data.risk_note = get("risk_note");
  data.summary = get("summary");
  return data;
}
