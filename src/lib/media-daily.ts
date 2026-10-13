/**
 * Verba diária de mídia (Meta e Google) e o recorte "mês até hoje" — o mesmo
 * do relatório mensal: do dia 1 até hoje. Regras puras, sem rede nem banco.
 */

const shift = (day: string, n: number) => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const firstOfMonth = (day: string) => day.slice(0, 8) + "01";

/**
 * Dias que o sync regrava: os últimos `days` dias ou o mês inteiro de ontem
 * (o que for mais longo), até hoje — hoje vem parcial e é regravado no
 * próximo sync.
 */
export function dailySyncRange(today: string, days = 14): { since: string; until: string } {
  const back = shift(today, -days);
  const month = firstOfMonth(shift(today, -1));
  return { since: month < back ? month : back, until: today };
}

/**
 * "Mês até hoje" visto em `at`: do dia 1 a `at`. No dia 1 o mês ainda não
 * tem dia fechado e a verba sairia zerada — aí vale o mês anterior inteiro.
 * `closedDays` = dias já fechados (sem hoje), a base da verba contratada
 * proporcional.
 */
export function monthToDate(at: string): { since: string; until: string; closedDays: number; previous: boolean } {
  const day = Number(at.slice(8, 10));
  if (day === 1) {
    const until = shift(at, -1);
    return { since: firstOfMonth(until), until, closedDays: Number(until.slice(8, 10)), previous: true };
  }
  return { since: firstOfMonth(at), until: at, closedDays: day - 1, previous: false };
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
 * Soma do "mês até hoje" visto em `at`, ou null se algum dia fechado não foi
 * sincronizado em todas as contas ativas — aí o score volta para a semana do
 * ritual em vez de mostrar uma soma incompleta. O dia de hoje pode faltar
 * (o sync ainda não rodou): conta como zero.
 */
export function monthSpend(d: DailySpend | undefined, at: string): number | null {
  if (!d || !d.accounts) return null;
  const { since, until } = monthToDate(at);
  let total = 0;
  for (let day = since; day <= until; day = shift(day, 1)) {
    const hit = d.byDay.get(day);
    if (day === at && !hit) continue;
    if (!hit || hit.accounts < d.accounts) return null;
    total += hit.spend;
  }
  return Math.round(total * 100) / 100;
}

/** Verba contratada da semana proporcional aos dias fechados do recorte. */
export function monthTarget(weekly: number, at: string): number {
  return Math.round(((weekly / 7) * monthToDate(at).closedDays) * 100) / 100;
}

/** "Mês até hoje · 01/10 – 13/10" (ou "Mês anterior · …" no dia 1). */
export function monthLabel(at: string): string {
  const { since, until, previous } = monthToDate(at);
  const f = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  return `${previous ? "Mês anterior" : "Mês até hoje"} · ${f(since)} – ${f(until)}`;
}
