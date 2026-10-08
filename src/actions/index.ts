"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import {
  createClient,
  createIntegration,
  createPlan,
  deleteClient,
  deleteIntegration,
  deletePlan,
  getClient,
  getGoogleLink,
  previewScore,
  getMetaLink,
  getPlan,
  importClients,
  linkGoogleAccount,
  linkMetaAccount,
  persistScore,
  recomputeAll,
  recomputeRange,
  rotateIntegrationToken,
  saveSnapshot,
  scoreFor,
  setIntegrationActive,
  setGoogleAccountActive,
  setMetaAccountActive,
  setMetaLeadMetric,
  setTargets,
  today,
  unlinkGoogleAccount,
  unlinkMetaAccount,
  updateClient,
  updatePlan,
  updatePlanStatus,
  setPlanTasks,
  setNextCheckin,
  setIntegrationCrm,
  suggestTargets,
  type Plan,
  type PlanPriority,
  type PlanTask,
} from "@/lib/repo";
import { logChange } from "@/lib/audit";
import {
  describeChanges,
  getVersion,
  previewImpact,
  sanitizeCalibration,
  saveVersion,
  type ImpactPreview,
} from "@/lib/calibration";
import { getConfig, getWeights } from "@/lib/repo";
import { targetKeysFor } from "@/lib/model/catalog";
import { parseCheckinForm } from "@/lib/model/form";
import type { AccountType, Band, DimensionKey } from "@/lib/model/types";
import { ACCOUNT_TYPE_LABEL } from "@/lib/model/types";
import { DIMENSIONS } from "@/lib/model/catalog";
import { requireAdmin, requireUser } from "@/lib/auth";
import type { ActionResult } from "@/lib/action";
import { listAdAccounts, metaConfigured, type AdAccount } from "@/lib/meta/graph";
import { LEAD_METRIC_LABEL, type LeadMetric } from "@/lib/meta/metrics";
import { syncMeta } from "@/lib/meta/sync";
import { getCustomer, googleAdsConfigured, listClientAccounts } from "@/lib/google/ads";
import type { GoogleAccount } from "@/lib/google/metrics";
import { formatCustomerId, normalizeCustomerId } from "@/lib/google/metrics";
import { syncGoogle } from "@/lib/google/sync";
import { parseClientsSheet } from "@/lib/import/clients-sheet";

const str = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() ?? "";
const numOrNull = (f: FormData, k: string) => {
  const v = str(f, k).replace(/\./g, "").replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
};

/**
 * Metas, integrações e canais aparecem em Configurações e em Performance:
 * o que muda um muda o outro.
 */
function revalidateSettings() {
  revalidatePath("/config", "layout");
  revalidatePath("/gt", "layout");
}

/** Recalcula e grava o snapshot do dia para um cliente — chamado após cada input. */
async function refresh(clientId: number) {
  const r = await scoreFor(clientId);
  if (r) await persistScore(clientId, today(), r);
}

/* ------------------- input do Account (check-in) ------------------- */

