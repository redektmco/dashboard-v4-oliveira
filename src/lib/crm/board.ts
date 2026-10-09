import { all } from "../db";
import {
  getConfig,
  lastCheckinByClient,
  listClients,
  listOpenPlans,
  portfolio,
  riskRank,
  today,
  type ClientRow,
  type Plan,
} from "../repo";
import { configSnapshot, type Pendencia } from "../config-status";
import { lateSteps } from "../playbook/db";
import { listRequests } from "../churn/db";
import { isOpen, type ChurnStatus } from "../churn/types";
import { nextActions, type NextAction } from "../client-view";
import { ACCOUNT_TYPE_LABEL, type AccountType, type Band, type Stage } from "../model/types";
import { targetFields } from "../model/target-fields";
import { daysBetween } from "../model/scoring";
import { stageOf } from "./stage";
import { lastInteractionByClient, type Interaction, type InteractionKind } from "./interactions";
import { whenBR } from "../config-status";
import type { GoogleLinkRowView, MetaLinkView, WebhookView } from "../../components/config/connections";

/**
 * O agregado da tela de Clientes (CRM).
 *
 * Regra de ouro desta função: **uma rodada de leitura para a carteira
 * inteira**. São 40+ contas e cada query é um round-trip HTTP no Neon — nada
 * de consultar dentro de um laço. Tudo o que é cálculo (etapa, pendências,
 * próxima ação) roda em memória, com funções puras que já existem:
 * `nextActions` (lib/client-view), `stageOf` (lib/crm/stage), `riskRank`.
 *
 * A metade de "configuração" (metas, fontes de leads, cobrança, pendências)
 * vem inteira de `configSnapshot()`, que já é a fonte única dessas regras e
 * é `cache()`ada por requisição — por isso nada daquilo é relido aqui.
 */

/* ----------------------------- tipos ----------------------------- */

export type PendenciaTag = { id: string; label: string; severity: "bloqueia" | "atencao" };

export type CrmRow = {
  id: number;
  name: string;
  active: boolean;
  accountType: AccountType;
  typeLabel: string;
  /** Segmento/nicho da conta — `clients.niche`. */
  segment: string | null;
  accountName: string | null;
  gtName: string | null;

  /** Saúde. `history` são os últimos pontos do score, para o sparkline. */
  score: number | null;
  band: Band | null;
  delta7: number | null;
  history: (number | null)[];

  stage: Stage;
  /** A etapa veio de `stage_override` e não da regra. */
  stageManual: boolean;

  mrr: number;
  since: string | null;
  renewalDate: string | null;
  renewalIn: number | null;
  services: string[];

  lastInteraction: { at: string; kind: InteractionKind; title: string; days: number } | null;
  nextAction: NextAction | null;
  pendencias: PendenciaTag[];
  openTasks: number;

  /** Metas: quantas das previstas para o tipo de conta estão definidas. */
  targets: { set: number; total: number };
  leadSources: string[];
  charge: { amount: number; dueDate: string; willSend: boolean } | null;
  churn: { id: number; status: ChurnStatus } | null;

  /**
   * Conexões editáveis no painel rápido. Continuam aqui (e não só na ficha)
   * porque gerar e girar o webhook do cliente só existe nesta tela —
   * Performance › Integrações é leitura e aponta de volta para cá.
   */
  hook: WebhookView | null;
  meta: MetaLinkView[];
  google: GoogleLinkRowView[];
};

export type CrmSummary = {
  ativos: number;
  mrrTotal: number;
  saudaveis: number;
  atencao: number;
  criticos: number;
  semScore: number;
  churn: number;
  comPendencias: number;
  arquivados: number;
  mrrEmRisco: number;
};

export type CrmBoard = { rows: CrmRow[]; summary: CrmSummary };

/* --------------------------- helpers ----------------------------- */

/** "hoje", "ontem", "há 4 dias" — o recorte que a listagem mostra. */
export function agoLabel(days: number): string {
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  return months === 1 ? "há 1 mês" : `há ${months} meses`;
}

const openTasksOf = (plans: Plan[]) =>
  plans.reduce((n, p) => n + p.tasks.filter((t) => !t.done).length, 0) + plans.length;

/* ---------------------------- carga ------------------------------ */

