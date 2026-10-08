import Link from "next/link";
import { headers } from "next/headers";
import { googleWeeks, metaWeeks } from "@/lib/repo";
import { configSnapshot, daysSince, whenBR } from "@/lib/config-status";
import { metaConfigured } from "@/lib/meta/graph";
import { googleAdsConfigured } from "@/lib/google/ads";
import { formatCustomerId } from "@/lib/google/metrics";
import { ACCOUNT_TYPE_LABEL } from "@/lib/model/types";
import { currentRitualDate } from "@/lib/week";
import { requireAdmin } from "@/lib/auth";
import { ConfigPage } from "@/components/config-shell";
import { Icon, type IconName } from "@/components/icon";
import { Letter, PageTitle, Pill, type Tone } from "@/components/kit";
import { CrmGuide, SyncMetaButton, SystemUserButton, TestWebhookButton } from "@/components/config/integrations-ui";
import { GoogleAccountsButton, SyncGoogleButton } from "@/components/config/google-ads-ui";

export const dynamic = "force-dynamic";

const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

type HealthRow = {
  clientId: number;
  name: string;
  source: string;
  problem: { label: string; tone: Tone } | null;
  metrics: { k: string; v: string; tone?: Tone; muted?: boolean }[];
  action: React.ReactNode;
};