export async function saveCheckin(formData: FormData) {
  const me = await requireUser();
  const clientId = Number(str(formData, "client_id"));
  const refDate = str(formData, "ref_date") || today();
  const filledBy = Number(str(formData, "filled_by")) || null;

  const data = parseCheckinForm((k) => str(formData, k));

  await saveSnapshot("checkin", clientId, refDate, filledBy, data);

  const renewal = str(formData, "renewal_date");
  if (renewal) await updateClient(clientId, { renewal_date: renewal });
  // Check-in feito: a agenda do próximo volta a ser a regra de frescor.
  await setNextCheckin(clientId, null);

  // Risco explícito de saída: o plano nasce junto com o check-in, com dono e prazo.
  if (data.risk_flag === true && str(formData, "create_plan") === "on") {
    const client = await getClient(clientId);
    const owner = str(formData, "plan_owner") || client?.account_name || me.name;
    await createPlan({
      client_id: clientId,
      created_by: me.id ?? null,
      risk: "Risco de saída",
      plan: String(data.risk_note || "Risco explícito de saída identificado no check-in."),
      owner,
      due_date: str(formData, "plan_due") || null,
      priority: "alta",
      dimension: "relationship",
      tasks: [],
    });
    await logChange(me, "plano", `Plano de ação criado: Risco de saída`, { clientId });
  }

  await refresh(clientId);
  revalidatePath("/");
  revalidatePath("/account");
  revalidatePath(`/clientes/${clientId}`);
  // "Registrar em sequência": depois de salvar, abre a próxima conta da fila.
  const [next, ...rest] = str(formData, "fila").split(",").map(Number).filter((n) => n > 0);
  if (next) {
    const msg = encodeURIComponent(`Check-in salvo. Próxima conta: ${rest.length + 1} restante(s).`);
    redirect(`/account/${next}?${rest.length ? `fila=${rest.join(",")}&` : ""}ok=${msg}`);
  }
  redirect(`/clientes/${clientId}?ok=${encodeURIComponent("Check-in salvo e score recalculado.")}`);
}

/** Score que o check-in em preenchimento daria — não grava nada. */
export async function previewCheckin(
  clientId: number,
  values: Record<string, string>,
): Promise<{ score: number | null; band: Band | null } | null> {
  await requireUser();
  const r = await previewScore(clientId, values.ref_date || today(), parseCheckinForm((k) => values[k] ?? ""));
  return r ? { score: r.score, band: r.band } : null;
}

/* -------------------------- cadastro ------------------------------- */

/**
 * Cria ou edita um cliente (modal "Novo cliente" / "Editar"). Devolve o
 * resultado em vez de redirecionar: o modal fecha e a lista se atualiza no
 * lugar. O recálculo do score do dia sai depois da resposta — a carteira
 * calcula o score ao vivo, então ninguém espera por ele.
 */
export async function saveClient(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const id = Number(str(formData, "id")) || 0;
  const name = str(formData, "name");
  const accountType = str(formData, "account_type") as AccountType;
  if (!name) return { error: "Informe o nome do cliente." };
  if (!(accountType in ACCOUNT_TYPE_LABEL)) return { error: "Escolha o tipo de conta." };

  const payload = {
    name,
    account_type: accountType,
    mrr: numOrNull(formData, "mrr") ?? 0,
    gt_user_id: Number(str(formData, "gt_user_id")) || null,
    account_user_id: Number(str(formData, "account_user_id")) || null,
    renewal_date: str(formData, "renewal_date") || null,
    contract_code: str(formData, "contract_code") || null,
    services: str(formData, "services")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    contract_start: str(formData, "contract_start") || null,
    fidelity_months: numOrNull(formData, "fidelity_months"),
    notice_days: numOrNull(formData, "notice_days"),
  };
  const clientId = id ? (await updateClient(id, payload), id) : await createClient(payload);

  const targets: Record<string, number> = {};
  for (const t of targetKeysFor(payload.account_type)) {
    const v = numOrNull(formData, t.key);
    if (v !== null) targets[t.key] = v;
  }
  if (Object.keys(targets).length)
    await setTargets(clientId, targets, str(formData, "effective_from") || today(), me.id);

  if (!id) await logChange(me, "cliente", `Cliente cadastrado: ${name}`, { clientId });

  after(() => refresh(clientId));
  revalidateSettings();
  revalidatePath("/");
  return { ok: id ? `${name} atualizado.` : `${name} cadastrado.` };
}

/** Arquivar tira o cliente da carteira e dos formulários sem apagar histórico. */
export async function setClientArchived(id: number, archived: boolean): Promise<ActionResult> {
  await requireUser();
  const client = await getClient(id);
  if (!client) return { error: "Cliente não encontrado." };
  await updateClient(id, { active: archived ? 0 : 1 });
  await logChange(await requireUser(), "cliente", `${archived ? "Cliente arquivado" : "Cliente reativado"}: ${client.name}`, {
    clientId: id,
  });
  revalidateSettings();
  revalidatePath("/");
  revalidatePath("/account");
  return { ok: archived ? `${client.name} arquivado.` : `${client.name} voltou para a carteira.` };
}

