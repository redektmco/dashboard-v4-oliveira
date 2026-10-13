import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getClient, listMetaLinks, today } from "@/lib/repo";
import { parsePeriod } from "@/lib/ficha-period";
import { metaConfigured } from "@/lib/meta/graph";
import { metaDemographics } from "@/lib/performance/demographics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Demografia da aba Performance (região, idade e gênero), lida ao vivo da
 * Meta no período da ficha. Rota à parte da de performance: são duas
 * leituras a mais por conta e a seção carrega sozinha, sem segurar o resto.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser()))
    return NextResponse.json({ error: "Sessão expirada. Entre de novo para continuar." }, { status: 401 });
  const clientId = Number((await params).id);
  if (!Number.isInteger(clientId)) return NextResponse.json({ error: "Cliente inválido." }, { status: 400 });
  const [client, links] = await Promise.all([getClient(clientId), listMetaLinks()]);
  if (!client) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  if (!metaConfigured()) return NextResponse.json({ error: "META_ACCESS_TOKEN não configurado." }, { status: 503 });

  const period = parsePeriod(Object.fromEntries(new URL(req.url).searchParams), today());
  const accounts = links
    .filter((l) => l.client_id === clientId && l.active === 1)
    .map((l) => ({ id: l.ad_account_id, name: l.name || l.ad_account_id, metric: l.lead_metric }));
  const data = await metaDemographics(accounts, client.account_type, { since: period.since, until: period.until });
  return NextResponse.json({ data });
}
