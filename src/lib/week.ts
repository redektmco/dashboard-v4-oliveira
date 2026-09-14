/**
 * Dia fixo do ritual do GT (briefing 3 e 10.4). Sexta-feira por padrão —
 * trocar aqui (ou por HEALTHSCORE_RITUAL_DAY=0..6) muda o ritual inteiro.
 */
export const RITUAL_DAY = Number(process.env.HEALTHSCORE_RITUAL_DAY ?? 5); // 0=dom … 5=sex

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Última ocorrência do dia do ritual, incluindo hoje. */
export function currentRitualDate(from = new Date()): string {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  const diff = (d.getDay() - RITUAL_DAY + 7) % 7;
  d.setDate(d.getDate() - diff);
  return isoDay(d);
}

/**
 * Sexta que FECHA a semana-ritual em que `from` cai — o próximo dia de ritual
 * ≥ `from`. É a âncora que o GT usa ao preencher a semana (default do form),
 * então um lead recebido em qualquer dia da semana cai no mesmo `ref_date` que
 * o snapshot manual daquela semana. Contraste com `currentRitualDate`, que
 * devolve a sexta que já passou (a semana que fechou).
 */
export function ritualWeekEnd(from: string | Date = new Date()): string {
  const d = typeof from === "string" ? new Date(from + "T12:00:00") : new Date(from);
  d.setHours(12, 0, 0, 0);
  const diff = (RITUAL_DAY - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return isoDay(d);
}

export const RITUAL_LABEL = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][
  RITUAL_DAY
];

export function weekLabel(ref: string): string {
  const end = new Date(ref + "T12:00:00");
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  const f = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${f(start)} – ${f(end)}`;
}
