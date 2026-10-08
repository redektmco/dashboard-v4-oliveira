/**
 * Regras puras do Google Ads: normaliza o ID da conta e agrupa as linhas
 * diárias da API nas semanas-ritual (mesmo formato do Meta, para o score
 * tratar as duas mídias do mesmo jeito). Sem rede nem banco — é o que os
 * testes cobrem.
 */
import { EMPTY_WEEK, weekRange, type MetaWeek } from "../meta/metrics";

/** "124-444-3600" → "1244443600". Devolve null se não tiver 10 dígitos. */
export function normalizeCustomerId(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 10 ? digits : null;
}

/** "1244443600" → "124-444-3600" (como o Google Ads mostra). */
export const formatCustomerId = (id: string) => id.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3");

/** Linha diária da `googleAds:search` (REST: camelCase, int64 como texto). */
export type DailyRow = {
  segments?: { date?: string };
  metrics?: {
    costMicros?: string | number;
    conversions?: string | number;
    conversionsValue?: string | number;
    clicks?: string | number;
    impressions?: string | number;
  };
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Soma os dias de cada semana-ritual (a semana que fecha em `ref` vai de
 * ref-6 a ref). Semana sem linha vira zero de propósito: verba parada é
 * sinal, não lacuna — igual ao Meta.
 *
 * `conversions` do Google já é o total das ações de conversão da conta: vira
 * `leads` (conta de geração de lead) e `purchases` (e-commerce), e
 * `conversionsValue` vira receita. Fracionário (atribuição por dados) é
 * arredondado no fim da semana, não dia a dia.
 */
export function bucketDaily(rows: DailyRow[], refs: string[]): Map<string, MetaWeek> {
  const ranges = refs.map((ref) => ({ ref, ...weekRange(ref) }));
  const acc = new Map<string, { w: MetaWeek; conv: number }>(refs.map((r) => [r, { w: { ...EMPTY_WEEK }, conv: 0 }]));
  for (const row of rows) {
    const day = row.segments?.date;
    if (!day) continue;
    const hit = ranges.find((r) => day >= r.since && day <= r.until);
    if (!hit) continue;
    const a = acc.get(hit.ref)!;
    const m = row.metrics ?? {};
    a.w.spend += num(m.costMicros) / 1_000_000;
    a.w.revenue += num(m.conversionsValue);
    a.w.clicks += num(m.clicks);
    a.w.impressions += num(m.impressions);
    a.conv += num(m.conversions);
  }
  const out = new Map<string, MetaWeek>();
  for (const [ref, { w, conv }] of acc) {
    const n = Math.round(conv);
    out.set(ref, { ...w, spend: Math.round(w.spend * 100) / 100, revenue: Math.round(w.revenue * 100) / 100, leads: n, purchases: n });
  }
  return out;
}

/** Conta de anúncio de cliente listada sob a MCC. */
export type GoogleAccount = { id: string; name: string; currency: string | null };

type CustomerClientRow = {
  customerClient?: { id?: string | number; descriptiveName?: string; currencyCode?: string; manager?: boolean; status?: string };
};

/**
 * Contas de cliente (não gerentes, ativas) de uma resposta `customer_client`,
 * em ordem alfabética. Subcontas gerentes ficam de fora: elas não têm métricas.
 */
export function parseClientAccounts(rows: CustomerClientRow[]): GoogleAccount[] {
  const seen = new Set<string>();
  const out: GoogleAccount[] = [];
  for (const r of rows) {
    const c = r.customerClient;
    const id = c?.id === undefined ? null : String(c.id).replace(/\D/g, "");
    if (!c || !id || c.manager || (c.status && c.status !== "ENABLED") || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: c.descriptiveName?.trim() || `Conta ${formatCustomerId(id)}`, currency: c.currencyCode ?? null });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
