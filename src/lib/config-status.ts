import { cache } from "react";
import { all, one } from "./db";
import { DIMENSIONS, targetKeysFor } from "./model/catalog";
import {
  getAllTargets,
  getWeights,
  lastRecompute,
  listClients,
  listIntegrations,
  listGoogleLinks,
  listMetaLinks,
  mediaWeeks,
  today,
  type ClientRow,
} from "./repo";
import { listCharges } from "./billing/db";
import { isEmailConfigured } from "./billing/email";
import { isWhatsappConfigured } from "./billing/whatsapp";
import { metaConfigured } from "./meta/graph";
import { googleAdsConfigured } from "./google/ads";
import { currentRitualDate } from "./week";
import type { BillingChargeRow } from "./billing/types";

/**
 * Estado da configuração da unidade: o que falta para o score refletir a
 * carteira inteira (Pendências), o que está funcionando e os contadores do
 * menu de Configurações. Tudo derivado do banco — nada aqui é guardado.
 */

export type Severity = "bloqueia" | "atencao";

export type PendenciaId = "sem_meta" | "sem_fonte" | "cobranca_sem_canal" | "verba_sem_leads" | "meta_erro";

export type Pendencia = {
  id: PendenciaId;
  severity: Severity;
  title: string;
  /** Versão curta para o celular. */
  shortTitle: string;
  consequence: string;
  shortConsequence: string;
  clients: { id: number; name: string }[];
  action: { label: string; href: string; hint?: string; primary?: boolean };
};

const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const dateBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Cobrança que não sai por nenhum canal: falta a env do canal ou o contato do cliente. */
export function chargeWillSend(c: BillingChargeRow, email = isEmailConfigured(), wa = isWhatsappConfigured()) {
  return Boolean((email && c.billingEmail) || (wa && c.billingPhone));
}

const hasTargets = (c: ClientRow, targets: Record<string, number> | undefined) =>
  targetKeysFor(c.account_type).some((t) => targets?.[t.key] !== undefined);

/** Uma leitura por requisição: o layout (contadores) e a página usam o mesmo snapshot. */
export const configSnapshot = cache(loadConfigSnapshot);

