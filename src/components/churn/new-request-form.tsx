"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { createChurnRequest } from "@/actions/churn";
import {
  CHANCE,
  CHANNEL,
  OUTCOME,
  REASONS,
  STATUS,
  addDays,
  addMonths,
  dateBr,
  dateLong,
  money,
  monthYear,
  reasonLabel,
  tenure,
  type ChurnChannel,
  type ChurnOutcome,
  type ChurnStatus,
  type Evidence,
  type RetentionChance,
} from "@/lib/churn/types";
import { ActionForm, SubmitButton } from "../form-controls";
import { Icon, type IconName } from "../icon";
import { toast } from "../toast";
import { EvidenceDrop } from "./evidence";
import { ChurnHeader, IconBox, TONE, TonePill } from "./ui";

export type FormClient = {
  id: number;
  name: string;
  mrr: number;
  accountUserId: number | null;
  contractCode: string | null;
  services: string[];
  contractStart: string;
  contractStartIsSignup: boolean;
  fidelityMonths: number | null;
  noticeDays: number | null;
  openRequest: boolean;
};

type Prev = { id: number; code: string; clientId: number; requestedAt: string; reason: string; status: ChurnStatus; outcome: ChurnOutcome | null };

type Draft = {
  clientId: string;
  requestedAt: string;
  channel: ChurnChannel;
  main: string;
  secondary: string[];
  justification: string;
  desiredEnd: string;
  ownerId: string;
  chance: RetentionChance | "";
  evidences: Evidence[];
};

const DRAFT_KEY = "healthscore.churn.draft";
const CHANNEL_ICON: Record<ChurnChannel, IconName> = { email: "mail", whatsapp: "messageCircle", call: "phone", reuniao: "users", outro: "ellipsis" };

/**
 * Churn 02 — Registrar solicitação de cancelamento. Formaliza o pedido feito
 * pelo cliente; os dados do contrato vêm do cadastro do cliente. Criar a
 * solicitação não cancela o contrato.
 */
export function NewRequestForm(props: {
  clients: FormClient[];
  users: { id: number; name: string }[];
  previous: Prev[];
  meId: number;
  today: string;
  initialClient: number | null;
}) {
  // O rascunho vive no navegador: o formulário só monta depois da hidratação.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted) return <div className="min-h-[60vh]" aria-busy="true" />;
  return <Inner {...props} />;
}

