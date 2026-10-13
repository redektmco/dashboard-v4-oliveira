// ============================================================
// Repositório do construtor de relatórios (tabela rp_reports) e a leitura
// dos números de um cliente num período — o que os blocos desenham.
// ============================================================
import { all, one, run } from "../db";
import { getTargets, googleWeeks, metaWeeks, type MetaAgg } from "../repo";
import { newId, newToken } from "../social/id";
import { sanitizeDoc } from "./layout";
import { EMPTY_NUMS, previousPeriod, sampleData } from "./metrics";
import type { Band, ChannelNums, Report, ReportData, ReportDoc, ReportFormat, WeekRow } from "./types";

type Row = {
  id: string;
  kind: "report" | "template";
  client_id: number | null;
  client_name: string | null;
  title: string;
  format: ReportFormat;
  period_start: string | null;
  period_end: string | null;
  doc: unknown;
  share_token: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT = `
  SELECT r.id, r.kind, r.client_id, c.name AS client_name, r.title, r.format,
         r.period_start::text AS period_start, r.period_end::text AS period_end,
         r.doc, r.share_token, u.name AS created_by_name,
         r.created_at::text AS created_at, r.updated_at::text AS updated_at
  FROM rp_reports r
  LEFT JOIN clients c ON c.id = r.client_id
  LEFT JOIN users u ON u.id = r.created_by`;

/** `timestamptz::text` ("2026-09-10 15:21:15.9-03") → ISO 8601 que o navegador entende. */
function iso(s: string): string {
  const d = new Date(s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

function toReport(r: Row): Report {
  return {
    id: r.id,
    kind: r.kind,
    clientId: r.client_id,
    clientName: r.client_name,
    title: r.title,
    format: r.format,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    doc: sanitizeDoc(r.doc, r.format),
    shareToken: r.share_token,
    createdByName: r.created_by_name,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export async function listReports(kind: "report" | "template"): Promise<Report[]> {
  const rows = await all<Row>(`${SELECT} WHERE r.kind = ? ORDER BY r.updated_at DESC`, [kind]);
  return rows.map(toReport);
}

export async function getReport(id: string): Promise<Report | null> {
  const r = await one<Row>(`${SELECT} WHERE r.id = ?`, [id]);
  return r ? toReport(r) : null;
}

export async function getReportByToken(token: string): Promise<Report | null> {
  if (!token || token.length < 16) return null;
  const r = await one<Row>(`${SELECT} WHERE r.share_token = ? AND r.kind = 'report'`, [token]);
  return r ? toReport(r) : null;
}

export async function createReport(input: {
  kind: "report" | "template";
  clientId: number | null;
  title: string;
  format: ReportFormat;
  periodStart: string | null;
  periodEnd: string | null;
  doc: ReportDoc;
  createdBy: number;
}): Promise<string> {
  const id = newId(input.kind === "template" ? "tpl_" : "rpt_");
  await run(
    `INSERT INTO rp_reports (id, kind, client_id, title, format, period_start, period_end, doc, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?::date, ?::date, ?::jsonb, ?, ?)`,
    [
      id,
      input.kind,
      input.clientId,
      input.title,
      input.format,
      input.periodStart,
      input.periodEnd,
      JSON.stringify(input.doc),
      input.createdBy,
      input.createdBy,
    ],
  );
  return id;
}

export type ReportPatch = Partial<{
  title: string;
  clientId: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  doc: ReportDoc;
}>;

export async function updateReport(id: string, patch: ReportPatch, userId: number): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (sql: string, v: unknown) => {
    sets.push(sql);
    params.push(v);
  };
  if (patch.title !== undefined) set("title = ?", patch.title);
  if (patch.clientId !== undefined) set("client_id = ?", patch.clientId);
  if (patch.periodStart !== undefined) set("period_start = ?::date", patch.periodStart);
  if (patch.periodEnd !== undefined) set("period_end = ?::date", patch.periodEnd);
  if (patch.doc !== undefined) set("doc = ?::jsonb", JSON.stringify(patch.doc));
  if (!sets.length) return;
  sets.push("updated_at = now()", "updated_by = ?");
  params.push(userId, id);
  await run(`UPDATE rp_reports SET ${sets.join(", ")} WHERE id = ?`, params);
}

/** Liga (token novo) ou desliga o link público. Religar gera outro link: o antigo para de abrir. */
export async function setShare(id: string, on: boolean): Promise<string | null> {
  const token = on ? newToken() : null;
  await run(`UPDATE rp_reports SET share_token = ? WHERE id = ?`, [token, id]);
  return token;
}

export const deleteReport = (id: string) => run(`DELETE FROM rp_reports WHERE id = ?`, [id]);

/* ------------------------------- números ------------------------------- */

const toNums = (a: MetaAgg | undefined): ChannelNums =>
  a
    ? {
        spend: a.week.spend,
        impressions: a.week.impressions,
        reach: a.week.reach,
        clicks: a.week.clicks,
        // Lead já resolvido pela métrica escolhida em cada conta (formulário,
        // conversa ou os dois); no Google é a conversão.
        leads: a.leads,
        conversations: a.week.conversations,
        purchases: a.week.purchases,
        revenue: a.week.revenue,
      }
    : { ...EMPTY_NUMS };

/**
 * Tudo que os blocos de um relatório leem, numa ida ao banco por fonte: as
 * semanas-ritual que fecham dentro do período (e do período anterior, para a
 * comparação), o Health Score no fim do período e as metas vigentes.
 *
 * O dado de mídia é semanal: o período soma as semanas cujo fechamento cai
 * dentro dele. Sem cliente (modelo), devolve números de exemplo.
 */
export async function reportData(
  client: { id: number; name: string } | null,
  start: string,
  end: string,
): Promise<ReportData> {
  if (!client) return sampleData(start, end);
  const prev = previousPeriod(start, end);

  const [meta, google, crm, score, targets] = await Promise.all([
    metaWeeks(client.id),
    googleWeeks(client.id),
    all<{ ref: string; n: number }>(
      `SELECT ref_date::text AS ref, count(*)::int AS n FROM crm_leads
       WHERE client_id = ? AND ref_date BETWEEN ?::date AND ?::date GROUP BY ref_date`,
      [client.id, prev.start, end],
    ),
    one<{ score: number | null; band: Band | null; day: string }>(
      `SELECT score, band, ref_day::text AS day FROM score_snapshots
       WHERE client_id = ? AND ref_day <= ?::date ORDER BY ref_day DESC LIMIT 1`,
      [client.id, end],
    ),
    getTargets(client.id, end),
  ]);

  const m = meta.get(client.id) ?? new Map<string, MetaAgg>();
  const g = google.get(client.id) ?? new Map<string, MetaAgg>();
  const c = new Map(crm.map((r) => [r.ref, Number(r.n)]));

  const weeksIn = (s: string, e: string): WeekRow[] => {
    const refs = new Set<string>();
    for (const map of [m, g, c]) for (const ref of map.keys()) if (ref >= s && ref <= e) refs.add(ref);
    return [...refs].sort().map((ref) => ({
      ref,
      meta: toNums(m.get(ref)),
      google: toNums(g.get(ref)),
      crmLeads: c.get(ref) ?? 0,
    }));
  };

  return {
    client,
    period: { start, end },
    previous: prev,
    weeks: weeksIn(start, end),
    prevWeeks: weeksIn(prev.start, prev.end),
    score: {
      value: score?.score === null || score?.score === undefined ? null : Number(score.score),
      band: score?.band ?? null,
      day: score?.day ?? null,
    },
    targets,
    sample: false,
  };
}
