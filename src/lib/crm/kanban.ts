import type { CrmRow } from "./board";
import { STAGE_LABEL, type Stage } from "../model/types";

/**
 * As colunas do kanban de Clientes — puro, sem React e sem banco.
 *
 * Cada agrupamento diz quais colunas existem e em qual delas cada cliente
 * cai. Os que dá para arrastar (etapa, Account, GT) mudam o cadastro; os
 * outros (saúde, renovação) são lidos do que já existe e só se olham.
 */

export type GroupBy = "etapa" | "saude" | "account" | "gt" | "renovacao";

export const GROUP_BY: { id: GroupBy; label: string }[] = [
  { id: "etapa", label: "Etapa" },
  { id: "saude", label: "Saúde" },
  { id: "account", label: "Account" },
  { id: "gt", label: "GT" },
  { id: "renovacao", label: "Renovação" },
];

/** Arrastar entre colunas muda o cliente — só onde a coluna é um campo editável. */
export const DRAGGABLE: Record<GroupBy, boolean> = {
  etapa: true,
  saude: false,
  account: true,
  gt: true,
  renovacao: false,
};

export type LaneTone = "azul" | "verde" | "amarelo" | "vermelho" | "ink";
export type Lane = { key: string; label: string; tone: LaneTone };

/** A coluna de quem não tem Account/GT. */
export const NONE = "__sem";

const STAGE_TONE: Record<Stage, LaneTone> = {
  onboarding: "azul",
  estavel: "ink",
  expansao: "verde",
  renovacao: "amarelo",
  retencao: "vermelho",
};

const HEALTH_LANES: Lane[] = [
  { key: "verde", label: "Saudáveis", tone: "verde" },
  { key: "amarelo", label: "Em atenção", tone: "amarelo" },
  { key: "vermelho", label: "Em risco", tone: "vermelho" },
  { key: NONE, label: "Sem score", tone: "ink" },
];

const RENEWAL_LANES: Lane[] = [
  { key: "vencida", label: "Vencida", tone: "vermelho" },
  { key: "30", label: "Até 30 dias", tone: "amarelo" },
  { key: "90", label: "31 a 90 dias", tone: "azul" },
  { key: "mais", label: "Mais de 90 dias", tone: "verde" },
  { key: NONE, label: "Sem data", tone: "ink" },
];

function renewalLane(days: number | null): string {
  if (days === null) return NONE;
  if (days < 0) return "vencida";
  if (days <= 30) return "30";
  if (days <= 90) return "90";
  return "mais";
}

/** Em qual coluna o cliente cai. */
export function laneOf(by: GroupBy, r: CrmRow): string {
  switch (by) {
    case "etapa":
      return r.stage;
    case "saude":
      return r.band ?? NONE;
    case "account":
      return r.accountName ?? NONE;
    case "gt":
      return r.gtName ?? NONE;
    case "renovacao":
      return renewalLane(r.renewalIn);
  }
}

/**
 * As colunas, na ordem em que aparecem. Para Account e GT, `people` são os
 * usuários do papel — todos viram coluna, mesmo sem cliente, para dar onde
 * soltar o cartão. Nome que só existe nos clientes (usuário removido) também
 * entra, senão o cliente sumiria do quadro.
 */
export function lanesFor(by: GroupBy, rows: CrmRow[], people: string[]): Lane[] {
  switch (by) {
    case "etapa":
      return (Object.keys(STAGE_LABEL) as Stage[]).map((s) => ({ key: s, label: STAGE_LABEL[s], tone: STAGE_TONE[s] }));
    case "saude":
      return HEALTH_LANES;
    case "renovacao":
      return RENEWAL_LANES;
    case "account":
    case "gt": {
      const names = new Set(people);
      for (const r of rows) {
        const n = laneOf(by, r);
        if (n !== NONE) names.add(n);
      }
      const sorted = [...names].sort((a, b) => a.localeCompare(b, "pt-BR"));
      return [
        ...sorted.map((n) => ({ key: n, label: n, tone: "ink" as const })),
        { key: NONE, label: by === "account" ? "Sem Account" : "Sem GT", tone: "ink" },
      ];
    }
  }
}
