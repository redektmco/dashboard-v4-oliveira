"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createClient,
  createPlan,
  persistScore,
  recomputeAll,
  recomputeRange,
  saveSnapshot,
  scoreFor,
  setSetting,
  setTargets,
  today,
  updateClient,
  updatePlanStatus,
} from "@/lib/repo";
import { targetKeysFor } from "@/lib/model/catalog";
import { parseCheckinForm, parsePerformanceForm } from "@/lib/model/form";
import { DEFAULT_CONFIG } from "@/lib/model/scoring";
import type { AccountType, DimensionKey } from "@/lib/model/types";
import { DIMENSIONS } from "@/lib/model/catalog";
import { requireUser } from "@/lib/auth";

const str = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() ?? "";
const numOrNull = (f: FormData, k: string) => {
  const v = str(f, k).replace(/\./g, "").replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
};

/** Recalcula e grava o snapshot do dia para um cliente — chamado após cada input. */
async function refresh(clientId: number) {
  const r = await scoreFor(clientId);
  if (r) await persistScore(clientId, today(), r);
}

/* ---------------------- input do GT (semanal) ---------------------- */

export async function savePerformance(formData: FormData) {
  await requireUser();
  const clientId = Number(str(formData, "client_id"));
  const accountType = str(formData, "account_type") as AccountType;
  const refDate = str(formData, "ref_date") || today();
  const filledBy = Number(str(formData, "filled_by")) || null;

  const data = parsePerformanceForm(accountType, (k) => str(formData, k));

  await saveSnapshot("performance", clientId, refDate, filledBy, data);

  // A meta preenchida na semana passa a valer como meta vigente do cliente.
  const targets: Record<string, number> = {};
  for (const t of targetKeysFor(accountType)) {
    const v = data[t.key];
    if (typeof v === "number") targets[t.key] = v;
  }
  await setTargets(clientId, targets, refDate);

  await refresh(clientId);
  revalidatePath("/");
  revalidatePath("/gt");
  revalidatePath(`/clientes/${clientId}`);
  redirect(`/clientes/${clientId}?salvo=performance`);
}

/* ------------------- input do Account (check-in) ------------------- */

export async function saveCheckin(formData: FormData) {
  await requireUser();
  const clientId = Number(str(formData, "client_id"));
  const refDate = str(formData, "ref_date") || today();
  const filledBy = Number(str(formData, "filled_by")) || null;

  const data = parseCheckinForm((k) => str(formData, k));

  await saveSnapshot("checkin", clientId, refDate, filledBy, data);

  const renewal = str(formData, "renewal_date");
  if (renewal) await updateClient(clientId, { renewal_date: renewal });

  await refresh(clientId);
  revalidatePath("/");
  revalidatePath("/account");
  revalidatePath(`/clientes/${clientId}`);
  redirect(`/clientes/${clientId}?salvo=checkin`);
}

/* -------------------------- cadastro ------------------------------- */

export async function upsertClient(formData: FormData) {
  await requireUser();
  const id = Number(str(formData, "id")) || 0;
  const payload = {
    name: str(formData, "name"),
    account_type: str(formData, "account_type") as AccountType,
    mrr: numOrNull(formData, "mrr") ?? 0,
    gt_user_id: Number(str(formData, "gt_user_id")) || null,
    account_user_id: Number(str(formData, "account_user_id")) || null,
    renewal_date: str(formData, "renewal_date") || null,
  };
  const clientId = id ? (await updateClient(id, payload), id) : await createClient(payload);

  const targets: Record<string, number> = {};
  for (const t of targetKeysFor(payload.account_type)) {
    const v = numOrNull(formData, t.key);
    if (v !== null) targets[t.key] = v;
  }
  if (Object.keys(targets).length)
    await setTargets(clientId, targets, str(formData, "effective_from") || today());

  await refresh(clientId);
  revalidatePath("/config");
  revalidatePath("/");
  redirect(`/config?salvo=${clientId}`);
}

export async function toggleClientActive(formData: FormData) {
  await requireUser();
  const id = Number(str(formData, "id"));
  const active = str(formData, "active") === "1" ? 0 : 1;
  await updateClient(id, { active });
  revalidatePath("/config");
  revalidatePath("/");
}

/* ------------------------- calibração ------------------------------ */

export async function saveWeights(formData: FormData) {
  await requireUser();
  const weights: Partial<Record<DimensionKey, number>> = {};
  for (const d of DIMENSIONS) {
    const v = numOrNull(formData, `w_${d.key}`);
    weights[d.key] = v ?? d.defaultWeight;
  }
  await setSetting("weights", weights);

  const config: Record<string, number> = {};
  for (const k of Object.keys(DEFAULT_CONFIG) as (keyof typeof DEFAULT_CONFIG)[]) {
    const v = numOrNull(formData, `cfg_${k}`);
    if (v !== null) config[k] = v;
  }
  await setSetting("config", config);

  // Recalcula a série inteira com os novos pesos — a recalibração precisa
  // reescrever o passado para que a comparação com o desfecho faça sentido.
  await recomputeRange(90);
  revalidatePath("/");
  revalidatePath("/modelo");
  revalidatePath("/config");
}

export async function resetWeights() {
  await requireUser();
  await setSetting("weights", {});
  await setSetting("config", {});
  await recomputeRange(90);
  revalidatePath("/");
  revalidatePath("/config");
}

export async function runRecompute() {
  await requireUser();
  await recomputeAll();
  revalidatePath("/");
}

/* --------------------------- planos -------------------------------- */

export async function addPlan(formData: FormData) {
  await requireUser();
  const clientId = Number(str(formData, "client_id"));
  await createPlan({
    client_id: clientId,
    risk: str(formData, "risk"),
    plan: str(formData, "plan"),
    owner: str(formData, "owner"),
    due_date: str(formData, "due_date") || null,
  });
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/");
}

export async function setPlanStatus(formData: FormData) {
  await requireUser();
  const id = Number(str(formData, "id"));
  const clientId = Number(str(formData, "client_id"));
  await updatePlanStatus(id, str(formData, "status") as never);
  revalidatePath(`/clientes/${clientId}`);
  revalidatePath("/");
}
