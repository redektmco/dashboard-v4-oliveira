"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addChurnNote, addChurnTask, changeChurnStatus, saveChurnReasons, toggleChurnTask } from "@/actions/churn";
import {
  CHANCE,
  REASONS,
  STATUS,
  ddmm,
  type ChurnEvent,
  type ChurnEventKind,
  type ChurnStatus,
  type ChurnTask,
  type Evidence,
  type RetentionChance,
} from "@/lib/churn/types";
import { ActionMenu, type MenuItem } from "../action-menu";
import { ActionForm, SubmitButton } from "../form-controls";
import { Icon, type IconName } from "../icon";
import { Modal } from "../modal";
import { toast } from "../toast";
import { EvidenceDrop, EvidenceFile } from "./evidence";
import { Option, ReasonChips, Field } from "./new-request-form";
import { TONE } from "./ui";

/* ------------------------------ menu "Mais" ------------------------------ */

export function StatusMenu({ id, status, clientId }: { id: number; status: ChurnStatus; clientId: number }) {
  const router = useRouter();
  const [, start] = useTransition();
  const move = (to: ChurnStatus) =>
    start(async () => {
      const r = await changeChurnStatus(id, to);
      if (r?.error) toast(r.error, { tone: "error" });
      else {
        toast(r?.ok ?? "Status alterado.");
        router.refresh();
      }
    });
  const items: MenuItem[] = [
    { label: "Mover para…", disabled: true },
    ...(["solicitado", "em_analise", "em_negociacao", "agendado"] as ChurnStatus[])
      .filter((s) => s !== status)
      .map((s) => ({ label: STATUS[s].label, icon: "arrowRightLeft" as IconName, onSelect: () => move(s) })),
    "separator",
    { label: "Abrir ficha do cliente", icon: "external", href: `/clientes/${clientId}` },
  ];
  return (
    <ActionMenu
      items={items}
      label="Mais ações"
      trigger={
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-ink-850 text-ink-300 hover:bg-ink-800 hover:text-ink-100">
          <Icon name="ellipsis" size={16} />
        </span>
      }
    />
  );
}

/* ------------------------------ editar motivos ------------------------------ */

export function EditReasons(props: {
  id: number;
  main: string;
  secondary: string[];
  justification: string;
  desiredEnd: string | null;
  chance: RetentionChance;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        <Icon name="pencil" size={14} />
        Editar
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Editar motivos" description="Os motivos ficam editáveis até a conclusão da solicitação." size="md">
        <ReasonsForm {...props} onDone={() => (setOpen(false), router.refresh())} />
      </Modal>
    </>
  );
}

