/**
 * Período da ficha do cliente — o filtro no topo da ficha vale para todas as
 * abas (Performance, Saúde, Metas, Atividades e Histórico). Mora na URL
 * (`?periodo=30d` ou `?de=2026-09-01&ate=2026-09-30`) para o link colado
 * abrir no mesmo recorte. Regras puras, sem rede nem banco.
 *
 * "Últimos N dias" segue o Gerenciador da Meta e o Google Ads: os N dias
 * fechados até ontem, sem o dia de hoje.
 */

export type PeriodPreset = "7d" | "14d" | "30d" | "90d" | "mes" | "mes-anterior";
export type PeriodKey = PeriodPreset | "custom";

export const DEFAULT_PRESET: PeriodPreset = "30d";

export const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "7d", label: "Últimos 7 dias" },
  { value: "14d", label: "Últimos 14 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" },
  { value: "mes", label: "Este mês" },
  { value: "mes-anterior", label: "Mês passado" },
];

export type FichaPeriod = {
  key: PeriodKey;
  /** "Últimos 30 dias", "Este mês", "Personalizado". */
  label: string;
  /** "13 set – 12 out". */
  range: string;
  since: string;
  until: string;
  days: number;
  /** Mesmo número de dias, logo antes — base do "Comparar". */
  previous: { since: string; until: string };
};

/** Maior intervalo aceito no personalizado (a Meta guarda 37 meses, o Google mais). */
const MAX_DAYS = 400;

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const shiftDay = (day: string, n: number) => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const daysBetween = (since: string, until: string) =>
  Math.round((Date.parse(until + "T00:00:00Z") - Date.parse(since + "T00:00:00Z")) / 86_400_000) + 1;

const validDay = (s: string | undefined | null): s is string => {
  if (!s || !ISO.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** "13 set" — com o ano quando o intervalo atravessa anos. */
function dayLabel(day: string, withYear: boolean) {
  const base = `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;
  return withYear ? `${base} ${day.slice(0, 4)}` : base;
}

export function rangeLabel(since: string, until: string): string {
  const years = since.slice(0, 4) !== until.slice(0, 4);
  if (since === until) return dayLabel(since, false);
  return `${dayLabel(since, years)} – ${dayLabel(until, years)}`;
}

function build(key: PeriodKey, label: string, since: string, until: string): FichaPeriod {
  const days = daysBetween(since, until);
  return {
    key,
    label,
    range: rangeLabel(since, until),
    since,
    until,
    days,
    previous: { since: shiftDay(since, -days), until: shiftDay(since, -1) },
  };
}

export function presetPeriod(preset: PeriodPreset, today: string): FichaPeriod {
  const label = PRESETS.find((p) => p.value === preset)!.label;
  if (preset === "mes") return build(preset, label, today.slice(0, 8) + "01", today);
  if (preset === "mes-anterior") {
    const until = shiftDay(today.slice(0, 8) + "01", -1);
    return build(preset, label, until.slice(0, 8) + "01", until);
  }
  const n = Number(preset.replace("d", ""));
  return build(preset, label, shiftDay(today, -n), shiftDay(today, -1));
}

/**
 * Lê o período da URL. Qualquer coisa inválida (data torta, fim antes do
 * início, futuro, intervalo grande demais) cai no padrão em vez de quebrar a
 * ficha.
 */
export function parsePeriod(
  sp: { periodo?: string | string[]; de?: string | string[]; ate?: string | string[] },
  today: string,
): FichaPeriod {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const de = one(sp.de);
  const ate = one(sp.ate);
  if (validDay(de) && validDay(ate) && de <= ate && ate <= today && daysBetween(de, ate) <= MAX_DAYS) {
    const preset = PRESETS.find((p) => {
      const q = presetPeriod(p.value, today);
      return q.since === de && q.until === ate;
    });
    return preset ? presetPeriod(preset.value, today) : build("custom", "Personalizado", de, ate);
  }
  const periodo = one(sp.periodo);
  const preset = PRESETS.find((p) => p.value === periodo)?.value ?? DEFAULT_PRESET;
  return presetPeriod(preset, today);
}

/** Query string do período (vazia no padrão, para a URL da ficha ficar limpa). */
export function periodQuery(p: Pick<FichaPeriod, "key" | "since" | "until">): string {
  if (p.key === "custom") return `de=${p.since}&ate=${p.until}`;
  if (p.key === DEFAULT_PRESET) return "";
  return `periodo=${p.key}`;
}

export const MAX_PERIOD_DAYS = MAX_DAYS;