export default async function IntegracoesPage() {
  await requireAdmin();
  const [snap, metaBy, googleBy] = await Promise.all([configSnapshot(), metaWeeks(), googleWeeks()]);
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app.v4oliveira.com.br";
  const base = `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  const total = snap.clients.length;
  const metaOn = metaConfigured();
  const googleOn = googleAdsConfigured();
  const week = currentRitualDate();

  const activeLinks = snap.metaLinks.filter((l) => l.active);
  const lastSync = activeLinks.map((l) => l.last_sync_at).filter((x): x is string => Boolean(x)).sort().pop() ?? null;
  const metaErrors = activeLinks.filter((l) => l.last_error).length;
  const googleLinks = snap.googleLinks.filter((l) => l.active);
  const googleLastSync = googleLinks.map((l) => l.last_sync_at).filter((x): x is string => Boolean(x)).sort().pop() ?? null;
  const googleErrors = googleLinks.filter((l) => l.last_error).length;
  const hooks = snap.integrations.filter((i) => i.active);
  const staleHooks = hooks.filter((i) => {
    const d = daysSince(i.last_event_at ?? i.last_lead_at);
    return d === null || d > 7;
  });
  const lastEvent = hooks.map((i) => i.last_event_at ?? i.last_lead_at).filter((x): x is string => Boolean(x)).sort().pop() ?? null;
  const channels = Number(snap.emailOn) + Number(snap.waOn);
  const verbaSemLeads = new Set(snap.verbaSemLeads.map((v) => v.client.id));

  const rows: HealthRow[] = [];
  for (const l of activeLinks) {
    const m = metaBy.get(l.client_id)?.get(week);
    const spend = m?.week.spend ?? 0;
    const leads = m?.leads ?? 0;
    const problem = l.last_error
      ? { label: "Erro na sincronização", tone: "vermelho" as Tone }
      : verbaSemLeads.has(l.client_id)
        ? { label: "Verba sem leads há 2 semanas", tone: "amarelo" as Tone }
        : null;
    rows.push({
      clientId: l.client_id,
      name: l.client_name,
      source: `Meta Ads · ${l.ad_account_id}`,
      problem,
      metrics: [
        { k: "Verba sem.", v: brl0(spend) },
        { k: "Leads", v: String(leads), tone: spend > 0 && leads === 0 ? "amarelo" : undefined },
        { k: "CPL", v: leads ? brl0(spend / leads) : "—" },
        { k: "Último dado", v: whenBR(l.last_sync_at), muted: true },
      ],
      action: (
        <a
          href={`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${l.ad_account_id.replace(/^act_/, "")}`}
          target="_blank"
          rel="noreferrer"
          className="btn h-[30px] shrink-0"
        >
          Ver campanha
        </a>
      ),
    });
  }
  for (const l of googleLinks) {
    const m = googleBy.get(l.client_id)?.get(week);
    const spend = m?.week.spend ?? 0;
    const leads = m?.leads ?? 0;
    rows.push({
      clientId: l.client_id,
      name: l.client_name,
      source: `Google Ads · ${formatCustomerId(l.customer_id)}`,
      problem: l.last_error ? { label: "Erro na sincronização", tone: "vermelho" as Tone } : null,
      metrics: [
        { k: "Verba sem.", v: brl0(spend) },
        { k: "Conversões", v: String(leads), tone: spend > 0 && leads === 0 ? "amarelo" : undefined },
        { k: "CPL", v: leads ? brl0(spend / leads) : "—" },
        { k: "Último dado", v: whenBR(l.last_sync_at), muted: true },
      ],
      action: (
        <a href="https://ads.google.com/aw/campaigns" target="_blank" rel="noreferrer" className="btn h-[30px] shrink-0">
          Ver campanha
        </a>
      ),
    });
  }
  for (const i of snap.integrations) {
    const last = i.last_event_at ?? i.last_lead_at;
    const d = daysSince(last);
    const problem = !i.active
      ? { label: "Pausado", tone: "neutro" as Tone }
      : d === null
        ? { label: "Nenhum evento ainda", tone: "amarelo" as Tone }
        : d > 7
          ? { label: `Sem eventos há ${d} dias`, tone: "amarelo" as Tone }
          : null;
    rows.push({
      clientId: i.client_id,
      name: i.client_name,
      source: `CRM · ${i.crm_name ?? "webhook"}`,
      problem,
      metrics: [
        { k: "Leads sem.", v: String(i.week_leads), tone: i.active && i.week_leads === 0 ? "amarelo" : undefined },
        { k: "Anterior", v: String(i.prev_week_leads) },
        { k: "Acumulado", v: String(i.total_leads) },
        { k: "Último dado", v: whenBR(last), muted: true },
      ],
      action: <TestWebhookButton url={`${base}/api/integrations/webhook/${i.token}`} lastEvent={whenBR(last)} />,
    });
  }
  // Problemas primeiro, depois por nome.
  rows.sort((a, b) => Number(Boolean(b.problem && b.problem.tone !== "neutro")) - Number(Boolean(a.problem && a.problem.tone !== "neutro")) || a.name.localeCompare(b.name));

  const clientOptions = snap.clients.map((c) => ({ id: c.id, label: `${c.name} · ${ACCOUNT_TYPE_LABEL[c.account_type]}` }));

  return (
    <ConfigPage>
      <PageTitle title="Integrações" description="Conexões da unidade. Vincular cada cliente acontece no painel do cliente, em Clientes." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Connection
          icon="megaphone"
          title="Meta Ads"
          pill={!metaOn ? { tone: "vermelho", label: "Sem token" } : metaErrors ? { tone: "amarelo", label: `${metaErrors} com erro` } : { tone: "verde", label: "Conectado" }}
          desc="Verba, leads, faturamento e alcance puxados todo dia às 05:30 com o usuário do sistema da unidade."
          metrics={[
            { k: "Clientes", v: `${new Set(activeLinks.map((l) => l.client_id)).size} de ${total}` },
            { k: "Última sync", v: whenBR(lastSync) },
          ]}
          actions={
            <>
              <SyncMetaButton disabled={!metaOn} />
              <SystemUserButton configured={metaOn} clients={clientOptions} linked={snap.metaLinks.map((l) => l.ad_account_id)} />
            </>
          }
        />
        <Connection
          icon="megaphone"
          title="Google Ads"
          pill={!googleOn ? { tone: "vermelho", label: "Sem credencial" } : googleErrors ? { tone: "amarelo", label: `${googleErrors} com erro` } : googleLinks.length ? { tone: "verde", label: "Conectado" } : { tone: "neutro", label: "Nenhuma conta" }}
          desc="Verba, conversões e receita das campanhas do Google, puxadas todo dia com o service account da unidade."
          metrics={[
            { k: "Clientes", v: `${new Set(googleLinks.map((l) => l.client_id)).size} de ${total}` },
            { k: "Última sync", v: whenBR(googleLastSync) },
          ]}
          actions={
            <>
              <SyncGoogleButton disabled={!googleOn} />
              <GoogleAccountsButton
                configured={googleOn}
                clients={clientOptions}
                links={snap.googleLinks.map((l) => ({
                  customerId: l.customer_id,
                  label: `${l.name} · ${formatCustomerId(l.customer_id)}`,
                  client: l.client_name,
                  active: Boolean(l.active),
                  error: l.last_error,
                }))}
              />
            </>
          }
        />
        <Connection
          icon="webhook"
          title="CRM por webhook"
          pill={
            !hooks.length
              ? { tone: "neutro", label: "Nenhum" }
              : staleHooks.length
                ? { tone: "amarelo", label: `${staleHooks.length} sem eventos` }
                : { tone: "verde", label: "Recebendo" }
          }
          desc="Cada lead recebido conta na semana e entra direto na régua de leads do score. Uma URL por cliente."
          metrics={[
            { k: "Clientes", v: `${hooks.length} de ${total}` },
            { k: "Último evento", v: whenBR(lastEvent), tone: staleHooks.length ? "amarelo" : undefined },
          ]}
          actions={
            <a href="#como-conectar" className="btn h-8">
              <Icon name="book" size={16} />
              Como conectar
            </a>
          }
        />
        <Connection
          icon="send"
          title="Canais de envio"
          pill={channels === 0 ? { tone: "vermelho", label: "Nenhum ativo" } : { tone: "verde", label: `${channels} de 2 ativos` }}
          desc="E-mail e WhatsApp usados para disparar cobranças no vencimento. Sem canal, nada é enviado."
          metrics={[
            { k: "E-mail", v: snap.emailOn ? "Ativo" : "—" },
            { k: "WhatsApp", v: snap.waOn ? "Ativo" : "—" },
          ]}
          actions={
            <Link href="/config/canais" className={`btn h-8 ${channels === 0 ? "btn-primary" : ""}`}>
              <Icon name={channels === 0 ? "plus" : "settings"} size={16} />
              {channels === 0 ? "Configurar canal" : "Ver canais"}
            </Link>
          }
        />
      </div>

      <div className="flex flex-col gap-4 xl:flex-row">
        <section className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-[15px] font-semibold text-ink-100">Saúde por cliente</h2>
            <p className="text-[12px] text-ink-400">Só clientes com integração. Problemas primeiro.</p>
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--border-hair)] bg-ink-900">
            {rows.map((r) => (
              <div key={`${r.clientId}-${r.source}`} className="flex flex-col gap-3 border-b border-[var(--border-hair)] px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <Letter name={r.name} />
                  <Link href={`/config/clientes?c=${r.clientId}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[13px] font-semibold text-ink-100 hover:underline">{r.name}</span>
                    <span className="truncate text-[11px] text-ink-400">{r.source}</span>
                  </Link>
                  {r.problem ? <Pill tone={r.problem.tone}>{r.problem.label}</Pill> : <Pill tone="verde">Funcionando</Pill>}
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:pl-[38px]">
                  {r.metrics.map((m) => (
                    <div key={m.k} className={`flex flex-col gap-0.5 ${m.k === "Último dado" ? "min-w-[100px] flex-1" : ""}`}>
                      <span className="text-[11px] text-ink-400">{m.k}</span>
                      <span className={`tnum text-[13px] ${m.muted ? "text-ink-300" : "font-semibold"} ${m.tone === "amarelo" ? "text-amarelo-fg" : m.muted ? "" : "text-ink-100"}`}>
                        {m.v}
                      </span>
                    </div>
                  ))}
                  {r.action}
                </div>
              </div>
            ))}
            {!rows.length && <p className="border-b border-[var(--border-hair)] px-5 py-8 text-center text-[13px] text-ink-400">Nenhum cliente com integração ainda.</p>}
            <div className="flex items-center gap-2.5 bg-white/[0.016] px-5 py-3.5">
              <Icon name="unplug" size={15} className="shrink-0 text-vermelho-fg" />
              <span className="min-w-0 flex-1 text-[13px] text-ink-300">
                {snap.semFonte.length
                  ? `${snap.semFonte.length} ${snap.semFonte.length === 1 ? "cliente sem nenhuma fonte de leads" : "clientes sem nenhuma fonte de leads"}`
                  : "Todos os clientes têm fonte de leads"}
              </span>
              {snap.semFonte.length > 0 && (
                <Link href="/config/clientes?filtro=sem_fonte&seq=1" className="flex items-center gap-1 text-[13px] font-semibold text-ink-100 hover:underline">
                  Conectar em Clientes
                  <Icon name="arrowRight" size={14} />
                </Link>
              )}
            </div>
          </div>
        </section>

        <section className="flex w-full shrink-0 flex-col gap-3 xl:w-[400px]">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-[15px] font-semibold text-ink-100">Como conectar o CRM</h2>
            <p className="text-[12px] text-ink-400">Escolha o CRM do cliente para ver o passo a passo.</p>
          </div>
          <CrmGuide host={host} />
        </section>
      </div>
    </ConfigPage>
  );
}