async function loadConfigSnapshot() {
  const [clients, targets, integrations, metaLinks, googleLinks, charges, metaByClient, weights] = await Promise.all([
    listClients(),
    getAllTargets(),
    listIntegrations(),
    listMetaLinks(),
    listGoogleLinks(),
    listCharges(),
    mediaWeeks(),
    getWeights(),
  ]);

  const crmOn = new Set(integrations.filter((i) => i.active).map((i) => i.client_id));
  const metaOn = new Set([...metaLinks, ...googleLinks].filter((l) => l.active).map((l) => l.client_id));
  const semMeta = clients.filter((c) => !hasTargets(c, targets.get(c.id)));
  const semFonte = clients.filter((c) => !crmOn.has(c.id) && !metaOn.has(c.id));

  const emailOn = isEmailConfigured();
  const waOn = isWhatsappConfigured();
  const activeCharges = charges.filter((c) => c.active);
  const naoEnviadas = activeCharges.filter((c) => !chargeWillSend(c, emailOn, waOn));
  const comContato = activeCharges.filter((c) => c.billingEmail || c.billingPhone);

  // Verba sem leads: as duas últimas semanas fechadas com gasto e zero lead
  // (da Meta, ou do CRM quando ele existe — é a fonte que vence no score).
  const w1 = currentRitualDate();
  const d = new Date(w1 + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 7);
  const w0 = d.toISOString().slice(0, 10);
  const crmLeads = await all<{ client_id: number; ref_date: string; n: number }>(
    `SELECT client_id, ref_date::text AS ref_date, COUNT(*)::int AS n FROM crm_leads
     WHERE ref_date IN (?::date, ?::date) GROUP BY client_id, ref_date`,
    [w0, w1],
  );
  const crmBy = new Map(crmLeads.map((r) => [`${r.client_id}:${r.ref_date}`, Number(r.n)]));
  const verbaSemLeads = clients
    .map((c) => {
      const weeks = metaByClient.get(c.id);
      if (!weeks) return null;
      let spend = 0;
      for (const ref of [w0, w1]) {
        const m = weeks.get(ref);
        if (!m || m.week.spend <= 0) return null;
        const leads = crmOn.has(c.id) ? (crmBy.get(`${c.id}:${ref}`) ?? 0) : m.leads;
        if (leads > 0) return null;
        spend += m.week.spend;
      }
      return { client: c, spend };
    })
    .filter((x): x is { client: ClientRow; spend: number } => x !== null);

  const metaErros = [...metaLinks, ...googleLinks].filter((l) => l.active && l.last_error);

  const leadWeight = weights.lead_quality ?? DIMENSIONS.find((x) => x.key === "lead_quality")!.defaultWeight;
  const nextDue = naoEnviadas.map((c) => c.dueDate).sort()[0];
  const pick = (list: ClientRow[]) => list.map((c) => ({ id: c.id, name: c.name }));

  const pendencias: Pendencia[] = [];
  if (semMeta.length)
    pendencias.push({
      id: "sem_meta",
      severity: "bloqueia",
      title: `${semMeta.length} ${plural(semMeta.length, "cliente sem meta", "clientes sem meta")}`,
      shortTitle: `${semMeta.length} ${plural(semMeta.length, "cliente sem meta", "clientes sem meta")}`,
      consequence: "Sem meta não há régua: o score dessas contas não é calculado e elas somem dos alertas.",
      shortConsequence: "O score dessas contas não é calculado.",
      clients: pick(semMeta),
      action: {
        label: "Definir metas",
        href: "/gt?filtro=sem_meta",
        hint: "Em Performance, cliente a cliente",
        primary: true,
      },
    });
  if (semFonte.length)
    pendencias.push({
      id: "sem_fonte",
      severity: "bloqueia",
      title: `${semFonte.length} ${plural(semFonte.length, "cliente sem fonte de leads", "clientes sem fonte de leads")}`,
      shortTitle: `${semFonte.length} sem fonte de leads`,
      consequence: `A dimensão Qualidade de lead / MQL (${leadWeight}% do score) fica sem dado e reduz a confiança.`,
      shortConsequence: "Lead / MQL fica sem dado.",
      clients: pick(semFonte),
      action: { label: "Conectar CRM", href: "/config/clientes?filtro=sem_fonte&seq=1", hint: "Gera uma URL de webhook por cliente" },
    });
  if (naoEnviadas.length)
    pendencias.push({
      id: "cobranca_sem_canal",
      severity: "atencao",
      title: `${naoEnviadas.length} ${plural(naoEnviadas.length, "cobrança não será enviada", "cobranças não serão enviadas")}`,
      shortTitle: `${naoEnviadas.length} ${plural(naoEnviadas.length, "cobrança não será enviada", "cobranças não serão enviadas")}`,
      consequence:
        !emailOn && !waOn
          ? `Nenhum canal de envio configurado. As cobranças são registradas, mas não disparam${nextDue ? ` — próximo vencimento ${dateBR(nextDue)}` : ""}.`
          : `Falta o contato de cobrança do cliente para o canal configurado${nextDue ? ` — próximo vencimento ${dateBR(nextDue)}` : ""}.`,
      shortConsequence: !emailOn && !waOn ? "Nenhum canal de envio configurado." : "Falta contato de cobrança.",
      clients: naoEnviadas.map((c) => ({ id: c.clientId, name: c.clientName })),
      action:
        !emailOn && !waOn
          ? { label: "Configurar e-mail", href: "/gt/canais", hint: "Leva 2 minutos" }
          : { label: "Revisar contatos", href: "/config/cobranca" },
    });
  for (const v of verbaSemLeads)
    pendencias.push({
      id: "verba_sem_leads",
      severity: "atencao",
      title: "Verba sem leads há 2 semanas",
      shortTitle: "Verba sem leads há 2 semanas",
      consequence: `${v.client.name} gastou ${brl0(v.spend)} sem nenhum lead registrado. Possível formulário desligado da campanha.`,
      shortConsequence: `${v.client.name} · ${brl0(v.spend)} sem leads.`,
      clients: [{ id: v.client.id, name: v.client.name }],
      action: { label: "Revisar integração", href: "/gt/integracoes" },
    });
  if (metaErros.length)
    pendencias.push({
      id: "meta_erro",
      severity: "atencao",
      title: `${metaErros.length} ${plural(metaErros.length, "conta de mídia com erro", "contas de mídia com erro")}`,
      shortTitle: "Mídia com erro de sincronização",
      consequence: `A última sincronização falhou: ${metaErros[0].last_error}`,
      shortConsequence: "A última sincronização falhou.",
      clients: metaErros.map((l) => ({ id: l.client_id, name: l.client_name })),
      action: { label: "Revisar integração", href: "/gt/integracoes" },
    });

  return {
    clients,
    targets,
    integrations,
    metaLinks,
    googleLinks,
    media: metaByClient,
    charges: activeCharges,
    semMeta,
    semFonte,
    naoEnviadas,
    comContato,
    verbaSemLeads,
    crmOn,
    metaOn,
    emailOn,
    waOn,
    pendencias,
  };
}

export type ConfigSnapshot = Awaited<ReturnType<typeof configSnapshot>>;

/** Contadores do menu de Configurações. */
export type ConfigBadges = {
  pendencias: number;
  clientes: number;
  cobranca: number;
  integracoes: number;
  canais: boolean;
};

export function badgesOf(s: ConfigSnapshot): ConfigBadges {
  return {
    pendencias: s.pendencias.length,
    clientes: s.semMeta.length,
    cobranca: s.naoEnviadas.length,
    integracoes: s.semFonte.length,
    canais: !s.emailOn && !s.waOn,
  };
}

