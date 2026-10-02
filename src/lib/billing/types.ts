// ============================================================
// Cobrança — invoice automático mensal por cliente.
// ============================================================

export type BillingRecurrence = "unica" | "mensal" | "trimestral" | "anual";

export const RECURRENCE_LABEL: Record<BillingRecurrence, string> = {
  unica: "Única",
  mensal: "Mensal",
  trimestral: "Trimestral",
  anual: "Anual",
};

/** Meses entre um disparo e o próximo (0 = cobrança única). */
export const RECURRENCE_MONTHS: Record<BillingRecurrence, number> = { unica: 0, mensal: 1, trimestral: 3, anual: 12 };
export type DispatchChannel = "email" | "whatsapp";
export type DispatchStatus = "sent" | "failed";

export interface BillingCharge {
  id: number;
  clientId: number;
  description: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  recurrence: BillingRecurrence;
  active: boolean;
  createdAt: string;
}

export type BillingChargeRow = BillingCharge & {
  clientName: string;
  billingEmail: string | null;
  billingPhone: string | null;
};

export interface DispatchLogEntry {
  id: number;
  chargeId: number;
  clientId: number;
  clientName: string;
  description: string;
  dueDate: string;
  amount: number;
  channel: DispatchChannel;
  status: DispatchStatus;
  error: string | null;
  trackingToken: string | null;
  openedAt: string | null;
  sentAt: string;
}

export interface DispatchSummary {
  checked: number;
  sent: number;
  failed: number;
  skipped: number;
}
