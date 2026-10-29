import { fieldsFor } from "../model/catalog";
import { applicableField } from "../model/services";
import { fmtBR, targetFields, type TargetField } from "../model/target-fields";
import type { AccountType, ScoreResult } from "../model/types";

/**
 * Forecast × realizado de uma conta, indicador a indicador — a mesma leitura
 * que o score faz. Usado na ficha do cliente e em Performance, para as duas
 * telas mostrarem o mesmo número com o mesmo rótulo (antes a ficha tinha
 * "metas por período" à parte e Performance o forecast semanal).
 */
export type ForecastLine = {
  /** Chave da meta (`client_targets.key`). */
  key: string;
  label: string;
  /** Forecast vigente formatado; `null` = não definido. */
  target: string | null;
  /** Realizado como o score leu (semana em curso ou mês até hoje na verba). */
  actual: string | null;
  /** Nota 0–100 do indicador no score; `null` = fora do cálculo. */
  score: number | null;
  /** Recorte do realizado quando não é a semana ("out até hoje"). */
  period?: string;
  /** Por que está fora do cálculo, quando está. */
  note?: string;
};

export const fmtTarget = (f: TargetField, v: number) => `${f.prefix ? `${f.prefix} ` : ""}${fmtBR(v, f.decimals)}${f.suffix ?? ""}`;

export function forecastLines(type: AccountType, targets: Record<string, number>, score: ScoreResult | null, services?: string[]): ForecastLine[] {
  const defs = fieldsFor(type, "gt").filter((f) => applicableField(f.key, services));
  const results = new Map((score?.dimensions ?? []).flatMap((d) => d.fields).map((f) => [f.key, f]));
  return targetFields(type).filter((f) => defs.some((d) => d.targetKey === f.key)).map((f) => {
    const def = defs.find((d) => d.targetKey === f.key);
    const r = def ? results.get(def.key) : undefined;
    return {
      key: f.key,
      label: f.label,
      target: targets[f.key] !== undefined ? fmtTarget(f, targets[f.key]) : null,
      actual: r?.actual ?? null,
      score: r?.score ?? null,
      period: r?.period,
      note: r?.score === null ? r?.note : undefined,
    };
  });
}

/** Tom do atingimento, nas bandas do score. */
export const lineTone = (score: number | null, green = 75, yellow = 55) =>
  score === null ? "neutro" : score >= green ? "verde" : score >= yellow ? "amarelo" : "vermelho";
