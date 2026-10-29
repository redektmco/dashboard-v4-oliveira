/** Atualiza somente campos de vendas; não rejuvenesce ou apaga métricas de mídia. */
export function mergeLiveSales(base: Record<string, unknown>, sales: Record<string, number>, hasCurrentMedia: boolean, period: string): Record<string, unknown> {
  return {
    ...base,
    ...sales,
    // Sem custo da mesma semana, não reutilizar ROAS/ROI antigos nem assumir verba zero.
    roas_real: hasCurrentMedia ? sales.roas_real ?? null : null,
    roi_real: hasCurrentMedia ? sales.roi_real ?? null : null,
    crm_sales_period: period,
  };
}