function Inner({
  clients,
  users,
  previous,
  meId,
  today,
  initialClient,
}: {
  clients: FormClient[];
  users: { id: number; name: string }[];
  previous: Prev[];
  meId: number;
  today: string;
  initialClient: number | null;
}) {
  const [d, setD] = useState<Draft>(() => {
    const blank: Draft = {
      clientId: initialClient ? String(initialClient) : "",
      requestedAt: today,
      channel: "email",
      main: "",
      secondary: [],
      justification: "",
      desiredEnd: "",
      ownerId: "",
      chance: "",
      evidences: [],
    };
    if (initialClient) return blank;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? { ...blank, ...(JSON.parse(raw) as Partial<Draft>) } : blank;
    } catch {
      return blank;
    }
  });
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  const client = clients.find((c) => String(c.id) === d.clientId) ?? null;
  const ownerId = d.ownerId || String(client?.accountUserId ?? meId);
  const owner = users.find((u) => String(u.id) === ownerId);
  const prev = useMemo(() => previous.filter((p) => client && p.clientId === client.id), [previous, client]);

  const fidelityEnd = client?.fidelityMonths ? addMonths(client.contractStart, client.fidelityMonths) : null;
  const minEnd = client?.noticeDays && d.requestedAt ? addDays(d.requestedAt, client.noticeDays) : null;

  const saveDraft = () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
      toast("Rascunho salvo neste navegador.");
    } catch {
      toast("Não foi possível salvar o rascunho.", { tone: "error" });
    }
  };

  return (
    <>
      <ChurnHeader
        crumbs={[{ href: "/churn", label: "Churn" }, { label: "Nova solicitação" }]}
        title="Registrar solicitação de cancelamento"
        description="Formalize o pedido feito pelo cliente. Os dados do contrato são puxados do cadastro do cliente."
        actions={
          <button type="button" className="btn btn-ghost" onClick={saveDraft}>
            <Icon name="save" size={15} />
            Salvar rascunho
          </button>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <ActionForm action={createChurnRequest} className="flex min-w-0 flex-col gap-4">
          <input type="hidden" name="evidences" value={JSON.stringify(d.evidences)} />
          <input type="hidden" name="owner_user_id" value={ownerId} />
          <input type="hidden" name="channel" value={d.channel} />
          <input type="hidden" name="retention_chance" value={d.chance} />
          {d.secondary.map((s) => (
            <input key={s} type="hidden" name="secondary_reasons" value={s} />
          ))}

          {/* 1 — cliente e contrato */}
          <Section n={1} title="Cliente e contrato" description="Selecione a conta que pediu para encerrar.">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Cliente" required>
                <select name="client_id" value={d.clientId} onChange={(e) => set({ clientId: e.target.value, ownerId: "" })} className="field field--deep" required>
                  <option value="">Selecione…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.openRequest ? " · já tem solicitação aberta" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Contrato">
                <div className="field field--deep flex items-center gap-2 text-ink-300">
                  <Icon name="fileText" size={15} className="shrink-0 text-ink-500" />
                  <span className="truncate">
                    {client ? [client.contractCode ?? "Sem número", client.services.join(" + ")].filter(Boolean).join(" · ") : "—"}
                  </span>
                </div>
              </Field>
            </div>

            {client?.openRequest && (
              <p className="flex items-center gap-2 rounded-lg bg-amarelo-dim px-3 py-2 text-[12px] text-amarelo-fg">
                <Icon name="alertCircle" size={14} className="shrink-0" />
                Esta conta já tem uma solicitação em aberto. Registre a nova só se for um pedido diferente.
              </p>
            )}

            {client && (
              <div className="overflow-hidden rounded-[10px] border border-[var(--border-hair)] bg-ink-950">
                <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-hair)] px-3.5 py-2.5">
                  <Icon name="database" size={14} className="text-ink-400" />
                  <span className="text-[12px] text-ink-300">Resumo do contrato</span>
                  <span className="flex-1" />
                  <Link href="/config/clientes" className="text-[11px] text-ink-500 hover:text-ink-100">
                    Puxado do cadastro do cliente · editar
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-4 p-3.5 md:grid-cols-4">
                  <Item label="Serviços">
                    {client.services.length ? (
                      <span className="flex flex-wrap gap-1">
                        {client.services.map((s) => (
                          <span key={s} className="rounded-md bg-ink-800 px-[7px] py-[3px] text-[12px] text-ink-100">
                            {s}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-[13px] text-ink-500">Não informado</span>
                    )}
                  </Item>
                  <Item label="Valor mensal">
                    <span className="flex items-baseline gap-1">
                      <span className="tnum text-[15px] text-ink-100">{money(client.mrr)}</span>
                      <span className="text-[12px] text-ink-500">/mês</span>
                    </span>
                  </Item>
                  <Item label={client.contractStartIsSignup ? "Cliente desde" : "Início"}>
                    <span className="text-[14px] text-ink-100">{dateLong(client.contractStart)}</span>
                    <span className="text-[12px] text-ink-500">{tenure(client.contractStart, today)} de casa</span>
                  </Item>
                  <Item label="Fidelidade">
                    <span className="text-[14px] text-ink-100">{client.fidelityMonths ? `${client.fidelityMonths} meses` : "Sem fidelidade"}</span>
                    {fidelityEnd &&
                      (fidelityEnd <= today ? (
                        <span className="flex items-center gap-1 text-[12px] text-amarelo-fg">
                          <Icon name="alert" size={12} />
                          Encerrada em {monthYear(fidelityEnd)}
                        </span>
                      ) : (
                        <span className="text-[12px] text-vermelho-fg">Vigente até {dateBr(fidelityEnd)}</span>
                      ))}
                  </Item>
                </div>
              </div>
            )}
          </Section>

          {/* 2 — recebimento */}
          <Section n={2} title="Recebimento" description="Quando e por onde o cliente comunicou o pedido.">
            <div className="grid gap-3 md:grid-cols-[200px_minmax(0,1fr)]">
              <Field label="Data da solicitação" required>
                <input type="date" name="requested_at" value={d.requestedAt} max={today} onChange={(e) => set({ requestedAt: e.target.value })} className="field field--deep" required />
              </Field>
              <Field label="Canal de recebimento" required>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                  {(Object.keys(CHANNEL) as ChurnChannel[]).map((c) => (
                    <Option key={c} on={d.channel === c} onClick={() => set({ channel: c })}>
                      <Icon name={CHANNEL_ICON[c]} size={14} />
                      {CHANNEL[c]}
                    </Option>
                  ))}
                </div>
              </Field>
            </div>
          </Section>

          {/* 3 — motivos */}
          <Section n={3} title="Motivos" description="Categorize o motivo principal e os secundários e registre a justificativa do cliente.">
            <Field label="Motivo principal" required>
              <select
                name="main_reason"
                value={d.main}
                onChange={(e) => set({ main: e.target.value, secondary: d.secondary.filter((s) => s !== e.target.value) })}
                className="field field--deep"
                required
              >
                <option value="">Selecione…</option>
                {Object.entries(REASONS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Motivos secundários" hint="Selecione quantos se aplicarem">
              <ReasonChips value={d.secondary} exclude={d.main} onChange={(secondary) => set({ secondary })} />
            </Field>
            <Field label="Justificativa apresentada pelo cliente" required>
              <textarea
                name="justification"
                rows={3}
                value={d.justification}
                onChange={(e) => set({ justification: e.target.value })}
                placeholder="O que o cliente disse, com as palavras dele."
                className="field field--deep min-h-[88px] py-2.5"
                required
              />
            </Field>
          </Section>

          {/* 4 — evidências */}
          <Section n={4} title="Evidências" description="Anexe prints, e-mails ou documentos relacionados ao pedido.">
            <EvidenceDrop files={d.evidences} onChange={(evidences) => set({ evidences })} folder={d.clientId || "sem-cliente"} />
          </Section>

          {/* 5 — encerramento e acompanhamento */}
          <Section n={5} title="Encerramento e acompanhamento" description="Prazo pedido pelo cliente, quem acompanha e chance de reverter.">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Data desejada para encerramento" required>
                <input type="date" name="desired_end" value={d.desiredEnd} onChange={(e) => set({ desiredEnd: e.target.value })} className="field field--deep" required />
              </Field>
              <Field label="Responsável pelo acompanhamento" required>
                <select value={ownerId} onChange={(e) => set({ ownerId: e.target.value })} className="field field--deep" required>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {minEnd && (
              <p className={`flex items-center gap-2 text-[12px] ${d.desiredEnd && d.desiredEnd < minEnd ? "text-amarelo-fg" : "text-ink-500"}`}>
                <Icon name="info" size={14} className="shrink-0" />
                Aviso prévio contratual de {client!.noticeDays} dias — encerramento mínimo em {dateBr(minEnd)}.
              </p>
            )}
            <Field label="Possibilidade de retenção" required>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {(Object.keys(CHANCE) as RetentionChance[]).map((c) => (
                  <Option key={c} on={d.chance === c} onClick={() => set({ chance: c })}>
                    <span className={`h-[7px] w-[7px] rounded-full ${TONE[CHANCE[c].tone].dot}`} />
                    {CHANCE[c].label}
                  </Option>
                ))}
              </div>
            </Field>
          </Section>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link href="/churn" className="btn btn-ghost">
              Cancelar
            </Link>
            <span onClick={() => localStorage.removeItem(DRAFT_KEY)}>
              <SubmitButton className="btn-light" pendingLabel="Criando…">
                <Icon name="check" size={15} />
                Criar solicitação
              </SubmitButton>
            </span>
          </div>
        </ActionForm>

        <aside className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-xl bg-azul-dim p-4">
            <p className="flex items-center gap-2 text-[13px] font-medium text-ink-100">
              <Icon name="shieldCheck" size={16} className="text-azul-fg" />O contrato continua ativo
            </p>
            <p className="text-[12px] leading-[17px] text-ink-300">
              Criar a solicitação não cancela o contrato. A receita só é contabilizada como perda após a conclusão com encerramento efetivo.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--border-hair)] bg-ink-900">
            <p className="border-b border-[var(--border-hair)] px-[18px] py-3.5 text-[14px] font-semibold text-ink-100">O que acontece ao criar</p>
            <ul className="flex flex-col gap-3 px-[18px] pb-4 pt-3.5">
              <Effect icon="circleDot" title={`Status inicial: ${STATUS.solicitado.label}`} desc="Visível na gestão de solicitações" />
              <Effect icon="heartPulse" title="Saúde do Cliente" desc="Evento “Pedido de cancelamento” no histórico da conta" />
              <Effect icon="listTodo" title="Tarefas" desc={`Tarefa de primeiro contato para ${owner?.name.split(" ")[0] ?? "o responsável"} em 48 h`} />
              <Effect icon="database" title="Clientes" desc="Contrato marcado com solicitação em aberto" />
            </ul>
          </div>

          <div className="rounded-xl border border-[var(--border-hair)] bg-ink-900">
            <p className="flex items-center justify-between border-b border-[var(--border-hair)] px-[18px] py-3.5 text-[14px] font-semibold text-ink-100">
              Solicitações anteriores
              <span className="text-[12px] font-normal text-ink-500">{prev.length}</span>
            </p>
            {prev.length === 0 ? (
              <p className="px-[18px] py-3.5 text-[12px] text-ink-500">{client ? "Nenhuma solicitação anterior desta conta." : "Selecione o cliente."}</p>
            ) : (
              prev.map((p) => (
                <Link key={p.id} href={`/churn/${p.id}`} className="flex items-center gap-2.5 border-b border-[var(--border-hair)] px-[18px] py-3 last:border-b-0 hover:bg-ink-850">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-ink-100">
                      {p.code} · {monthYear(p.requestedAt)}
                    </span>
                    <span className="block truncate text-[12px] text-ink-500">{reasonLabel(p.reason)}</span>
                  </span>
                  <TonePill tone={p.outcome ? OUTCOME[p.outcome].tone : STATUS[p.status].tone}>{p.outcome ? OUTCOME[p.outcome].short : STATUS[p.status].short}</TonePill>
                </Link>
              ))
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function Section({ n, title, description, children }: { n: number; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border-hair)] bg-ink-900">
      <header className="flex items-center gap-3 border-b border-[var(--border-hair)] px-4 py-4 sm:px-5">
        <span className="tnum grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-ink-800 text-[11px] text-ink-300">{n}</span>
        <div className="min-w-0 space-y-[3px]">
          <h2 className="text-[15px] font-semibold text-ink-100">{title}</h2>
          <p className="text-[12px] text-ink-500">{description}</p>
        </div>
      </header>
      <div className="flex flex-col gap-4 p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-center gap-1 text-[13px] text-ink-300">
        {label}
        {required && <span className="text-v4-red">*</span>}
        {hint && <span className="ml-auto text-[12px] text-ink-500">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

export function Option({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex h-9 items-center justify-center gap-[7px] rounded-lg border text-[13px] transition-colors ${
        on ? "border-[var(--border-strong)] bg-ink-800 text-ink-100" : "border-[var(--border-hair)] bg-ink-950 text-ink-300 hover:text-ink-100"
      }`}
    >
      {children}
    </button>
  );
}

export function ReasonChips({ value, exclude, onChange }: { value: string[]; exclude?: string; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(REASONS)
        .filter(([k]) => k !== exclude && k !== "outro")
        .map(([k, label]) => {
          const on = value.includes(k);
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}
              className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition-colors ${
                on ? "border-[var(--border-strong)] bg-ink-800 text-ink-100" : "border-[var(--border-hair)] bg-ink-950 text-ink-300 hover:text-ink-100"
              }`}
            >
              {on && <Icon name="check" size={13} />}
              {label}
            </button>
          );
        })}
    </div>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12px] text-ink-500">{label}</span>
      {children}
    </div>
  );
}

function Effect({ icon, title, desc }: { icon: IconName; title: string; desc: string }) {
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
