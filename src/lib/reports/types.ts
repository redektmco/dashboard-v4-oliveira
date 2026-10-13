/**
 * Construtor de relatórios (o "Reportei" da unidade): o documento que o
 * editor monta e que o link público, o modo apresentação e o PDF desenham.
 *
 * O documento é JSON puro, gravado inteiro em `rp_reports.doc`. Cada página
 * é uma grade de 12 colunas por N linhas (N depende do formato) e cada bloco
 * ocupa um retângulo dessa grade — é o que deixa arrastar e redimensionar
 * "no encaixe", como no Elementor, sem um bloco cair meio pixel fora do lugar.
 *
 * Os números NÃO moram no documento: o bloco guarda só *qual* métrica mostrar
 * (ou o valor digitado à mão). O valor sai do banco na hora de desenhar, pelo
 * período e cliente do relatório — por isso um modelo serve a qualquer cliente.
 */

export type ReportFormat = "a4" | "slide";

export const FORMAT_LABEL: Record<ReportFormat, string> = {
  a4: "Relatório (A4 em pé)",
  slide: "Apresentação (16:9)",
};

/** Medidas da página em px (96 dpi): A4 = 210×297 mm; slide = 1280×720. */
export const PAGE: Record<ReportFormat, { w: number; h: number; rows: number }> = {
  a4: { w: 794, h: 1123, rows: 26 },
  slide: { w: 1280, h: 720, rows: 16 },
};

export const COLS = 12;
/** Margem interna da página e respiro entre blocos, em px da página. */
export const PAGE_PAD = 32;
export const GAP = 10;

export type Theme = { mode: "dark" | "light"; accent: string };
export const DEFAULT_THEME: Theme = { mode: "dark", accent: "#e50914" };

/* ------------------------------ métricas ------------------------------ */

/** De onde vem o número: Meta + Google somados, ou um canal só. */
export type Source = "all" | "meta" | "google";
export const SOURCE_LABEL: Record<Source, string> = {
  all: "Meta + Google",
  meta: "Meta Ads",
  google: "Google Ads",
};

export type MetricKey =
  | "spend"
  | "impressions"
  | "reach"
  | "clicks"
  | "ctr"
  | "cpc"
  | "cpm"
  | "leads"
  | "cpl"
  | "conversations"
  | "purchases"
  | "revenue"
  | "roas"
  | "ticket"
  | "crm_leads";

/** Como o número é escrito. `x` = multiplicador (ROAS 3,2x). */
export type NumberFormat = "int" | "decimal" | "currency" | "percent" | "x";

/* ------------------------------- blocos ------------------------------- */

/** Fundo do bloco: transparente, cartão do tema ou a cor de destaque. */
export type Surface = "none" | "card" | "accent";
export type Align = "left" | "center" | "right";

type Base = { id: string; x: number; y: number; w: number; h: number };

export type HeadingBlock = Base & {
  type: "heading";
  text: string;
  size: "xl" | "lg" | "md" | "sm";
  align: Align;
  color?: string;
  surface: Surface;
};

export type TextBlock = Base & {
  type: "text";
  text: string;
  size: "sm" | "md" | "lg";
  align: Align;
  color?: string;
  surface: Surface;
};

/** Valor digitado à mão — para o que o banco não tem (orgânico, balcão…). */
export type Manual = { value: number | null; previous: number | null; format: NumberFormat };

export type KpiBlock = Base & {
  type: "kpi";
  label: string;
  metric: MetricKey;
  source: Source;
  mode: "auto" | "manual";
  manual: Manual;
  showDelta: boolean;
  surface: Surface;
};

export type ChartBlock = Base & {
  type: "chart";
  title: string;
  kind: "line" | "bar" | "donut";
  metric: MetricKey;
  source: Source;
  /** Semana a semana, ou Meta x Google lado a lado. */
  by: "week" | "channel";
  mode: "auto" | "manual";
  /** Modo manual: uma linha por ponto, "Rótulo; valor". */
  manualText: string;
  manualFormat: NumberFormat;
  surface: Surface;
};

export type TableBlock = Base & {
  type: "table";
  title: string;
  metrics: MetricKey[];
  source: Source;
  rows: "week" | "channel";
  mode: "auto" | "manual";
  /** Modo manual: colado da planilha (tab) ou separado por ";". 1ª linha = cabeçalho. */
  manualText: string;
  surface: Surface;
};

