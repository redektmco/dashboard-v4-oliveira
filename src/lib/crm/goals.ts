import { all, insert, run } from "../db";
import { targetFields, type TargetField } from "../model/target-fields";
import type { AccountType } from "../model/types";
import type { Snap } from "../repo";

/**
 * Metas por período da ficha do cliente (aba Metas e integrações).
 *
 * **Isto não substitui `client_targets`.** Aquela tabela é a régua do score:
 * uma chave, um valor, valendo a partir de uma data — e o motor de cálculo
 * segue lendo só ela. O que falta ali, e vive aqui, é o *compromisso do
 * período*: "200 leads qualificados em outubro", "CPL no teto de R$ 35". Tem
 * período fechado, direção (piso ou teto) e escopo. Mexer numa não mexe na
 * outra, de propósito: mudar a meta comercial do mês não pode alterar o
 * score retroativo.
 *
 * O realizado NÃO é digitado: sai dos `performance_snapshots` que o GT já
 * preenche toda semana (`realizedIn`). Meta sem campo correspondente no
 * catálogo fica sem realizado e aparece como "sem leitura" — melhor do que
 * pedir ao time para alimentar o mesmo número duas vezes.
 */

export type GoalPeriod = "mensal" | "trimestral";
/** `piso`: quanto mais, melhor (leads). `teto`: quanto menos, melhor (CPL). */
export type GoalDirection = "piso" | "teto";

export type Goal = {
  id: number;
  client_id: number;
  /** Chave do catálogo (`TargetField.key`) quando houver — é o que liga ao realizado. */
  metric: string;
  label: string;
  direction: GoalDirection;
  target: number;
  period: GoalPeriod;
  scope: string;
  active: number;
};

export const PERIOD_LABEL: Record<GoalPeriod, string> = { mensal: "Mensal", trimestral: "Trimestral" };

const SELECT = `SELECT id, client_id, metric, label, direction, target, period, scope, active
                FROM crm_goals`;

export const listGoals = (clientId: number) =>
  all<Goal>(`${SELECT} WHERE client_id = ? AND active = 1 ORDER BY id`, [clientId]);

/** Metas de toda a carteira numa leitura — a listagem não consulta por linha. */
export const goalsByClient = async () => {
  const rows = await all<Goal>(`${SELECT} WHERE active = 1 ORDER BY client_id, id`);
  const map = new Map<number, Goal[]>();
  for (const g of rows) {
    const list = map.get(g.client_id);
    if (list) list.push(g);
    else map.set(g.client_id, [g]);
  }
  return map;
};

export type NewGoal = {
  clientId: number;
  metric: string;
  label: string;
  direction: GoalDirection;
  target: number;
  period: GoalPeriod;
  scope?: string;
};