export async function crmBoard({ baseUrl, at = today() }: { baseUrl: string; at?: string }): Promise<CrmBoard> {
  const [rows, config, snap, allClients, interactions, checkins, plans, late, churn, upsells] = await Promise.all([
    portfolio(at),
    getConfig(),
    configSnapshot(),
    listClients(false),
    lastInteractionByClient(),
    lastCheckinByClient(),
    listOpenPlans(),
    lateSteps(),
    listRequests(),
    all<{ client_id: number; n: number }>(
      `SELECT client_id, COUNT(*)::int AS n FROM upsell_opportunities
       WHERE stage NOT IN ('ganha','perdida') AND closed_at IS NULL
       GROUP BY client_id`,
    ),
  ]);

  const interactionBy = new Map(interactions.map((i) => [i.client_id, i]));
  const checkinBy = new Map(checkins.map((s) => [s.client_id, s]));
  const lateBy = new Map(late.map((l) => [l.client_id, Number(l.n)]));
  const upsellBy = new Set(upsells.map((u) => u.client_id));

  const plansBy = new Map<number, Plan[]>();
  for (const p of plans) plansBy.set(p.client_id, [...(plansBy.get(p.client_id) ?? []), p]);

  const churnBy = new Map<number, { id: number; status: ChurnStatus }>();
  for (const r of churn) if (isOpen(r.status) && !churnBy.has(r.client_id)) churnBy.set(r.client_id, { id: r.id, status: r.status });

  // A parcela que vence primeiro é a que a listagem mostra — mesma escolha da
  // tela antiga de cadastro.
  const chargeBy = new Map<number, (typeof snap.charges)[number]>();
  for (const c of [...snap.charges].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))) {
    if (!chargeBy.has(c.clientId)) chargeBy.set(c.clientId, c);
  }

  // Pendências: `configSnapshot` já decide a regra de cada uma e devolve a
  // lista de clientes afetados. Aqui só viramos do avesso, de pendência→
  // clientes para cliente→pendências.
  const pendBy = new Map<number, PendenciaTag[]>();
  const tag = (clientId: number, t: PendenciaTag) => pendBy.set(clientId, [...(pendBy.get(clientId) ?? []), t]);
  for (const p of snap.pendencias as Pendencia[]) {
    for (const c of p.clients) tag(c.id, { id: p.id, label: p.shortTitle, severity: p.severity });
  }

  const sourcesBy = new Map<number, string[]>();
  const addSource = (clientId: number, label: string) =>
    sourcesBy.set(clientId, [...(sourcesBy.get(clientId) ?? []), label]);
  for (const i of snap.integrations) if (i.active) addSource(i.client_id, i.crm_name || "CRM");
  for (const m of snap.metaLinks) if (m.active) addSource(m.client_id, "Meta Ads");
  for (const g of snap.googleLinks) if (g.active) addSource(g.client_id, "Google Ads");

  // As mesmas conexões, agora na forma que os controles de edição esperam.
  const hookBy = new Map<number, WebhookView>(
    snap.integrations.map((i) => [
      i.client_id,
      {
        url: `${baseUrl}/api/integrations/webhook/${i.token}`,
        active: Boolean(i.active),
        crmName: i.crm_name,
        lastEvent: whenBR(i.last_event_at ?? i.last_lead_at),
        weekLeads: i.week_leads,
        totalLeads: i.total_leads,
      },
    ]),
  );
  const googleBy = new Map<number, GoogleLinkRowView[]>();
  for (const l of snap.googleLinks) {
    const view: GoogleLinkRowView = {
      customerId: l.customer_id,
      name: l.name || l.customer_id,
      active: Boolean(l.active),
      lastSync: whenBR(l.last_sync_at),
      error: l.last_error,
    };
    googleBy.set(l.client_id, [...(googleBy.get(l.client_id) ?? []), view]);
  }

  const metaBy = new Map<number, MetaLinkView[]>();
  for (const l of snap.metaLinks) {
    const view: MetaLinkView = {
      adAccountId: l.ad_account_id,
      name: l.name,
      leadMetric: l.lead_metric,
      active: Boolean(l.active),
      lastSync: whenBR(l.last_sync_at),
      error: l.last_error,
    };
    metaBy.set(l.client_id, [...(metaBy.get(l.client_id) ?? []), view]);
  }

  const scored = new Map(rows.map((r) => [r.client.id, r]));

  const build = (client: ClientRow): CrmRow => {
    const p = scored.get(client.id) ?? null;
    const clientPlans = plansBy.get(client.id) ?? [];
    const latePlans = clientPlans.filter((x) => x.due_date && x.due_date < at).length;
    const lateStepN = lateBy.get(client.id) ?? 0;
    const fields = targetFields(client.account_type);
    const targets = snap.targets.get(client.id) ?? {};
    const hasTargets = fields.some((f) => targets[f.key] !== undefined);
    const inter = interactionBy.get(client.id) ?? null;
    const charge = chargeBy.get(client.id) ?? null;

    const pendencias = [...(pendBy.get(client.id) ?? [])];
    if (latePlans)
      pendencias.push({
        id: "plano_vencido",
        label: latePlans === 1 ? "Plano de ação vencido" : `${latePlans} planos vencidos`,
        severity: "bloqueia",
      });
    if (lateStepN)
      pendencias.push({
        id: "playbook_atrasado",
        label: lateStepN === 1 ? "Passo do playbook atrasado" : `${lateStepN} passos do playbook atrasados`,
        severity: "atencao",
      });

    const next = client.active
      ? nextActions({
          client,
          at,
          lastCheckin: checkinBy.get(client.id) ?? null,
          plans: clientPlans,
          config,
          hasTargets,
        })[0] ?? null
      : null;

    return {
      id: client.id,
      name: client.name,
      active: Boolean(client.active),
      accountType: client.account_type,
      typeLabel: ACCOUNT_TYPE_LABEL[client.account_type],
      segment: client.niche,
      accountName: client.account_name,
      gtName: client.gt_name,

      score: p?.score.score ?? null,
      band: p?.score.band ?? null,
      delta7: p?.delta7 ?? null,
      history: (p?.history ?? []).slice(-8).map((h) => h.score),

      stage: stageOf({
        override: client.stage_override,
        churnOpen: churnBy.has(client.id),
        upsellOpen: upsellBy.has(client.id),
        since: client.contract_start ?? client.created_at.slice(0, 10),
        renewalDate: client.renewal_date,
        at,
      }),
      stageManual: Boolean(client.stage_override),

      mrr: Number(client.mrr),
      since: client.contract_start ?? client.created_at.slice(0, 10),
      renewalDate: client.renewal_date,
      renewalIn: client.renewal_date ? daysBetween(at, client.renewal_date) : null,
      services: client.services ?? [],

      lastInteraction: inter ? interactionView(inter, at) : null,
      nextAction: next,
      pendencias,
      openTasks: openTasksOf(clientPlans),

      targets: { set: fields.filter((f) => targets[f.key] !== undefined).length, total: fields.length },
      leadSources: sourcesBy.get(client.id) ?? [],
      charge: charge
        ? { amount: charge.amount, dueDate: charge.dueDate, willSend: snap.naoEnviadas.every((n) => n.id !== charge.id) }
        : null,
      churn: churnBy.get(client.id) ?? null,

      hook: hookBy.get(client.id) ?? null,
      meta: metaBy.get(client.id) ?? [],
      google: googleBy.get(client.id) ?? [],
    };
  };

  // Ativos primeiro, ordenados por risco (igual à Carteira); arquivados ao fim.
  const ativos = allClients.filter((c) => c.active);
  const arquivados = allClients.filter((c) => !c.active);
  const byRisk = (a: ClientRow, b: ClientRow) => {
    const pa = scored.get(a.id);
    const pb = scored.get(b.id);
    if (!pa || !pb) return a.name.localeCompare(b.name, "pt-BR");
    return riskRank(pa) - riskRank(pb);
  };
  const built = [...[...ativos].sort(byRisk), ...arquivados].map(build);

  return { rows: built, summary: summarize(built) };
}

function interactionView(i: Interaction, at: string) {
  return { at: i.at, kind: i.kind, title: i.title, days: Math.max(0, daysBetween(i.at.slice(0, 10), at)) };
}

export function summarize(rows: CrmRow[]): CrmSummary {
  const ativos = rows.filter((r) => r.active);
  const count = (b: Band) => ativos.filter((r) => r.band === b).length;
  return {
    ativos: ativos.length,
    mrrTotal: ativos.reduce((n, r) => n + r.mrr, 0),
    saudaveis: count("verde"),
    atencao: count("amarelo"),
    criticos: count("vermelho"),
    semScore: ativos.filter((r) => r.band === null).length,
    churn: ativos.filter((r) => r.churn).length,
    comPendencias: ativos.filter((r) => r.pendencias.length).length,
    arquivados: rows.length - ativos.length,
    mrrEmRisco: ativos.filter((r) => r.band === "vermelho").reduce((n, r) => n + r.mrr, 0),
  };
}
