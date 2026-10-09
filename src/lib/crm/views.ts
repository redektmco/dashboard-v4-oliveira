import type { CrmRow } from "./board";
import type { Stage } from "../model/types";

/**
 * Abas, filtros e ordenação da listagem — puro, sem React e sem banco.
 *
 * Fica aqui, e não dentro do componente, por dois motivos: dá para testar a
 * combinação de filtros sem montar a tela, e o servidor usa as mesmas regras
 * para resolver os links antigos (`?filtro=sem_meta` e companhia).
 */

/* ------------------------------ abas ------------------------------ */

export type View = "todos" | "saudaveis" | "atencao" | "risco" | "churn" | "pendencias" | "arquivados";

export const VIEWS: { id: View; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "saudaveis", label: "Saudáveis" },
  { id: "atencao", label: "Em atenção" },
  { id: "risco", label: "Em risco" },
  { id: "churn", label: "Churn solicitado" },
  { id: "pendencias", label: "Com pendências" },
  { id: "arquivados", label: "Arquivados" },
];

const VIEW_TEST: Record<View, (r: CrmRow) => boolean> = {
  todos: (r) => r.active,
  saudaveis: (r) => r.active && r.band === "verde",
  atencao: (r) => r.active && r.band === "amarelo",
  risco: (r) => r.active && r.band === "vermelho",
  churn: (r) => r.active && r.churn !== null,
  pendencias: (r) => r.active && r.pendencias.length > 0,
  arquivados: (r) => !r.active,
};

export const inView = (r: CrmRow, v: View) => VIEW_TEST[v](r);

export const countViews = (rows: CrmRow[]): Record<View, number> =>
  Object.fromEntries(VIEWS.map((v) => [v.id, rows.filter((r) => inView(r, v.id)).length])) as Record<View, number>;

/* ----------------------------- filtros ---------------------------- */

export type Filters = {
  q: string;
  /** id do usuário Account, ou "" para todos. */
  account: string;
  gt: string;
  stage: Stage | "";
  source: "" | "com" | "sem";
  targets: "" | "definidas" | "pendentes";
  billing: "" | "com" | "sem" | "sem_canal";
  /** Entrou na carteira nos últimos N dias. */
  entry: "" | "30" | "90" | "365";
  /** Última interação: até N dias, ou "nunca". */
  interaction: "" | "7" | "30" | "60" | "nunca";
};

export const EMPTY_FILTERS: Filters = {
  q: "",
  account: "",
  gt: "",
  stage: "",
  source: "",
  targets: "",
  billing: "",
  entry: "",
  interaction: "",
};

export const activeFilterCount = (f: Filters) =>
  (Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).filter((k) => k !== "q" && f[k] !== "").length;

/** Sem acento e em minúsculas — a busca não pode depender de digitar "Imobiliária". */
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

function matchesQuery(r: CrmRow, q: string) {
  const needle = norm(q.trim());
  if (!needle) return true;
  const hay = [r.name, r.segment, r.accountName, r.gtName, ...r.services].filter(Boolean).join(" ");
  return norm(hay).includes(needle);
}

const withinDays = (days: number | null, limit: number) => days !== null && days <= limit;

export function matchesFilters(r: CrmRow, f: Filters): boolean {
  if (!matchesQuery(r, f.q)) return false;
  if (f.account && r.accountName !== f.account) return false;
  if (f.gt && r.gtName !== f.gt) return false;
  if (f.stage && r.stage !== f.stage) return false;

  if (f.source === "com" && !r.leadSources.length) return false;
  if (f.source === "sem" && r.leadSources.length) return false;

  if (f.targets === "definidas" && r.targets.set === 0) return false;
  if (f.targets === "pendentes" && r.targets.set > 0) return false;

  if (f.billing === "com" && !r.charge) return false;
  if (f.billing === "sem" && r.charge) return false;
  if (f.billing === "sem_canal" && (!r.charge || r.charge.willSend)) return false;

  if (f.entry) {
    if (!r.since) return false;
    const ageDays = Math.floor((Date.now() - new Date(`${r.since}T00:00:00`).getTime()) / 86_400_000);
    if (ageDays > Number(f.entry)) return false;
  }

  if (f.interaction === "nunca") {
    if (r.lastInteraction) return false;
  } else if (f.interaction) {
    if (!withinDays(r.lastInteraction?.days ?? null, Number(f.interaction))) return false;
  }

  return true;
}

/* --------------------------- ordenação ---------------------------- */

export type SortKey = "risco" | "nome" | "score" | "mrr" | "interacao" | "renovacao";
export type SortDir = "asc" | "desc";

export const SORT_LABEL: Record<SortKey, string> = {
  risco: "risco",
  nome: "nome",
  score: "Health Score",
  mrr: "MRR",
  interacao: "última interação",
  renovacao: "renovação",
};

/** O número que cada ordenação compara. `null` = a conta não tem o dado. */
const VALUE: Record<Exclude<SortKey, "risco" | "nome">, (r: CrmRow) => number | null> = {
  score: (r) => r.score,
  mrr: (r) => r.mrr,
  // Menos dias = interação mais recente.
  interacao: (r) => r.lastInteraction?.days ?? null,
  renovacao: (r) => r.renewalIn,
};

/**
 * Quem não tem o dado vai para o fim da lista nas duas direções — inverter a
 * ordem não deve jogar as contas sem score para o topo.
 */
export function sortRows(rows: CrmRow[], key: SortKey, dir: SortDir): CrmRow[] {
  if (key === "risco") return [...rows]; // já vem ordenado por risco do servidor
  const sign = dir === "asc" ? 1 : -1;
  if (key === "nome") return [...rows].sort((a, b) => a.name.localeCompare(b.name, "pt-BR") * sign);

  const value = VALUE[key];
  const withValue: CrmRow[] = [];
  const without: CrmRow[] = [];
  for (const r of rows) (value(r) === null ? without : withValue).push(r);
  withValue.sort((a, b) => (value(a)! - value(b)!) * sign);
  return [...withValue, ...without];
}

/* ------------------- compatibilidade de URL ----------------------- */

/**
 * Os links antigos continuam valendo: `?filtro=sem_meta`, `sem_fonte`,
 * `arquivados` e `todos` são traduzidos para a aba + filtro equivalentes.
 * São disparados de Configurações, de Performance › Integrações e da ficha.
 */
export function fromLegacyFilter(filtro: string | null): { view: View; filters: Filters } {
  const base = { view: "todos" as View, filters: { ...EMPTY_FILTERS } };
  if (filtro === "sem_meta") return { view: "todos", filters: { ...EMPTY_FILTERS, targets: "pendentes" } };
  if (filtro === "sem_fonte") return { view: "todos", filters: { ...EMPTY_FILTERS, source: "sem" } };
  if (filtro === "arquivados") return { view: "arquivados", filters: { ...EMPTY_FILTERS } };
  if (VIEWS.some((v) => v.id === filtro)) return { view: filtro as View, filters: { ...EMPTY_FILTERS } };
  return base;
}

/** A lista que a tela mostra: aba, depois filtros, depois ordenação. */
export const applyAll = (rows: CrmRow[], view: View, filters: Filters, sort: SortKey, dir: SortDir) =>
  sortRows(
    rows.filter((r) => inView(r, view) && matchesFilters(r, filters)),
    sort,
    dir,
  );