/**
 * Exclusão definitiva — só administradores, e só confirmando o nome. Leva
 * junto todo o histórico do cliente (ver `deleteClient`).
 */
export async function removeClient(id: number, confirmName: string): Promise<ActionResult> {
  await requireAdmin();
  const client = await getClient(id);
  if (!client) return { error: "Cliente não encontrado." };
  if (confirmName.trim().toLowerCase() !== client.name.trim().toLowerCase())
    return { error: "O nome digitado não confere." };
  await deleteClient(id);
  revalidatePath("/config");
  revalidatePath("/");
  revalidatePath("/social");
  return { ok: `${client.name} excluído com todo o histórico.` };
}

/* ------------------------- calibração ------------------------------ */

/**
 * Salva a calibração como nova versão (v8, v9…) e reescreve a série dos
 * últimos 90 dias. `restoreFrom` marca que a versão nova é a volta de uma
 * antiga — o histórico fica linear, nada é apagado.
 */
async function applyCalibration(
  next: { weights: ReturnType<typeof sanitizeCalibration>["weights"]; config: ReturnType<typeof sanitizeCalibration>["config"] },
  note: string,
): Promise<ActionResult & { version?: number }> {
  const me = await requireUser();
  const [weights, config] = await Promise.all([getWeights(), getConfig()]);
  const changes = describeChanges({ weights, config }, next);
  if (!changes.length && !note.startsWith("Volta")) return { error: "Nada mudou em relação à versão em uso." };
  const version = await saveVersion(next.weights, next.config, note || changes.join(" · "), me.id);
  for (const c of changes.length ? changes : [note]) await logChange(me, "calibracao", c, { data: { version } });
  await recomputeRange(90);
  revalidatePath("/");
  revalidateSettings();
  return { ok: `Versão v${version} salva e últimos 90 dias recalculados.`, version };
}

export async function saveCalibration(input: {
  weights: Record<string, unknown>;
  config: Record<string, unknown>;
}): Promise<ActionResult & { version?: number }> {
  await requireUser();
  const next = sanitizeCalibration(input);
  const total = Object.values(next.weights).reduce((a, b) => a + (b ?? 0), 0);
  if (total !== 100) return { error: `Os pesos somam ${total}% — precisam somar 100%.` };
  if (next.config.yellowFloor >= next.config.greenFloor)
    return { error: "O piso da Atenção precisa ser menor que o do Saudável." };
  return applyCalibration(next, "");
}

export async function restoreCalibration(version: number): Promise<ActionResult & { version?: number }> {
  await requireUser();
  const v = await getVersion(version);
  if (!v) return { error: "Versão não encontrada." };
  return applyCalibration({ weights: v.weights, config: v.config }, `Volta à v${version}`);
}

/** Prévia do impacto com a calibração ainda não salva. Não grava nada. */
export async function previewCalibration(input: {
  weights: Record<string, unknown>;
  config: Record<string, unknown>;
}): Promise<ImpactPreview | { error: string }> {
  await requireUser();
  const next = sanitizeCalibration(input);
  return previewImpact(next.weights, next.config);
}

/** Volta os pesos e limiares ao padrão do modelo (também vira versão). */
export async function resetWeights(): Promise<ActionResult> {
  await requireUser();
  return applyCalibration(sanitizeCalibration({}), "Volta ao padrão do modelo");
}

export async function runRecompute(): Promise<ActionResult> {
  await requireUser();
  const r = await recomputeAll();
  revalidatePath("/");
  return { ok: `Score do dia recalculado para ${r.clients} cliente(s).` };
}

/* ----------------------- integrações (CRM) ------------------------- */

