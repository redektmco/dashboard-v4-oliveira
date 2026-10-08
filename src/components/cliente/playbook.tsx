"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  notOurError,
  removeLearning,
  removeUpsell,
  runStep,
  saveCrmDiag,
  saveLearning,
  saveStep,
  saveUpsell,
  toggleStep,
  updateUpsell,
} from "@/actions/playbook";
import type { Band } from "@/lib/model/types";
import type { Attention } from "@/lib/playbook/attention";
import type { CrmDiagnostic, LearningRecord, Step, Upsell } from "@/lib/playbook/db";
import {
  CRM_QUESTIONS,
  ERROR_CAUSES,
  ESCALATION_TRIGGERS,
  LEARNING_FIELDS,
  UPSELL_OPEN,
  UPSELL_STAGES,
  ekyteText,
  type FlagMeta,
  type UpsellStage,
} from "@/lib/playbook/templates";
import { ActionForm, SubmitButton } from "../form-controls";
import { ConfirmDialog, Modal } from "../modal";
import { toast } from "../toast";
import { Icon } from "../icon";
import { Card, Pill, SectionHead, type Tone } from "../kit";
import { CopyEkyte, PlanButton } from "./client-ui";

/* ------------------------------------------------------------------ */
/* Dados (montados no servidor — textos do playbook já resolvidos)     */
/* ------------------------------------------------------------------ */

export type StepView = Step & { how: string; when: string; deadline: string; goal: string };

export type PlaybookData = {
  clientId: number;
  clientName: string;
  now: string;
  band: Band | null;
  flag: FlagMeta | null;
  episode: { id: number; band: Band; prev_band: Band | null; started_at: string } | null;
  steps: StepView[];
  previous: { band: Band; started_at: string; ended_at: string | null }[];
  proximity: "perto" | "longe" | null;
  niche: string | null;
  churnOpen: { id: number; code: string } | null;
  learning: LearningRecord[];
  upsells: Upsell[];
  attention: Attention[];
  crm: CrmDiagnostic | null;
};

export const FLAG_SHORT: Record<Band, string> = { verde: "Green", amarelo: "Yellow", vermelho: "Red" };

const ddmm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");
/** Data e hora local (prazos de 24h/48h pedem a hora). */
const when = (iso: string | null, withTime = false) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
};
const daysSince = (iso: string, now: string) => Math.max(0, Math.floor((Date.parse(now) - Date.parse(iso)) / 86_400_000));
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86_400_000).toISOString();

async function act(p: Promise<{ ok?: string; error?: string } | null>) {
  const r = await p;
  if (r?.error) toast(r.error, { tone: "error" });
  else if (r?.ok) toast(r.ok);
}

/* ------------------------------------------------------------------ */
/* Seção                                                               */
/* ------------------------------------------------------------------ */

export function PlaybookSection({ data, variant }: { data: PlaybookData; variant: "desktop" | "mobile" }) {
  const ref = useRef<HTMLElement>(null);
  // O atalho "Ver playbook" da carteira aponta para #playbook; no celular a
  // seção visível é a segunda cópia, então ela mesma rola até aparecer.
  useEffect(() => {
    if (window.location.hash === "#playbook" && ref.current?.offsetParent) ref.current.scrollIntoView();
  }, []);

  const { episode, flag } = data;
  const late = data.steps.filter((s) => s.status === "pendente" && s.due_at && s.due_at < data.now).length;

  return (
    <section ref={ref} id={variant === "desktop" ? "playbook" : undefined} className="flex scroll-mt-20 flex-col gap-4">
      {variant === "desktop" ? (
        <SectionHead
          title={episode && flag ? `Playbook · ${flag.name}` : "Playbook da flag"}
          subtitle={flag ? `${flag.focus}: ${flag.goal}` : "A flag sai da faixa do Health Score; cada flag tem a sua sequência de ações."}
          action={episode ? <EpisodeStamp data={data} late={late} /> : undefined}
        />
      ) : (
        <div className="flex flex-col gap-1 pt-2">
          <h2 className="font-display text-[16px] font-semibold tracking-[-0.2px] text-ink-100">
            {episode && flag ? `Playbook · ${flag.name}` : "Playbook da flag"}
          </h2>
          {episode && <EpisodeStamp data={data} late={late} />}
        </div>
      )}

      {!episode || !flag ? (
        <Card className="py-8 text-center text-[13px] text-ink-400">
          A conta ainda não tem nota — o playbook começa quando houver dado de performance ou check-in.
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="px-4 sm:px-5">
            <p className="border-b border-[var(--border-hair)] py-3.5 text-[13px] leading-[19px] text-ink-300">{flag.situation}</p>
            <ul>
              {data.steps.map((s, i) => (
                <StepRow key={s.id} s={s} data={data} last={i === data.steps.length - 1} />
              ))}
            </ul>
          </Card>
          <div className="flex flex-col gap-4">
            <RulesCard data={data} />
            {(episode.band !== "verde" || data.learning.length > 0) && <LearningCard data={data} />}
            {(episode.band === "verde" || data.upsells.length > 0) && <UpsellCard data={data} />}
          </div>
        </div>
      )}

      <AttentionBlock data={data} />
    </section>
  );
}

