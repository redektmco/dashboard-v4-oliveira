import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { gaql, googleAdsConfigured } from "@/lib/google/ads";
import { conv1, googleUnread, type ActionRow, type DailyRow } from "@/lib/google/metrics";
import { listGoogleLinks, today } from "@/lib/repo";
import { validPeriod } from "@/lib/reports/input";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Diagnóstico do Google Ads para as contas de um cliente: por campanha, verba,
 * "Conversões" (o que o painel conta), "Todas as conversões" e a quebra por
 * ação de conversão — mostra se a ação de lead está como secundária.
 *
 *   /api/google/eventos?cliente=22&de=2026-10-01&ate=2026-10-13
 */
export async function GET(req: Request) {
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Sessão expirada. Entre de novo para continuar." }, { status: 401 });
  if (!googleAdsConfigured()) return NextResponse.json({ error: "Google Ads não configurado." }, { status: 503 });
  const sp = new URL(req.url).searchParams;
  const clientId = Number(sp.get("cliente"));
  if (!clientId) return NextResponse.json({ error: "Informe ?cliente=<id do cliente>." }, { status: 400 });
  const day = today();
  const period = validPeriod(sp.get("de") ?? `${day.slice(0, 8)}01`, sp.get("ate") ?? day);
  if (!period) return NextResponse.json({ error: "Período inválido (use de=AAAA-MM-DD&ate=AAAA-MM-DD)." }, { status: 400 });
  const between = `segments.date BETWEEN '${period.start}' AND '${period.end}'`;

  const links = (await listGoogleLinks()).filter((l) => l.client_id === clientId);
  const contas = await Promise.all(
    links.map(async (l) => {
      try {
        const [rows, actions] = await Promise.all([
          gaql<DailyRow>(
            l.customer_id,
            "SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.conversions, metrics.all_conversions, metrics.clicks " +
              `FROM campaign WHERE ${between}`,
          ),
          gaql<ActionRow>(
            l.customer_id,
            "SELECT campaign.id, segments.conversion_action_name, metrics.conversions, metrics.all_conversions " +
              `FROM campaign WHERE ${between} AND metrics.all_conversions > 0`,
          ),
        ]);
        return {
          conta: l.name || l.customer_id,
          id: l.customer_id,
          ativa: l.active === 1,
          nao_contados: googleUnread(rows, actions),
          campanhas: rows
            .filter((r) => num(r.metrics?.costMicros) > 0 || num(r.metrics?.allConversions) > 0)
            .map((r) => ({
              campanha: r.campaign?.name,
              verba: Math.round((num(r.metrics?.costMicros) / 1_000_000) * 100) / 100,
              conversoes_painel: conv1(num(r.metrics?.conversions)),
              todas_as_conversoes: conv1(num(r.metrics?.allConversions)),
              por_acao: Object.fromEntries(
                actions
                  .filter((a) => a.campaign?.id === r.campaign?.id)
                  .map((a) => [
                    a.segments?.conversionActionName ?? "?",
                    { conversoes: conv1(num(a.metrics?.conversions)), todas: conv1(num(a.metrics?.allConversions)) },
                  ]),
              ),
            })),
        };
      } catch (e) {
        return { conta: l.name || l.customer_id, id: l.customer_id, erro: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  return NextResponse.json({ periodo: period, contas }, { headers: { "cache-control": "no-store" } });
}