export async function enableIntegration(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const clientId = Number(str(formData, "client_id"));
  if (!clientId) return { error: "Escolha o cliente." };
  await createIntegration(clientId, me.id ?? null);
  const crm = str(formData, "crm_name");
  if (crm) await setIntegrationCrm(clientId, crm);
  const c = await getClient(clientId);
  await logChange(me, "integracao", `Webhook conectado: ${c?.name ?? "cliente"}`, { clientId });
  revalidateSettings();
  return { ok: "Webhook gerado. Copie o endereço e cole no CRM." };
}

export async function setIntegrationPaused(clientId: number, paused: boolean): Promise<ActionResult> {
  await requireAdmin();
  await setIntegrationActive(clientId, !paused);
  // Ligar/desligar muda o que entra no score — recalcula a série recente.
  after(() => recomputeRange(45));
  revalidateSettings();
  revalidatePath("/");
  return { ok: paused ? "Integração pausada — os leads voltam para o input manual." : "Integração reativada." };
}

export async function rotateIntegration(clientId: number): Promise<ActionResult> {
  await requireAdmin();
  await rotateIntegrationToken(clientId);
  revalidateSettings();
  return { ok: "Novo endereço gerado. Atualize o webhook no CRM." };
}

export async function setIntegrationCrmName(clientId: number, crmName: string): Promise<ActionResult> {
  await requireAdmin();
  await setIntegrationCrm(clientId, crmName.trim() || null);
  revalidateSettings();
  return { ok: "CRM de origem atualizado." };
}

export async function removeIntegration(clientId: number): Promise<ActionResult> {
  const me = await requireAdmin();
  const c = await getClient(clientId);
  await deleteIntegration(clientId);
  await logChange(me, "integracao", `Webhook removido: ${c?.name ?? "cliente"}`, { clientId });
  after(() => recomputeRange(45));
  revalidateSettings();
  revalidatePath("/");
  return { ok: "Integração removida. Os leads já recebidos continuam no histórico." };
}

/* ------------------------ importação de planilha -------------------- */

export async function importClientsSheet(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Escolha o arquivo .csv da planilha." };
  if (file.size > 5 * 1024 * 1024) return { error: "Arquivo grande demais (máx. 5 MB)." };
  let rows;
  try {
    rows = parseClientsSheet(await file.text());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não consegui ler a planilha." };
  }
  if (!rows.length) return { error: "Nenhum cliente encontrado na planilha." };
  const r = await importClients(rows);
  after(() => recomputeAll());
  revalidatePath("/config");
  revalidatePath("/");
  const people = r.people.length ? ` · ${r.people.length} pessoa(s) do time adicionada(s)` : "";
  return { ok: `${r.created.length} cliente(s) novo(s), ${r.updated.length} atualizado(s)${people}.` };
}

/* ---------------------------- Meta Ads ----------------------------- */

const LEAD_METRICS: LeadMetric[] = ["lead", "messaging", "both"];