function EpisodeStamp({ data, late }: { data: PlaybookData; late: number }) {
  const ep = data.episode!;
  const days = daysSince(ep.started_at, data.now);
  return (
    <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-400">
      <Pill tone={ep.band}>{FLAG_SHORT[ep.band]}</Pill>
      desde {when(ep.started_at, true)} · {days === 0 ? "hoje" : `${days} dia${days === 1 ? "" : "s"}`}
      {ep.prev_band && <span className="text-ink-500">(antes {FLAG_SHORT[ep.prev_band]})</span>}
      {late > 0 && (
        <span className="font-medium text-vermelho-fg">
          · {late} passo{late === 1 ? "" : "s"} atrasado{late === 1 ? "" : "s"}
        </span>
      )}
    </span>
  );
}

/* ------------------------------ passos ------------------------------ */

function StepRow({ s, data, last }: { s: StepView; data: PlaybookData; last: boolean }) {
  const [open, setOpen] = useState(false);
  const [learning, setLearning] = useState(false);
  const [pending, start] = useTransition();
  const done = s.status === "feito";
  const recurring = s.every_days !== null;
  const lateStep = s.status === "pendente" && !!s.due_at && s.due_at < data.now;
  // Prazos de 24h/48h mostram a hora; os de dias, só a data.
  const shortDeadline = !recurring && /\d+h$/.test(s.deadline);

  return (
    <li className={`py-3.5 ${last ? "" : "border-b border-[var(--border-hair)]"}`}>
      <div className="flex items-start gap-3">
        {recurring ? (
          <span className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center text-ink-400" title="Passo recorrente">
            <Icon name="repeat" size={15} />
          </span>
        ) : (
          <button
            type="button"
            role="checkbox"
            aria-checked={done}
            aria-label={`Concluir: ${s.title}`}
            disabled={pending}
            onClick={() => start(() => act(toggleStep(s.id, !done)))}
            className={`mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-[1.5px] ${
              done ? "border-verde bg-verde text-ink-950" : "border-[var(--border-strong)] hover:border-ink-300"
            }`}
          >
            {done && <Icon name="check" size={11} stroke={3.5} />}
          </button>
        )}
        <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 flex-col gap-1 text-left" aria-expanded={open}>
          <span className={`text-[14px] font-medium ${done ? "text-ink-400 line-through" : "text-ink-100"}`}>{s.title}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-400">
            <span>{s.owner}</span>
            <span className="text-ink-600">·</span>
            {recurring ? (
              <span className={lateStep ? "font-medium text-vermelho-fg" : ""}>
                {s.deadline} · próximo {when(s.due_at)}
                {s.runs > 0 && ` · feito ${s.runs}× (último ${when(s.last_run_at)})`}
              </span>
            ) : done ? (
              <span className="text-verde-fg">
                Feito {when(s.done_at)}
                {s.done_by ? ` por ${s.done_by.split(" ")[0]}` : ""}
              </span>
            ) : (
              <span className={lateStep ? "font-medium text-vermelho-fg" : ""}>
                {lateStep ? "Atrasado · " : ""}
                {s.deadline} · até {when(s.due_at, shortDeadline)}
              </span>
            )}
          </span>
          {s.note && !open && <span className="line-clamp-1 text-[12px] text-ink-300">“{s.note}”</span>}
        </button>
        {recurring && s.status === "pendente" && (
          <button type="button" className="btn btn-sm shrink-0" disabled={pending} onClick={() => start(() => act(runStep(s.id)))}>
            <Icon name="check" size={13} />
            Registrar
          </button>
        )}
        <button type="button" onClick={() => setOpen(!open)} className="mt-0.5 shrink-0 text-ink-500 hover:text-ink-100" aria-label={open ? "Recolher" : "Detalhes"}>
          <Icon name={open ? "chevronUp" : "chevronDown"} size={16} />
        </button>
      </div>

      {s.key === "erro_nosso" && !done && (
        <div className="ml-[30px] mt-2.5 flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" onClick={() => setLearning(true)}>
            <Icon name="alertCircle" size={13} />
            Foi erro nosso
          </button>
          <button type="button" className="btn btn-sm btn-ghost" disabled={pending} onClick={() => start(() => act(notOurError(s.id)))}>
            Não foi erro nosso
          </button>
        </div>
      )}

      {open && (
        <div className="ml-[30px] mt-3 flex flex-col gap-3 rounded-lg bg-ink-850 p-3.5">
          <Detail label="Como fazer">{s.how}</Detail>
          <div className="grid gap-3 sm:grid-cols-2">
            <Detail label="Quando">{s.when}</Detail>
            <Detail label="Objetivo">{s.goal}</Detail>
          </div>
          <ActionForm action={saveStep} className="flex flex-col gap-2.5">
            <input type="hidden" name="id" value={s.id} />
            <label className="block">
              <span className="label">Owner</span>
              <input name="owner" defaultValue={s.owner} required maxLength={120} className="field mt-1 h-9" />
            </label>
            <label className="block">
              <span className="label">Nota</span>
              <textarea
                name="note"
                rows={2}
                defaultValue={s.note}
                maxLength={2000}
                className="field mt-1 resize-y text-[13px]"
                placeholder={s.key === "bonificacao" ? "Decisão e quem aprovou (Coordenação + Liderança)" : "O que foi feito, decidido ou combinado"}
              />
            </label>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <CopyEkyte
                text={() =>
                  ekyteText({
                    dor: `${data.clientName} em ${data.flag?.name ?? "flag"}: ${data.flag?.situation ?? ""}`,
                    motivo: s.note || `Cliente entrou em ${data.flag?.name ?? "flag"} em ${when(data.episode?.started_at ?? null)}.`,
                    acao: `${s.title}. ${s.how}`,
                    prazo: s.due_at,
                    owner: s.owner,
                    objetivo: s.goal,
                  })
                }
              />
              <SubmitButton className="btn-sm">Salvar</SubmitButton>
            </div>
          </ActionForm>
        </div>
      )}

      {learning && <LearningModal data={data} record={null} onClose={() => setLearning(false)} />}
    </li>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-[0.04em] text-ink-500">{label}</span>
      <span className="text-[13px] leading-[19px] text-ink-200">{children}</span>
    </div>
  );
}

