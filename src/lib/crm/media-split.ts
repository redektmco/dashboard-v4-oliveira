import type { MetaAgg } from "../repo";
import { EMPTY_WEEK, type MetaWeek } from "../meta/metrics";

/**
 * Mídia separada por canal.
 *
 * O score e a carteira leem Meta + Google somados (`mediaWeeks`), porque a
 * régua é do resultado da conta, não da ferramenta. Mas na hora de entender
 * *por que* o número caiu, a soma esconde o que importa: foi o Meta que parou
 * ou o Google que encareceu? Esta função desfaz a soma — sem tocar no que o
 * score usa.
 *
 * Pura, sem banco: recebe os mapas que `metaWeeks`/`googleWeeks` devolvem.
 */

export type Channel = "meta" | "google";

export const CHANNEL_LABEL: Record<Channel, string> = { meta: "Meta Ads", google: "Google Ads" };

export type ChannelWeek = {
  ref: string;
  spend: number;
  /** Leads (Meta) ou conversões (Google) — o que cada plataforma devolve. */
  results: number;
  revenue: number;
  impressions: number;
  clicks: number;
};

export type ChannelTotals = ChannelWeek & {
  /** Custo por resultado no período. `null` quando não houve resultado. */
  cpr: number | null;
  /** ROAS do período. `null` sem verba. */
  roas: number | null;
  /** Fatia da verba total do período, 0–1. */
  share: number;
  /** A conta tem alguma conta vinculada neste canal. */
  linked: boolean;
};

export type MediaSplit = {
  weeks: string[];
  byChannel: Record<Channel, { weeks: ChannelWeek[]; totals: ChannelTotals }>;
  total: { spend: number; results: number; revenue: number };
  /** Houve qualquer verba no período em algum canal. */
  hasData: boolean;
};

const weekOf = (ref: string, agg: MetaAgg | undefined): ChannelWeek => {
  const w: MetaWeek = agg?.week ?? EMPTY_WEEK;
  return {
    ref,
    spend: w.spend,
    results: agg?.leads ?? 0,
    revenue: w.revenue,
    impressions: w.impressions,
    clicks: w.clicks,
  };
};

const sum = (list: ChannelWeek[]) =>
  list.reduce(
    (a, w) => ({
      ref: "",
      spend: a.spend + w.spend,
      results: a.results + w.results,
      revenue: a.revenue + w.revenue,
      impressions: a.impressions + w.impressions,
      clicks: a.clicks + w.clicks,
    }),
    { ref: "", spend: 0, results: 0, revenue: 0, impressions: 0, clicks: 0 } as ChannelWeek,
  );

export function mediaSplit(input: {
  /** Semanas-ritual a mostrar, da mais antiga para a mais recente. */
  weeks: string[];
  meta: Map<string, MetaAgg> | undefined;
  google: Map<string, MetaAgg> | undefined;
  /** Há conta vinculada no canal — distingue "sem verba" de "não conectado". */
  metaLinked: boolean;
  googleLinked: boolean;
}): MediaSplit {
  const { weeks } = input;
  const build = (src: Map<string, MetaAgg> | undefined, linked: boolean) => {
    const list = weeks.map((ref) => weekOf(ref, src?.get(ref)));
    const t = sum(list);
    return { weeks: list, totals: { ...t, cpr: null, roas: null, share: 0, linked } as ChannelTotals };
  };

  const byChannel = { meta: build(input.meta, input.metaLinked), google: build(input.google, input.googleLinked) };
  const spend = byChannel.meta.totals.spend + byChannel.google.totals.spend;

  for (const c of ["meta", "google"] as Channel[]) {
    const t = byChannel[c].totals;
    t.cpr = t.results > 0 ? t.spend / t.results : null;
    t.roas = t.spend > 0 ? t.revenue / t.spend : null;
    t.share = spend > 0 ? t.spend / spend : 0;
  }

  return {
    weeks,
    byChannel,
    total: {
      spend,
      results: byChannel.meta.totals.results + byChannel.google.totals.results,
      revenue: byChannel.meta.totals.revenue + byChannel.google.totals.revenue,
    },
    hasData: spend > 0,
  };
}

/**
 * Como o canal se moveu da penúltima para a última semana fechada — a leitura
 * que o Account precisa na call. `null` quando não há duas semanas com verba.
 */
export function weekOverWeek(weeks: ChannelWeek[]): { spend: number | null; results: number | null } {
  if (weeks.length < 2) return { spend: null, results: null };
  const [prev, last] = weeks.slice(-2);
  const pct = (a: number, b: number) => (a === 0 ? null : ((b - a) / a) * 100);
  return { spend: pct(prev.spend, last.spend), results: pct(prev.results, last.results) };
}