function Connection({
  icon,
  title,
  pill,
  desc,
  metrics,
  actions,
}: {
  icon: IconName;
  title: string;
  pill: { tone: Tone; label: string };
  desc: string;
  metrics: { k: string; v: string; tone?: Tone }[];
  actions: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3.5 rounded-xl border border-[var(--border-hair)] bg-ink-900 p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-ink-800 text-ink-100">
          <Icon name={icon} size={17} stroke={1.75} />
        </span>
        <h2 className="min-w-0 flex-1 font-display text-[15px] font-semibold leading-tight text-ink-100">{title}</h2>
        <Pill tone={pill.tone}>{pill.label}</Pill>
      </div>
      <p className="text-[12px] leading-[18px] text-ink-300">{desc}</p>
      <div className="flex rounded-lg bg-ink-850">
        {metrics.map((m, i) => (
          <div key={m.k} className={`flex flex-1 flex-col gap-[3px] px-3 py-2.5 ${i === 0 ? "border-r border-[var(--border-hair)]" : ""}`}>
            <span className="text-[11px] text-ink-400">{m.k}</span>
            <span className={`tnum truncate text-[13px] font-semibold ${m.tone === "amarelo" ? "text-amarelo-fg" : "text-ink-100"}`}>{m.v}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto flex flex-wrap gap-2 xl:flex-nowrap">{actions}</div>
    </section>
  );
}