function ReasonsForm({
  id,
  main: main0,
  secondary: sec0,
  justification,
  desiredEnd,
  chance: chance0,
  onDone,
}: {
  id: number;
  main: string;
  secondary: string[];
  justification: string;
  desiredEnd: string | null;
  chance: RetentionChance;
  onDone: () => void;
}) {
  const [main, setMain] = useState(main0);
  const [sec, setSec] = useState(sec0);
  const [chance, setChance] = useState(chance0);
  return (
    <ActionForm action={saveChurnReasons} onSuccess={onDone} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="retention_chance" value={chance} />
      {sec.map((s) => (
        <input key={s} type="hidden" name="secondary_reasons" value={s} />
      ))}
      <Field label="Motivo principal" required>
        <select name="main_reason" value={main} onChange={(e) => setMain(e.target.value)} className="field">
          {Object.entries(REASONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Motivos secundários">
        <ReasonChips value={sec} exclude={main} onChange={setSec} />
      </Field>
      <Field label="Justificativa do cliente" required>
        <textarea name="justification" defaultValue={justification} rows={3} className="field min-h-[80px] py-2.5" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Encerramento desejado">
          <input type="date" name="desired_end" defaultValue={desiredEnd ?? ""} className="field" />
        </Field>
      </div>
      <Field label="Possibilidade de retenção">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {(Object.keys(CHANCE) as RetentionChance[]).map((c) => (
            <Option key={c} on={chance === c} onClick={() => setChance(c)}>
              <span className={`h-[7px] w-[7px] rounded-full ${TONE[CHANCE[c].tone].dot}`} />
              {CHANCE[c].label}
            </Option>
          ))}
        </div>
      </Field>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onDone}>
          Cancelar
        </button>
        <SubmitButton className="btn-light">Salvar motivos</SubmitButton>
      </div>
    </ActionForm>
  );
}

/* ------------------------------ histórico ------------------------------ */

const EVENT_ICON: Record<ChurnEventKind, IconName> = {
  abertura: "flag",
  observacao: "stickyNote",
  contato: "phone",
  anexo: "paperclip",
  status: "arrowRightLeft",
  tentativa: "handshake",
  resposta: "messageReply",
  conclusao: "flag",
};
type Tab = "tudo" | "contatos" | "negociacoes" | "status" | "notas";
const TAB_KINDS: Record<Tab, ChurnEventKind[] | null> = {
  tudo: null,
  contatos: ["contato", "abertura"],
  negociacoes: ["tentativa", "resposta"],
  status: ["status", "conclusao"],
  notas: ["observacao", "anexo"],
};
const TAB_LABEL: Record<Tab, string> = { tudo: "Tudo", contatos: "Contatos", negociacoes: "Negociações", status: "Status", notas: "Notas" };

const hhmm = (at: string) => {
  const d = new Date(at);
  return isNaN(d.getTime())
    ? at.slice(11, 16)
    : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
};
const dayOf = (at: string) => {
  const d = new Date(at);
  return isNaN(d.getTime()) ? at.slice(0, 10) : d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
};

export function HistoryPanel({ id, events, closed }: { id: number; events: ChurnEvent[]; closed: boolean }) {
  const [tab, setTab] = useState<Tab>("tudo");
  const [kind, setKind] = useState<"observacao" | "contato" | "anexo">("observacao");
  const [files, setFiles] = useState<Evidence[]>([]);
  const [formKey, setFormKey] = useState(0);
  const router = useRouter();
  const list = events.filter((e) => !TAB_KINDS[tab] || TAB_KINDS[tab]!.includes(e.kind));

  return (
    <section className="rounded-xl border border-[var(--border-hair)] bg-ink-900">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
        <div className="space-y-[3px]">
          <h2 className="text-[15px] font-semibold text-ink-100">Histórico da solicitação</h2>
          <p className="text-[12px] text-ink-500">Contatos, negociações e status — da abertura à conclusão</p>
        </div>
        <div className="no-scrollbar flex gap-1 overflow-x-auto" role="tablist">
          {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`h-7 shrink-0 rounded-[7px] px-2.5 text-[12px] ${tab === t ? "bg-ink-800 text-ink-100" : "text-ink-500 hover:text-ink-100"}`}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </header>

      {!closed && (
        <div className="px-5 pb-4">
          <ActionForm
            key={formKey}
            action={addChurnNote}
            onSuccess={() => {
              setFiles([]);
              setFormKey((k) => k + 1);
              router.refresh();
            }}
            className="overflow-hidden rounded-[10px] bg-ink-850"
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="evidences" value={JSON.stringify(files)} />
            {kind === "anexo" ? (
              <div className="p-3">
                <EvidenceDrop files={files} onChange={setFiles} folder={`req-${id}`} compact />
              </div>
            ) : (
              <textarea
                name="text"
                rows={2}
                placeholder={kind === "contato" ? "Ex.: Call com a sócia · 25 min (1ª linha = título). Detalhes nas linhas seguintes…" : "Registrar observação, contato ou atualização…"}
                className="block w-full resize-y bg-transparent px-3.5 py-3 text-[13px] text-ink-100 outline-none placeholder:text-ink-500"
              />
            )}
            <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border-hair)] px-2.5 py-2">
              {(
                [
                  ["observacao", "stickyNote", "Observação"],
                  ["contato", "phone", "Contato"],
                  ["anexo", "paperclip", "Anexo"],
                ] as const
              ).map(([k, icon, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={`flex h-7 items-center gap-[5px] rounded-md px-2 text-[12px] ${kind === k ? "bg-ink-800 text-ink-100" : "text-ink-500 hover:text-ink-100"}`}
                >
                  <Icon name={icon} size={13} />
                  {label}
                </button>
              ))}
              <span className="flex-1" />
              <SubmitButton className="btn-light btn-sm" pendingLabel="Salvando…">
                Salvar
              </SubmitButton>
            </div>
          </ActionForm>
        </div>
      )}

      <ol className="px-5 pb-5 pt-1">
        {list.length === 0 && <li className="py-6 text-center text-[13px] text-ink-500">Nada registrado nesta aba.</li>}
        {list.map((e, i) => {
          const files = (e.data.files as Evidence[] | undefined) ?? [];
          return (
            <li key={e.id} className="flex gap-3.5">
              <div className="flex w-7 shrink-0 flex-col items-center">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-ink-850 text-ink-300">
                  <Icon name={EVENT_ICON[e.kind]} size={13} />
                </span>
                {i < list.length - 1 && <span className="w-px flex-1 bg-ink-700" />}
              </div>
              <div className={`flex min-w-0 flex-1 flex-col gap-1 pt-1 ${i < list.length - 1 ? "pb-[18px]" : ""}`}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] text-ink-100">{e.title}</span>
                  <span className="text-[12px] text-ink-500">
                    {ddmm(dayOf(e.at))} · {hhmm(e.at)}
                  </span>
                </div>
                {e.user_name && <span className="text-[12px] text-ink-500">{e.user_name}</span>}
                {e.body && <p className="whitespace-pre-line text-[12px] leading-[17px] text-ink-300">{e.body}</p>}
                {files.length > 0 && (
                  <div className="mt-1 flex max-w-[360px] flex-col gap-1.5">
                    {files.map((f) => (
                      <EvidenceFile key={f.url} f={f} />
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ------------------------------ tarefas ------------------------------ */

export function TasksCard({ id, tasks, users, closed }: { id: number; tasks: ChurnTask[]; users: string[]; closed: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <section className="rounded-xl border border-[var(--border-hair)] bg-ink-900">
      <header className="flex items-center justify-between border-b border-[var(--border-hair)] px-[18px] py-3.5">
        <h2 className="text-[14px] font-semibold text-ink-100">Tarefas vinculadas</h2>
        {!closed && (
          <button type="button" className="text-[12px] text-ink-300 hover:text-ink-100" onClick={() => setOpen(true)}>
            + Nova
          </button>
        )}
      </header>
      {tasks.length === 0 ? (
        <p className="px-[18px] py-3.5 text-[12px] text-ink-500">Nenhuma tarefa.</p>
      ) : (
        <ul>
          {tasks.map((t) => (
            <TaskRow key={t.id} t={t} />
          ))}
        </ul>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Nova tarefa" size="sm">
        <ActionForm action={addChurnTask} onSuccess={() => (setOpen(false), router.refresh())} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={id} />
          <Field label="Tarefa" required>
            <input name="text" className="field" autoFocus required />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Responsável">
              <select name="owner" className="field">
                <option value="">—</option>
                {users.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prazo">
              <input type="date" name="due_date" className="field" />
            </Field>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <SubmitButton className="btn-light">Criar tarefa</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
    </section>
  );
}

export function TaskRow({ t, compact = false }: { t: ChurnTask; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(t.done === 1);
  const toggle = () =>
    start(async () => {
      setDone(!done);
      const r = await toggleChurnTask(t.id, !done);
      if (r?.error) {
        setDone(done);
        toast(r.error, { tone: "error" });
      } else router.refresh();
    });
  return (
    <li className={`flex items-start gap-2.5 border-b border-[var(--border-hair)] last:border-b-0 ${compact ? "px-3.5 py-[11px]" : "px-[18px] py-2.5"}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={t.text}
        disabled={pending}
        onClick={toggle}
        className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border ${done ? "border-ink-100 bg-ink-100 text-ink-950" : "border-ink-600"}`}
      >
        {done && <Icon name="check" size={11} stroke={3} />}
      </button>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={`text-[13px] ${done ? "text-ink-500 line-through decoration-ink-600" : "text-ink-100"}`}>{t.text}</span>
        <span className="text-[11px] text-ink-500">
          {[t.owner?.split(" ")[0], t.due_date && ddmm(t.due_date), t.note].filter(Boolean).join(" · ") || "Sem responsável"}
        </span>
      </span>
    </li>
  );
}