/* ------------------------------ regras ------------------------------ */

function RulesCard({ data }: { data: PlaybookData }) {
  const ep = data.episode!;
  const red = ep.band === "vermelho";
  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <span className="text-[13px] font-medium text-ink-300">Regras desta flag</span>
      {data.churnOpen && (
        <Link
          href={`/churn/${data.churnOpen.id}`}
          className="flex gap-2.5 rounded-lg border-l-[3px] border-v4-red bg-vermelho-dim p-3 text-[13px] leading-[18px] text-ink-100"
        >
          <Icon name="alert" size={15} className="mt-0.5 shrink-0 text-vermelho-fg" />
          <span>
            Gatilho de escalonamento ativo: pedido de cancelamento {data.churnOpen.code} aberto. Coordenação e/ou Michelle entram junto com o Account.
          </span>
        </Link>
      )}
      <ul className="flex flex-col gap-2">
        {data.flag!.rules.map((r) => (
          <li key={r} className="flex gap-2 text-[13px] leading-[19px] text-ink-300">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-500" />
            {r}
          </li>
        ))}
      </ul>
      {red && (
        <div className="flex flex-col gap-1.5 border-t border-[var(--border-hair)] pt-3">
          <span className="text-[12px] font-medium text-ink-400">Quando escalonar (pelo menos um)</span>
          <ul className="flex flex-col gap-1">
            {ESCALATION_TRIGGERS.map((t) => (
              <li key={t} className="text-[12px] leading-[17px] text-ink-300">
                · {t}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-col gap-1 border-t border-[var(--border-hair)] pt-3 text-[12px] leading-[17px] text-ink-400">
        <span>
          Proximidade:{" "}
          <strong className="font-medium text-ink-200">
            {data.proximity === "perto" ? "perto — visita" : data.proximity === "longe" ? "longe — vídeo + gift card da Maxx" : "não cadastrada"}
          </strong>
        </span>
        <span>
          Nicho: <strong className="font-medium text-ink-200">{data.niche || "não cadastrado"}</strong>
          {red && !data.niche && " — necessário para o benchmark com outras unidades."}
        </span>
      </div>
      {data.previous.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border-hair)] pt-3 text-[12px] text-ink-500">
          Flags anteriores:
          {data.previous.map((p) => (
            <span key={p.started_at} className="flex items-center gap-1">
              <span className={`h-1.5 w-1.5 rounded-full ${p.band === "verde" ? "bg-verde" : p.band === "amarelo" ? "bg-amarelo" : "bg-vermelho"}`} />
              {FLAG_SHORT[p.band]} {ddmm(p.started_at)}–{ddmm(p.ended_at)}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------------------------- Erro nosso ---------------------------- */

function learningDue(r: LearningRecord, days: number) {
  return r.flag_at ? addDays(r.flag_at, days) : addDays(r.created_at, days);
}

function LearningCard({ data }: { data: PlaybookData }) {
  const [editing, setEditing] = useState<LearningRecord | "new" | null>(null);
  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-300">Erro nosso</span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditing("new")}>
          <Icon name="plus" size={13} />
          Registrar
        </button>
      </div>
      {!data.learning.length ? (
        <p className="text-[12px] leading-[17px] text-ink-400">
          Se o cliente mudou de flag por um erro da equipe, registre aqui. O foco é corrigir a causa, não punir.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.learning.map((r) => {
            const missing = LEARNING_FIELDS.filter((f) => (f.key === "prevention" ? !r.prevention_plan_id : !r[f.key]));
            const lateN = missing.filter((f) => learningDue(r, f.days) < data.now).length;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  className="flex w-full flex-col gap-1 rounded-lg bg-ink-850 p-3 text-left hover:bg-ink-800"
                >
                  <span className="line-clamp-2 text-[13px] font-medium text-ink-100">{r.what}</span>
                  <span className="flex flex-wrap gap-x-2 text-[12px] text-ink-400">
                    {r.cause && <span>{ERROR_CAUSES[r.cause]}</span>}
                    <span>{ddmm(r.created_at)}</span>
                    {missing.length ? (
                      <span className={lateN ? "font-medium text-vermelho-fg" : "text-amarelo-fg"}>
                        {missing.length} campo{missing.length === 1 ? "" : "s"} pendente{missing.length === 1 ? "" : "s"}
                        {lateN ? ` (${lateN} atrasado${lateN === 1 ? "" : "s"})` : ""}
                      </span>
                    ) : (
                      <span className="text-verde-fg">Completo</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {editing && <LearningModal data={data} record={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function LearningModal({ data, record, onClose }: { data: PlaybookData; record: LearningRecord | null; onClose: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const base = record ? (record.flag_at ?? record.created_at) : (data.episode?.started_at ?? data.now);
  const meta = (key: string) => {
    const f = LEARNING_FIELDS.find((x) => x.key === key)!;
    const due = addDays(base, f.days);
    return (
      <span className="text-[11px] text-ink-500">
        {f.owner} · até {when(due)}
      </span>
    );
  };
  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={record ? "Registro de aprendizado" : "Erro nosso"}
        description="Corrigir a causa e garantir que o erro não se repita. Sem foco em punição."
        cardClassName="modal-card--form"
      >
        <ActionForm action={saveLearning} onSuccess={onClose}>
          {record ? (
            <input type="hidden" name="id" value={record.id} />
          ) : (
            <>
              <input type="hidden" name="client_id" value={data.clientId} />
              {data.episode && <input type="hidden" name="episode_id" value={data.episode.id} />}
            </>
          )}
          <label className="block">
            <span className="flex items-baseline justify-between gap-2">
              <span className="label">O que foi o erro *</span>
              {meta("what")}
            </span>
            <textarea name="what" required rows={2} defaultValue={record?.what} maxLength={2000} className="field mt-1 resize-y" placeholder="O que aconteceu e o impacto no cliente" />
          </label>
          <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
            <label className="block">
              <span className="label">Tipo de falha</span>
              <select name="cause" defaultValue={record?.cause ?? ""} className="field mt-1 h-10">
                <option value="">—</option>
                {Object.entries(ERROR_CAUSES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="flex items-baseline justify-between gap-2">
                <span className="label">Por que erramos</span>
                {meta("why")}
              </span>
              <textarea name="why" rows={2} defaultValue={record?.why} maxLength={2000} className="field mt-1 resize-y" placeholder="Causa raiz" />
            </label>
          </div>
          <label className="block">
            <span className="flex items-baseline justify-between gap-2">
              <span className="label">Quem errou</span>
              {meta("who")}
            </span>
            <input name="who" defaultValue={record?.who} maxLength={200} className="field mt-1 h-10" placeholder="Pessoa ou área — para alinhar, treinar e corrigir" />
          </label>
          <label className="block">
            <span className="flex items-baseline justify-between gap-2">
              <span className="label">O que aprendemos</span>
              {meta("learned")}
            </span>
            <textarea name="learned" rows={2} defaultValue={record?.learned} maxLength={2000} className="field mt-1 resize-y" placeholder="Lição concreta tirada do caso" />
          </label>
          <div className="flex flex-col gap-1.5 rounded-lg bg-ink-850 p-3">
            <span className="flex items-baseline justify-between gap-2">
              <span className="label">O que faremos para não repetir</span>
              {meta("prevention")}
            </span>
            {record?.prevention_plan_id ? (
              <span className="flex items-center gap-2 text-[13px] text-ink-100">
                <Icon name="listTodo" size={14} className="text-verde-fg" />
                Plano preventivo: {record.prevention_title}
              </span>
            ) : record ? (
              <PlanButton
                className="btn btn-sm self-start"
                prefill={{
                  risk: `Evitar repetir: ${record.what.slice(0, 120)}`,
                  motivo: record.why,
                  owner: "Coordenação de Operações",
                  objetivo: "Garantir que o erro não se repita.",
                  learningId: record.id,
                }}
              >
                <Icon name="plus" size={13} />
                Criar plano preventivo
              </PlanButton>
            ) : (
              <span className="text-[12px] text-ink-400">Depois de salvar, crie o plano preventivo no formato padrão (seis campos).</span>
            )}
          </div>
          <div className="modal-actions">
            {record && (
              <button type="button" className="btn btn-ghost btn-sm mr-auto text-vermelho-fg" onClick={() => setDeleting(true)}>
                Excluir
              </button>
            )}
            <button type="button" className="btn" onClick={onClose}>
              Cancelar
            </button>
            <SubmitButton>{record ? "Salvar" : "Registrar erro"}</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
      {record && (
        <ConfirmDialog
          open={deleting}
          onClose={() => setDeleting(false)}
          title="Excluir este registro?"
          confirmLabel="Excluir"
          pendingLabel="Excluindo…"
          onConfirm={async () => {
            const r = await removeLearning(record.id);
            if (!r?.error) onClose();
            return r;
          }}
        >
          <p>Use só para registro feito por engano. O plano preventivo, se houver, continua na lista de planos.</p>
        </ConfirmDialog>
      )}
    </>
  );
}

/* ------------------------------ Upsell ------------------------------ */

const STAGE_TONE: Record<UpsellStage, Tone> = {
  mapeada: "neutro",
  repassada: "neutro",
  apresentada: "amarelo",
  negociacao: "amarelo",
  ganha: "verde",
  perdida: "vermelho",
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function UpsellCard({ data }: { data: PlaybookData }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Upsell | null>(null);
  const open = data.upsells.filter((u) => UPSELL_OPEN.includes(u.stage));
  const closed = data.upsells.filter((u) => !UPSELL_OPEN.includes(u.stage));
  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-300">Upsell e cross-sell</span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCreating(true)}>
          <Icon name="plus" size={13} />
          Oportunidade
        </button>
      </div>
      {!data.upsells.length && (
        <p className="text-[12px] leading-[17px] text-ink-400">
          Cruze os resultados com o portfólio (If This Then That) e registre o produto que resolve a próxima necessidade do cliente.
        </p>
      )}
      {[...open, ...closed].map((u) => {
        const last = u.updates[u.updates.length - 1]?.at ?? u.created_at;
        const stale = UPSELL_OPEN.includes(u.stage) && daysSince(last, data.now) > 7;
        return (
          <button key={u.id} type="button" onClick={() => setEditing(u)} className="flex flex-col gap-1.5 rounded-lg bg-ink-850 p-3 text-left hover:bg-ink-800">
            <span className="flex items-start justify-between gap-2">
              <span className="text-[13px] font-medium text-ink-100">{u.product}</span>
              <Pill tone={STAGE_TONE[u.stage]}>{UPSELL_STAGES[u.stage]}</Pill>
            </span>
            <span className="flex flex-wrap gap-x-2 text-[12px] text-ink-400">
              {u.value !== null && <span>+{brl(u.value)}/mês</span>}
              {u.commercial_owner && <span>Comercial: {u.commercial_owner}</span>}
              <span className={stale ? "font-medium text-vermelho-fg" : ""}>
                {stale ? "Status da semana atrasado · " : "Último status "}
                {ddmm(last)}
              </span>
            </span>
          </button>
        );
      })}
      {creating && (
        <Modal open onClose={() => setCreating(false)} title="Nova oportunidade" description="Proposta de upsell ou cross-sell fundamentada em resultado." cardClassName="modal-card--form">
          <ActionForm action={saveUpsell} onSuccess={() => setCreating(false)}>
            <input type="hidden" name="client_id" value={data.clientId} />
            <label className="block">
              <span className="label">Produto ou serviço sugerido *</span>
              <input name="product" required maxLength={200} autoFocus className="field mt-1 h-10" placeholder="Ex.: Gestão de CRM, Google Ads, Social media" />
            </label>
            <label className="block">
              <span className="label">Resultados que fundamentam</span>
              <textarea name="rationale" rows={3} maxLength={2000} className="field mt-1 resize-y" placeholder="O que já entregamos e qual necessidade o produto resolve" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="label">MRR adicional estimado (R$)</span>
                <input name="value" inputMode="decimal" className="field mt-1 h-10" />
              </label>
              <label className="block">
                <span className="label">Quem assume no comercial</span>
                <input name="commercial_owner" maxLength={120} className="field mt-1 h-10" />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setCreating(false)}>
                Cancelar
              </button>
              <SubmitButton>Registrar oportunidade</SubmitButton>
            </div>
          </ActionForm>
        </Modal>
      )}
      {editing && <UpsellModal u={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function UpsellModal({ u, onClose }: { u: Upsell; onClose: () => void }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <>
      <Modal open onClose={onClose} title={u.product} description={u.rationale || undefined} cardClassName="modal-card--form">
        <ActionForm action={updateUpsell} onSuccess={onClose}>
          <input type="hidden" name="id" value={u.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Etapa</span>
              <select name="stage" defaultValue={u.stage} className="field mt-1 h-10">
                {Object.entries(UPSELL_STAGES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Quem assume no comercial</span>
              <input name="commercial_owner" defaultValue={u.commercial_owner} maxLength={120} className="field mt-1 h-10" />
            </label>
          </div>
          <label className="block">
            <span className="label">Status da semana</span>
            <textarea name="note" rows={2} maxLength={1000} className="field mt-1 resize-y" placeholder="Negociação, resposta do cliente, próximo passo" />
          </label>
          {u.updates.length > 0 && (
            <ul className="flex max-h-48 flex-col gap-2 overflow-y-auto rounded-lg bg-ink-850 p-3">
              {[...u.updates].reverse().map((x, i) => (
                <li key={i} className="flex flex-col gap-0.5 text-[12px]">
                  <span className="text-ink-400">
                    {when(x.at)} · {x.by} · {UPSELL_STAGES[x.stage]}
                  </span>
                  {x.note && <span className="text-ink-200">{x.note}</span>}
                </li>
              ))}
            </ul>
          )}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost btn-sm mr-auto text-vermelho-fg" onClick={() => setDeleting(true)}>
              Excluir
            </button>
            <button type="button" className="btn" onClick={onClose}>
              Cancelar
            </button>
            <SubmitButton>Registrar status</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Excluir esta oportunidade?"
        confirmLabel="Excluir"
        pendingLabel="Excluindo…"
        onConfirm={async () => {
          const r = await removeUpsell(u.id);
          if (!r?.error) onClose();
          return r;
        }}
      >
        <p>Use só para registro feito por engano. Oportunidade que não fechou deve ir para “Perdida” — fica no histórico.</p>
      </ConfirmDialog>
    </>
  );
}

/* ------------------------- Pontos de atenção ------------------------- */

const ATT_TONE: Record<Attention["status"], Tone> = { ok: "verde", aberto: "vermelho", sem_dado: "neutro" };
const ATT_LABEL: Record<Attention["status"], string> = { ok: "Ok", aberto: "Ponto aberto", sem_dado: "Sem dado" };

function AttentionBlock({ data }: { data: PlaybookData }) {
  const [crm, setCrm] = useState(false);
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-[13px] font-medium text-ink-300">Pontos de atenção · fora da nota</span>
      <div className="grid gap-3 md:grid-cols-2">
        {data.attention.map((a) => (
          <Card key={a.key} className="flex flex-col gap-2 p-4">
            <span className="flex items-start justify-between gap-2">
              <span className="flex flex-col gap-0.5">
                <span className="text-[14px] font-medium text-ink-100">{a.label}</span>
                <span className="text-[12px] text-ink-500">{a.owner}</span>
              </span>
              <Pill tone={ATT_TONE[a.status]}>{ATT_LABEL[a.status]}</Pill>
            </span>
            <p className="text-[13px] leading-[19px] text-ink-300">{a.detail}</p>
            <div className="mt-auto flex flex-wrap gap-2 pt-1">
              {a.key === "crm" && (
                <button type="button" className="btn btn-sm" onClick={() => setCrm(true)}>
                  <Icon name="squarePen" size={13} />
                  {data.crm ? "Atualizar diagnóstico" : "Preencher diagnóstico"}
                </button>
              )}
              {a.key === "criativos" && (
                <Link href="/social" className="btn btn-sm btn-ghost">
                  <Icon name="image" size={13} />
                  Social media
                </Link>
              )}
              {a.status === "aberto" && (
                <PlanButton
                  className="btn btn-sm btn-ghost"
                  prefill={
                    a.key === "crm"
                      ? { risk: "CRM desorganizado ou não usado pelo time do cliente", owner: "Analista de CRM", objetivo: "CRM ativo e dados confiáveis para medir vendas." }
                      : { risk: "Insatisfeito com os criativos", owner: "Account + Design", objetivo: "Ter criativos aprovados que também performem." }
                  }
                >
                  <Icon name="listTodo" size={13} />
                  Criar plano
                </PlanButton>
              )}
            </div>
          </Card>
        ))}
      </div>
      {crm && <CrmModal data={data} onClose={() => setCrm(false)} />}
    </div>
  );
}

function CrmModal({ data, onClose }: { data: PlaybookData; onClose: () => void }) {
  const prev = data.crm?.data ?? {};
  return (
    <Modal open onClose={onClose} title="Diagnóstico de CRM" description="CRM e processo comercial do cliente. Owner da resposta: Analista de CRM." cardClassName="modal-card--form">
      <ActionForm action={saveCrmDiag} onSuccess={onClose}>
        <input type="hidden" name="client_id" value={data.clientId} />
        {CRM_QUESTIONS.map((q) => (
          <fieldset key={q.key} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hair)] pb-3">
            <legend className="sr-only">{q.label}</legend>
            <span className="text-[14px] text-ink-100">{q.label}</span>
            <span className="flex gap-1.5">
              {(["sim", "nao"] as const).map((v) => (
                <label key={v} className="cursor-pointer">
                  <input type="radio" name={q.key} value={v} defaultChecked={prev[q.key] === v} required className="peer sr-only" />
                  <span className="inline-flex h-8 items-center rounded-md border border-[var(--border-strong)] px-3 text-[13px] text-ink-300 peer-checked:border-ink-100 peer-checked:bg-ink-100 peer-checked:text-ink-950 peer-focus-visible:ring-2 peer-focus-visible:ring-v4-red">
                    {v === "sim" ? "Sim" : "Não"}
                  </span>
                </label>
              ))}
            </span>
          </fieldset>
        ))}
        <label className="block">
          <span className="label">Observação</span>
          <textarea name="note" rows={2} maxLength={1000} defaultValue={prev.note ?? ""} className="field mt-1 resize-y" placeholder="Melhorias, oportunidades e pontos de quebra do funil" />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <SubmitButton>Salvar diagnóstico</SubmitButton>
        </div>
      </ActionForm>
    </Modal>
  );
}