/* ----------------------------- Funcionando ----------------------------- */

export type HealthItem = { label: string; detail: string; ok: boolean; href: string };

const SP = "America/Sao_Paulo";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: SP });

/** "Hoje, 05:58", "Ontem, 18:42" ou "24/09, 18:42" — no fuso de São Paulo. */
export function whenBR(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts.includes("T") || ts.includes(" ") ? ts.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00") : ts);
  if (Number.isNaN(d.getTime())) return "—";
  const time = d.toLocaleTimeString("pt-BR", { timeZone: SP, hour: "2-digit", minute: "2-digit" });
  const now = new Date();
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (dayKey(d) === dayKey(now)) return `Hoje, ${time}`;
  if (dayKey(d) === dayKey(y)) return `Ontem, ${time}`;
  return `${d.toLocaleDateString("pt-BR", { timeZone: SP, day: "2-digit", month: "2-digit" })}, ${time}`;
}

export const daysSince = (ts: string | null | undefined) => {
  if (!ts) return null;
  const d = new Date(ts.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  return Number.isNaN(d.getTime()) ? null : Math.floor((Date.now() - d.getTime()) / 86_400_000);
};

export async function healthItems(s: ConfigSnapshot, calibratedAt: string | null): Promise<HealthItem[]> {
  const [stamp, users] = await Promise.all([
    lastRecompute(),
    one<{ active: number; admins: number }>(
      `SELECT COUNT(*) FILTER (WHERE active = 1 AND login IS NOT NULL)::int AS active,
              COUNT(*) FILTER (WHERE active = 1 AND is_admin = 1)::int AS admins
       FROM users`,
    ),
  ]);
  const items: HealthItem[] = [];

  const lastSync = s.metaLinks
    .map((l) => l.last_sync_at)
    .filter((x): x is string => Boolean(x))
    .sort()
    .pop();
  items.push(
    !metaConfigured()
      ? { label: "Meta Ads", detail: "Token do sistema não configurado", ok: false, href: "/gt/integracoes" }
      : {
          label: "Meta Ads",
          detail: lastSync ? `Sincronizado ${whenBR(lastSync).replace(/^Hoje/, "hoje").replace(/^Ontem/, "ontem")}` : "Nenhuma conta vinculada",
          ok: Boolean(lastSync) && !s.metaLinks.some((l) => l.active && l.last_error),
          href: "/gt/integracoes",
        },
  );

  const googleSync = s.googleLinks
    .map((l) => l.last_sync_at)
    .filter((x): x is string => Boolean(x))
    .sort()
    .pop();
  items.push(
    !googleAdsConfigured()
      ? { label: "Google Ads", detail: "Credencial não configurada", ok: false, href: "/gt/integracoes" }
      : {
          label: "Google Ads",
          detail: googleSync ? `Sincronizado ${whenBR(googleSync).replace(/^Hoje/, "hoje").replace(/^Ontem/, "ontem")}` : "Nenhuma conta vinculada",
          ok: Boolean(googleSync) && !s.googleLinks.some((l) => l.active && l.last_error),
          href: "/gt/integracoes",
        },
  );

  const age = daysSince(stamp?.at);
  items.push({
    label: "Recompute do score",
    detail: stamp ? `${whenBR(stamp.at)} · ${stamp.clients} clientes` : "Ainda não rodou",
    ok: age !== null && age <= 1,
    href: "/config/modelo",
  });

  for (const i of s.integrations.filter((x) => x.active)) {
    const last = i.last_event_at ?? i.last_lead_at;
    const since = daysSince(last);
    items.push({
      label: `Webhook ${i.client_name}`,
      detail: last ? `Último lead em ${whenBR(last).replace(/, \d{2}:\d{2}$/, "").replace(/^Hoje$/, "hoje").replace(/^Ontem$/, "ontem")}` : "Nenhum lead recebido",
      ok: since !== null && since <= 7,
      href: "/gt/integracoes",
    });
  }

  const calAge = daysSince(calibratedAt);
  items.push({
    label: "Calibração",
    detail: calAge === null ? "Nunca revisada" : calAge === 0 ? "Revisada hoje" : `Revisada há ${calAge} ${calAge === 1 ? "dia" : "dias"}`,
    ok: calAge !== null && calAge <= 100,
    href: "/config/modelo",
  });

  items.push({
    label: "Usuários",
    detail: `${users?.active ?? 0} ativos · ${users?.admins ?? 0} ${users?.admins === 1 ? "admin" : "admins"}`,
    ok: true,
    href: "/config/usuarios",
  });
  return items;
}

/** "Verificado hoje, 06:00": a última passada do recompute diário. */
export async function verifiedLabel() {
  const stamp = await lastRecompute();
  return stamp ? `Verificado ${whenBR(stamp.at).replace(/^Hoje/, "hoje").replace(/^Ontem/, "ontem")}` : "Ainda não verificado";
}

export { today };
