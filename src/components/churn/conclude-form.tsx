"use client";

import Link from "next/link";
import { useState } from "react";
import { concludeChurn } from "@/actions/churn";
import {
  OUTCOME,
  REASONS,
  RESULT,
  STATUS,
  dateBr,
  ddmm,
  money,
  strategyLabel,
  tenure,
  type AttemptResult,
  type ChurnOutcome,
  type ChurnStatus,
} from "@/lib/churn/types";
import { ActionForm, SubmitButton } from "../form-controls";
import { Icon, type IconName } from "../icon";
import { Field } from "./new-request-form";
import { Caps, IconBox, TONE } from "./ui";

type Pend = { text: string; owner: string; due: string; done: boolean; note?: string };

const OUTCOME_ICON: Record<ChurnOutcome, IconName> = { retido: "shieldCheck", retido_alteracao: "filePen", cancelado: "xCircle" };
const OUTCOME_DESC: Record<ChurnOutcome, string> = {
  retido: "Cliente permaneceu com o contrato atual",
  retido_alteracao: "Permaneceu com mudança de valor, serviço ou escopo",
  cancelado: "Contrato encerrado definitivamente",
};

/**
 * Churn 05 — formulário de conclusão. O resultado decide o resto: retenção
 * pede só a observação (e o novo valor, se mudou); cancelamento pede data
 * efetiva, motivo final e as pendências do encerramento, que viram tarefas.
 */
