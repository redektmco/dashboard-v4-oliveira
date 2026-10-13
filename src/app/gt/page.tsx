import { headers } from "next/headers";
import { crmBoard } from "@/lib/crm/board";
import { targetFields } from "@/lib/model/target-fields";
import { getAllTargets } from "@/lib/repo";
import { metaConfigured } from "@/lib/meta/graph";
import { googleAdsConfigured } from "@/lib/google/ads";
import { currentRitualDate, weekLabel } from "@/lib/week";
import { requireUser } from "@/lib/auth";
import { MetasBoard, type MetaRow } from "@/components/performance/metas-board";

export const dynamic = "force-dynamic";

/**
 * Performance › Metas. Não há mais preenchimento manual: verba, leads e
 * vendas vêm do Meta Ads, do Google Ads e do CRM. O time define a meta de
 * cada conta — é contra ela que o score mede o número da semana.
 *
 * A linha e o painel saem de `crmBoard()`, a mesma leitura da ficha e de
 * Clientes: forecast × realizado e fontes de dados são os mesmos números
 * nas três telas.
 */
export default async function MetasPage() {
  const me = await requireUser();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app.v4oliveira.com.br";
  const baseUrl = `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  const [{ rows }, targets] = await Promise.all([crmBoard({ baseUrl }), getAllTargets()]);

  const active = rows.filter((r) => r.active);
  const metaRows: MetaRow[] = active.map((r) => ({
    crm: r,
    fields: targetFields(r.accountType),
    targets: targets.get(r.id) ?? {},
  }));

  return (
    <MetasBoard
      rows={metaRows}
      weekLabel={weekLabel(currentRitualDate())}
      isAdmin={Boolean(me.is_admin)}
      metaReady={metaConfigured()}
      linkedAccounts={rows.flatMap((r) => r.meta.map((m) => m.adAccountId))}
      googleReady={googleAdsConfigured()}
      linkedGoogle={rows.flatMap((r) => r.google.map((g) => g.customerId))}
    />
  );
}
