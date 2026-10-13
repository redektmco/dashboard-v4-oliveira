import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { allPages, metaConfigured } from "@/lib/meta/graph";
import { parseInsight, type InsightRow } from "@/lib/meta/metrics";
import { listMetaLinks, today } from "@/lib/repo";
import { validPeriod } from "@/lib/reports/input";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Row = InsightRow & { campaign_name?: string };

/**
 * Diagnóstico: o que a Meta devolve, campanha a campanha, para as contas de
 * um cliente — os tipos de evento crus de `actions` e `conversions` e o que o
 * painel entende como lead. É para quando o número do painel não bate com o
 * Gerenciador: mostra se o evento veio, com que nome e onde.
 *
 *   /api/meta/eventos?cliente=12&de=2026-10-01&ate=2026-10-13
 */
export async function GET(req: Request) {
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Sessão expirada. Entre de novo para continuar." }, { status: 401 });
  if (!metaConfigured()) return NextResponse.json({ error: "META_ACCESS_TOKEN não configurado." }, { status: 503 });
  const sp = new URL(req.url).searchParams;
  const clientId = Number(sp.get("cliente"));
  if (!clientId) return NextResponse.json({ error: "Informe ?cliente=<id do cliente>." }, { status: 400 });
  const day = today();
  const period = validPeriod(sp.get("de") ?? `${day.slice(0, 8)}01`, sp.get("ate") ?? day);
  if (!period) return NextResponse.json({ error: "Período inválido (use de=AAAA-MM-DD&ate=AAAA-MM-DD)." }, { status: 400 });

  const links = (await listMetaLinks()).filter((l) => l.client_id === clientId);
  const time_range = JSON.stringify({ since: period.start, until: period.end });
  const contas = await Promise.all(
    links.map(async (l) => {
      try {
        const rows = await allPages<Row>(`${l.ad_account_id}/insights`, {
          level: "campaign",
          fields: "campaign_name,spend,actions,conversions",
          time_range,
        });
        return {
          conta: l.name || l.ad_account_id,
          id: l.ad_account_id,
          ativa: l.active === 1,
          lead_conta_como: l.lead_metric,
          campanhas: rows.map((r) => ({
            campanha: r.campaign_name,
            verba: Number(r.spend) || 0,
            painel: { leads_site: parseInsight(r).leads, conversas: parseInsight(r).conversations },
            actions: Object.fromEntries((r.actions ?? []).map((a) => [a.action_type, Number(a.value)])),
            conversions: Object.fromEntries((r.conversions ?? []).map((a) => [a.action_type, Number(a.value)])),
          })),
        };
      } catch (e) {
        return { conta: l.name || l.ad_account_id, id: l.ad_account_id, erro: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  return NextResponse.json({ periodo: period, contas }, { headers: { "cache-control": "no-store" } });
}
