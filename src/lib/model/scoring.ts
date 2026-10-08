import { DIMENSIONS, fieldsFor } from "./catalog";
import type {
  AccountType,
  Band,
  Confidence,
  DimensionKey,
  DimensionResult,
  FieldDef,
  FieldResult,
  OverrideHit,
  ScoreResult,
} from "./types";

/* ------------------------------------------------------------------ */
/* Configuração de cálculo — briefing 5.4 / 5.5 / 10.5                 */
/* ------------------------------------------------------------------ */

export type ScoreConfig = {
  /** Bandas — briefing 5.3 */
  greenFloor: number;
  yellowFloor: number;
  /** Frescor do dado — briefing 5.5 */
  perfMaxAgeDays: number;
  checkinMaxAgeDays: number;
  /** Overrides — briefing 5.4 */
  underMetaThreshold: number;
  underMetaCycles: number;
  /** Janela de alerta de renovação (dias) */
  renewalAlertDays: number;
};

export const DEFAULT_CONFIG: ScoreConfig = {
  greenFloor: 75,
  yellowFloor: 55,
  perfMaxAgeDays: 10,
  checkinMaxAgeDays: 35,
  underMetaThreshold: 50,
  underMetaCycles: 2,
  renewalAlertDays: 60,
};

export type WeightMap = Partial<Record<DimensionKey, number>>;

/* ------------------------------------------------------------------ */
/* Réguas de normalização — briefing 5.2                               */
/* ------------------------------------------------------------------ */

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Régua A — quanto maior melhor. Teto em 100: super-mês não mascara problema. */
export function ruleA(real: number, meta: number): number | null {
  if (!isFinite(real) || !isFinite(meta) || meta <= 0) return null;
  return clamp((real / meta) * 100);
}

/** Régua B — quanto menor melhor (CPL, CAC). */
export function ruleB(real: number, meta: number): number | null {
  if (!isFinite(real) || !isFinite(meta) || meta <= 0) return null;
  if (real <= 0) return null; // sem custo apurado não há o que normalizar
  return clamp((meta / real) * 100);
}

/** Régua C — escala fixa 1–5. */
export function ruleC5(n: number): number | null {
  if (!isFinite(n) || n < 1 || n > 5) return null;
  return clamp(((n - 1) / 4) * 100);
}

export function ruleBool(v: unknown): number | null {
  if (v === true || v === 1 || v === "sim" || v === "true") return 100;
  if (v === false || v === 0 || v === "nao" || v === "false") return 0;
  return null;
}

/** sim / parcial / não -> 100 / 50 / 0 */
export function ruleTri(v: unknown): number | null {
  if (v === "full" || v === 100) return 100;
  if (v === "partial" || v === 50) return 50;
  if (v === "none" || v === 0) return 0;
  return null;
}

/** Exposição de renovação: quanto mais perto, menor o colchão. */
export function ruleRenewal(daysUntil: number | null): number | null {
  if (daysUntil === null) return null;
  if (daysUntil < 0) return 25;
  if (daysUntil <= 7) return 40;
  if (daysUntil <= 30) return 55;
  if (daysUntil <= 60) return 70;
  if (daysUntil <= 90) return 85;
  return 100;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return isFinite(n) ? n : null;
}

