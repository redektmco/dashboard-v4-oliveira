/**
 * Regras puras do Google Ads: normaliza o ID da conta e agrupa as linhas
 * diárias da API nas semanas-ritual (mesmo formato do Meta, para o score
 * tratar as duas mídias do mesmo jeito). Sem rede nem banco — é o que os
 * testes cobrem.
 */
import { EMPTY_WEEK, weekRange, type MetaWeek, type UnreadEvent } from "../meta/metrics";
import { fillDays } from "../media-daily";

/** "124-444-3600" → "1244443600". Devolve null se não tiver 10 dígitos. */
export function normalizeCustomerId(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 10 ? digits : null;
}

/** "1244443600" → "124-444-3600" (como o Google Ads mostra). */
export const formatCustomerId = (id: string) => id.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3");

/**
 * Linha diária da `googleAds:search` (REST: camelCase, int64 como texto) —
 * por campanha (`FROM campaign`), que é o que o vigia de ação secundária lê.
 */
export type DailyRow = {
  campaign?: { id?: string; name?: string };
  segments?: { date?: string };
  metrics?: {
    costMicros?: string | number;
    conversions?: string | number;
    conversionsValue?: string | number;
    /** "Todas as conversões": inclui as ações secundárias (fora de "Conversões"). */
    allConversions?: string | number;
    clicks?: string | number;
    impressions?: string | number;
  };
};

/** Conversão fracionária (atribuição por dados) com 1 casa — o mesmo em toda leitura. */
export const conv1 = (n: number) => Math.round(n * 10) / 10;

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Soma os dias de cada semana-ritual (a semana que fecha em `ref` vai de
 * ref-6 a ref). Semana sem linha vira zero de propósito: verba parada é
 * sinal, não lacuna — igual ao Meta.
 *
 * `conversions` do Google é a coluna "Conversões" (ações principais): vira
 * `leads` (conta de geração de lead) e `purchases` (e-commerce), e
 * `conversionsValue` vira receita. Fracionário (atribuição por dados) fica
 * com 1 casa no fim da semana. A base do CPL (`leadSpend`) é a verba toda da
 * semana, como o "Custo por lead bruto" do Google Ads.
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
  const r2 = (n: number) => Math.round(n * 100) / 100;
  for (const [ref, { w, conv }] of acc) {
    const n = conv1(conv);
    out.set(ref, { ...w, spend: r2(w.spend), revenue: r2(w.revenue), leadSpend: r2(w.spend), leads: n, purchases: n });
  }
  return out;
}

/** Linha da quebra por ação de conversão (`segments.conversion_action_name`). */
export type ActionRow = {
  campaign?: { id?: string; name?: string };
  segments?: { conversionActionName?: string };
  metrics?: { allConversions?: string | number; conversions?: string | number };
};

/**
 * Vigia do Google: campanha com verba e "Conversões" zero, mas com "Todas as
 * conversões" — a ação de lead do cliente provavelmente está como secundária
 * no Google Ads e o painel mostraria zero. Lista as ações que converteram.
 */
export function googleUnread(rows: DailyRow[], actions: ActionRow[]): UnreadEvent[] {
  const by = new Map<string, { name: string; spend: number; conv: number; all: number }>();
  for (const r of rows) {
    const id = r.campaign?.id ?? "";
    const c = by.get(id) ?? { name: r.campaign?.name || id || "campanha", spend: 0, conv: 0, all: 0 };
    c.spend += num(r.metrics?.costMicros) / 1_000_000;
    c.conv += num(r.metrics?.conversions);
    c.all += num(r.metrics?.allConversions);
    by.set(id, c);
  }
  const out: UnreadEvent[] = [];
  for (const [id, c] of by) {
    if (c.spend <= 0 || c.conv > 0 || c.all <= 0) continue;
    const events: Record<string, number> = {};
    for (const a of actions)
      if ((a.campaign?.id ?? "") === id && a.segments?.conversionActionName)
        events[a.segments.conversionActionName] = conv1((events[a.segments.conversionActionName] ?? 0) + num(a.metrics?.allConversions));
    out.push({ campaign: c.name, spend: Math.round(c.spend * 100) / 100, events: Object.keys(events).length ? events : { "Todas as conversões": conv1(c.all) } });
  }
  return out.sort((a, b) => b.spend - a.spend);
}

/** Verba por dia de `since` a `until` (zero no dia sem linha). */
export function dailySpend(rows: DailyRow[], since: string, until: string): Map<string, number> {
  const spend = new Map<string, number>();
  for (const row of rows) {
    const day = row.segments?.date;
    if (day) spend.set(day, (spend.get(day) ?? 0) + num(row.metrics?.costMicros) / 1_000_000);
  }
  return fillDays(since, until, spend);
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

/**
 * Reconstrói o PEM de uma chave privada colada em variável de ambiente, venha
 * como vier: com "\\n" literal, quebras de linha reais, quebras trocadas por
 * espaços, entre aspas, ou com o "NOME=" junto. Só confia nos bytes base64 do
 * miolo e remonta o cabeçalho, o rodapé e as linhas de 64 caracteres.
 * Devolve null se não achar uma chave.
 */
export function normalizePrivateKey(raw: string): string | null {
  const m = raw.match(/-----BEGIN ([A-Z ]*PRIVATE KEY)-----([\s\S]*?)-----END \1-----/);
  if (!m) return null;
  const body = m[2].replace(/\\n|\\r|\s+/g, "").replace(/[^A-Za-z0-9+/=]/g, "");
  if (body.length < 100) return null;
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${m[1]}-----\n${lines.join("\n")}\n-----END ${m[1]}-----\n`;
}
