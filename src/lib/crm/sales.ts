import { all, one } from "../db";

export const SALES_PAGE_SIZE = 25;
export type Sale = { id: number; receivedAt: string; externalId: string | null; value: number; referenceWeek: string };
export type SalesResult = { rows: Sale[]; count: number; revenue: number; ticket: number | null; page: number; pages: number };

export function salesPage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^[1-9]\d*$/.test(raw)) return 1;
  const page = Number(raw);
  return Number.isSafeInteger(page) ? page : 1;
}

/** Read-only: received day in São Paulo, never the ritual reference week. */
export async function listSales(clientId: number, since: string, until: string, requestedPage = 1): Promise<SalesResult> {
  const where = `client_id = ? AND (received_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ?::date AND ?::date`;
  const params = [clientId, since, until];
  const totals = await one<{ count: number; revenue: number }>(
    `SELECT count(*)::int AS count, COALESCE(sum(value), 0) AS revenue FROM crm_sales WHERE ${where}`, params,
  );
  const count = Number(totals?.count ?? 0);
  const revenue = Number(totals?.revenue ?? 0);
  const pages = Math.max(1, Math.ceil(count / SALES_PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
  const rows = await all<{ id: number; received_at: string; dedup_key: string | null; value: number; ref_date: string }>(
    `SELECT id, received_at::text, dedup_key, value, ref_date::text FROM crm_sales WHERE ${where}
     ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?`, [...params, SALES_PAGE_SIZE, (page - 1) * SALES_PAGE_SIZE],
  );
  return { rows: rows.map(r => ({ id: Number(r.id), receivedAt: r.received_at, externalId: r.dedup_key, value: Number(r.value), referenceWeek: r.ref_date })), count, revenue, ticket: count ? revenue / count : null, page, pages };
}