/** Contas de anúncio que o token enxerga — carregadas só quando o modal abre. */
export async function loadMetaAdAccounts(): Promise<{ accounts?: AdAccount[]; error?: string }> {
  await requireAdmin();
  try {
    return { accounts: await listAdAccounts() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao falar com a Meta." };
  }
}

export async function connectMetaAccount(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  const clientId = Number(str(formData, "client_id"));
  const accountId = str(formData, "ad_account_id");
  const metric = str(formData, "lead_metric") as LeadMetric;
  if (!clientId) return { error: "Escolha o cliente." };
  if (!accountId) return { error: "Escolha a conta de anúncio." };
  if (!LEAD_METRICS.includes(metric)) return { error: "Escolha o que conta como lead." };

  // Revalida no servidor: só vincula conta que o token realmente enxerga.
  let acc: AdAccount | undefined;
  try {
    acc = (await listAdAccounts()).find((a) => a.id === accountId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao falar com a Meta." };
  }
  if (!acc) return { error: "O token da unidade não tem acesso a essa conta." };

  await linkMetaAccount(clientId, { id: acc.id, name: acc.name, currency: acc.currency }, metric, me.id ?? null);
  const linked = await getClient(clientId);
  await logChange(me, "integracao", `Meta Ads vinculado: ${linked?.name ?? acc.name}`, { clientId });
  // Histórico de 12 semanas já no vínculo, para o score não esperar o cron.
  const r = await syncMeta({ weeks: 12, adAccountId: acc.id });
  after(() => recomputeRange(90));
  revalidateSettings();
  revalidatePath("/");
  if (r.failed.length) return { error: `Conta vinculada, mas a sincronização falhou: ${r.failed[0].error}` };
  return { ok: `${acc.name} vinculada — 12 semanas importadas.` };
}

export async function syncMetaNow(): Promise<ActionResult> {
  await requireAdmin();
  if (!metaConfigured()) return { error: "Configure META_ACCESS_TOKEN no ambiente." };
  const r = await syncMeta({ weeks: 3 });
  await recomputeRange(28);
  revalidateSettings();
  revalidatePath("/");
  if (r.failed.length) {
    return { error: `${r.ok} de ${r.accounts} conta(s) sincronizadas. Falhou: ${r.failed.map((f) => f.account).join(", ")}` };
  }
  return { ok: `${r.ok} conta(s) sincronizadas e score recalculado.` };
}

export async function setMetaAccountPaused(adAccountId: string, paused: boolean): Promise<ActionResult> {
  await requireAdmin();
  await setMetaAccountActive(adAccountId, !paused);
  after(() => recomputeRange(45));
  revalidateSettings();
  revalidatePath("/");
  return { ok: paused ? "Conta pausada — os números voltam para o input manual." : "Conta reativada." };
}

export async function changeMetaLeadMetric(adAccountId: string, metric: LeadMetric): Promise<ActionResult> {
  await requireAdmin();
  if (!LEAD_METRICS.includes(metric)) return { error: "Métrica inválida." };
  await setMetaLeadMetric(adAccountId, metric);
  after(() => recomputeRange(45));
  revalidateSettings();
  revalidatePath("/");
  return { ok: `Lead agora conta como: ${LEAD_METRIC_LABEL[metric].toLowerCase()}.` };
}

export async function removeMetaAccount(adAccountId: string): Promise<ActionResult> {
  await requireAdmin();
  const link = await getMetaLink(adAccountId);
  await unlinkMetaAccount(adAccountId);
  after(() => recomputeRange(90));
  revalidateSettings();
  revalidatePath("/");
  return { ok: `${link?.name ?? "Conta"} desvinculada.` };
}

/* --------------------------- Google Ads ---------------------------- */

/** Contas dos clientes sob a MCC — carregadas só quando o diálogo abre. */
export async function loadGoogleAccounts(): Promise<{ accounts?: GoogleAccount[]; error?: string }> {
  await requireAdmin();
  if (!googleAdsConfigured()) return { error: "Credencial do Google Ads não configurada." };
  try {
    return { accounts: await listClientAccounts() };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao falar com o Google Ads." };
  }
}

export async function connectGoogleAccount(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();
  if (!googleAdsConfigured()) return { error: "Configure GOOGLE_ADS_DEVELOPER_TOKEN e a credencial do Google (GOOGLE_SA_*) no ambiente." };
  const clientId = Number(str(formData, "client_id"));
  const customerId = normalizeCustomerId(str(formData, "customer_id"));
  if (!clientId) return { error: "Escolha o cliente." };
  if (!customerId) return { error: "Informe o ID da conta do Google Ads (10 dígitos, ex.: 124-444-3600)." };

  // Só vincula conta que a credencial realmente enxerga — e que tenha métricas.
  let acc;
  try {
    acc = await getCustomer(customerId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao falar com o Google Ads." };
  }
  if (acc.manager) return { error: "Esse ID é de uma MCC (conta gerente). Informe o ID da conta de anúncio do cliente." };

  await linkGoogleAccount(clientId, { id: customerId, name: acc.name, currency: acc.currency }, me.id ?? null);
  const linked = await getClient(clientId);
  await logChange(me, "integracao", `Google Ads vinculado: ${linked?.name ?? acc.name}`, { clientId });
  // Histórico de 12 semanas já no vínculo, para o score não esperar o cron.
  const r = await syncGoogle({ weeks: 12, customerId });
  after(() => recomputeRange(90));
  revalidateSettings();
  revalidatePath("/");
  if (r.failed.length) return { error: `Conta vinculada, mas a sincronização falhou: ${r.failed[0].error}` };
  return { ok: `${acc.name} (${formatCustomerId(customerId)}) vinculada — 12 semanas importadas.` };
}

export async function syncGoogleNow(): Promise<ActionResult> {
  await requireAdmin();
  if (!googleAdsConfigured()) return { error: "Configure GOOGLE_ADS_DEVELOPER_TOKEN e a credencial do Google (GOOGLE_SA_*) no ambiente." };
  const r = await syncGoogle({ weeks: 3 });
  await recomputeRange(28);
  revalidateSettings();
  revalidatePath("/");
  if (r.failed.length) {
    return { error: `${r.ok} de ${r.accounts} conta(s) sincronizadas. ${r.failed[0].account}: ${r.failed[0].error}` };
  }
  return { ok: `${r.ok} conta(s) do Google Ads sincronizadas e score recalculado.` };
}

export async function setGoogleAccountPaused(customerId: string, paused: boolean): Promise<ActionResult> {
  await requireAdmin();
  await setGoogleAccountActive(customerId, !paused);
  after(() => recomputeRange(45));
  revalidateSettings();
  revalidatePath("/");
  return { ok: paused ? "Conta pausada — os números voltam para o input manual." : "Conta reativada." };
}

export async function removeGoogleAccount(customerId: string): Promise<ActionResult> {
  await requireAdmin();
  const link = await getGoogleLink(customerId);
  await unlinkGoogleAccount(customerId);
  after(() => recomputeRange(90));
  revalidateSettings();
  revalidatePath("/");
  return { ok: `${link?.name ?? "Conta"} desvinculada.` };
}

/* --------------------------- planos -------------------------------- */

const PRIORITIES: PlanPriority[] = ["alta", "media", "baixa"];

function planFields(formData: FormData) {
  const priority = str(formData, "priority") as PlanPriority;
  const dimension = str(formData, "dimension") as DimensionKey | "";
  let tasks: PlanTask[] = [];
  try {
    const raw = JSON.parse(str(formData, "tasks") || "[]");
    if (Array.isArray(raw))
      tasks = raw
        .map((t) => ({ text: String(t?.text ?? "").trim().slice(0, 200), done: Boolean(t?.done) }))
        .filter((t) => t.text)
        .slice(0, 30);
  } catch {
    tasks = [];
  }
  return {
    risk: str(formData, "risk"),
    plan: str(formData, "plan"),
    owner: str(formData, "owner"),
    due_date: str(formData, "due_date") || null,
    priority: PRIORITIES.includes(priority) ? priority : "media",
    dimension: dimension && DIMENSIONS.some((d) => d.key === dimension) ? (dimension as DimensionKey) : null,
    tasks,
  };
}

export async function savePlan(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireUser();
  const clientId = Number(str(formData, "client_id"));
  const id = Number(str(formData, "id")) || 0;
  const f = planFields(formData);
  if (!f.risk || !f.owner || !f.due_date) return { error: "Preencha o título, o responsável e o prazo." };
  if (id) await updatePlan(id, f);
  else {
    await createPlan({ client_id: clientId, created_by: me.id, ...f });
    await logChange(me, "plano", `Plano de ação criado: ${f.risk}`, { clientId });
  }
  const status = str(formData, "status") as Plan["status"];
  if (id && ["aberto", "em_andamento", "concluido", "cancelado"].includes(status)) {
    const cur = await getPlan(id);
    if (cur && cur.status !== status) await updatePlanStatus(id, status);
  }
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/");
  return { ok: id ? "Plano atualizado." : "Plano registrado." };
}

/** Marca/desmarca uma tarefa do plano direto no cartão. */
export async function togglePlanTask(id: number, index: number, done: boolean): Promise<ActionResult> {
  await requireUser();
  const plan = await getPlan(id);
  if (!plan) return { error: "Plano não encontrado." };
  const tasks = plan.tasks.map((t, i) => (i === index ? { ...t, done } : t));
  await setPlanTasks(id, tasks);
  // Primeira tarefa feita tira o plano do "não iniciado".
  if (done && plan.status === "aberto") await updatePlanStatus(id, "em_andamento");
  revalidatePath(`/clientes/${plan.client_id}`);
  return { ok: done ? "Tarefa concluída." : "Tarefa reaberta." };
}

/* ------------------------ check-in agendado ------------------------ */

export async function scheduleCheckin(clientId: number, when: string | null): Promise<ActionResult> {
  const me = await requireUser();
  const client = await getClient(clientId);
  if (!client) return { error: "Cliente não encontrado." };
  // `datetime-local` chega sem fuso: é o horário de São Paulo.
  const at = when ? `${when.length === 16 ? when + ":00" : when}-03:00` : null;
  if (at && Number.isNaN(new Date(at).getTime())) return { error: "Data inválida." };
  await setNextCheckin(clientId, at);
  if (at)
    await logChange(
      me,
      "checkin_agendado",
      `Check-in agendado para ${new Date(at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
      { clientId },
    );
  revalidatePath(`/clientes/${clientId}`);
  return { ok: at ? "Check-in agendado." : "Agendamento removido." };
}

/* ----------------------- metas pelo painel ------------------------ */

/** Sugestão de metas pela média de 90 dias — carregada quando o painel abre. */
export async function loadTargetSuggestions(clientId: number) {
  await requireUser();
  return suggestTargets(clientId);
}

/** Metas do mês salvas pelo painel "Configurar cliente" em Configurações › Clientes. */
export async function saveClientTargets(clientId: number, values: Record<string, number | null>): Promise<ActionResult> {
  const me = await requireUser();
  const client = await getClient(clientId);
  if (!client) return { error: "Cliente não encontrado." };
  const allowed = new Set(targetKeysFor(client.account_type).map((t) => t.key));
  const targets: Record<string, number> = {};
  for (const [k, v] of Object.entries(values)) if (allowed.has(k) && v !== null && Number.isFinite(v) && v > 0) targets[k] = v;
  if (!Object.keys(targets).length) return { error: "Preencha ao menos uma meta." };
  await setTargets(clientId, targets, today(), me.id);
  await logChange(me, "meta", `Metas definidas: ${client.name}`, { clientId });
  after(() => refresh(clientId));
  revalidateSettings();
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/");
  return { ok: `Metas de ${client.name} salvas.` };
}

export async function changePlanStatus(id: number, status: Plan["status"]): Promise<ActionResult> {
  await requireUser();
  const plan = await getPlan(id);
  if (!plan) return { error: "Plano não encontrado." };
  await updatePlanStatus(id, status);
  revalidatePath(`/clientes/${plan.client_id}`);
  revalidatePath("/");
  const label = { aberto: "reaberto", em_andamento: "em andamento", concluido: "concluído", cancelado: "cancelado" }[status];
  return { ok: `Plano ${label}.` };
}

export async function removePlan(id: number): Promise<ActionResult> {
  await requireUser();
  const plan = await getPlan(id);
  if (!plan) return { error: "Plano não encontrado." };
  await deletePlan(id);
  revalidatePath(`/clientes/${plan.client_id}`);
  revalidatePath("/");
  return { ok: "Plano excluído." };
}
