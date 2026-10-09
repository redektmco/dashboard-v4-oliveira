import { DIMENSIONS, fieldByKey, fieldsFor } from "./model/catalog";
import { bandOf, daysBetween, type ScoreConfig, type WeightMap } from "./model/scoring";
import type { Band, DimensionKey, ScoreResult } from "./model/types";
import type { ClientRow, Plan, SeriesPoint, Snap, TargetChange } from "./repo";
import type { AuditEntry } from "./audit";

/**
 * Tudo o que a ficha do cliente mostra, derivado do que já está no banco:
 * status da conta, próximas ações, diagnóstico por dimensão, risco
 * principal, eventos do gráfico e a linha do tempo. Puro — recebe os dados
 * carregados e devolve o modelo de tela, sem tocar no banco.
 */

export const BAND_LABEL: Record<Band, string> = { verde: "Saudável", amarelo: "Atenção", vermelho: "Crítico" };

export const DIM_SHORT: Record<DimensionKey, string> = {
  performance: "Performance",
  relationship: "Relacionamento",
  lead_quality: "Lead / MQL",
  financial: "Financeiro",
  operational: "Operacional",
};

const RISK_TEXT: Record<DimensionKey, string> = {
  performance: "A performance está abaixo da meta estabelecida",
  relationship: "O relacionamento com o cliente está abaixo do esperado",
  lead_quality: "A qualidade dos leads está abaixo do esperado",
  financial: "O financeiro da conta (adimplência e renovação) está em risco",
  operational: "A operação (tracking, entregas e campanhas) está abaixo do esperado",
};

