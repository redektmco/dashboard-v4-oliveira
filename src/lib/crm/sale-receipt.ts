import { one, run } from "../db";

export type SaleReceipt = {
  id: number;
  counted: boolean;
  value: number;
  refDate: string;
  receivedAt: string;
  receivedDate: string;
};
type ReceiptRow = { id: number; value: number; ref_date: string; received_at: string; received_date: string };
const receiptColumns = `id, value, ref_date::text AS ref_date, received_at::text AS received_at,
  (received_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS received_date`;

/** A replay returns the original receipt, without changing its date, value or payload. */
export async function recordSaleReceipt(
  clientId: number, refDate: string, dedupKey: string | null, value: number, payload: unknown,
): Promise<SaleReceipt> {
  const inserted = await one<ReceiptRow>(
    `INSERT INTO crm_sales (client_id, ref_date, dedup_key, value, payload)
     VALUES (?, ?::date, ?, ?, ?::jsonb)
     ON CONFLICT (client_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING
     RETURNING ${receiptColumns}`,
    [clientId, refDate, dedupKey, value, JSON.stringify(payload ?? {})],
  );
  // Separate SELECT sees a concurrent winner after INSERT's conflict wait.
  const receipt = inserted ?? await one<ReceiptRow>(
    `SELECT ${receiptColumns} FROM crm_sales WHERE client_id = ? AND dedup_key = ?`, [clientId, dedupKey],
  );
  if (!receipt) throw new Error("Não foi possível recuperar o recebimento da venda.");
  await run("UPDATE crm_integrations SET last_sale_at = now() WHERE client_id = ?", [clientId]);
  return {
    id: Number(receipt.id), counted: inserted !== null, value: Number(receipt.value),
    refDate: receipt.ref_date, receivedAt: new Date(receipt.received_at).toISOString(), receivedDate: receipt.received_date,
  };
}
