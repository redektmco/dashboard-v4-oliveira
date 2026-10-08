/**
 * Churn — solicitações de cancelamento já formalizadas pelo cliente. Este
 * módulo não prevê churn: ele acompanha o pedido do cliente da análise ao
 * desfecho (retido ou cancelado). Tipos e rótulos puros, sem banco — usados
 * tanto no servidor quanto nos componentes.
 */

export type ChurnStatus = "solicitado" | "em_analise" | "em_negociacao" | "agendado" | "retido" | "cancelado";
export type ChurnChannel = "email" | "whatsapp" | "call" | "reuniao" | "outro";
export type RetentionChance = "alta" | "media" | "baixa" | "nenhuma";
export type ChurnOutcome = "retido" | "retido_alteracao" | "cancelado";
export type AttemptResult = "aguardando" | "aceita" | "recusada" | "contraproposta_aceita" | "contraproposta_recusada";
export type ChurnEventKind = "abertura" | "observacao" | "contato" | "anexo" | "status" | "tentativa" | "resposta" | "conclusao";

/** Tom de cor de cada status/resultado (mapeado para as classes em `churn-ui`). */
export type ChurnTone = "cinza" | "azul" | "amarelo" | "roxo" | "verde" | "vermelho";

export const STATUS: Record<ChurnStatus, { label: string; short: string; tone: ChurnTone }> = {
  solicitado: { label: "Solicitado", short: "Solicitado", tone: "cinza" },
  em_analise: { label: "Em análise", short: "Em análise", tone: "azul" },
  em_negociacao: { label: "Em negociação", short: "Em negociação", tone: "amarelo" },
  agendado: { label: "Cancelamento agendado", short: "Agendado", tone: "roxo" },
  retido: { label: "Retido", short: "Retido", tone: "verde" },
  cancelado: { label: "Cancelado", short: "Cancelado", tone: "vermelho" },
};

/** Ordem do processo (barra de etapas). Retido/Cancelado são o desfecho. */
export const FLOW: ChurnStatus[] = ["solicitado", "em_analise", "em_negociacao", "agendado"];
export const OPEN_STATUSES: ChurnStatus[] = FLOW;
export const isOpen = (s: ChurnStatus) => OPEN_STATUSES.includes(s);

export const CHANNEL: Record<ChurnChannel, string> = {
  email: "E-mail",
  whatsapp: "WhatsApp",
  call: "Call",
  reuniao: "Reunião",
  outro: "Outro",
};

export const CHANCE: Record<RetentionChance, { label: string; tone: ChurnTone }> = {
  alta: { label: "Alta", tone: "verde" },
  media: { label: "Média", tone: "amarelo" },
  baixa: { label: "Baixa", tone: "vermelho" },
  nenhuma: { label: "Nenhuma", tone: "cinza" },
};

/** Motivos de saída (principal, secundários e motivo final). */
export const REASONS: Record<string, string> = {
  custo: "Custo / orçamento",
  resultados: "Resultados insuficientes",
  estrategia: "Mudança de estratégia",
  internalizacao: "Internalização do marketing",
  atendimento: "Atendimento / comunicação",
  concorrente: "Contratou concorrente",
  prazo: "Prazo de entrega",
  fim_operacao: "Fim da operação",
  outro: "Outro",
};
export const reasonLabel = (k: string | null | undefined) => (k ? (REASONS[k] ?? k) : "—");

/** Estratégias de retenção. */
export const STRATEGIES: Record<string, string> = {
  desconto: "Desconto temporário",
  escopo: "Ajuste de escopo",
  pausa: "Pausa temporária",
  upgrade: "Upgrade sem custo",
  troca_time: "Troca de time",
  recuperacao: "Plano de recuperação",
};
export const strategyLabel = (k: string) => STRATEGIES[k] ?? k;

export const RESULT: Record<AttemptResult, { label: string; tone: ChurnTone }> = {
  aguardando: { label: "Aguardando retorno", tone: "amarelo" },
  aceita: { label: "Aceita", tone: "verde" },
  recusada: { label: "Recusada", tone: "vermelho" },
  contraproposta_aceita: { label: "Contraproposta aceita", tone: "verde" },
  contraproposta_recusada: { label: "Contraproposta recusada", tone: "vermelho" },
};

export const OUTCOME: Record<ChurnOutcome, { label: string; short: string; tone: ChurnTone }> = {
  retido: { label: "Retido", short: "Retido", tone: "verde" },
  retido_alteracao: { label: "Retido com alteração", short: "Retido c/ alteração", tone: "verde" },
  cancelado: { label: "Cancelamento efetivado", short: "Cancelado", tone: "vermelho" },
};