export const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const firstName = (n: string | null | undefined) => (n ? n.trim().split(/\s+/)[0] : "—");
const fmt1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const addDays = (iso: string, n: number) => {
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Hora local de São Paulo de um timestamp do banco, "14:20". */
const SP = "America/Sao_Paulo";
const toDate = (ts: string) => new Date(ts.includes("T") || ts.includes(" ") ? ts.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00") : ts + "T12:00:00");
export const hhmm = (ts: string) =>
  toDate(ts).toLocaleTimeString("pt-BR", { timeZone: SP, hour: "2-digit", minute: "2-digit" });
export const localDay = (ts: string) => toDate(ts).toLocaleDateString("en-CA", { timeZone: SP });

/* ------------------------------ check-ins ------------------------------ */

const CHECKIN_KEYS = ["q1_satisfaction", "q2_climate", "q3_trust", "q4_lead_quality", "q5_engagement", "q6_expectation"];

export type CheckinRow = {
  id: number;
  day: string;
  by: string | null;
  /** Média das seis perguntas, 1–5 (inteiro para os pontinhos). */
  nota: number | null;
  title: string;
  note: string;
  band: Band;
  risk: string | null;
  answers: { key: string; label: string; value: number | null }[];
  attendance: string | null;
  paymentOk: boolean | null;
  summary: string;
};

function splitSummary(text: string): [string, string] {
  const t = text.trim();
  if (!t) return ["", ""];
  const lines = t.split(/\n+/);
  if (lines.length > 1) return [lines[0].trim(), lines.slice(1).join(" ").trim()];
  const m = t.match(/^(.{8,90}?[.!?])\s+(.+)$/);
  return m ? [m[1].replace(/[.!?]$/, ""), m[2]] : [t, ""];
}

export function checkinRow(c: Snap): CheckinRow {
  const vals = CHECKIN_KEYS.map((k) => {
    const n = Number(c.data[k]);
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
  });
  const present = vals.filter((v): v is number => v !== null);
  const avg = present.length ? present.reduce((a, b) => a + b, 0) / present.length : null;
  const risk = c.data.risk_flag ? String(c.data.risk_note || "Risco explícito marcado") : null;
  const band: Band = risk || (avg !== null && avg < 3) ? "vermelho" : avg !== null && avg >= 4 ? "verde" : "amarelo";
  const [t, n] = splitSummary(String(c.data.summary ?? ""));
  const fallbackTitle = risk ? "Risco explícito na conversa" : band === "verde" ? "Conta estável" : band === "amarelo" ? "Pontos de atenção" : "Relação em risco";
  const lowest = CHECKIN_KEYS.map((k, i) => ({ k, v: vals[i] }))
    .filter((x) => x.v !== null)
    .sort((a, b) => (a.v as number) - (b.v as number))[0];
  const fallbackNote = risk
    ? risk
    : lowest && (lowest.v as number) < 4
      ? `Menor nota: ${fieldByKey(lowest.k)?.label ?? lowest.k} (${lowest.v})`
      : "Sem pendências críticas";
  return {
    id: c.id,
    day: c.ref_date,
    by: c.filler,
    nota: avg === null ? null : Math.round(avg),
    title: t || fallbackTitle,
    note: n || (t ? "" : fallbackNote),
    band,
    risk,
    answers: CHECKIN_KEYS.map((k, i) => ({ key: k, label: fieldByKey(k)?.label ?? k, value: vals[i] })),
    attendance: (c.data.attendance as string) ?? null,
    paymentOk: typeof c.data.payment_ok === "boolean" ? (c.data.payment_ok as boolean) : null,
    summary: String(c.data.summary ?? ""),
  };
}

/* --------------------------- próximas ações --------------------------- */

export type NextAction = {
  id: string;
  title: string;
  status: "Atrasada" | "Hoje" | "Pendente";
  owner: string;
  due: string;
  kind: "performance" | "checkin" | "plano" | "metas";
  href?: string;
  planId?: number;
  quick: string;
};

function dueStatus(due: string, at: string): NextAction["status"] {
  return due < at ? "Atrasada" : due === at ? "Hoje" : "Pendente";
}

export function nextActions(input: {
  client: ClientRow;
  at: string;
  lastCheckin: Snap | null;
  plans: Plan[];
  config: ScoreConfig;
  hasTargets: boolean;
}): NextAction[] {
  const { client, at, config } = input;
  const out: NextAction[] = [];

  // Check-in: o agendado manda; sem agenda, vence quando o último fica velho.
  const scheduled = client.next_checkin_at;
  const due = scheduled
    ? localDay(scheduled)
    : input.lastCheckin
      ? addDays(input.lastCheckin.ref_date, config.checkinMaxAgeDays)
      : at;
  if (scheduled || daysBetween(at, due) <= 14) {
    const st = dueStatus(due, at);
    const time = scheduled ? ` · ${hhmm(scheduled).replace(/:00$/, "h")}` : "";
    out.push({
      id: "checkin",
      title: "Realizar check-in",
      status: st,
      owner: firstName(client.account_name),
      due: st === "Atrasada" ? `Venceu ${ddmm(due)}` : `Até ${ddmm(due)}${time}`,
      kind: "checkin",
      href: `/account/${client.id}`,
      quick: "Agendar",
    });
  }

  if (!input.hasTargets)
    out.push({
      id: "metas",
      title: "Definir o forecast da conta",
      status: "Pendente",
      owner: firstName(client.gt_name),
      due: "Sem forecast, sem score",
      kind: "metas",
      href: `/gt?c=${client.id}`,
      quick: "Definir",
    });

  for (const p of input.plans.filter((x) => x.status === "aberto" || x.status === "em_andamento")) {
    const st = p.due_date ? dueStatus(p.due_date, at) : "Pendente";
    out.push({
      id: `plan-${p.id}`,
      title: p.risk,
      status: st,
      owner: firstName(p.owner),
      due: p.due_date ? (st === "Atrasada" ? `Venceu ${ddmm(p.due_date)}` : `Até ${ddmm(p.due_date)}`) : "Sem prazo",
      kind: "plano",
      planId: p.id,
      quick: "Revisar",
    });
  }

  const rank = { Atrasada: 0, Hoje: 1, Pendente: 2 };
  return out.sort((a, b) => rank[a.status] - rank[b.status]);
}

/* ------------------------------ diagnóstico ------------------------------ */

export type DimView = {
  key: DimensionKey;
  label: string;
  short: string;
  score: number | null;
  band: Band | null;
  indicators: number;
  delta: number | null;
  weight: number;
  /** Quanto a dimensão tira do score cheio: peso efetivo × distância de 100. */
  loss: number;
};

export function dimensionViews(s: ScoreResult, series: SeriesPoint[], config: ScoreConfig, accountType: ClientRow["account_type"], at: string): DimView[] {
  const ref = addDays(at, -7);
  const past = [...series].reverse().find((p) => p.day <= ref);
  return s.dimensions.map((d) => {
    const prev = past?.dims[d.key];
    const score = d.score;
    return {
      key: d.key,
      label: d.label,
      short: DIM_SHORT[d.key],
      score,
      band: score === null ? null : bandOf(score, config),
      indicators: fieldsFor(accountType).filter((f) => f.dimension === d.key).length,
      delta: score !== null && prev != null ? Math.round(score - Number(prev)) : null,
      weight: d.weight,
      loss: score === null ? 0 : (d.effectiveWeight / 100) * (100 - score),
    };
  });
}

export type MainRisk = { dim: DimView; text: string; meta: number; gap: number };

export function mainRisk(dims: DimView[], config: ScoreConfig): MainRisk | null {
  const worst = dims.filter((d) => d.score !== null && d.score < config.greenFloor).sort((a, b) => b.loss - a.loss)[0];
  if (!worst || worst.score === null) return null;
  return {
    dim: worst,
    text: `${RISK_TEXT[worst.key]} e representa atualmente o maior impacto negativo no Health Score.`,
    meta: config.greenFloor,
    gap: Math.round(worst.score) - config.greenFloor,
  };
}

/* ---------------------------- status da conta ---------------------------- */

export type AccountStatus = { headline: string; tone: Band | null; summary: string; short: string };

export function accountStatus(s: ScoreResult, dims: DimView[], config: ScoreConfig): AccountStatus {
  const issues: string[] = [];
  const perf = dims.find((d) => d.key === "performance");
  if (perf && perf.band && perf.band !== "verde" && (perf.delta ?? 0) <= 0) issues.push("queda de performance");
  for (const o of s.overrides) {
    if (o.trigger === "Flag de risco explícito") issues.push("risco explícito no último check-in");
    else if (o.trigger === "Inadimplência") issues.push("inadimplência registrada");
    else if (o.trigger === "Tracking quebrado") issues.push("tracking quebrado");
  }
  const pAge = s.provenance.performance.ageDays;
  if (pAge === null) issues.push("performance nunca preenchida");
  else if (pAge > config.perfMaxAgeDays) issues.push(`campos importantes sem atualização há ${pAge} dias`);
  const cAge = s.provenance.checkin.ageDays;
  if (cAge === null) issues.push("nenhum check-in registrado");
  else if (cAge > config.checkinMaxAgeDays) issues.push(`check-in atrasado há ${cAge - config.checkinMaxAgeDays} dias`);

  const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`);
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

  if (s.score === null)
    return { headline: "Sem dados suficientes", tone: null, summary: "Ainda não há preenchimento para calcular o score desta conta.", short: "Sem preenchimento para calcular o score." };
  if (s.band === "verde" && !issues.length)
    return {
      headline: "Conta saudável",
      tone: "verde",
      summary: "Todas as leituras recentes estão dentro do esperado. Siga o ritual de acompanhamento.",
      short: "Leituras recentes dentro do esperado.",
    };
  return {
    headline: s.band === "verde" ? "Ponto de atenção" : "Atenção necessária",
    tone: s.band === "verde" ? "amarelo" : s.band,
    summary: issues.length ? `A conta apresenta ${list(issues)}.` : "Uma ou mais dimensões estão abaixo da faixa saudável.",
    short: issues.length ? `${cap(list(issues))}.` : "Dimensões abaixo da faixa saudável.",
  };
}

/* ------------------------------ eventos ------------------------------ */

export type EventKind = "checkin" | "meta" | "queda" | "plano" | "performance" | "outro";

export type AccountEvent = {
  day: string;
  kind: EventKind;
  title: string;
  detail: string;
  by: string | null;
  at: string;
};

const TARGET_LABEL = (key: string) => {
  const f = fieldsFor("lead_gen").concat(fieldsFor("ecommerce"), fieldsFor("branding")).find((x) => x.targetKey === key);
  return f?.label ?? key;
};
const fmtTarget = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: v % 1 === 0 ? 0 : 1, minimumFractionDigits: v % 1 === 0 ? 0 : 1 });

/** Meta mudou de verdade: o GT regrava as metas a cada semana, então só conta valor diferente. */
export function targetChanges(history: TargetChange[]) {
  const asc = [...history].reverse();
  const last = new Map<string, number>();
  const out: { day: string; at: string; key: string; from: number | null; to: number; by: string | null }[] = [];
  for (const t of asc) {
    const prev = last.get(t.key);
    const v = Number(t.value);
    if (prev === undefined || prev !== v) {
      if (prev !== undefined) out.push({ day: localDay(t.created_at), at: t.created_at, key: t.key, from: prev, to: v, by: t.by });
      last.set(t.key, v);
    }
  }
  return out.reverse();
}

export function accountEvents(input: {
  series: SeriesPoint[];
  perf: Snap[];
  checkins: Snap[];
  plans: Plan[];
  targets: TargetChange[];
  audit: AuditEntry[];
  perfDropDetail: Map<string, string>;
}): AccountEvent[] {
  const events: AccountEvent[] = [];
  const scoreOn = new Map(input.series.map((p) => [p.day, p.score]));
  const prevScore = (day: string) => {
    const before = input.series.filter((p) => p.day < day && p.score !== null);
    return before.length ? before[before.length - 1].score : null;
  };

  for (const c of input.checkins) {
    const r = checkinRow(c);
    events.push({
      day: c.ref_date,
      kind: "checkin",
      title: "Check-in registrado",
      detail: `${r.nota !== null ? `Nota ${r.nota}/5 · ` : ""}${r.title}`,
      by: c.filler,
      at: c.filled_at,
    });
  }

  for (const p of input.perf) {
    if (!p.id) continue;
    const day = localDay(p.filled_at);
    const before = prevScore(day);
    const after = scoreOn.get(day) ?? null;
    const detail =
      before !== null && after !== null && Math.abs(after - before) >= 0.1
        ? `Health Score ${after < before ? "caiu" : "subiu"} de ${fmt1(before)} para ${fmt1(after)}`
        : `Semana de ${ddmm(p.ref_date)}`;
    events.push({ day, kind: "performance", title: "Performance atualizada", detail, by: p.filler, at: p.filled_at });
  }

  for (const t of targetChanges(input.targets)) {
    events.push({
      day: t.day,
      kind: "meta",
      title: "Forecast alterado",
      detail: `Meta de ${TARGET_LABEL(t.key)} revisada de ${fmtTarget(t.from!)} para ${fmtTarget(t.to)}`,
      by: t.by,
      at: t.at,
    });
  }

  for (const p of input.plans) {
    const n = p.tasks.length;
    events.push({
      day: localDay(p.created_at),
      kind: "plano",
      title: "Plano de ação criado",
      detail: `${p.risk}${n ? ` · ${n} ${n === 1 ? "tarefa" : "tarefas"}` : ""}`,
      by: p.created_by_name,
      at: p.created_at,
    });
  }

  // Queda de performance: a dimensão perde 5+ pontos de um dia para o outro.
  for (let i = 1; i < input.series.length; i++) {
    const a = input.series[i - 1].dims.performance;
    const b = input.series[i].dims.performance;
    if (a == null || b == null) continue;
    const drop = Number(b) - Number(a);
    if (drop <= -5) {
      const day = input.series[i].day;
      events.push({
        day,
        kind: "queda",
        title: "Queda de performance",
        detail: `Performance −${Math.round(-drop)} pts${input.perfDropDetail.get(day) ? ` · ${input.perfDropDetail.get(day)}` : ""}`,
        by: null,
        at: day + "T12:00:00",
      });
    }
  }

  for (const a of input.audit) {
    if (a.kind === "meta" || a.kind === "plano") continue; // já entram acima
    events.push({ day: localDay(a.at), kind: "outro", title: a.text, detail: "", by: a.user_name, at: a.at });
  }

  // Dia primeiro (é o que a tela mostra), hora como desempate.
  return events.sort((x, y) => (x.day !== y.day ? (x.day < y.day ? 1 : -1) : x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
}

/** Dias de queda de performance (para buscar o indicador que puxou a queda). */
export function perfDropDays(series: SeriesPoint[]): string[] {
  const out: string[] = [];
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1].dims.performance;
    const b = series[i].dims.performance;
    if (a != null && b != null && Number(b) - Number(a) <= -5) out.push(series[i].day);
  }
  return out;
}

export const weightsOf = (w: WeightMap) => DIMENSIONS.map((d) => ({ key: d.key, weight: w[d.key] ?? d.defaultWeight }));
