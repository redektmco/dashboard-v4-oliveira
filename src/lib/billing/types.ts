// ============================================================
// Cobrança — invoice automático mensal por cliente.
// ============================================================

export type BillingRecurrence = "unica" | "mensal";
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
