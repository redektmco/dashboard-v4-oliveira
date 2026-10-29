import { all } from "../db";
import type { CrmPeriodTotals } from "../performance/overview";

/**
 * A ficha usa dias exatos, não ref_date (que fecha a semana-ritual).
 * Um evento às 01h UTC ainda pertence ao dia anterior em São Paulo.
 * Histórico permanece legível mesmo se a integração for desativada.
 */
export async function crmPeriodTotals(clientId: number, since: string, until: string): Promise<CrmPeriodTotals> {
  const params = [since, until, clientId];
  const [[leads], [sales]] = await Promise.all([
    all<{ total: number; n: number }>(
      `SELECT count(*)::int AS total,
              (count(*) FILTER (WHERE (received_at AT TIME ZONE 'America/Sao_Paulo')::date
                BETWEEN ?::date AND ?::date))::int AS n
       FROM crm_leads WHERE client_id = ?`, params,
    ),
    all<{ total: number; n: number; revenue: number }>(
      `SELECT count(*)::int AS total,
              (count(*) FILTER (WHERE (received_at AT TIME ZONE 'America/Sao_Paulo')::date
                BETWEEN ?::date AND ?::date))::int AS n,
              COALESCE(sum(value) FILTER (WHERE (received_at AT TIME ZONE 'America/Sao_Paulo')::date
                BETWEEN ?::date AND ?::date), 0) AS revenue
       FROM crm_sales WHERE client_id = ?`, [since, until, since, until, clientId],
    ),
  ]);
  return {
    leads: leads.total > 0 ? Number(leads.n) : null,
    sales: sales.total > 0 ? Number(sales.n) : null,
    revenue: sales.total > 0 ? Number(sales.revenue) : null,
  };
}
