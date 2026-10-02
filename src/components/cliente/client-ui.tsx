"use client";

import { createContext, useCallback, useContext, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { changePlanStatus, removePlan, savePlan, scheduleCheckin, togglePlanTask } from "@/actions";
import type { Plan, PlanTask } from "@/lib/repo";
import type { Band, DimensionKey } from "@/lib/model/types";
import type { CheckinRow, NextAction } from "@/lib/client-view";
import { ActionForm, SubmitButton } from "../form-controls";
import { ConfirmDialog, Modal } from "../modal";
import { SidePanel } from "../side-panel";
import { toast } from "../toast";
import { Icon, type IconName } from "../icon";
import { BAND_TEXT, Bar, BandPill, ColLabel, KV, Pill, type Tone } from "../kit";

/* ------------------------------------------------------------------ */
/* Dados                                                               */
/* ------------------------------------------------------------------ */

export type DrawerField = {
  label: string;
  score: number | null;
  band: Band | null;
  weight: number;
  actual: string;
  target: string;
  note?: string;
};

export type DrawerDim = {
  key: DimensionKey;
  label: string;
  score: number | null;
  band: Band | null;
  meta: number;
  weight: number;
  stale: string | null;
  fields: DrawerField[];
  primary: { label: string; href: string; icon: IconName };
};

export type ClientUIData = {
  clientId: number;
  clientName: string;
  today: string;
  dims: DrawerDim[];
  dimBands: Partial<Record<DimensionKey, Band | null>>;
  plans: Plan[];
  owners: string[];
  defaultOwner: string;
  clickupBase: string;
  checkins: CheckinRow[];
  actions: NextAction[];
  nextCheckinAt: string | null;
};

type Ctx = {
  data: ClientUIData;
  openDim: (k: DimensionKey) => void;
  openPlan: (p: Plan | null, dimension?: DimensionKey | null) => void;
  openCheckin: (id: number) => void;
  openSchedule: () => void;
  openActions: () => void;
  openHistory: () => void;
};

const UICtx = createContext<Ctx | null>(null);
const useUI = () => {
  const c = useContext(UICtx);
  if (!c) throw new Error("ClientUI ausente");
  return c;
};

const DIM_LABEL: Record<DimensionKey, string> = {
  performance: "Performance / Resultado",
  relationship: "Relacionamento / Engajamento",
  lead_quality: "Qualidade de lead / MQL",
  financial: "Financeiro / Comercial",
  operational: "Operacional / Dados",
};
const DIM_SHORT: Record<DimensionKey, string> = {
  performance: "Performance",
  relationship: "Relacionamento",
  lead_quality: "Lead / MQL",
  financial: "Financeiro",
  operational: "Operacional",
};

/* ------------------------------------------------------------------ */
/* Provedor                                                            */
/* ------------------------------------------------------------------ */

export function ClientUI({
  data,
  history,
  children,
}: {
  data: ClientUIData;
  history: React.ReactNode;
  children: React.ReactNode;
}) {
  const [dim, setDim] = useState<DimensionKey | null>(null);
  const [plan, setPlan] = useState<{ plan: Plan | null; dimension: DimensionKey | null } | null>(null);
  const [checkin, setCheckin] = useState<number | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [allActions, setAllActions] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const ctx = useMemo<Ctx>(
    () => ({
      data,
      openDim: setDim,
      openPlan: (p, d = null) => setPlan({ plan: p, dimension: p?.dimension ?? d }),
      openCheckin: setCheckin,
      openSchedule: () => setScheduling(true),
      openActions: () => setAllActions(true),
      openHistory: () => setShowHistory(true),
    }),
    [data],
  );

  const closeDim = useCallback(() => setDim(null), []);
  const ck = data.checkins.find((c) => c.id === checkin) ?? null;

  return (
    <UICtx.Provider value={ctx}>
      {children}
      <IndicatorsDrawer dims={data.dims} current={dim} onChange={setDim} onClose={closeDim} />
      <PlanModal
        open={plan !== null}
        onClose={() => setPlan(null)}
        plan={plan?.plan ?? null}
        dimension={plan?.dimension ?? null}
        data={data}
      />
      <CheckinModal row={ck} clientId={data.clientId} onClose={() => setCheckin(null)} />
      <ScheduleModal open={scheduling} onClose={() => setScheduling(false)} clientId={data.clientId} current={data.nextCheckinAt} />
      <Modal open={allActions} onClose={() => setAllActions(false)} title="Próximas ações" description={`${data.actions.length} pendente(s) nesta conta.`}>
        <div className="-mx-1">
          {data.actions.map((a) => (
            <ActionRow key={a.id} a={a} stacked={false} onAfter={() => setAllActions(false)} />
          ))}
          {!data.actions.length && <p className="py-6 text-center text-[13px] text-ink-400">Nada pendente nesta conta.</p>}
        </div>
      </Modal>
      <Modal open={showHistory} onClose={() => setShowHistory(false)} title="Histórico da conta" description="Tudo o que aconteceu na conta, em ordem cronológica, e os inputs que alimentam o score." size="lg">
        {history}
      </Modal>
    </UICtx.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Gatilhos (usados nas partes renderizadas no servidor)               */
/* ------------------------------------------------------------------ */

export function DimButton({ dim, className, children, label }: { dim: DimensionKey; className?: string; children: React.ReactNode; label?: string }) {
  const { openDim } = useUI();
  return (
    <button type="button" onClick={() => openDim(dim)} className={className} aria-label={label}>
      {children}
    </button>
  );
}

export function PlanButton({
  planId,
  dimension,
  className,
  children,
  label,
}: {
  planId?: number;
  dimension?: DimensionKey | null;
  className?: string;
  children: React.ReactNode;
  label?: string;
}) {
  const { openPlan, data } = useUI();
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onClick={() => openPlan(planId ? (data.plans.find((p) => p.id === planId) ?? null) : null, dimension ?? null)}
    >
      {children}
    </button>
  );
}

export function CheckinButton({ id, className, children }: { id: number; className?: string; children: React.ReactNode }) {
  const { openCheckin } = useUI();
  return (
    <button type="button" onClick={() => openCheckin(id)} className={className}>
      {children}
    </button>
  );
}

export function OpenActions({ className, children }: { className?: string; children: React.ReactNode }) {
  const { openActions } = useUI();
  return (
    <button type="button" onClick={openActions} className={className}>
      {children}
    </button>
  );
}

export function OpenHistory({ className, children }: { className?: string; children: React.ReactNode }) {
  const { openHistory } = useUI();
  return (
    <button type="button" onClick={openHistory} className={className}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Próximas ações                                                      */
/* ------------------------------------------------------------------ */

const ACTION_ICON: Record<NextAction["status"], { icon: IconName; cls: string }> = {
  Atrasada: { icon: "alertCircle", cls: "text-vermelho-fg" },
  Hoje: { icon: "timer", cls: "text-amarelo-fg" },
  Pendente: { icon: "circleDashed", cls: "text-ink-400" },
};
const STATUS_CLS: Record<NextAction["status"], string> = {
  Atrasada: "text-vermelho-fg",
  Hoje: "text-amarelo-fg",
  Pendente: "text-ink-300",
};

function QuickAction({ a, onAfter }: { a: NextAction; onAfter?: () => void }) {
  const { openSchedule, openPlan, data } = useUI();
  const cls = "btn btn-sm shrink-0";
  if (a.kind === "checkin")
    return (
      <button type="button" className={cls} onClick={() => (onAfter?.(), openSchedule())}>
        {a.quick}
      </button>
    );
  if (a.kind === "plano")
    return (
      <button type="button" className={cls} onClick={() => (onAfter?.(), openPlan(data.plans.find((p) => p.id === a.planId) ?? null))}>
        {a.quick}
      </button>
    );
  return (
    <Link href={a.href ?? "#"} className={cls}>
      {a.quick}
    </Link>
  );
}

/** Linha de próxima ação: ícone de status, título, status · dono · prazo e o atalho. */
export function ActionRow({ a, stacked, onAfter, last }: { a: NextAction; stacked: boolean; onAfter?: () => void; last?: boolean }) {
  const ic = ACTION_ICON[a.status];
  const title = a.href ? (
    <Link href={a.href} className="truncate text-[13px] font-medium text-ink-100 hover:underline">
      {a.title}
    </Link>
  ) : (
    <span className="truncate text-[13px] font-medium text-ink-100">{a.title}</span>
  );
  return (
    <div className={`flex items-center gap-3 py-3.5 ${last ? "" : "border-b border-[var(--border-hair)]"}`}>
      <Icon name={ic.icon} size={18} stroke={1.75} className={`shrink-0 ${ic.cls}`} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title}
        {stacked ? (
          <div className="flex flex-col gap-0.5 text-[12px]">
            <span className={`font-medium ${STATUS_CLS[a.status]}`}>{a.status}</span>
            <span className="text-ink-400">
              {a.owner} · {a.due}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-1.5 text-[12px]">
            <span className={`font-medium ${STATUS_CLS[a.status]}`}>{a.status}</span>
            <span className="text-ink-500">·</span>
            <span className="text-ink-300">{a.owner}</span>
            <span className="text-ink-500">·</span>
            <span className="text-ink-400">{a.due}</span>
          </div>
        )}
      </div>
      <QuickAction a={a} onAfter={onAfter} />
    </div>
  );
}

export function ActionList({ limit, stacked }: { limit: number; stacked: boolean }) {
  const { data } = useUI();
  const list = data.actions.slice(0, limit);
  if (!list.length)
    return (
      <div className="flex items-center gap-3 py-4 text-[13px] text-ink-400">
        <Icon name="checkCircle" size={18} className="text-verde-fg" />
        Nenhuma ação pendente nesta conta.
      </div>
    );
  return (
    <div>
      {list.map((a, i) => (
        <ActionRow key={a.id} a={a} stacked={stacked} last={stacked && i === list.length - 1} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Drawer de indicadores                                               */
/* ------------------------------------------------------------------ */

function IndicatorsDrawer({
  dims,
  current,
  onChange,
  onClose,
}: {
  dims: DrawerDim[];
  current: DimensionKey | null;
  onChange: (k: DimensionKey) => void;
  onClose: () => void;
}) {
  const idx = dims.findIndex((d) => d.key === current);
  const d = idx >= 0 ? dims[idx] : null;
  const go = (step: number) => onChange(dims[(idx + step + dims.length) % dims.length].key);
  const { data } = useUI();

  return (
    <SidePanel open={Boolean(d)} onClose={onClose} label={d ? `Indicadores de ${d.label}` : "Indicadores"}>
      {d && (
        <>
          <header className="flex flex-col gap-3.5 border-b border-[var(--border-hair)] px-6 py-5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">
                Dimensão · {idx + 1} de {dims.length}
              </span>
              <div className="flex gap-1">
                <button type="button" onClick={() => go(-1)} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-300 hover:bg-ink-850" aria-label="Dimensão anterior">
                  <Icon name="chevronUp" size={16} />
                </button>
                <button type="button" onClick={() => go(1)} className="flex h-7 w-7 items-center justify-center rounded-md text-ink-300 hover:bg-ink-850" aria-label="Próxima dimensão">
                  <Icon name="chevronDown" size={16} />
                </button>
                <button type="button" onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-strong)] bg-ink-850 text-ink-300 hover:text-ink-100" aria-label="Fechar">
                  <Icon name="x" size={16} />
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-display text-[20px] font-semibold tracking-[-0.3px] text-ink-100">{d.label}</h2>
              <BandPill band={d.band} />
            </div>
            <div className="flex flex-wrap items-end gap-6">
              <div className="flex items-end gap-1">
                <span className="tnum font-display text-[32px] font-semibold leading-8 tracking-[-1px] text-ink-100">
                  {d.score === null ? "—" : Math.round(d.score)}
                </span>
                <span className="text-[13px] text-ink-400">/ 100</span>
              </div>
              <KV k="Meta" v={d.meta} />
              {d.score !== null && (
                <KV k="Gap" v={`${d.score - d.meta >= 0 ? "+" : "−"}${Math.abs(Math.round(d.score) - d.meta)} pts`} tone={d.score >= d.meta ? "verde" : "vermelho"} />
              )}
              <KV k="Peso no score" v={`${d.weight}%`} />
            </div>
          </header>

          {d.stale && (
            <div className="flex items-center gap-2.5 bg-amarelo-dim px-6 py-3 text-[12px] text-amarelo-fg">
              <Icon name="clock" size={16} className="shrink-0" />
              {d.stale}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
            <div className="flex gap-3 py-2.5">
              <ColLabel className="flex-1">Indicador</ColLabel>
              <ColLabel className="w-[76px] text-right">Atual</ColLabel>
              <ColLabel className="w-[76px] text-right">Meta</ColLabel>
              <ColLabel className="w-[84px]">Status</ColLabel>
            </div>
            {d.fields.map((f) => {
              const tone: Tone = f.band ?? "neutro";
              return (
                <div key={f.label} className="flex items-center gap-3 border-t border-[var(--border-hair)] py-3.5">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-ink-100">{f.label}</span>
                    <Bar value={f.score ?? 0} tone={tone} thin className="max-w-[120px]" />
                    <span className="text-[11px] text-ink-400">{f.score === null ? (f.note ?? "sem dado") : `Peso ${Math.round(f.weight)}%`}</span>
                  </div>
                  <span
                    className={`tnum w-[76px] text-right text-[13px] font-semibold ${
                      f.band === "vermelho" ? "text-vermelho-fg" : f.band === "amarelo" ? "text-amarelo-fg" : "text-ink-100"
                    }`}
                  >
                    {f.actual}
                  </span>
                  <span className="tnum w-[76px] text-right text-[13px] text-ink-300">{f.target}</span>
                  <span className="w-[84px]">{f.band ? <Pill tone={f.band}>{BAND_TEXT[f.band]}</Pill> : <span className="text-[12px] text-ink-500">—</span>}</span>
                </div>
              );
            })}
            {!d.fields.length && <p className="py-8 text-center text-[13px] text-ink-400">Nenhum indicador desta dimensão vale para o tipo de conta.</p>}
          </div>

          <footer className="flex justify-end gap-2 border-t border-[var(--border-hair)] px-6 py-4">
            <Link href={`/config/clientes?c=${data.clientId}`} className="btn">
              <Icon name="target" size={16} />
              Alterar metas
            </Link>
            <Link href={d.primary.href} className="btn btn-light">
              <Icon name={d.primary.icon} size={16} />
              {d.primary.label}
            </Link>
          </footer>
        </>
      )}
    </SidePanel>
  );
}

/* ------------------------------------------------------------------ */
/* Plano de ação                                                       */
/* ------------------------------------------------------------------ */

export const PLAN_STATUS: Record<Plan["status"], { label: string; tone: Tone }> = {
  aberto: { label: "Não iniciado", tone: "neutro" },
  em_andamento: { label: "Em andamento", tone: "amarelo" },
  concluido: { label: "Concluído", tone: "verde" },
  cancelado: { label: "Cancelado", tone: "neutro" },
};
export const PRIORITY: Record<Plan["priority"], { label: string; cls: string }> = {
  alta: { label: "Alta", cls: "text-vermelho-fg" },
  media: { label: "Média", cls: "text-amarelo-fg" },
  baixa: { label: "Baixa", cls: "text-ink-300" },
};

function clickupUrl(base: string, client: string, p: Plan) {
  const q = new URLSearchParams({
    name: `[Health Score] ${client} — ${p.risk}`,
    description: `${p.plan}${p.tasks.length ? `\n\n${p.tasks.map((t) => `- [${t.done ? "x" : " "}] ${t.text}`).join("\n")}` : ""}${p.due_date ? `\n\nPrazo: ${p.due_date}` : ""}`,
  });
  return `${base}?${q}`;
}

function PlanModal({
  open,
  onClose,
  plan,
  dimension,
  data,
}: {
  open: boolean;
  onClose: () => void;
  plan: Plan | null;
  dimension: DimensionKey | null;
  data: ClientUIData;
}) {
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <Modal open={open} onClose={onClose} title={plan ? "Plano de ação" : "Novo plano de ação"} description={plan ? undefined : "Tarefa ligada a um problema da conta, com dono, prazo e passos."}>
        <PlanForm key={plan?.id ?? `new-${dimension}`} plan={plan} dimension={dimension} data={data} onDone={onClose} onDelete={() => setDeleting(true)} />
      </Modal>
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Excluir este plano?"
        confirmLabel="Excluir plano"
        pendingLabel="Excluindo…"
        onConfirm={async () => {
          const r = await removePlan(plan!.id);
          if (!r?.error) onClose();
          return r;
        }}
      >
        <p>
          Use só para registro feito por engano. Plano que não vai adiante deve ser <strong className="text-ink-100">cancelado</strong> — assim o
          histórico da conta mostra que o risco foi tratado.
        </p>
      </ConfirmDialog>
    </>
  );
}

function PlanForm({
  plan,
  dimension,
  data,
  onDone,
  onDelete,
}: {
  plan: Plan | null;
  dimension: DimensionKey | null;
  data: ClientUIData;
  onDone: () => void;
  onDelete: () => void;
}) {
  const [tasks, setTasks] = useState<PlanTask[]>(plan?.tasks ?? []);
  const [draft, setDraft] = useState("");
  const [priority, setPriority] = useState<Plan["priority"]>(plan?.priority ?? "media");
  const [pending, start] = useTransition();
  const owners = data.owners;

  const toggle = (i: number) => {
    const next = tasks.map((t, j) => (j === i ? { ...t, done: !t.done } : t));
    setTasks(next);
    // Plano já salvo: marcar a tarefa grava na hora, sem precisar do Salvar.
    if (plan)
      start(async () => {
        const r = await togglePlanTask(plan.id, i, next[i].done);
        if (r?.error) toast(r.error, { tone: "error" });
      });
  };
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    setTasks([...tasks, { text: t, done: false }]);
    setDraft("");
  };

  return (
    <ActionForm action={savePlan} onSuccess={onDone}>
      <input type="hidden" name="client_id" value={data.clientId} />
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <input type="hidden" name="tasks" value={JSON.stringify(tasks)} />
      <input type="hidden" name="priority" value={priority} />
      <label className="block">
        <span className="label">Título</span>
        <input name="risk" required autoFocus={!plan} defaultValue={plan?.risk} className="field mt-1" placeholder="Ex.: Recuperar performance" />
      </label>
      <label className="block">
        <span className="label">Contexto</span>
        <textarea name="plan" rows={2} defaultValue={plan?.plan} className="field mt-1" placeholder="Qual o problema e o que vamos fazer" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Dimensão</span>
          <select name="dimension" defaultValue={plan?.dimension ?? dimension ?? ""} className="field mt-1">
            <option value="">Sem dimensão</option>
            {(Object.keys(DIM_LABEL) as DimensionKey[]).map((k) => (
              <option key={k} value={k}>
                {DIM_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Responsável</span>
          <input name="owner" required list="plan-owners" className="field mt-1" defaultValue={plan?.owner ?? data.defaultOwner} />
          <datalist id="plan-owners">
            {owners.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="label">Prazo</span>
          <input type="date" name="due_date" defaultValue={plan?.due_date ?? ""} className="field mt-1" />
        </label>
        <div>
          <span className="label">Prioridade</span>
          <div className="seg mt-1 w-full">
            {(["alta", "media", "baixa"] as const).map((p) => (
              <button key={p} type="button" className={`flex-1 ${priority === p ? "on" : ""}`} onClick={() => setPriority(p)}>
                {PRIORITY[p].label}
              </button>
            ))}
          </div>
        </div>
        {plan && (
          <label className="block sm:col-span-2">
            <span className="label">Status</span>
            <select name="status" defaultValue={plan.status} className="field mt-1">
              {(Object.keys(PLAN_STATUS) as Plan["status"][]).map((s) => (
                <option key={s} value={s}>
                  {PLAN_STATUS[s].label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between">
          <span className="label">Tarefas</span>
          {tasks.length > 0 && (
            <span className="text-[12px] text-ink-400">
              {tasks.filter((t) => t.done).length}/{tasks.length} feitas{pending ? " · salvando…" : ""}
            </span>
          )}
        </div>
        <ul className="mt-1.5 space-y-1">
          {tasks.map((t, i) => (
            <li key={i} className="group flex items-center gap-2 rounded-md bg-ink-850 px-2.5 py-1.5">
              <input type="checkbox" checked={t.done} onChange={() => toggle(i)} className="h-4 w-4 accent-[var(--color-v4-red)]" aria-label={`Concluir: ${t.text}`} />
              <span className={`min-w-0 flex-1 text-[13px] ${t.done ? "text-ink-400 line-through" : "text-ink-100"}`}>{t.text}</span>
              <button type="button" onClick={() => setTasks(tasks.filter((_, j) => j !== i))} className="text-ink-500 hover:text-ink-100" aria-label="Remover tarefa">
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-1.5 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className="field"
            placeholder="Adicionar tarefa e Enter"
          />
          <button type="button" onClick={add} className="btn shrink-0">
            <Icon name="plus" size={14} />
          </button>
        </div>
      </div>

      <div className="modal-actions">
        {plan && (
          <div className="mr-auto flex gap-1">
            <a href={clickupUrl(data.clickupBase, data.clientName, plan)} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
              <Icon name="external" size={13} />
              ClickUp
            </a>
            <button type="button" onClick={onDelete} className="btn btn-ghost btn-sm text-vermelho-fg">
              Excluir
            </button>
          </div>
        )}
        <button type="button" className="btn" onClick={onDone}>
          Cancelar
        </button>
        <SubmitButton>{plan ? "Salvar" : "Registrar plano"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

/** Cartões de plano (lista da ficha). Clique abre o plano. */
export function PlanCards({ variant }: { variant: "desktop" | "mobile" }) {
  const { data, openPlan } = useUI();
  const [all, setAll] = useState(false);
  const open = data.plans.filter((p) => p.status === "aberto" || p.status === "em_andamento");
  const closed = data.plans.length - open.length;
  const limit = variant === "mobile" ? 2 : 3;
  const list = all ? open : open.slice(0, limit);

  const card = (p: Plan, i: number, n: number) => {
    const done = p.tasks.filter((t) => t.done).length;
    const dimBand = p.dimension ? (data.dimBands[p.dimension] ?? null) : null;
    const st = PLAN_STATUS[p.status];
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => openPlan(p)}
        className={`flex w-full flex-col gap-3 text-left ${
          variant === "mobile"
            ? "rounded-xl border border-[var(--border-hair)] bg-ink-900 p-4"
            : `py-[18px] ${i < n - 1 ? "border-b border-[var(--border-hair)]" : ""}`
        } hover:[&_.plan-title]:underline`}
      >
        <div className="flex w-full gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
            <span className="plan-title text-[14px] font-medium text-ink-100">{p.risk}</span>
            {p.dimension && (
              <span className="flex items-center gap-1.5 text-[12px] text-ink-400">
                <span className={`h-1.5 w-1.5 rounded-full ${dimBand === "vermelho" ? "bg-vermelho" : dimBand === "amarelo" ? "bg-amarelo" : dimBand === "verde" ? "bg-verde" : "bg-ink-500"}`} />
                {DIM_SHORT[p.dimension]}
              </span>
            )}
          </div>
          <Pill tone={st.tone}>{st.label}</Pill>
        </div>
        <div className="flex w-full gap-3">
          <div className="flex flex-1 flex-col gap-[3px]">
            <span className="text-[11px] text-ink-400">Responsável</span>
            <span className="truncate text-[13px] font-medium text-ink-100">{p.owner}</span>
          </div>
          <div className="flex flex-1 flex-col gap-[3px]">
            <span className="text-[11px] text-ink-400">Prazo</span>
            <span className={`tnum text-[13px] font-medium ${p.due_date && p.due_date < data.today ? "text-vermelho-fg" : "text-ink-100"}`}>
              {p.due_date ? `${p.due_date.slice(8, 10)}/${p.due_date.slice(5, 7)}` : "—"}
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-[3px]">
            <span className="text-[11px] text-ink-400">Prioridade</span>
            <span className={`text-[13px] font-medium ${PRIORITY[p.priority].cls}`}>{PRIORITY[p.priority].label}</span>
          </div>
        </div>
        <div className="flex w-full items-center gap-2.5">
          <Bar value={p.tasks.length ? (done / p.tasks.length) * 100 : 0} tone="neutro" className="flex-1" />
          <span className="tnum shrink-0 text-[12px] text-ink-400">
            {p.tasks.length ? `${done}/${p.tasks.length} tarefas` : "sem tarefas"}
          </span>
        </div>
      </button>
    );
  };

  if (!open.length)
    return (
      <div className={`flex flex-col items-center gap-2 py-8 text-center ${variant === "mobile" ? "rounded-xl border border-[var(--border-hair)] bg-ink-900" : ""}`}>
        <Icon name="listTodo" size={20} className="text-ink-500" />
        <p className="text-[13px] text-ink-400">Nenhum plano em aberto.</p>
        {closed > 0 && <p className="text-[12px] text-ink-500">{closed} concluído(s) ou cancelado(s) no histórico.</p>}
      </div>
    );

  return (
    <div className={variant === "mobile" ? "flex flex-col gap-2.5" : ""}>
      {list.map((p, i) => card(p, i, list.length))}
      {open.length > list.length && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className={`flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-100 ${variant === "mobile" ? "self-start" : "border-t border-[var(--border-hair)] py-3"} w-full`}
        >
          <Icon name="chevronDown" size={13} />
          Mais {open.length - list.length} {open.length - list.length === 1 ? "plano em aberto" : "planos em aberto"}
        </button>
      )}
      {closed > 0 && variant === "desktop" && <ClosedPlans />}
    </div>
  );
}

function ClosedPlans() {
  const { data, openPlan } = useUI();
  const closed = data.plans.filter((p) => p.status === "concluido" || p.status === "cancelado");
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-[var(--border-hair)] py-3">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-100">
        <Icon name={open ? "chevronDown" : "chevronRight"} size={13} />
        {closed.length} concluído(s) ou cancelado(s)
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {closed.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => openPlan(p)} className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left text-[13px] text-ink-300 hover:bg-ink-850">
                <span className="truncate">{p.risk}</span>
                <Pill tone={PLAN_STATUS[p.status].tone}>{PLAN_STATUS[p.status].label}</Pill>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Muda o status direto (usado no histórico). */
export async function setPlanStatus(id: number, s: Plan["status"]) {
  const r = await changePlanStatus(id, s);
  if (r?.error) toast(r.error, { tone: "error" });
  else if (r?.ok) toast(r.ok);
}

/* ------------------------------------------------------------------ */
/* Check-in completo                                                   */
/* ------------------------------------------------------------------ */

const ATTENDANCE: Record<string, string> = { full: "Compareceu", partial: "Remarcou", none: "Faltou" };

function CheckinModal({ row, clientId, onClose }: { row: CheckinRow | null; clientId: number; onClose: () => void }) {
  return (
    <Modal
      open={Boolean(row)}
      onClose={onClose}
      title={row ? `Check-in de ${row.day.slice(8, 10)}/${row.day.slice(5, 7)}/${row.day.slice(0, 4)}` : "Check-in"}
      description={row ? `Registrado por ${row.by ?? "—"}${row.nota !== null ? ` · nota média ${row.nota}/5` : ""}` : undefined}
    >
      {row && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[14px] font-medium text-ink-100">{row.title}</div>
              {row.note && <div className="mt-0.5 text-[13px] text-ink-400">{row.note}</div>}
            </div>
            <Pill tone={row.band}>{BAND_TEXT[row.band]}</Pill>
          </div>
          <div className="divide-y divide-[var(--border-hair)] rounded-lg border border-[var(--border-hair)]">
            {row.answers.map((a) => (
              <div key={a.key} className="flex items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1 text-[13px] text-ink-300">{a.label}</span>
                <span className="flex gap-[3px]" aria-hidden>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span key={n} className={`h-2.5 w-1 rounded-[1px] ${a.value !== null && n <= a.value ? "bg-ink-300" : "bg-ink-800"}`} />
                  ))}
                </span>
                <span className="tnum w-8 text-right text-[13px] font-medium text-ink-100">{a.value ?? "—"}/5</span>
              </div>
            ))}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <dt className="text-[11px] text-ink-400">Presença</dt>
              <dd className="text-ink-100">{row.attendance ? (ATTENDANCE[row.attendance] ?? row.attendance) : "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-ink-400">Adimplência</dt>
              <dd className={row.paymentOk === false ? "text-vermelho-fg" : "text-ink-100"}>{row.paymentOk === null ? "—" : row.paymentOk ? "Em dia" : "Inadimplente"}</dd>
            </div>
          </dl>
          {row.risk && (
            <div className="rounded-lg bg-vermelho-dim px-3 py-2.5 text-[13px] text-vermelho-fg">
              <strong className="font-semibold">Risco explícito:</strong> {row.risk}
            </div>
          )}
          {row.summary && (
            <div>
              <div className="label">Resumo da conversa</div>
              <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink-300">{row.summary}</p>
            </div>
          )}
          <div className="modal-actions">
            <Link href={`/account/${clientId}`} className="btn">
              <Icon name="plus" size={14} />
              Novo check-in
            </Link>
            <button type="button" onClick={onClose} className="btn btn-light">
              Fechar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Agendar check-in                                                    */
/* ------------------------------------------------------------------ */

function toLocalInput(ts: string | null) {
  if (!ts) return "";
  const d = new Date(ts.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  if (Number.isNaN(d.getTime())) return "";
  const sp = new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${sp.getFullYear()}-${p(sp.getMonth() + 1)}-${p(sp.getDate())}T${p(sp.getHours())}:${p(sp.getMinutes())}`;
}

function ScheduleModal({ open, onClose, clientId, current }: { open: boolean; onClose: () => void; clientId: number; current: string | null }) {
  const [value, setValue] = useState(toLocalInput(current));
  const [pending, start] = useTransition();
  const run = (v: string | null) =>
    start(async () => {
      const r = await scheduleCheckin(clientId, v);
      if (r?.error) toast(r.error, { tone: "error" });
      else {
        if (r?.ok) toast(r.ok);
        onClose();
      }
    });
  return (
    <Modal open={open} onClose={onClose} title="Agendar check-in" description="A data entra nas próximas ações da conta e no lembrete do Account." size="sm">
      <label className="block">
        <span className="label">Data e hora</span>
        <input type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} className="field mt-1" />
      </label>
      <div className="modal-actions">
        {current && (
          <button type="button" className="btn btn-ghost mr-auto" disabled={pending} onClick={() => run(null)}>
            Remover agendamento
          </button>
        )}
        <Link href={`/account/${clientId}`} className="btn">
          Registrar agora
        </Link>
        <button type="button" className="btn btn-light" disabled={pending || !value} aria-busy={pending} onClick={() => run(value)}>
          {pending && <span className="spinner" aria-hidden />}
          Agendar
        </button>
      </div>
    </Modal>
  );
}
