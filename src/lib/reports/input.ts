/** Validação do que chega do navegador nas rotas e actions do construtor. */

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const isDay = (s: unknown): s is string => typeof s === "string" && DAY.test(s) && !Number.isNaN(Date.parse(s));

/** Período válido: datas reais, início ≤ fim, no máximo ~13 meses (o histórico de mídia não vai além). */
export function validPeriod(start: unknown, end: unknown): { start: string; end: string } | null {
  if (!isDay(start) || !isDay(end) || start > end) return null;
  const days = (Date.parse(end) - Date.parse(start)) / 86_400_000;
  return days <= 400 ? { start, end } : null;
}