export type Evidence = { name: string; url: string; size: number; at: string };
export type AttemptChange = { label: string; current: string; proposed: string; delta: string };

export type ChurnRequest = {
  id: number;
  code: string;
  client_id: number;
  client_name: string;
  client_active: number;
  account_type: string;
  /** Início do contrato (ou cadastro do cliente, se não informado). */
  client_since: string;
  status: ChurnStatus;
  requested_at: string;
  channel: ChurnChannel;
  main_reason: string;
  secondary_reasons: string[];
  justification: string;
  desired_end: string | null;
  owner_user_id: number | null;
  owner_name: string | null;
  retention_chance: RetentionChance;
  mrr: number;
  contract_code: string | null;
  services: string[];
  evidences: Evidence[];
  outcome: ChurnOutcome | null;
  final_reason: string | null;
  final_note: string | null;
  effective_end: string | null;
  new_mrr: number | null;
  client_inactivated: number;
  closed_at: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  /** Agregados para as listas. */
  attempts: number;
  attempts_open: number;
  /** Data (YYYY-MM-DD) da última mudança para o status atual. */
  status_since: string | null;
};

export type ChurnAttempt = {
  id: number;
  request_id: number;
  n: number;
  strategy: string;
  proposal: string;
  changes: AttemptChange[];
  current_mrr: number | null;
  proposed_mrr: number | null;
  owner_user_id: number | null;
  owner_name: string | null;
  due_date: string | null;
  sent_at: string;
  result: AttemptResult;
  response: string | null;
  response_kind: "resposta" | "contraproposta" | null;
  responded_at: string | null;
  created_at: string;
};

export type ChurnTask = {
  id: number;
  request_id: number;
  attempt_id: number | null;
  kind: "tarefa" | "pendencia";
  text: string;
  owner: string | null;
  due_date: string | null;
  note: string | null;
  done: number;
};

export type ChurnEvent = {
  id: number;
  request_id: number;
  at: string;
  kind: ChurnEventKind;
  title: string;
  body: string;
  data: Record<string, unknown>;
  user_name: string | null;
};

/** SC-0142: código legível da solicitação, derivado do id. */
export const churnCode = (id: number) => `SC-${String(id).padStart(4, "0")}`;

/* ------------------------------ datas ------------------------------ */

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** 18 set 2026 */
export const dateLong = (iso: string | null) =>
  iso ? `${iso.slice(8, 10)} ${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : "—";
/** 18/09/2026 */
export const dateBr = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
/** 18/09 */
export const ddmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");
/** mar/2025 */
export const monthYear = (iso: string | null) => (iso ? `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}` : "—");

export function daysUntil(from: string, to: string) {
  return Math.round((Date.parse(to + "T12:00:00Z") - Date.parse(from + "T12:00:00Z")) / 86_400_000);
}

/** "em 23 dias", "amanhã", "hoje", "atrasado 2 dias". */
export function inDays(today: string, to: string | null) {
  if (!to) return "—";
  const d = daysUntil(today, to);
  if (d === 0) return "hoje";
  if (d === 1) return "amanhã";
  if (d > 1) return `em ${d} dias`;
  return d === -1 ? "ontem" : `atrasado ${-d} dias`;
}

export function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addMonths(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** Tempo de casa: "2a 4m", "9m", "4 anos e 7 meses" (longo). */
export function tenure(from: string | null, to: string, long = false) {
  if (!from) return "—";
  const a = new Date(from + "T12:00:00Z");
  const b = new Date(to + "T12:00:00Z");
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months--;
  months = Math.max(0, months);
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (long) {
    const ys = y ? `${y} ${y === 1 ? "ano" : "anos"}` : "";
    const ms = m ? `${m} ${m === 1 ? "mês" : "meses"}` : "";
    return [ys, ms].filter(Boolean).join(" e ") || "menos de 1 mês";
  }
  return y ? `${y}a ${m}m` : `${m}m`;
}

export const monthsBetween = (from: string | null, to: string) => {
  if (!from) return null;
  const a = new Date(from + "T12:00:00Z");
  const b = new Date(to + "T12:00:00Z");
  return Math.max(0, (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()));
};

/** R$ 4.800 (sem centavos). */
export const money = (n: number | null | undefined) =>
  n == null ? "—" : `R$ ${Math.round(n).toLocaleString("pt-BR")}`;

/** R$ 58,4 mil */
export const moneyK = (n: number) =>
  Math.abs(n) >= 1000
    ? `R$ ${(n / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil`
    : money(n);
