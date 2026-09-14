import { headers } from "next/headers";
import { listClients, listIntegrations, today } from "@/lib/repo";
import { ACCOUNT_TYPE_LABEL } from "@/lib/model/types";
import { IntegrationsManager } from "@/components/integrations-manager";
import { Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { ritualWeekEnd, weekLabel } from "@/lib/week";

export const dynamic = "force-dynamic";

const fmtWhen = (s: string | null) =>
  s
    ? new Date(s.includes("T") || s.includes(" ") ? s.replace(" ", "T") : s + "T00:00:00").toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export default async function IntegracoesPage() {
  await requireAdmin();

  const [integrations, clients] = await Promise.all([listIntegrations(), listClients(false)]);

  // Base pública do webhook: honra o host do proxy da Vercel; em último caso
  // cai para o domínio de produção.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app.v4oliveira.com.br";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = `${proto}://${host}`;

  const semIntegracao = clients.filter((c) => c.active && !integrations.some((i) => i.client_id === c.id));
  const ativos = integrations.filter((i) => i.active).length;
  const leadsSemana = integrations.reduce((a, i) => a + i.week_leads, 0);

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Integrações ativas" value={ativos} hint={`de ${integrations.length} cadastradas`} />
        <Stat label="Leads nesta semana" value={leadsSemana} hint={weekLabel(ritualWeekEnd(today()))} />
        <Stat
          label="Clientes sem CRM"
          value={semIntegracao.length}
          tone={semIntegracao.length > 0 ? "amarelo" : "verde"}
          hint="ainda no input manual"
        />
      </div>
      <IntegrationsManager
        base={base}
        available={semIntegracao.map((c) => ({ id: c.id, label: `${c.name} · ${ACCOUNT_TYPE_LABEL[c.account_type]}` }))}
        items={integrations.map((i) => ({
          clientId: i.client_id,
          clientName: i.client_name,
          typeLabel: ACCOUNT_TYPE_LABEL[i.account_type],
          leadGen: i.account_type === "lead_gen",
          clientActive: Boolean(i.client_active),
          active: Boolean(i.active),
          url: `${base}/api/integrations/webhook/${i.token}`,
          weekLeads: i.week_leads,
          prevWeekLeads: i.prev_week_leads,
          totalLeads: i.total_leads,
          lastEvent: fmtWhen(i.last_event_at ?? i.last_lead_at),
        }))}
      />
    </>
  );
}