export function daysBetween(a: string | Date, b: string | Date): number {
  const da = typeof a === "string" ? new Date(a + (a.length === 10 ? "T00:00:00" : "")) : a;
  const db = typeof b === "string" ? new Date(b + (b.length === 10 ? "T00:00:00" : "")) : b;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

const fmt = (n: number, d = 0) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Valor de exibição de um par real/meta: dinheiro compacto ("R$ 38,2 mil",
 * "R$ 84"), percentual ou número com no máximo uma casa — é o que cabe na
 * coluna Atual / Meta do drawer de indicadores.
 */
function display(n: number, label: string, decimals = 0): string {
  if (/\(R\$\)/.test(label)) {
    if (Math.abs(n) >= 10_000) return `R$ ${fmt(n / 1000, n % 1000 === 0 ? 0 : 1)} mil`;
    return `R$ ${fmt(n, Math.abs(n) < 10 && n % 1 !== 0 ? 2 : 0)}`;
  }
  if (/\(%\)/.test(label)) return `${fmt(n, 1)}%`;
  return fmt(n, Math.min(decimals, 1));
}

export const TRI_VALUES = ["full", "partial", "none"] as const;
export type TriValue = (typeof TRI_VALUES)[number];

/* ------------------------------------------------------------------ */
/* Avaliação campo a campo                                             */
/* ------------------------------------------------------------------ */

export type ScoreInput = {
  clientId: number;
  accountType: AccountType;
  today: string; // YYYY-MM-DD
  renewalDate: string | null;
  performance: {
    ref_date: string;
    filled_at: string;
    by: string | null;
    data: Record<string, unknown>;
  } | null;
  checkin: {
    ref_date: string;
    filled_at: string;
    by: string | null;
    data: Record<string, unknown>;
  } | null;
  /** Snapshots de performance anteriores ao atual, mais recente primeiro. */
  perfHistory: { ref_date: string; data: Record<string, unknown> }[];
  /**
   * Pedidos de cancelamento do cliente (módulo Churn): data do pedido e data
   * de conclusão (`null` = ainda aberto). Ameaça de cancelamento é sempre
   * Red no playbook do Account, qualquer que seja o resto do diagnóstico.
   */
  churnRequests?: { from: string; to: string | null }[];
  weights?: WeightMap;
  config?: ScoreConfig;
};

function evalField(
  f: FieldDef,
  input: ScoreInput,
): { score: number | null; raw: string; note?: string; actual?: string; target?: string } {
  const perf = input.performance?.data ?? null;
  const chk = input.checkin?.data ?? null;
  const bag = f.source === "gt" ? perf : chk;
  if (!bag) return { score: null, raw: "—", note: "sem preenchimento" };

  const i = f.input;

  switch (f.rule) {
    case "A":
    case "B": {
      if (i.kind !== "pair") return { score: null, raw: "—" };
      const real = num(bag[i.realKey]);
      const meta = num(bag[i.metaKey]);
      const d = i.decimals ?? 0;
      if (real === null || meta === null)
        return { score: null, raw: "—", note: "real ou meta em branco" };
      const score = f.rule === "A" ? ruleA(real, meta) : ruleB(real, meta);
      return {
        score,
        raw: `${fmt(real, d)} / ${fmt(meta, d)}`,
        actual: display(real, i.realLabel, d),
        target: display(meta, i.realLabel, d),
        note: score === null ? "meta inválida (zero ou vazia)" : undefined,
      };
    }
    case "RATE": {
      if (i.kind !== "pair") return { score: null, raw: "—" };
      const mql = num(bag[i.realKey]);
      const leads = num(bag["leads_real"]);
      const metaRate = num(bag[i.metaKey]);
      if (mql === null || leads === null || !leads)
        return { score: null, raw: "—", note: "sem MQL ou sem leads na semana" };
      const rate = (mql / leads) * 100;
      if (metaRate === null || metaRate <= 0)
        return {
          score: null,
          raw: `${fmt(rate, 1)}%`,
          actual: `${fmt(rate, 1)}%`,
          note: "meta de taxa de MQL não cadastrada",
        };
      return {
        score: ruleA(rate, metaRate),
        raw: `${fmt(rate, 1)}% de ${fmt(leads)} leads / meta ${fmt(metaRate, 1)}%`,
        actual: `${fmt(rate, 1)}%`,
        target: `${fmt(metaRate, 1)}%`,
      };
    }
    case "TREND": {
      if (i.kind !== "number") return { score: null, raw: "—" };
      const real = num(bag[i.key]);
      if (real === null) return { score: null, raw: "—", note: "em branco" };
      const prev = input.perfHistory
        .map((s) => num(s.data[i.key]))
        .filter((v): v is number => v !== null && v > 0)
        .slice(0, 4);
      if (!prev.length)
        return {
          score: null,
          raw: fmt(real, i.decimals ?? 0),
          actual: display(real, i.label, i.decimals ?? 0),
          note: "sem histórico — fora do cálculo",
        };
      const base = prev.reduce((a, b) => a + b, 0) / prev.length;
      return {
        score: ruleA(real, base),
        raw: `${fmt(real, i.decimals ?? 0)} vs base ${fmt(base, i.decimals ?? 0)} (${prev.length} sem.)`,
        actual: display(real, i.label, i.decimals ?? 0),
        target: display(base, i.label, i.decimals ?? 0),
      };
    }
    case "C5": {
      if (i.kind !== "scale5") return { score: null, raw: "—" };
      const n = num(bag[i.key]);
      if (n === null) return { score: null, raw: "—", note: "em branco" };
      return { score: ruleC5(n), raw: `nota ${n}`, actual: `${fmt(n)}/5`, target: "5/5" };
    }
    case "BOOL": {
      if (i.kind !== "bool") return { score: null, raw: "—" };
      const s = ruleBool(bag[i.key]);
      if (s === null) return { score: null, raw: "—", note: "em branco" };
      const label = s === 100 ? i.trueLabel : i.falseLabel;
      return { score: s, raw: label, actual: label, target: i.trueLabel };
    }
    case "TRI": {
      if (i.kind !== "tri") return { score: null, raw: "—" };
      const v = bag[i.key];
      const s = ruleTri(v);
      if (s === null) return { score: null, raw: "—", note: "em branco" };
      const idx = TRI_VALUES.indexOf(v as TriValue);
      return { score: s, raw: i.options[idx] ?? String(v), actual: i.options[idx] ?? String(v), target: i.options[0] };
    }
    case "RENEWAL": {
      const date = (bag["renewal_date"] as string | undefined) || input.renewalDate;
      if (!date) return { score: null, raw: "—", note: "data de renovação não cadastrada" };
      const d = daysBetween(input.today, date);
      return {
        score: ruleRenewal(d),
        raw: d < 0 ? `vencida há ${-d}d` : `em ${d} dias (${date})`,
        actual: d < 0 ? `vencida` : `${d} dias`,
        target: "> 90 dias",
      };
    }
    default:
      return { score: null, raw: "—" };
  }
}

/** Média ponderada renormalizando entre os itens presentes. */
function weightedMean(items: { score: number | null; weight: number }[]) {
  const present = items.filter((x) => x.score !== null && x.weight > 0);
  const total = present.reduce((a, x) => a + x.weight, 0);
  if (!total) return { score: null as number | null, total: 0 };
  const score = present.reduce((a, x) => a + (x.score as number) * x.weight, 0) / total;
  return { score, total };
}

export function bandOf(score: number, cfg: ScoreConfig = DEFAULT_CONFIG): Band {
  if (score >= cfg.greenFloor) return "verde";
  if (score >= cfg.yellowFloor) return "amarelo";
  return "vermelho";
}

/** Score da dimensão de performance de um snapshot isolado (usado no override de ciclos). */
function performanceScoreOf(
  accountType: AccountType,
  snap: { ref_date: string; data: Record<string, unknown> },
  input: ScoreInput,
): number | null {
  const fields = fieldsFor(accountType, "gt").filter((f) => f.dimension === "performance");
  const items = fields.map((f) => {
    const r = evalField(f, {
      ...input,
      performance: { ref_date: snap.ref_date, filled_at: snap.ref_date, by: null, data: snap.data },
      perfHistory: [],
    });
    return { score: r.score, weight: f.weight };
  });
  return weightedMean(items).score;
}

/* ------------------------------------------------------------------ */
/* Cálculo principal — briefing 5.3 a 5.6                              */
/* ------------------------------------------------------------------ */

export function computeScore(input: ScoreInput): ScoreResult {
  const cfg = input.config ?? DEFAULT_CONFIG;
  const weights = input.weights ?? {};
  const fields = fieldsFor(input.accountType);

  // 1) Normaliza cada campo.
  const results: FieldResult[] = fields.map((f) => {
    const r = evalField(f, input);
    return {
      key: f.key,
      label: f.label,
      dimension: f.dimension,
      source: f.source,
      rule: f.rule,
      weight: f.weight,
      effectiveWeight: 0,
      raw: r.raw,
      actual: r.actual,
      target: r.target,
      score: r.score,
      note: r.note,
      period: f.period,
    };
  });

  // 2) Média ponderada dos campos dentro de cada dimensão.
  const dimensions: DimensionResult[] = DIMENSIONS.map((d) => {
    const own = results.filter((r) => r.dimension === d.key);
    const { score, total } = weightedMean(own);
    for (const r of own) {
      r.effectiveWeight =
        r.score !== null && total > 0 ? Math.round((r.weight / total) * 1000) / 10 : 0;
    }
    return {
      key: d.key,
      label: d.label,
      weight: weights[d.key] ?? d.defaultWeight,
      effectiveWeight: 0,
      score: score === null ? null : Math.round(score * 10) / 10,
      fields: own,
    };
  });

  // 3) Média ponderada das dimensões -> score final 0–100.
  const agg = weightedMean(dimensions.map((d) => ({ score: d.score, weight: d.weight })));
  for (const d of dimensions) {
    d.effectiveWeight =
      d.score !== null && agg.total > 0 ? Math.round((d.weight / agg.total) * 1000) / 10 : 0;
  }
  const score = agg.score === null ? null : Math.round(agg.score * 10) / 10;
  const rawBand = score === null ? null : bandOf(score, cfg);

  // 4) Overrides — briefing 5.4.
  const overrides: OverrideHit[] = [];
  const chk = input.checkin?.data;
  if (chk && ruleBool(chk["payment_ok"]) === 0) {
    overrides.push({
      trigger: "Inadimplência",
      effect: "vermelho",
      detail: `Account marcou adimplência = não no check-in de ${input.checkin!.ref_date}.`,
    });
  }
  if (chk && ruleBool(chk["risk_flag"]) === 100) {
    overrides.push({
      trigger: "Flag de risco explícito",
      effect: "vermelho",
      detail: String(chk["risk_note"] || "Risco explícito marcado sem detalhe."),
    });
  }
  const churn = (input.churnRequests ?? []).find((r) => r.from <= input.today && (r.to === null || r.to > input.today));
  if (churn) {
    overrides.push({
      trigger: "Pedido de cancelamento",
      effect: "vermelho",
      detail: `Pedido de cancelamento aberto desde ${churn.from}. Ameaça de cancelamento é sempre Red.`,
    });
  }
  const perf = input.performance?.data;
  if (perf && ruleBool(perf["tracking_ok"]) === 0) {
    overrides.push({
      trigger: "Tracking quebrado",
      effect: "teto_amarelo",
      detail: "Dado cego não pode ser verde — teto de amarelo até o tracking voltar.",
    });
  }
  const cycles = [
    input.performance ? { ref_date: input.performance.ref_date, data: input.performance.data } : null,
    ...input.perfHistory,
  ]
    .filter((s): s is { ref_date: string; data: Record<string, unknown> } => s !== null)
    .slice(0, cfg.underMetaCycles);
  if (cycles.length === cfg.underMetaCycles) {
    const scores = cycles.map((s) => performanceScoreOf(input.accountType, s, input));
    if (scores.every((s) => s !== null && s < cfg.underMetaThreshold)) {
      overrides.push({
        trigger: `Performance < ${cfg.underMetaThreshold}% por ${cfg.underMetaCycles} ciclos`,
        effect: "vermelho",
        detail: cycles
          .map((c, idx) => `${c.ref_date}: ${Math.round(scores[idx]!)}`)
          .join(" · "),
      });
    }
  }

  let band = rawBand;
  if (band) {
    if (overrides.some((o) => o.effect === "vermelho")) band = "vermelho";
    else if (overrides.some((o) => o.effect === "teto_amarelo") && band === "verde") band = "amarelo";
  }

  // 5) Confiança do dado — briefing 5.5.
  const perfAge = input.performance ? daysBetween(input.performance.ref_date, input.today) : null;
  const chkAge = input.checkin ? daysBetween(input.checkin.ref_date, input.today) : null;
  const perfFresh = perfAge !== null && perfAge <= cfg.perfMaxAgeDays;
  const chkFresh = chkAge !== null && chkAge <= cfg.checkinMaxAgeDays;
  const confidence: Confidence =
    perfFresh && chkFresh ? "alta" : perfFresh || chkFresh ? "media" : "baixa";

  return {
    clientId: input.clientId,
    score,
    rawBand,
    band,
    confidence,
    dimensions,
    overrides,
    provenance: {
      performance: {
        ref_date: input.performance?.ref_date ?? null,
        filled_at: input.performance?.filled_at ?? null,
        by: input.performance?.by ?? null,
        ageDays: perfAge,
      },
      checkin: {
        ref_date: input.checkin?.ref_date ?? null,
        filled_at: input.checkin?.filled_at ?? null,
        by: input.checkin?.by ?? null,
        ageDays: chkAge,
      },
    },
  };
}
