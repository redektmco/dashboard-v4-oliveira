import { randomBytes } from "node:crypto";
import { all, insert, one, run } from "@/lib/db";
import type { BillingChargeRow, DispatchChannel, DispatchLogEntry, DispatchStatus } from "./types";

/** Token url-safe para o pixel de rastreio do e-mail — não-adivinhável. */
export function newTrackToken(): string {
  return randomBytes(18).toString("base64url");
}

const CHARGE_SELECT = `
  SELECT bc.id, bc.client_id, bc.description, bc.amount, bc.due_date::text AS due_date,
         bc.recurrence, bc.active, bc.created_at::text AS created_at,
         c.name AS client_name, c.billing_email, c.billing_phone
  FROM billing_charges bc
  JOIN clients c ON c.id = bc.client_id`;

function toCharge(r: {
  id: number;
  client_id: number;
  description: string;
  amount: number;
  due_date: string;
  recurrence: string;
  active: number;
  created_at: string;
  client_name: string;
  billing_email: string | null;
  billing_phone: string | null;
}): BillingChargeRow {
  return {
    id: r.id,
    clientId: r.client_id,
    description: r.description,
    amount: Number(r.amount),
    dueDate: r.due_date,
    recurrence: r.recurrence as BillingChargeRow["recurrence"],
    active: Boolean(r.active),
    createdAt: r.created_at,
    clientName: r.client_name,
    billingEmail: r.billing_email,
    billingPhone: r.billing_phone,
  };
}

/** Todas as parcelas cadastradas, mais recentes primeiro por vencimento. */
export async function listCharges(): Promise<BillingChargeRow[]> {
  const rows = await all<Parameters<typeof toCharge>[0]>(
    `${CHARGE_SELECT} ORDER BY bc.active DESC, bc.due_date ASC`,
  );
  return rows.map(toCharge);
}

export async function getCharge(id: number): Promise<BillingChargeRow | null> {
  const row = await one<Parameters<typeof toCharge>[0]>(`${CHARGE_SELECT} WHERE bc.id = ?`, [id]);
  return row ? toCharge(row) : null;
}

export async function createCharge(input: {
  clientId: number;
  description: string;
  amount: number;
  dueDate: string;
  recurrence: "unica" | "mensal";
  createdBy: number | null;
}): Promise<number> {
  return insert(
    `INSERT INTO billing_charges (client_id, description, amount, due_date, recurrence, created_by)
     VALUES (?, ?, ?, ?::date, ?, ?) RETURNING id`,
    [input.clientId, input.description, input.amount, input.dueDate, input.recurrence, input.createdBy],
  );
}

export async function updateCharge(
  id: number,
  input: { description: string; amount: number; dueDate: string; recurrence: "unica" | "mensal" },
): Promise<void> {
  await run(
    `UPDATE billing_charges SET description = ?, amount = ?, due_date = ?::date, recurrence = ? WHERE id = ?`,
    [input.description, input.amount, input.dueDate, input.recurrence, id],
  );
}

export const setChargeActive = (id: number, active: boolean) =>
  run(`UPDATE billing_charges SET active = ? WHERE id = ?`, [active ? 1 : 0, id]);

/** Avança a parcela recorrente para o próximo mês, depois de disparar. */
export const advanceMonthly = (id: number) =>
  run(`UPDATE billing_charges SET due_date = due_date + INTERVAL '1 month' WHERE id = ?`, [id]);

/** Parcelas ativas que vencem hoje (data do banco — o cron roda 0h de São Paulo). */
export async function chargesDueToday(): Promise<BillingChargeRow[]> {
  const rows = await all<Parameters<typeof toCharge>[0]>(
    `${CHARGE_SELECT} WHERE bc.active = 1 AND bc.due_date = CURRENT_DATE`,
  );
  return rows.map(toCharge);
}

export const setBillingContact = (clientId: number, email: string | null, phone: string | null) =>
  run(`UPDATE clients SET billing_email = ?, billing_phone = ? WHERE id = ?`, [email, phone, clientId]);

/** Clientes ativos com o contato de cobrança atual — para o formulário de nova cobrança. */
export async function listClientContacts(): Promise<
  { id: number; name: string; billingEmail: string | null; billingPhone: string | null }[]
> {
  const rows = await all<{ id: number; name: string; billing_email: string | null; billing_phone: string | null }>(
    `SELECT id, name, billing_email, billing_phone FROM clients WHERE active = 1 ORDER BY name`,
  );
  return rows.map((r) => ({ id: r.id, name: r.name, billingEmail: r.billing_email, billingPhone: r.billing_phone }));
}

/**
 * Reserva a linha do disparo antes de tentar enviar — o índice único em
 * (charge_id, due_date, channel) garante que o cron não manda duas vezes no
 * mesmo dia (retry da Vercel, ou disparo manual em cima do cron). `null`
 * significa que já existe um disparo hoje para essa parcela+canal.
 */
export async function reserveDispatch(input: {
  chargeId: number;
  clientId: number;
  dueDate: string;
  amount: number;
  channel: DispatchChannel;
  trackingToken: string | null;
}): Promise<number | null> {
  const rows = await all<{ id: number }>(
    `INSERT INTO billing_dispatch_log (charge_id, client_id, due_date, amount, channel, status, tracking_token)
     VALUES (?, ?, ?::date, ?, ?, 'failed', ?)
     ON CONFLICT (charge_id, due_date, channel) DO NOTHING
     RETURNING id`,
    [input.chargeId, input.clientId, input.dueDate, input.amount, input.channel, input.trackingToken],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

export const finalizeDispatch = (id: number, status: DispatchStatus, error: string | null) =>
  run(`UPDATE billing_dispatch_log SET status = ?, error = ? WHERE id = ?`, [status, error, id]);

export const markOpened = (token: string) =>
  run(`UPDATE billing_dispatch_log SET opened_at = now() WHERE tracking_token = ? AND opened_at IS NULL`, [token]);

const LOG_SELECT = `
  SELECT l.id, l.charge_id, l.client_id, l.due_date::text AS due_date, l.amount, l.channel, l.status,
         l.error, l.tracking_token, l.opened_at::text AS opened_at, l.sent_at::text AS sent_at,
         c.name AS client_name, bc.description
  FROM billing_dispatch_log l
  JOIN clients c ON c.id = l.client_id
  JOIN billing_charges bc ON bc.id = l.charge_id`;

export async function listDispatchLog(limit = 100): Promise<DispatchLogEntry[]> {
  const rows = await all<{
    id: number;
    charge_id: number;
    client_id: number;
    due_date: string;
    amount: number;
    channel: string;
    status: string;
    error: string | null;
    tracking_token: string | null;
    opened_at: string | null;
    sent_at: string;
    client_name: string;
    description: string;
  }>(`${LOG_SELECT} ORDER BY l.sent_at DESC LIMIT ?`, [limit]);
  return rows.map((r) => ({
    id: r.id,
    chargeId: r.charge_id,
    clientId: r.client_id,
    clientName: r.client_name,
    description: r.description,
    dueDate: r.due_date,
    amount: Number(r.amount),
    channel: r.channel as DispatchChannel,
    status: r.status as DispatchStatus,
    error: r.error,
    trackingToken: r.tracking_token,
    openedAt: r.opened_at,
    sentAt: r.sent_at,
  }));
}
