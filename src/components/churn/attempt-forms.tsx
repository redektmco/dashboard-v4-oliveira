"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { answerAttempt, registerAttempt } from "@/actions/churn";
import { RESULT, STRATEGIES, ddmm, money, type AttemptResult } from "@/lib/churn/types";
import { ActionForm, SubmitButton } from "../form-controls";
import { Icon } from "../icon";
import { Modal } from "../modal";
import { Switch } from "./controls";
import { Field, Option } from "./new-request-form";

const parseMoney = (v: string) => {
  const n = Number(v.replace(/[R$\s.]/g, "").replace(",", "."));
  return v.trim() && isFinite(n) ? n : null;
};

/** Painel "Registrar nova tentativa" (Churn 04). */
export function NewAttemptForm({
  id,
  code,
  n,
  mrr,
  users,
  defaultOwner,
  today,
}: {
  id: number;
  code: string;
  n: number;
  mrr: number;
  users: { id: number; name: string }[];
  defaultOwner: number;
  today: string;
}) {
  const router = useRouter();
  const [key, setKey] = useState(0);
  const [strategy, setStrategy] = useState("");
  const [proposed, setProposed] = useState("");
  const [rows, setRows] = useState<{ label: string; current: string; proposed: string }[]>([]);
  const [owner, setOwner] = useState(String(defaultOwner));
  const [due, setDue] = useState("");
  const [task, setTask] = useState(true);
  const ownerName = users.find((u) => String(u.id) === owner)?.name.split(" ")[0] ?? "o responsável";
  const value = parseMoney(proposed);
  const pct = value !== null && mrr ? Math.round(((value - mrr) / mrr) * 100) : null;
  const taskText = `Cobrar retorno da proposta${strategy ? ` de ${STRATEGIES[strategy].toLowerCase()}` : ""}`;

  const reset = () => {
    setStrategy("");
    setProposed("");
    setRows([]);
    setDue("");
    setTask(true);
    setKey((k) => k + 1);
    router.refresh();
  };

  return (
    <section id="nova-tentativa" className="scroll-mt-6 rounded-xl border border-[var(--border-hair)] bg-ink-900">
      <header className="space-y-[3px] border-b border-[var(--border-hair)] px-5 py-4">
        <h2 className="text-[15px] font-semibold text-ink-100">Registrar nova tentativa</h2>
        <p className="text-[12px] text-ink-500">
          Tentativa {n} · vinculada à {code}
        </p>
      </header>
      <ActionForm key={key} action={registerAttempt} onSuccess={reset} className="flex flex-col">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="strategy" value={strategy} />
        <input type="hidden" name="current_mrr" value={mrr} />
        <input type="hidden" name="owner_user_id" value={owner} />
        {task && <input type="hidden" name="task_text" value={taskText} />}
        <div className="flex flex-col gap-[18px] p-5">
          <Field label="Estratégia de negociação" required>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(STRATEGIES).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={strategy === k}
                  onClick={() => setStrategy(k)}
                  className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] ${
                    strategy === k ? "border-[var(--border-strong)] bg-ink-800 text-ink-100" : "border-[var(--border-hair)] text-ink-300 hover:text-ink-100"
                  }`}
                >
                  {strategy === k && <Icon name="check" size={13} />}
                  {label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Proposta comercial / operacional" required>
            <textarea name="proposal" rows={3} className="field min-h-[84px] py-2.5 !text-[13px]" placeholder="O que está sendo oferecido ao cliente." />
          </Field>

          <Field label="Alterações propostas" hint={`Contrato atual: ${money(mrr)}`}>
            <div className="flex items-center gap-2">
              <span className="field flex flex-1 items-center !text-[13px] text-ink-400">{money(mrr)}</span>
              <Icon name="arrowRight" size={15} className="shrink-0 text-ink-500" />
              <input
                name="proposed_mrr"
                inputMode="decimal"
                value={proposed}
                onChange={(e) => setProposed(e.target.value)}
                placeholder="Novo valor (R$)"
                className="field flex-1 !text-[13px]"
              />
            </div>
            {pct !== null && pct !== 0 && (
              <span className="text-[12px] text-amarelo-fg">
                {pct > 0 ? "+" : "−"}
                {Math.abs(pct)}% no valor mensal
              </span>
            )}
            <div className="mt-1 flex flex-col overflow-hidden rounded-lg border border-[var(--border-hair)]">
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_28px] items-center gap-1.5 border-b border-[var(--border-hair)] p-2">
                  <input
                    name="change_label"
                    value={r.label}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    placeholder="Item (ex.: Social media)"
                    className="field !h-8 !min-h-8 !px-2 !text-[12px]"
                  />
                  <input
                    name="change_current"
                    value={r.current}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, current: e.target.value } : x)))}
                    placeholder="Atual"
                    className="field !h-8 !min-h-8 !px-2 !text-[12px]"
                  />
                  <input
                    name="change_proposed"
                    value={r.proposed}
                    onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, proposed: e.target.value } : x)))}
                    placeholder="Proposto"
                    className="field !h-8 !min-h-8 !px-2 !text-[12px]"
                  />
                  <button type="button" className="modal-x" aria-label="Remover alteração" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                    <Icon name="x" size={13} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setRows([...rows, { label: "", current: "", proposed: "" }])}
                className="flex items-center gap-1.5 px-3 py-2.5 text-left text-[12px] text-ink-300 hover:bg-ink-850 hover:text-ink-100"
              >
                <Icon name="plus" size={13} />
                Alteração de serviço, escopo ou prazo
              </button>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Responsável">
              <select value={owner} onChange={(e) => setOwner(e.target.value)} className="field !text-[13px]">
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prazo de retorno">
              <input type="date" name="due_date" min={today} value={due} onChange={(e) => setDue(e.target.value)} className="field !text-[13px]" />
            </Field>
          </div>

          <div className="flex flex-col gap-2.5 rounded-lg bg-ink-850 p-3">
            <div className="flex items-center gap-2">
              <Icon name="listTodo" size={14} className="text-ink-400" />
              <span className="flex-1 text-[12px] text-ink-100">Criar tarefa de acompanhamento</span>
              <Switch checked={task} onChange={setTask} label="Criar tarefa de acompanhamento" name="create_task" />
            </div>
            {task && (
              <p className="text-[12px] text-ink-500">
                “{taskText}” será criada nas tarefas da solicitação para {ownerName}
                {due ? `, com vencimento em ${ddmm(due)}` : ""}.
              </p>
            )}
          </div>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-[var(--border-hair)] px-5 py-3.5">
          <button type="button" className="btn btn-ghost" onClick={reset}>
            Descartar
          </button>
          <SubmitButton className="btn-light" pendingLabel="Registrando…">
            <Icon name="send" size={14} />
            Registrar tentativa
          </SubmitButton>
        </footer>
      </ActionForm>
    </section>
  );
}

/** Botão + janela "Registrar resposta" de uma tentativa aguardando retorno. */
export function AnswerAttempt({ attemptId, n, today }: { attemptId: number; n: number; today: string }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<AttemptResult | "">("");
  const router = useRouter();
  const kind = result.startsWith("contraproposta") ? "contraproposta" : "resposta";
  return (
    <>
      <button type="button" className="btn btn-sm shrink-0" onClick={() => setOpen(true)}>
        <Icon name="reply" size={13} />
        Registrar resposta
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Resposta da tentativa ${n}`} description="O que o cliente respondeu à proposta." size="sm">
        <ActionForm
          action={answerAttempt}
          onSuccess={() => {
            setOpen(false);
            setResult("");
            router.refresh();
          }}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="attempt_id" value={attemptId} />
          <input type="hidden" name="result" value={result} />
          <input type="hidden" name="response_kind" value={kind} />
          <Field label="Resultado" required>
            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(RESULT) as AttemptResult[])
                .filter((r) => r !== "aguardando")
                .map((r) => (
                  <Option key={r} on={result === r} onClick={() => setResult(r)}>
                    {RESULT[r].label}
                  </Option>
                ))}
            </div>
          </Field>
          <Field label={kind === "contraproposta" ? "Contraproposta do cliente" : "Resposta do cliente"} required>
            <textarea name="response" rows={3} className="field min-h-[80px] py-2.5" />
          </Field>
          <Field label="Respondida em">
            <input type="date" name="responded_at" defaultValue={today} max={today} className="field" />
          </Field>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <SubmitButton className="btn-light">Salvar resposta</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}
