/** Situação operacional não é a etapa comercial (onboarding/retenção/etc.). */
export const CLIENT_STATUSES = ["active", "paused", "closed", "pending"] as const;
export type ClientStatus = typeof CLIENT_STATUSES[number];
export const STATUS_LABEL: Record<ClientStatus | "legacy_inactive", string> = {
  active: "Ativo", paused: "Pausado", closed: "Encerrado", pending: "Aguardando início",
  legacy_inactive: "Inativo · situação a confirmar",
};
export const REVENUE_MODELS = ["recurring", "one_off", "mixed"] as const;
export type RevenueModel = typeof REVENUE_MODELS[number];
export const REVENUE_LABEL: Record<RevenueModel, string> = {
  recurring: "Recorrente", one_off: "Pontual (fora do MRR)", mixed: "Misto (somente parcela recorrente no MRR)",
};
type Contract = { active: number | boolean; mrr: number; lifecycle_status?: ClientStatus | null; revenue_model?: RevenueModel | null };
export function clientStatus(c: Pick<Contract, "active" | "lifecycle_status">): ClientStatus | "legacy_inactive" {
  if (!c.active && (!c.lifecycle_status || c.lifecycle_status === "active")) return "legacy_inactive";
  return c.lifecycle_status ?? "active";
}
export const isCurrentClient = (c: Pick<Contract, "active" | "lifecycle_status">) => Boolean(c.active) && clientStatus(c) === "active";
/** Mantém o valor declarado legado; não infere natureza pelo nome do serviço. */
export const recurringMrr = (c: Pick<Contract, "mrr" | "revenue_model">) => c.revenue_model === "one_off" ? 0 : Math.max(0, Number(c.mrr) || 0);
export const currentMrr = (c: Contract) => isCurrentClient(c) ? recurringMrr(c) : 0;

export function validateClassification(input: { status: string; revenueModel: string; mrr: number; source: string; confirmed: boolean }): string | null {
  if (input.status && !CLIENT_STATUSES.includes(input.status as ClientStatus)) return "Escolha uma situação válida.";
  if (input.revenueModel && !REVENUE_MODELS.includes(input.revenueModel as RevenueModel)) return "Escolha a natureza da receita.";
  if (!Number.isFinite(input.mrr) || input.mrr < 0) return "MRR deve ser um valor válido, maior ou igual a zero.";
  if (input.source.trim().length < 5) return "Informe a fonte confiável (contrato, confirmação do responsável ou documento).";
  if (input.source.trim().length > 500) return "A fonte deve ter até 500 caracteres.";
  if (!input.confirmed) return "Confirme a conferência da fonte antes de alterar o cadastro.";
  return null;
}
