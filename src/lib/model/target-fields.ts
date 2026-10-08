import { fieldsFor } from "./catalog";
import type { AccountType } from "./types";

/** Campo de meta como os editores mostram: rótulo curto, unidade e casas. */
export type TargetField = {
  key: string;
  label: string;
  prefix?: string;
  suffix?: string;
  decimals: number;
  lowerIsBetter: boolean;
};

/** Campos de meta do tipo de conta, com rótulo curto e unidade para o painel. */
export function targetFields(type: AccountType): TargetField[] {
  return fieldsFor(type, "gt")
    .filter((f) => f.targetKey && f.input.kind === "pair")
    .map((f) => {
      const i = f.input as Extract<typeof f.input, { kind: "pair" }>;
      const money = /\(R\$\)/.test(i.realLabel);
      const pct = f.rule === "RATE" || /\(%\)/.test(i.realLabel);
      return {
        key: f.targetKey!,
        label: f.label,
        prefix: money ? "R$" : undefined,
        suffix: pct ? "%" : f.key === "roas" ? "x" : money ? undefined : "/sem.",
        decimals: i.decimals ?? 0,
        lowerIsBetter: f.rule === "B",
      };
    });
}

/** Número digitado no padrão brasileiro ("66.000", "3,0") → número. */
export function parseBR(raw: string): number | null {
  const v = raw.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const fmtBR = (n: number, d: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: n % 1 === 0 ? 0 : Math.min(d, 2) || 1, maximumFractionDigits: Math.max(d, 1) });
