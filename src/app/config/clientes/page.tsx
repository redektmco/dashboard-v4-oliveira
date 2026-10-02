import { headers } from "next/headers";
import {
  clientFootprints,
  getAllTargets,
  listClients,
  listIntegrations,
  listMetaLinks,
  listUsers,
} from "@/lib/repo";
import { listCharges } from "@/lib/billing/db";
import { chargeWillSend, whenBR } from "@/lib/config-status";
import { fieldsFor } from "@/lib/model/catalog";
import { ACCOUNT_TYPE_LABEL, type AccountType } from "@/lib/model/types";
import { metaConfigured } from "@/lib/meta/graph";
import { requireUser } from "@/lib/auth";
import { ClientsBoard, type BoardClient, type TargetField } from "@/components/config/clients-board";

export const dynamic = "force-dynamic";

const EMPTY_FOOTPRINT = { perf: 0, checkins: 0, plans: 0, projects: 0, leads: 0, integration: false };

/** Campos de meta do tipo de conta, com rótulo curto e unidade para o painel. */
function targetFields(type: AccountType): TargetField[] {
  return fieldsFor(type, "gt")
    .filter((f) => f.targetKey && f.input.kind === "pair")
    .map((f) => {
      const i = f.input as Extract<typeof f.input, { kind: "pair" }>;
      const money = /\(R\$\)/.test(i.realLabel);
      const pct = f.rule === "RATE" || /\(%\)/.test(i.realLabel);
      return {
        key: f.targetKey!,
        label: f.label,
        prefix: money ? "R$" : undefined,
        suffix: pct ? "%" : f.key === "roas" ? "x" : money ? undefined : "/sem.",
        decimals: i.decimals ?? 0,
        lowerIsBetter: f.rule === "B",
      };
    });
}

export default async function ConfigClientesPage() {
  const me = await requireUser();
  const [clients, users, targetsBy, footprints, integrations, metaLinks, charges] = await Promise.all([
    listClients(false),
    listUsers(),
    getAllTargets(),
    clientFootprints(),
    listIntegrations(),
    listMetaLinks(),
    listCharges(),
  ]);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app.v4oliveira.com.br";
  const base = `${h.get("x-forwarded-proto") ?? "https"}://${host}`;

  const rows: BoardClient[] = clients.map((c) => {
    const hook = integrations.find((i) => i.client_id === c.id);
    const charge = charges.filter((x) => x.clientId === c.id && x.active).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0];
    const channels = charge ? [charge.billingEmail && "e-mail", charge.billingPhone && "WhatsApp"].filter(Boolean).join(" e ") : "";
    return {
      ...c,
      typeLabel: ACCOUNT_TYPE_LABEL[c.account_type],
      targets: targetsBy.get(c.id) ?? {},
      fields: targetFields(c.account_type),
      footprint: footprints.get(c.id) ?? EMPTY_FOOTPRINT,
      meta: metaLinks
        .filter((l) => l.client_id === c.id)
        .map((l) => ({
          adAccountId: l.ad_account_id,
          name: l.name,
          leadMetric: l.lead_metric,
          active: Boolean(l.active),
          lastSync: whenBR(l.last_sync_at),
          error: l.last_error,
        })),
      hook: hook
        ? {
            url: `${base}/api/integrations/webhook/${hook.token}`,
            active: Boolean(hook.active),
            crmName: hook.crm_name,
            lastEvent: whenBR(hook.last_event_at ?? hook.last_lead_at),
            weekLeads: hook.week_leads,
            totalLeads: hook.total_leads,
          }
        : null,
      charge: charge
        ? {
            amount: charge.amount,
            dueDate: charge.dueDate,
            channels,
            willSend: chargeWillSend(charge),
          }
        : null,
    };
  });

  return (
    <ClientsBoard
      rows={rows}
      users={users}
      isAdmin={Boolean(me.is_admin)}
      metaReady={metaConfigured()}
      linkedAccounts={metaLinks.map((l) => l.ad_account_id)}
    />
  );
}
