/**
 * Demografia da aba Performance: leads, verba e CPL por região do Brasil e
 * por idade × gênero, lidos ao vivo da Meta (breakdowns `region` e
 * `age,gender`, campanha a campanha — o resultado segue o que cada campanha
 * otimiza, a mesma regra do resto da aba). A Meta não cruza região com idade
 * e gênero numa mesma leitura, por isso são dois blocos independentes.
 * O Google Ads não entra: a API dele não devolve região e idade no mesmo
 * formato e as contas da unidade quase não segmentam por público.
 */
import { allPages, fetchCampaignGoals } from "../meta/graph";
import { EVENT_FIELDS, type LeadMetric } from "../meta/metrics";
import type { AccountType } from "../model/types";
import { metaTotals, type MetaRow } from "./meta-live";
import type { BrRegion } from "./br-map";

export type DemoAgg = { spend: number; results: number; resultSpend: number };
export type Gender = "female" | "male" | "unknown";
export const AGES = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"] as const;
export type AgeBand = (typeof AGES)[number];

export type DemographicsData = {
  regions: Record<BrRegion, DemoAgg>;
  /** Fora do Brasil ou região que a Meta não informou. */
  otherRegion: DemoAgg;
  ageGender: { age: AgeBand; gender: Gender; agg: DemoAgg }[];
  errors: { account: string; error: string }[];
};

const EMPTY = (): DemoAgg => ({ spend: 0, results: 0, resultSpend: 0 });
const add = (a: DemoAgg, b: DemoAgg) => {
  a.spend += b.spend;
  a.results += b.results;
  a.resultSpend += b.resultSpend;
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\(state\)|\bstate of\b|\bstate\b|\bestado d[eo]\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Estado (como a Meta escreve, em português ou inglês) → região. */
const STATE_REGION: Record<string, BrRegion> = Object.fromEntries(
  (
    [
      ["norte", ["acre", "amapa", "amazonas", "para", "rondonia", "roraima", "tocantins"]],
      [
        "nordeste",
        ["alagoas", "bahia", "ceara", "maranhao", "paraiba", "pernambuco", "piaui", "rio grande do norte", "sergipe"],
      ],
      ["centro_oeste", ["goias", "mato grosso", "mato grosso do sul", "distrito federal", "federal district"]],
      ["sudeste", ["espirito santo", "minas gerais", "rio de janeiro", "sao paulo"]],
      ["sul", ["parana", "rio grande do sul", "santa catarina"]],
    ] as [BrRegion, string[]][]
  ).flatMap(([r, states]) => states.map((s) => [s, r])),
);

export const regionOf = (metaRegion: string | undefined): BrRegion | null => (metaRegion ? (STATE_REGION[norm(metaRegion)] ?? null) : null);

const aggOf = (r: MetaRow, metric: LeadMetric, type: AccountType, goals: Awaited<ReturnType<typeof fetchCampaignGoals>>): DemoAgg => {
  const t = metaTotals(r, metric, type, goals);
  return { spend: t.spend, results: type === "branding" ? 0 : t.results, resultSpend: type === "branding" ? 0 : t.resultSpend };
};

type BreakdownRow = MetaRow & { region?: string; age?: string; gender?: string };

export async function metaDemographics(
  accounts: { id: string; name: string; metric: LeadMetric }[],
  type: AccountType,
  range: { since: string; until: string },
): Promise<DemographicsData> {
  const out: DemographicsData = {
    regions: { norte: EMPTY(), nordeste: EMPTY(), centro_oeste: EMPTY(), sudeste: EMPTY(), sul: EMPTY() },
    otherRegion: EMPTY(),
    ageGender: [],
    errors: [],
  };
  const ag = new Map<string, { age: AgeBand; gender: Gender; agg: DemoAgg }>();
  const params = (breakdowns: string) => ({
    level: "campaign",
    fields: `campaign_id,spend,${EVENT_FIELDS}`,
    breakdowns,
    time_range: JSON.stringify(range),
  });

  await Promise.all(
    accounts.map(async (a) => {
      try {
        const [byRegion, byAge, goals] = await Promise.all([
          allPages<BreakdownRow>(`${a.id}/insights`, params("region")),
          allPages<BreakdownRow>(`${a.id}/insights`, params("age,gender")),
          fetchCampaignGoals(a.id),
        ]);
        for (const r of byRegion) {
          const reg = regionOf(r.region);
          add(reg ? out.regions[reg] : out.otherRegion, aggOf(r, a.metric, type, goals));
        }
        for (const r of byAge) {
          const age = (AGES as readonly string[]).includes(r.age ?? "") ? (r.age as AgeBand) : null;
          if (!age) continue; // 13-17 e "Unknown" ficam de fora das barras
          const gender: Gender = r.gender === "female" || r.gender === "male" ? r.gender : "unknown";
          const key = `${age}|${gender}`;
          const cur = ag.get(key) ?? { age, gender, agg: EMPTY() };
          add(cur.agg, aggOf(r, a.metric, type, goals));
          ag.set(key, cur);
        }
      } catch (e) {
        out.errors.push({ account: a.name, error: e instanceof Error ? e.message : String(e) });
      }
    }),
  );
  out.ageGender = [...ag.values()];
  return out;
}
