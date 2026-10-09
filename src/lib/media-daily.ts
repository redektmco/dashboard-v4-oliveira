/**
 * Verba diária de mídia (Meta e Google) e o recorte "últimos 7 dias" — o
 * mesmo do Google Ads e do Gerenciador da Meta: os 7 dias fechados até
 * ontem, sem o dia de hoje. Regras puras, sem rede nem banco.
 */

const shift = (day: string, n: number) => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Dias fechados que o sync regrava: os `days` dias até ontem. */
export function dailySyncRange(today: string, days = 14): { since: string; until: string } {
  return { since: shift(today, -days), until: shift(today, -1) };
}

/** "Últimos 7 dias" vistos em `at`: de at-7 a at-1. */
export function last7(at: string): { since: string; until: string } {
  return { since: shift(at, -7), until: shift(at, -1) };
}

/**
 * Um valor por dia de `since` a `until`, com zero no dia que a API não
 * devolveu (sem entrega não volta linha — e verba parada é sinal).
 */
export function fillDays(since: string, until: string, spend: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (let d = since; d <= until; d = shift(d, 1)) out.set(d, Math.round((spend.get(d) ?? 0) * 100) / 100);
  return out;
}

/** Verba diária de um cliente, somando as contas ativas: `accounts` = quantas contas cobrem cada dia. */
export type DailySpend = { accounts: number; byDay: Map<string, { spend: number; accounts: number }> };

/**
 * Soma dos últimos 7 dias vistos em `at`, ou null se algum dia não foi
 * sincronizado em todas as contas ativas — aí o score volta para a semana
 * do ritual em vez de mostrar uma soma incompleta.
 */
export function rollingSpend(d: DailySpend | undefined, at: string): number | null {
  if (!d || !d.accounts) return null;
  const { since, until } = last7(at);
  let total = 0;
  for (let day = since; day <= until; day = shift(day, 1)) {
    const hit = d.byDay.get(day);
    if (!hit || hit.accounts < d.accounts) return null;
    total += hit.spend;
  }
  return Math.round(total * 100) / 100;
}

/** "02/10 – 08/10" */
export function last7Label(at: string): string {
  const { since, until } = last7(at);
  const f = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  return `Últimos 7 dias · ${f(since)} – ${f(until)}`;
}
