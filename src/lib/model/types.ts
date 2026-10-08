// Tipos de domínio do Health Score — Unidade V4.
// Referência: briefing seções 3, 4 e 5.

export type AccountType = "lead_gen" | "ecommerce" | "branding";

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  lead_gen: "Geração de Lead",
  ecommerce: "E-commerce / Venda direta",
  branding: "Branding / Awareness / Social",
};

export type DimensionKey =
  | "performance"
  | "relationship"
  | "lead_quality"
  | "financial"
  | "operational";

export type Source = "gt" | "account";

export type Band = "verde" | "amarelo" | "vermelho";

export type Confidence = "alta" | "media" | "baixa";

/** Réguas de normalização — briefing 5.2 */
export type Rule =
  | "A" // quanto maior melhor: min(100, real/meta*100)
  | "B" // quanto menor melhor: min(100, meta/real*100)
  | "C5" // escala fixa 1–5: ((n-1)/4)*100
  | "BOOL" // sim/não -> 100/0
  | "TRI" // sim/parcial/não -> 100/50/0
  | "RATE" // taxa (a/b) comparada a uma meta de taxa
  | "TREND" // valor vs média das semanas anteriores
  | "RENEWAL"; // distância até a renovação

export type InputSpec =
  | {
      kind: "pair";
      realKey: string;
      metaKey: string;
      realLabel: string;
      metaLabel: string;
      unit?: string;
      decimals?: number;
    }
  | { kind: "number"; key: string; label: string; unit?: string; decimals?: number }
  | {
      kind: "scale5";
      key: string;
      label: string;
      /** Âncoras 1–5 desta pergunta. Sem isto, caem nas genéricas. */
      anchors?: Record<number, string>;
    }
  | { kind: "bool"; key: string; label: string; trueLabel: string; falseLabel: string }
  | {
      kind: "tri";
      key: string;
      label: string;
      options: [string, string, string]; // valores 100 / 50 / 0
    }
  | { kind: "text"; key: string; label: string; placeholder?: string }
  | { kind: "date"; key: string; label: string };

export type FieldDef = {
  key: string;
  label: string;
  /** Recorte do valor (ex.: "Total da semana"), mostrado sob o indicador. */
  period?: string;
  /**
   * Pergunta literal, na primeira pessoa, para o Account ler em voz alta na
   * call. O critério do check-in é o que o cliente responde — não o que o
   * Account deduz depois. Campos de fato objetivo não têm pergunta.
   */
  question?: string;
  /** Definição objetiva — o preenchedor reporta um fato, não interpreta. */
  definition: string;
  dimension: DimensionKey;
  source: Source;
  /** Peso dentro da dimensão (0–100 dentro do conjunto presente). */
  weight: number;
  weightRationale: string;
  rule: Rule;
  accountTypes: AccountType[] | "all";
  input: InputSpec;
  /** Chave da meta cadastrada no cliente que pré-preenche o campo. */
  targetKey?: string;
};

export type DimensionDef = {
  key: DimensionKey;
  label: string;
  source: string;
  defaultWeight: number;
  rationale: string;
};

export type Client = {
  id: number;
  name: string;
  account_type: AccountType;
  mrr: number;
  gt_user_id: number | null;
  account_user_id: number | null;
  renewal_date: string | null;
  active: number;
  created_at: string;
  /** Contrato (puxado pelo churn): número, serviços, início, fidelidade e aviso prévio. */
  contract_code: string | null;
  services: string[];
  contract_start: string | null;
  fidelity_months: number | null;
  notice_days: number | null;
};

export type User = { id: number; name: string; role: "gt" | "account" | "coord" | "social" };

export type Snapshot = {
  id: number;
  client_id: number;
  ref_date: string;
  filled_by: number | null;
  filled_at: string;
  data: Record<string, unknown>;
};

export type FieldResult = {
  key: string;
  label: string;
  dimension: DimensionKey;
  source: Source;
  rule: Rule;
  weight: number;
  /** Peso efetivo após renormalização entre campos presentes. */
  effectiveWeight: number;
  raw: string; // valor cru legível
  /** Valor atual e meta já formatados, separados (coluna Atual / Meta). */
  actual?: string;
  target?: string;
  score: number | null; // 0–100 ou null quando ausente
  note?: string;
  period?: string;
};

export type DimensionResult = {
  key: DimensionKey;
  label: string;
  weight: number;
  effectiveWeight: number;
  score: number | null;
  fields: FieldResult[];
};

export type OverrideHit = {
  trigger: string;
  effect: "vermelho" | "teto_amarelo";
  detail: string;
};

export type ScoreResult = {
  clientId: number;
  score: number | null;
  rawBand: Band | null;
  band: Band | null;
  confidence: Confidence;
  dimensions: DimensionResult[];
  overrides: OverrideHit[];
  provenance: {
    performance: { ref_date: string | null; filled_at: string | null; by: string | null; ageDays: number | null };
    checkin: { ref_date: string | null; filled_at: string | null; by: string | null; ageDays: number | null };
  };
};