export const addGoal = (g: NewGoal, byUserId: number | null) =>
  insert(
    `INSERT INTO crm_goals (client_id, metric, label, direction, target, period, scope, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [g.clientId, g.metric, g.label, g.direction, g.target, g.period, g.scope ?? "todas", byUserId],
  );

export const updateGoalTarget = (id: number, target: number) =>
  run(`UPDATE crm_goals SET target = ? WHERE id = ?`, [target, id]);

/** Arquiva em vez de apagar: a meta do mês passado explica o histórico. */
export const archiveGoal = (id: number) => run(`UPDATE crm_goals SET active = 0 WHERE id = ?`, [id]);

export const restoreGoal = (id: number) => run(`UPDATE crm_goals SET active = 1 WHERE id = ?`, [id]);

export const getGoal = async (id: number) => (await all<Goal>(`${SELECT} WHERE id = ?`, [id]))[0] ?? null;

/* ---------------------------- período ---------------------------- */

export type Period = {
  /** Primeiro dia, `YYYY-MM-DD`. */
  from: string;
  /** Último dia, `YYYY-MM-DD`, inclusivo. */
  to: string;
  /** "outubro" ou "Q4 2026". */
  label: string;
  /** Fração do período já decorrida, 0–1. No primeiro dia já conta 1 dia. */
  elapsed: number;
};

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/**
 * O período corrente de uma meta, a partir de um dia `YYYY-MM-DD`.
 *
 * Pura e sem fuso: recebe o dia já resolvido (`today()` do repo, que é
 * America/Sao_Paulo) e trabalha só com os números da string. Usar `new Date()`
 * aqui faria o período virar à meia-noite de Londres.
 */
export function periodOf(period: GoalPeriod, day: string): Period {
  const [y, m, d] = day.split("-").map(Number);
  const month = m - 1;
  if (period === "mensal") {
    const total = daysInMonth(y, month);
    return {
      from: iso(y, month, 1),
      to: iso(y, month, total),
      label: MONTHS[month],
      elapsed: Math.min(1, d / total),
    };
  }
  const q = Math.floor(month / 3);
  const firstMonth = q * 3;
  const lastMonth = firstMonth + 2;
  const total = daysInMonth(y, firstMonth) + daysInMonth(y, firstMonth + 1) + daysInMonth(y, lastMonth);
  let done = d;
  for (let i = firstMonth; i < month; i += 1) done += daysInMonth(y, i);
  return {
    from: iso(y, firstMonth, 1),
    to: iso(y, lastMonth, daysInMonth(y, lastMonth)),
    label: `Q${q + 1} ${y}`,
    elapsed: Math.min(1, done / total),
  };
}

/* --------------------------- realizado --------------------------- */

/**
 * O realizado da métrica no período, lido dos snapshots de performance.
 *
 * `piso` soma (leads do mês são a soma das semanas). `teto` faz média simples
 * das semanas com leitura — média de CPL ponderada por verba seria mais
 * correta, mas a verba não está no snapshot: fica a média, que é o que o
 * painel do GT já mostra.
 *
 * Devolve `null` quando nenhuma semana do período tem a chave preenchida:
 * "sem leitura" é diferente de "zero".
 */
export function realizedIn(snaps: Snap[], metric: string, p: Period, direction: GoalDirection): number | null {
  const vals: number[] = [];
  for (const s of snaps) {
    if (s.ref_date < p.from || s.ref_date > p.to) continue;
    const raw = s.data?.[metric];
    if (raw === null || raw === undefined || raw === "") continue;
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) continue;
    vals.push(n);
  }
  if (!vals.length) return null;
  const sum = vals.reduce((a, b) => a + b, 0);
  return direction === "piso" ? sum : sum / vals.length;
}

/* ----------------------------- status ---------------------------- */

export type GoalStatus = "saudavel" | "atencao" | "critico" | "sem_leitura";

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  saudavel: "Saudável",
  atencao: "Atenção",
  critico: "Risco crítico",
  sem_leitura: "Sem leitura",
};

export type GoalView = {
  goal: Goal;
  period: Period;
  /** Realizado no período. `null` quando nenhuma semana tem leitura. */
  real: number | null;
  /** Realizado ÷ meta. `null` sem leitura. */
  ratio: number | null;
  status: GoalStatus;
  /** Campo do catálogo, para formatar (R$, %, casas). */
  field: TargetField | undefined;
};

/**
 * Status da meta — e aqui está a decisão que importa.
 *
 * Meta de piso não se julga pelo valor absoluto no meio do período: 61 de 200
 * leads é 31%, e no dia 9 de outubro isso está *adiantado*, não atrasado. O
 * que vale é o ritmo — progresso ÷ fração do período decorrida. Abaixo de 70%
 * do ritmo é crítico, abaixo de 90% é atenção.
 *
 * Meta de teto é o contrário: compara o valor direto com o limite, sem ritmo
 * — estourar o CPL no dia 5 já é estourar. Até 10% acima é atenção.
 */
export function goalStatus(
  goal: Goal,
  real: number | null,
  p: Period,
): { ratio: number | null; status: GoalStatus } {
  if (real === null) return { ratio: null, status: "sem_leitura" };
  if (!Number.isFinite(goal.target) || goal.target === 0) return { ratio: null, status: "sem_leitura" };

  const ratio = real / goal.target;
  if (goal.direction === "teto") {
    return { ratio, status: ratio <= 1 ? "saudavel" : ratio <= 1.1 ? "atencao" : "critico" };
  }
  // Ritmo esperado: no dia 9 de 31, espera-se 29% da meta.
  const pace = p.elapsed > 0 ? ratio / p.elapsed : 1;
  return { ratio, status: pace >= 0.9 ? "saudavel" : pace >= 0.7 ? "atencao" : "critico" };
}

/** Junta meta + período + realizado + status, pronto para a tela. */
export function goalViews(goals: Goal[], snaps: Snap[], day: string, accountType: AccountType): GoalView[] {
  const fields = targetFields(accountType);
  return goals.map((goal) => {
    const period = periodOf(goal.period, day);
    const real = realizedIn(snaps, goal.metric, period, goal.direction);
    const { ratio, status } = goalStatus(goal, real, period);
    return { goal, period, real, ratio, status, field: fields.find((f) => f.key === goal.metric) };
  });
}

/* ------------------------- fontes de leads ------------------------ */

/**
 * Fonte de leads informada na mão — portal, indicação, orgânico.
 *
 * Meta e Google não entram aqui: saem de `mediaSplit`, com verba e CPL reais.
 * Esta tabela é para o que não tem API e o time precisa declarar, e é o que
 * explica os leads que chegam pelo webhook sem campo de origem.
 */
export type LeadSource = { id: number; client_id: number; name: string; note: string; active: number };

const SOURCE_SELECT = `SELECT id, client_id, name, note, active FROM crm_lead_sources`;

export const listLeadSources = (clientId: number) =>
  all<LeadSource>(`${SOURCE_SELECT} WHERE client_id = ? AND active = 1 ORDER BY name`, [clientId]);

export const addLeadSource = (clientId: number, name: string, note: string) =>
  insert(`INSERT INTO crm_lead_sources (client_id, name, note) VALUES (?, ?, ?) RETURNING id`, [
    clientId,
    name,
    note,
  ]);

export const archiveLeadSource = (id: number) =>
  run(`UPDATE crm_lead_sources SET active = 0 WHERE id = ?`, [id]);

export const restoreLeadSource = (id: number) =>
  run(`UPDATE crm_lead_sources SET active = 1 WHERE id = ?`, [id]);

export const getLeadSource = async (id: number) =>
  (await all<LeadSource>(`${SOURCE_SELECT} WHERE id = ?`, [id]))[0] ?? null;