export type FunnelBlock = Base & {
  type: "funnel";
  title: string;
  steps: MetricKey[];
  source: Source;
  mode: "auto" | "manual";
  manualText: string;
  surface: Surface;
};

export type GoalBlock = Base & {
  type: "goal";
  label: string;
  metric: MetricKey;
  source: Source;
  /** `auto`: a meta semanal do cliente (`client_targets`) × semanas do período. */
  targetMode: "auto" | "manual";
  target: number | null;
  surface: Surface;
};

export type ScoreBlock = Base & { type: "score"; label: string; surface: Surface };

export type ImageBlock = Base & {
  type: "image";
  url: string;
  fit: "cover" | "contain";
  radius: number;
};

export type LogoBlock = Base & { type: "logo"; variant: "full" | "symbol"; align: Align };

export type ShapeBlock = Base & {
  type: "shape";
  color: string;
  radius: number;
  opacity: number;
};

export type Block =
  | HeadingBlock
  | TextBlock
  | KpiBlock
  | ChartBlock
  | TableBlock
  | FunnelBlock
  | GoalBlock
  | ScoreBlock
  | ImageBlock
  | LogoBlock
  | ShapeBlock;

export type BlockType = Block["type"];

export type Page = { id: string; blocks: Block[]; background?: string };

export type ReportDoc = { version: 1; theme: Theme; pages: Page[] };

/* ------------------------------ registro ------------------------------ */

export type Report = {
  id: string;
  kind: "report" | "template";
  clientId: number | null;
  clientName: string | null;
  title: string;
  format: ReportFormat;
  periodStart: string | null;
  periodEnd: string | null;
  doc: ReportDoc;
  shareToken: string | null;
  /** Última sincronização com Meta e Google (null = só o banco). */
  live: LiveSnapshot | null;
  createdByName: string | null;
  updatedAt: string;
  createdAt: string;
};

/* -------------------------------- dados ------------------------------- */

/** Números de um canal numa semana-ritual. */
export type ChannelNums = {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  leads: number;
  conversations: number;
  purchases: number;
  revenue: number;
  /**
   * Verba só das campanhas que geraram lead (ou conversa, pela métrica da
   * conta) — a base do CPL, como no score. Campanha de alcance ou de visita
   * ao Instagram não entra.
   */
  leadSpend: number;
};

/** Uma semana (ou trecho de 7 dias) do período: `start` a `ref`. */
export type WeekRow = { ref: string; start: string; meta: ChannelNums; google: ChannelNums; crmLeads: number };

/**
 * De onde vieram os números: `live` = lidos na hora das APIs da Meta e do
 * Google para o período exato (botão Sincronizar); `db` = semanas-ritual que o
 * sync diário gravou no banco; `sample` = exemplo (modelo sem cliente).
 */
export type DataSource =
  | { kind: "live"; at: string; errors: { account: string; error: string }[] }
  | { kind: "db" }
  | { kind: "sample" };

/** O que o "Sincronizar" grava no relatório: os números do período exato. */
export type LiveSnapshot = {
  clientId: number;
  start: string;
  end: string;
  at: string;
  weeks: WeekRow[];
  prevWeeks: WeekRow[];
  errors: { account: string; error: string }[];
};

export type Band = "verde" | "amarelo" | "vermelho";

/**
 * "Leads contam de" do cliente — a mesma regra do score. `campaign` (padrão)
 * = conversão das campanhas; `webhook` = leads do CRM (semana sem lead no
 * CRM usa a campanha); `both` = a soma dos dois.
 */
export type LeadRule = "campaign" | "webhook" | "both";

/** Tudo que os blocos leem, calculado uma vez por (cliente, período). */
export type ReportData = {
  client: { id: number; name: string } | null;
  period: { start: string; end: string };
  previous: { start: string; end: string };
  weeks: WeekRow[];
  prevWeeks: WeekRow[];
  score: { value: number | null; band: Band | null; day: string | null };
  /** Metas semanais vigentes no fim do período (`client_targets`). */
  targets: Record<string, number>;
  /** "Leads contam de" do cliente: decide o que é Lead no total (Meta + Google). */
  leadSource: LeadRule;
  /** Números de exemplo (modelo sem cliente): o editor avisa. */
  sample: boolean;
  source: DataSource;
};