export function ConcludeForm({
  id,
  mrr,
  mainReason,
  desiredEnd,
  contractStart,
  fidelityEnded,
  fidelityEnd,
  attempts,
  users,
  ownerName,
  statusTrail,
  today,
}: {
  id: number;
  mrr: number;
  mainReason: string;
  desiredEnd: string | null;
  contractStart: string | null;
  fidelityEnded: boolean;
  fidelityEnd: string | null;
  attempts: { n: number; strategy: string; result: AttemptResult; respondedAt: string | null; proposedMrr: number | null }[];
  users: string[];
  ownerName: string | null;
  statusTrail: { status: ChurnStatus; date: string }[];
  today: string;
}) {
  const accepted = attempts.find((a) => a.result === "aceita" || a.result === "contraproposta_aceita");
  const [outcome, setOutcome] = useState<ChurnOutcome>(accepted ? (accepted.proposedMrr !== null ? "retido_alteracao" : "retido") : "cancelado");
  const [end, setEnd] = useState(desiredEnd ?? today);
  const [newMrr, setNewMrr] = useState(accepted?.proposedMrr != null ? String(accepted.proposedMrr) : "");
  const [pend, setPend] = useState<Pend[]>([
    { text: "Transferir acessos Google Ads e Meta Business", owner: "", due: "", done: false },
    { text: "Entregar relatório final e backup de criativos", owner: ownerName ?? "", due: "", done: false },
    { text: "Emitir fatura proporcional do último mês", owner: "Financeiro", due: "", done: false },
    { text: "Revogar acessos da equipe às contas do cliente", owner: "Operações", due: "", done: false },
    fidelityEnded
      ? { text: "Multa rescisória", owner: "", due: "", done: true, note: "Isenta · fora da fidelidade" }
      : { text: `Multa rescisória (fidelidade até ${dateBr(fidelityEnd)})`, owner: "Financeiro", due: "", done: false },
  ]);

  const cancel = outcome === "cancelado";
  const newValue = Number(newMrr.replace(/[R$\s.]/g, "").replace(",", ".")) || 0;
  const lost = cancel ? mrr : outcome === "retido_alteracao" ? Math.max(0, mrr - newValue) : 0;
  const kept = cancel ? 0 : outcome === "retido_alteracao" ? newValue : mrr;
  const openPend = pend.filter((p) => p.text.trim() && !p.done).length;
  const setP = (i: number, p: Partial<Pend>) => setPend(pend.map((x, j) => (j === i ? { ...x, ...p } : x)));

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <ActionForm action={concludeChurn} className="min-w-0 overflow-hidden rounded-xl border border-[var(--border-hair)] bg-ink-900">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="outcome" value={outcome} />
        {cancel &&
          pend.map((p, i) => (
            <span key={i} hidden>
              <input type="hidden" name="pend_text" value={p.note ? `${p.text} — ${p.note}` : p.text} />
              <input type="hidden" name="pend_owner" value={p.owner} />
              <input type="hidden" name="pend_due" value={p.due} />
              <input type="hidden" name="pend_done" value={p.done ? "1" : "0"} />
            </span>
          ))}

        <Part n="01" title="Resultado" sub="Qual foi a decisão final do cliente?" first>
          <div className="grid gap-2.5 md:grid-cols-3" role="radiogroup">
            {(Object.keys(OUTCOME) as ChurnOutcome[]).map((o) => {
              const on = outcome === o;
              return (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setOutcome(o)}
                  className={`flex flex-col gap-2.5 rounded-[10px] border p-3.5 text-left transition-colors ${
                    on
                      ? o === "cancelado"
                        ? "border-vermelho/50 bg-vermelho-dim"
                        : "border-verde/40 bg-verde-dim"
                      : "border-[var(--border-hair)] bg-ink-850 hover:border-[var(--border-strong)]"
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <Icon name={OUTCOME_ICON[o]} size={17} className={on ? TONE[OUTCOME[o].tone].text : "text-ink-400"} />
                    <span className={`grid h-4 w-4 place-items-center rounded-full border ${on ? "border-ink-100" : "border-ink-600"}`}>
                      {on && <span className="h-2 w-2 rounded-full bg-ink-100" />}
                    </span>
                  </span>
                  <span className="flex flex-col gap-[3px]">
                    <span className="text-[13px] text-ink-100">{OUTCOME[o].label}</span>
                    <span className="text-[12px] text-ink-500">{OUTCOME_DESC[o]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Part>

        <Part
          n="02"
          title={cancel ? "Encerramento" : "Retenção"}
          sub={cancel ? "Datas e motivo definitivo — o motivo final pode diferir do registrado na abertura" : "O que ficou combinado com o cliente"}
        >
          {cancel && (
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Data efetiva de encerramento" required>
                <input type="date" name="effective_end" value={end} onChange={(e) => setEnd(e.target.value)} className="field !text-[13px]" required />
              </Field>
              <Field label="Motivo final" required hint={`Inicial: ${REASONS[mainReason] ?? mainReason}`}>
                <select name="final_reason" defaultValue={mainReason} className="field !text-[13px]">
                  {Object.entries(REASONS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          {outcome === "retido_alteracao" && (
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Novo valor mensal" required hint={`Atual: ${money(mrr)}`}>
                <input name="new_mrr" inputMode="decimal" value={newMrr} onChange={(e) => setNewMrr(e.target.value)} placeholder="R$" className="field !text-[13px]" />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2.5 text-[12px] text-ink-300">
                <input type="checkbox" name="update_mrr" defaultChecked className="h-4 w-4 accent-[var(--color-ink-100)]" />
                Atualizar o MRR no cadastro do cliente
              </label>
            </div>
          )}
          {!cancel && <input type="hidden" name="final_reason" value={mainReason} />}
          <Field label="Observação final">
            <textarea
              name="final_note"
              rows={3}
              className="field min-h-[84px] py-2.5 !text-[13px]"
              placeholder={cancel ? "Contexto da saída, relação com o cliente, chance de voltar…" : "O que foi acordado e o que acompanhar daqui para frente…"}
            />
          </Field>
        </Part>

        <Part n="03" title="Tentativa de retenção" sub="Preenchido a partir do histórico da solicitação">
          <div className="flex flex-col gap-3 rounded-lg bg-ink-850 px-3.5 py-3 sm:flex-row sm:items-center sm:gap-4">
            <span className="flex w-fit gap-0.5 rounded-lg bg-ink-950 p-[3px] text-[12px]" aria-label="Houve tentativa de retenção">
              <span className={`rounded-md px-3.5 py-[5px] ${attempts.length ? "bg-ink-800 text-ink-100" : "text-ink-500"}`}>Sim</span>
              <span className={`rounded-md px-3.5 py-[5px] ${attempts.length ? "text-ink-500" : "bg-ink-800 text-ink-100"}`}>Não</span>
            </span>
            <span className="flex-1 text-[12px] text-ink-300">
              {attempts.length
                ? `${attempts.length} ${attempts.length === 1 ? "tentativa registrada" : "tentativas registradas"} — ${attempts
                    .map((a) => `${strategyLabel(a.strategy)} (${RESULT[a.result].label.toLowerCase()}${a.respondedAt ? ` em ${ddmm(a.respondedAt)}` : ""})`)
                    .join(", ")}.`
                : "Nenhuma tentativa de retenção registrada para esta solicitação."}
            </span>
            <Link href={`/churn/${id}/retencao`} className="shrink-0 text-[12px] text-ink-100 hover:underline">
              Ver tentativas
            </Link>
          </div>
        </Part>

        {cancel && (
          <Part n="04" title="Pendências do encerramento" sub="Itens contratuais que precisam ser resolvidos — viram tarefas da solicitação">
            <div className="overflow-hidden rounded-lg border border-[var(--border-hair)]">
              {pend.map((p, i) => (
                <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--border-hair)] px-3.5 py-[9px] last:border-b-0">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={p.done}
                    aria-label={`${p.text} concluída`}
                    onClick={() => setP(i, { done: !p.done })}
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded-[4px] border ${p.done ? "border-ink-100 bg-ink-100 text-ink-950" : "border-ink-600"}`}
                  >
                    {p.done && <Icon name="check" size={11} stroke={3} />}
                  </button>
                  <input
                    value={p.text}
                    onChange={(e) => setP(i, { text: e.target.value })}
                    placeholder="Descreva a pendência"
                    className={`min-w-[180px] flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-600 ${p.done ? "text-ink-500 line-through" : "text-ink-100"}`}
                  />
                  <select
                    value={p.owner}
                    onChange={(e) => setP(i, { owner: e.target.value })}
                    className="h-7 max-w-[140px] rounded-md bg-transparent text-[12px] text-ink-400 outline-none"
                    aria-label="Responsável"
                  >
                    <option value="">Sem responsável</option>
                    {[...new Set([...users, "Financeiro", "Operações", ...(p.owner ? [p.owner] : [])])].map((u) => (
                      <option key={u} value={u} className="bg-ink-900">
                        {u}
                      </option>
                    ))}
                  </select>
                  {p.note ? (
                    <span className="w-[130px] text-[12px] text-ink-500">{p.note}</span>
                  ) : p.done ? (
                    <span className="w-[130px] text-[12px] text-verde-fg">Concluída</span>
                  ) : (
                    <input
                      type="date"
                      value={p.due}
                      onChange={(e) => setP(i, { due: e.target.value })}
                      aria-label="Prazo"
                      className="h-7 w-[130px] rounded-md bg-transparent text-[12px] text-amarelo-fg outline-none [color-scheme:dark]"
                    />
                  )}
                  <button type="button" className="modal-x" aria-label="Remover pendência" onClick={() => setPend(pend.filter((_, j) => j !== i))}>
                    <Icon name="x" size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPend([...pend, { text: "", owner: "", due: "", done: false }])}
              className="flex w-fit items-center gap-1.5 text-[12px] text-ink-300 hover:text-ink-100"
            >
              <Icon name="plus" size={13} />
              Adicionar pendência
            </button>
          </Part>
        )}

        <footer className="flex flex-col gap-3 border-t border-[var(--border-hair)] bg-ink-950/60 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <span className="flex flex-1 items-start gap-2 text-[12px] text-ink-500">
            <Icon name="lock" size={14} className="mt-px shrink-0" />
            {cancel
              ? "Após confirmar, o status passa a Cancelado, o cliente sai da carteira na data efetiva e o histórico completo fica preservado."
              : "Após confirmar, o status passa a Retido e o histórico completo fica preservado para consulta."}
          </span>
          <div className="flex gap-2">
            <Link href={`/churn/${id}`} className="btn btn-ghost">
              Voltar
            </Link>
            <SubmitButton className={cancel ? "btn-primary" : "btn-light"} pendingLabel="Confirmando…">
              <Icon name={cancel ? "xCircle" : "shieldCheck"} size={15} />
              {cancel ? "Confirmar cancelamento" : "Confirmar retenção"}
            </SubmitButton>
          </div>
        </footer>
      </ActionForm>

      <aside className="flex flex-col gap-4">
        <section className="rounded-xl border border-[var(--border-hair)] bg-ink-900">
          <div className="space-y-0.5 px-[18px] pt-3.5">
            <h2 className="text-[14px] font-semibold text-ink-100">Impacto financeiro</h2>
            <p className="text-[12px] text-ink-500">Valores do contrato no cadastro do cliente</p>
          </div>
          <div className="flex flex-col gap-1 px-[18px] py-4">
            <Caps>{cancel || lost > 0 ? "Receita mensal perdida" : "Receita mensal preservada"}</Caps>
            <span className="flex items-end gap-1.5">
              <span className={`tnum font-display text-[30px] font-semibold leading-none ${cancel || lost > 0 ? "text-vermelho-fg" : "text-verde-fg"}`}>
                {money(cancel || lost > 0 ? lost : kept)}
              </span>
              <span className="pb-1 text-[13px] text-ink-500">/mês</span>
            </span>
          </div>
          {[
            ["Receita preservada", money(kept), "text-ink-300"],
            ["Impacto anualizado", money(lost * 12), lost ? "text-ink-100" : "text-ink-500"],
            ["Tempo de permanência", tenure(contractStart, cancel ? end : today, true), "text-ink-100"],
            ["Contabilizada como perda", cancel ? `a partir de ${dateBr(end)}` : lost ? "a partir da conclusão" : "—", "text-ink-100"],
          ].map(([k, v, cls]) => (
            <div key={k} className="flex items-center justify-between gap-3 border-t border-[var(--border-hair)] px-[18px] py-2.5 text-[12px]">
              <span className="text-ink-500">{k}</span>
              <span className={cls}>{v}</span>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-[var(--border-hair)] bg-ink-900">
          <div className="space-y-0.5 px-[18px] pt-3.5">
            <h2 className="text-[14px] font-semibold text-ink-100">Ao confirmar</h2>
            <p className="text-[12px] text-ink-500">Atualizações automáticas no painel</p>
          </div>
          <ul className="flex flex-col gap-3 px-[18px] pb-4 pt-3.5">
            {cancel ? (
              <>
                <Sync icon="database" title="Clientes e carteira" desc={`Cliente arquivado em ${dateBr(end)} — sai da carteira e do score`} />
                <Sync icon="heartPulse" title="Saúde do Cliente" desc="Evento “Churn concluído” no histórico da conta" />
                <Sync icon="listTodo" title="Tarefas" desc={`${openPend} ${openPend === 1 ? "pendência aberta" : "pendências abertas"} como tarefas`} />
              </>
            ) : (
              <>
                <Sync icon="database" title="Clientes e carteira" desc="Cliente segue ativo na carteira" />
                {outcome === "retido_alteracao" && <Sync icon="wallet" title="MRR" desc={`${money(mrr)} → ${money(newValue)} no cadastro (se marcado)`} />}
                <Sync icon="heartPulse" title="Saúde do Cliente" desc="Evento “Cliente retido” no histórico da conta" />
              </>
            )}
          </ul>
        </section>

        <section className="rounded-xl border border-[var(--border-hair)] bg-ink-900">
          <div className="space-y-0.5 px-[18px] pt-3.5">
            <h2 className="text-[14px] font-semibold text-ink-100">Histórico preservado</h2>
            <p className="text-[12px] text-ink-500">Todas as mudanças de status ficam registradas</p>
          </div>
          <ol className="px-[18px] pb-4 pt-3.5">
            {[...statusTrail.map((s) => ({ label: STATUS[s.status].label, date: ddmm(s.date), tone: STATUS[s.status].tone, done: true })), {
              label: cancel ? "Cancelado" : "Retido",
              date: "ao confirmar",
              tone: cancel ? ("vermelho" as const) : ("verde" as const),
              done: false,
            }].map((s, i, arr) => (
              <li key={i} className="flex gap-2.5">
                <span className="flex w-2.5 flex-col items-center gap-[3px] pt-1">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${s.done ? TONE[s.tone].dot : "border border-ink-500"}`} />
                  {i < arr.length - 1 && <span className="w-px flex-1 bg-ink-700" />}
                </span>
                <span className={`flex flex-1 justify-between gap-2 pb-3 text-[12px] ${s.done ? "text-ink-100" : "text-ink-500"}`}>
                  {s.label}
                  <span className="text-ink-500">{s.date}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}

function Part({ n, title, sub, first, children }: { n: string; title: string; sub: string; first?: boolean; children: React.ReactNode }) {
  return (
    <section className={`flex flex-col gap-4 px-5 py-[22px] sm:px-6 ${first ? "" : "border-t border-[var(--border-hair)]"}`}>
      <div className="space-y-1">
        <p className="flex items-center gap-2">
          <span className="tnum text-[11px] text-ink-500">{n}</span>
          <span className="text-[14px] font-semibold text-ink-100">{title}</span>
        </p>
        <p className="text-[12px] text-ink-500">{sub}</p>
      </div>
      {children}
    </section>
  );
}

function Sync({ icon, title, desc }: { icon: IconName; title: string; desc: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <IconBox icon={icon} />
      <span className="flex flex-col gap-0.5">
        <span className="text-[12px] text-ink-100">{title}</span>
        <span className="text-[12px] text-ink-500">{desc}</span>
      </span>
    </li>
  );
}
