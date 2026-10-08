import { configSnapshot } from "@/lib/config-status";
import { ACCOUNT_TYPE_LABEL } from "@/lib/model/types";
import { targetFields } from "@/lib/model/target-fields";
import { currentRitualDate, weekLabel } from "@/lib/week";
import { requireUser } from "@/lib/auth";
import { MetasBoard, type MetaRow } from "@/components/performance/metas-board";

export const dynamic = "force-dynamic";

/**
 * Performance › Metas. Não há mais preenchimento manual: verba, leads e
 * receita vêm do Meta Ads, do Google Ads e do CRM. O time define a meta de
 * cada conta — é contra ela que o score mede o número da semana.
 */
export default async function MetasPage() {
  await requireUser();
  const snap = await configSnapshot();
  const week = currentRitualDate();

  const rows: MetaRow[] = snap.clients.map((c) => {
    const meta = snap.metaLinks.filter((l) => l.client_id === c.id && l.active);
    const google = snap.googleLinks.filter((l) => l.client_id === c.id && l.active);
    const hook = snap.integrations.find((i) => i.client_id === c.id && i.active);
    const media = snap.media.get(c.id)?.get(week);
    const sources = [
      ...(meta.length ? [{ label: "Meta Ads", error: meta.some((l) => l.last_error) }] : []),
      ...(google.length ? [{ label: "Google Ads", error: google.some((l) => l.last_error) }] : []),
      ...(hook ? [{ label: `CRM${hook.crm_name ? ` · ${hook.crm_name}` : ""}`, error: false }] : []),
    ];
    return {
      id: c.id,
      name: c.name,
      typeLabel: ACCOUNT_TYPE_LABEL[c.account_type],
      gt: c.gt_name,
      fields: targetFields(c.account_type),
      targets: snap.targets.get(c.id) ?? {},
      sources,
      week: media || hook ? { spend: media?.week.spend ?? null, leads: hook ? hook.week_leads : (media?.leads ?? null) } : null,
    };
  });

  return <MetasBoard rows={rows} weekLabel={weekLabel(week)} />;
}
