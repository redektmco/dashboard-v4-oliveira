"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { pauseCharge, saveCharge, testDispatchNow } from "@/actions/billing";
import { RECURRENCE_LABEL, RECURRENCE_MONTHS, type BillingChargeRow, type BillingRecurrence, type DispatchLogEntry } from "@/lib/billing/types";
import { ActionForm, SubmitButton } from "../form-controls";
import { ActionMenu, type MenuItem } from "../action-menu";
import { SidePanel } from "../side-panel";
import { toast } from "../toast";
import { Icon } from "../icon";
import { PageTitle, Pill, Segmented } from "../kit";

export type BillingClient = {
  id: number;
  name: string;
  mrr: number;
  renewalDate: string | null;
  billingEmail: string | null;
  billingPhone: string | null;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MON = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const isoToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

function addMonths(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

/** Próximo dia do mês do contrato (dia da renovação), a partir de hoje. */
function contractDay(renewal: string | null) {
  const today = isoToday();
  if (!renewal) return addMonths(today, 1);
  const day = Number(renewal.slice(8, 10));
  let d = `${today.slice(0, 8)}${String(day).padStart(2, "0")}`;
  if (d <= today) d = addMonths(d, 1);
  return d;
}

const parseBR = (raw: string) => {
  const v = raw.trim().replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(v);
  return v && Number.isFinite(n) ? n : null;
};
const money = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Configurações › Cobrança: o que vai disparar e quando, mês a mês, e o
 * painel de nova cobrança ao lado (valor e contato vêm do cadastro).
 */
export function BillingBoard({
  clients,
  charges,
  log,
  emailOn,
  waOn,
}: {
  clients: BillingClient[];
  charges: BillingChargeRow[];
  log: DispatchLogEntry[];
  emailOn: boolean;
  waOn: boolean;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<"proximos" | "historico">("proximos");
  const [panel, setPanel] = useState<{ charge: BillingChargeRow | null; clientId: number | null } | null>(null);
  const [draft, setDraft] = useState<{ clientId: number | null; amount: number | null; due: string } | null>(null);
  const [dispatching, startDispatch] = useTransition();

  // ?novo=<id> abre a nova cobrança já com o cliente; ?c=<id> destaca as dele.
  const novo = params.get("novo");
  const focus = Number(params.get("c")) || null;
  const [handled, setHandled] = useState<string | null>(null);
  if (handled !== novo) {
    setHandled(novo);
    if (novo) setPanel({ charge: null, clientId: Number(novo) || null });
  }

  const willSend = (c: { billingEmail: string | null; billingPhone: string | null }) => Boolean((emailOn && c.billingEmail) || (waOn && c.billingPhone));
  const active = charges.filter((c) => c.active);
  const monthly = active.reduce((a, c) => a + (RECURRENCE_MONTHS[c.recurrence] ? c.amount / RECURRENCE_MONTHS[c.recurrence] : 0), 0);
  const next = active.map((c) => c.dueDate).sort()[0];
  const sending = active.filter(willSend).length;
  const noChannel = !emailOn && !waOn;
  const noContact = active.filter((c) => !c.billingEmail && !c.billingPhone).length;

  const groups = (() => {
    const list = [...active].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
    const rows: ({ kind: "draft"; due: string; clientId: number | null; amount: number | null } | { kind: "charge"; c: BillingChargeRow })[] = list.map((c) => ({ kind: "charge" as const, c }));
    if (draft && panel && !panel.charge) rows.push({ kind: "draft", due: draft.due, clientId: draft.clientId, amount: draft.amount });
    rows.sort((a, b) => ((a.kind === "draft" ? a.due : a.c.dueDate) < (b.kind === "draft" ? b.due : b.c.dueDate) ? -1 : 1));
    const by = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = (r.kind === "draft" ? r.due : r.c.dueDate).slice(0, 7);
      by.set(k, [...(by.get(k) ?? []), r]);
    }
    return [...by.entries()];
  })();

  const closePanel = () => {
    setPanel(null);
    setDraft(null);
    if (params.get("novo")) router.replace(pathname, { scroll: false });
  };

  const menu = (c: BillingChargeRow): MenuItem[] => [
    { label: "Editar", icon: "pencil", onSelect: () => setPanel({ charge: c, clientId: c.clientId }) },
    { label: "Ver cliente", icon: "external", href: `/clientes/${c.clientId}` },
    "separator",
    c.active
      ? {
          label: "Encerrar",
          icon: "x",
          danger: true,
          hint: "Para de disparar; o histórico continua",
          onSelect: async () => {
            const r = await pauseCharge(c.id, false);
            if (r?.error) toast(r.error, { tone: "error" });
            else if (r?.ok) toast(r.ok);
          },
        }
      : {
          label: "Reativar",
          icon: "refresh",
          onSelect: async () => {
            const r = await pauseCharge(c.id, true);
            if (r?.error) toast(r.error, { tone: "error" });
            else if (r?.ok) toast(r.ok);
          },
        },
  ];

  const panelEl = panel && (
    <ChargePanel
      key={`${panel.charge?.id ?? "novo"}-${panel.clientId}`}
      clients={clients}
      charge={panel.charge}
      initialClient={panel.clientId}
      noChannel={noChannel}
      onDraft={setDraft}
      onClose={closePanel}
    />
  );

  return (
    <div className="flex items-start gap-6">
      <div className="flex w-full min-w-0 flex-1 flex-col gap-5">
        <PageTitle
          title="Cobrança"
          description="Faturas que disparam sozinhas no vencimento."
          aside={
            <div className="flex gap-2">
              <button type="button" className="btn" onClick={() => setPanel({ charge: null, clientId: null })}>
                <Icon name="plus" size={16} />
                Nova cobrança
              </button>
              <button
                type="button"
                className="btn"
                disabled={dispatching}
                aria-busy={dispatching}
                onClick={() =>
                  startDispatch(async () => {
                    const r = await testDispatchNow();
                    if (r?.error) toast(r.error, { tone: "error" });
                    else if (r?.ok) toast(r.ok);
                  })
                }
              >
                {dispatching ? <span className="spinner" aria-hidden /> : <Icon name="send" size={16} />}
                Testar disparo
              </button>
            </div>
          }
        />

        {(noChannel || noContact > 0) && (
          <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-amarelo/25 bg-amarelo-dim px-4 py-3">
            <Icon name="alert" size={16} className="shrink-0 text-amarelo-fg" />
            <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-amarelo-fg">{noChannel ? "Nenhum canal de envio" : `${noContact} cobrança(s) sem contato`}</span>
              <span className="text-[12px] text-amarelo-fg/80">
                {noChannel
                  ? "As cobranças ficam registradas, mas não são enviadas até você conectar um canal."
                  : "Sem e-mail ou WhatsApp do cliente a fatura não tem para onde ir. Edite a cobrança e informe o contato."}
              </span>
            </div>
            {noChannel && (
              <div className="flex gap-1.5">
                <Link href="/gt/canais#email" className="btn h-8">
                  <Icon name="mail" size={16} />
                  E-mail
                </Link>
                <Link href="/gt/canais#whatsapp" className="btn h-8">
                  <Icon name="messageCircle" size={16} />
                  WhatsApp
                </Link>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-x-8 gap-y-3 py-1">
          {[
            { k: "Recorrente / mês", v: brl(monthly) },
            { k: "Cobranças ativas", v: String(active.length) },
            { k: "Próximo disparo", v: next ? dmy(next) : "—" },
            { k: "Serão enviadas", v: `${sending} de ${active.length}`, warn: sending < active.length },
          ].map((m) => (
            <div key={m.k} className="flex flex-col gap-1">
              <span className="text-[12px] text-ink-400">{m.k}</span>
              <span className={`tnum font-display text-[18px] font-semibold ${m.warn ? "text-amarelo-fg" : "text-ink-100"}`}>{m.v}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2">
          <h2 className="font-display text-[15px] font-semibold text-ink-100">{view === "proximos" ? "Próximos disparos" : "Histórico de disparos"}</h2>
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: "proximos", label: "Próximos" },
              { value: "historico", label: "Histórico" },
            ]}
          />
        </div>

        {view === "proximos" ? (
          <div className="overflow-hidden rounded-xl border border-[var(--border-hair)] bg-ink-900">
            {groups.map(([month, rows]) => (
              <div key={month}>
                <div className="border-b border-[var(--border-hair)] bg-white/[0.016] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-400">
                  {MONTHS[Number(month.slice(5, 7)) - 1]} {month.slice(0, 4)}
                </div>
                {rows.map((r) => {
                  if (r.kind === "draft") {
                    const cl = clients.find((c) => c.id === r.clientId);
                    return (
                      <div key="draft" className="flex items-center gap-4 border-b border-[var(--border-hair)] bg-v4-red/5 px-5 py-3.5">
                        <DateCol iso={r.due} muted month />
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="truncate text-[13px] font-semibold text-ink-100">{cl?.name ?? "Nova cobrança"}</span>
                          <span className="text-[12px] text-ink-400">Rascunho · prévia de como vai aparecer</span>
                        </div>
                        <span className="tnum text-[13px] font-semibold text-ink-300">{r.amount ? brl(r.amount) : "—"}</span>
                      </div>
                    );
                  }
                  const c = r.c;
                  const send = willSend(c);
                  return (
                    <div
                      key={c.id}
                      className={`flex items-center gap-4 border-b border-[var(--border-hair)] px-5 py-3.5 ${focus === c.clientId ? "bg-ink-850" : ""}`}
                    >
                      <DateCol iso={c.dueDate} />
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <Link href={`/clientes/${c.clientId}`} className="truncate text-[13px] font-semibold text-ink-100 hover:underline">
                            {c.clientName}
                          </Link>
                          {c.recurrence !== "unica" && (
                            <span className="flex shrink-0 items-center gap-1 rounded bg-ink-800 px-1.5 py-0.5 text-[11px] text-ink-300">
                              <Icon name="repeat" size={10} />
                              {RECURRENCE_LABEL[c.recurrence]}
                            </span>
                          )}
                        </span>
                        <span className="truncate text-[12px] text-ink-400">
                          {c.description}
                          {c.billingEmail || c.billingPhone ? ` · ${c.billingEmail ?? c.billingPhone}` : " · sem contato"}
                        </span>
                      </div>
                      <span className="tnum hidden text-[13px] font-semibold text-ink-100 sm:block">{brl(c.amount)}</span>
                      <span className="hidden sm:block">{send ? <Pill tone="verde">Será enviada</Pill> : <Pill tone="amarelo">Não será enviada</Pill>}</span>
                      <ActionMenu items={menu(c)} label={`Ações da cobrança de ${c.clientName}`} size="sm" />
                    </div>
                  );
                })}
              </div>
            ))}
            {!groups.length && (
              <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
                <p className="text-[13px] text-ink-400">Nenhuma cobrança ativa.</p>
                <button type="button" className="btn" onClick={() => setPanel({ charge: null, clientId: null })}>
                  <Icon name="plus" size={14} />
                  Cadastrar a primeira
                </button>
              </div>
            )}
          </div>
        ) : (
          <History log={log} ended={charges.filter((c) => !c.active)} menu={menu} />
        )}
      </div>

      {panel && (
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-[420px] shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--border-strong)] bg-ink-900 lg:flex">
          {panelEl}
        </aside>
      )}
      <MobileOnlyPanel open={Boolean(panel)} onClose={closePanel}>
        {panelEl}
      </MobileOnlyPanel>
    </div>
  );
}

function DateCol({ iso, muted, month }: { iso: string; muted?: boolean; month?: boolean }) {
  const d = new Date(iso + "T12:00:00Z");
  return (
    <span className="flex w-10 shrink-0 flex-col items-center">
      <span className={`tnum font-display text-[20px] font-semibold leading-[22px] ${muted ? "text-ink-400" : "text-ink-100"}`}>{iso.slice(8, 10)}</span>
      <span className="text-[11px] text-ink-400">{month ? MON[d.getUTCMonth()] : WEEK[d.getUTCDay()]}</span>
    </span>
  );
}

function History({ log, ended, menu }: { log: DispatchLogEntry[]; ended: BillingChargeRow[]; menu: (c: BillingChargeRow) => MenuItem[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-xl border border-[var(--border-hair)] bg-ink-900">
        {log.map((l) => (
          <div key={l.id} className="flex items-center gap-4 border-b border-[var(--border-hair)] px-5 py-3 last:border-0">
            <DateCol iso={l.sentAt.slice(0, 10)} month />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[13px] font-semibold text-ink-100">{l.clientName}</span>
              <span className="truncate text-[12px] text-ink-400">
                {l.description} · vencimento {dmy(l.dueDate)} · {l.channel === "email" ? "E-mail" : "WhatsApp"}
                {l.channel === "email" ? (l.openedAt ? " · aberto" : " · não aberto") : ""}
              </span>
              {l.error && <span className="truncate text-[11px] text-vermelho-fg">{l.error}</span>}
            </div>
            <span className="tnum hidden text-[13px] font-semibold text-ink-100 sm:block">{brl(l.amount)}</span>
            {l.status === "sent" ? <Pill tone="verde">Enviada</Pill> : <Pill tone="vermelho">Falhou</Pill>}
          </div>
        ))}
        {!log.length && <p className="px-5 py-10 text-center text-[13px] text-ink-400">Nenhum disparo ainda. O histórico aparece no primeiro vencimento.</p>}
      </div>
      {ended.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[var(--border-hair)] bg-ink-900">
          <div className="border-b border-[var(--border-hair)] bg-white/[0.016] px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-400">Encerradas</div>
          {ended.map((c) => (
            <div key={c.id} className="flex items-center gap-4 border-b border-[var(--border-hair)] px-5 py-3 last:border-0">
              <DateCol iso={c.dueDate} month muted />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[13px] font-semibold text-ink-300">{c.clientName}</span>
                <span className="truncate text-[12px] text-ink-400">
                  {c.description} · {RECURRENCE_LABEL[c.recurrence]}
                </span>
              </div>
              <span className="tnum hidden text-[13px] text-ink-300 sm:block">{brl(c.amount)}</span>
              <Pill tone="neutro">Encerrada</Pill>
              <ActionMenu items={menu(c)} label={`Ações da cobrança de ${c.clientName}`} size="sm" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileOnlyPanel({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return (
    <SidePanel open={open && mobile} onClose={onClose} label="Cobrança" width={440}>
      {children}
    </SidePanel>
  );
}

/* ------------------------------------------------------------------ */
/* Painel: nova cobrança / editar                                      */
/* ------------------------------------------------------------------ */

function ChargePanel({
  clients,
  charge,
  initialClient,
  noChannel,
  onDraft,
  onClose,
}: {
  clients: BillingClient[];
  charge: BillingChargeRow | null;
  initialClient: number | null;
  noChannel: boolean;
  onDraft: (d: { clientId: number | null; amount: number | null; due: string } | null) => void;
  onClose: () => void;
}) {
  const start = clients.find((c) => c.id === (charge?.clientId ?? initialClient)) ?? null;
  const [clientId, setClientId] = useState<number | null>(start?.id ?? null);
  const client = clients.find((c) => c.id === clientId) ?? null;
  const [description, setDescription] = useState(charge?.description ?? "Mensalidade de gestão");
  const [amount, setAmount] = useState(charge ? money(charge.amount) : start ? money(start.mrr) : "");
  const [due, setDue] = useState(charge?.dueDate ?? contractDay(start?.renewalDate ?? null));
  const [rec, setRec] = useState<BillingRecurrence>(charge?.recurrence ?? "mensal");
  const [editContact, setEditContact] = useState(false);
  const [email, setEmail] = useState(charge?.billingEmail ?? start?.billingEmail ?? "");
  const [phone, setPhone] = useState(charge?.billingPhone ?? start?.billingPhone ?? "");

  const pick = (id: number | null) => {
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    if (c && !charge) {
      setAmount(money(c.mrr));
      setDue(contractDay(c.renewalDate));
      setEmail(c.billingEmail ?? "");
      setPhone(c.billingPhone ?? "");
      setEditContact(!c.billingEmail && !c.billingPhone);
    }
  };

  const value = parseBR(amount);
  useEffect(() => {
    if (!charge) onDraft({ clientId, amount: value, due });
  }, [clientId, value, due, charge, onDraft]);

  const months = RECURRENCE_MONTHS[rec];
  const dates = due ? (months ? [0, 1, 2].map((i) => addMonths(due, i * months)) : [due]) : [];

  return (
    <ActionForm action={saveCharge} onSuccess={onClose} className="flex min-h-0 flex-1 flex-col">
      {charge && <input type="hidden" name="id" value={charge.id} />}
      <input type="hidden" name="client_id" value={clientId ?? ""} />
      <input type="hidden" name="amount" value={value ?? ""} />
      <input type="hidden" name="recurrence" value={rec} />
      <input type="hidden" name="billing_email" value={email} />
      <input type="hidden" name="billing_phone" value={phone} />

      <header className="flex gap-3 border-b border-[var(--border-hair)] px-6 py-[18px]">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="font-display text-[17px] font-semibold text-ink-100">{charge ? "Editar cobrança" : "Nova cobrança"}</h2>
          <p className="text-[12px] text-ink-300">Escolha o cliente: valor e contato vêm do cadastro dele.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-strong)] bg-ink-850 text-ink-300 hover:text-ink-100">
          <Icon name="x" size={15} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-6">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-300">Cliente</span>
          <select
            value={clientId ?? ""}
            onChange={(e) => pick(Number(e.target.value) || null)}
            disabled={Boolean(charge)}
            className="field h-[38px] field--deep text-[14px]"
            required
          >
            <option value="" disabled>
              Selecione…
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {client && (
            <div className="flex flex-col gap-1.5 rounded-lg bg-ink-850 p-3">
              <div className="flex justify-between">
                <span className="text-[12px] font-semibold text-ink-300">Contato de cobrança</span>
                <button type="button" onClick={() => setEditContact(!editContact)} className="text-[12px] font-medium text-ink-100 hover:underline">
                  {editContact ? "Pronto" : "Editar"}
                </button>
              </div>
              {editContact ? (
                <div className="flex flex-col gap-2 pt-1">
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="financeiro@cliente.com.br" className="field" />
                  <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 90000-0000" className="field" />
                  <span className="text-[11px] text-ink-400">Fica salvo no cadastro do cliente para as próximas cobranças.</span>
                </div>
              ) : (
                <>
                  <span className="flex items-center gap-2 text-[12px] text-ink-100">
                    <Icon name="mail" size={13} className="text-ink-400" />
                    {email || <span className="text-ink-400">sem e-mail</span>}
                  </span>
                  <span className="flex items-center gap-2 text-[12px] text-ink-100">
                    <Icon name="messageCircle" size={13} className="text-ink-400" />
                    {phone || <span className="text-ink-400">sem WhatsApp</span>}
                  </span>
                </>
              )}
            </div>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-300">Descrição</span>
          <input name="description" value={description} onChange={(e) => setDescription(e.target.value)} required className="field h-[38px] field--deep text-[14px]" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-300">Valor</span>
            <span className="flex h-[38px] items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-ink-950 px-3 focus-within:border-ink-400">
              <span className="text-[13px] text-ink-400">R$</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="tnum min-w-0 flex-1 bg-transparent text-[14px] text-ink-100 outline-none" />
            </span>
            <span className="text-[11px] text-ink-400">{client && value === client.mrr ? "MRR do cliente" : "Valor da fatura"}</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-300">{charge ? "Próximo vencimento" : "Primeiro vencimento"}</span>
            <input type="date" name="due_date" value={due} onChange={(e) => setDue(e.target.value)} required className="field h-[38px] field--deep text-[14px]" />
            <span className="text-[11px] text-ink-400">{client?.renewalDate ? "Dia do contrato" : "Escolha o dia"}</span>
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-ink-300">Recorrência</span>
          <Segmented
            full
            value={rec}
            onChange={setRec}
            options={(Object.keys(RECURRENCE_LABEL) as BillingRecurrence[]).map((r) => ({ value: r, label: RECURRENCE_LABEL[r] }))}
          />
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--border-hair)] pt-3.5">
          <span className="text-[12px] font-semibold text-ink-300">Próximos disparos</span>
          <div className="flex flex-wrap gap-1.5">
            {dates.map((d) => (
              <span key={d} className="tnum rounded-[5px] bg-ink-850 px-2 py-1 text-[12px] text-ink-300">
                {d.slice(8, 10)}/{d.slice(5, 7)}
              </span>
            ))}
            {months > 0 && <span className="rounded-[5px] bg-ink-850 px-2 py-1 text-[12px] text-ink-300">…</span>}
          </div>
          {(noChannel || (!email && !phone)) && (
            <span className="flex items-center gap-1.5 text-[12px] text-amarelo-fg">
              <Icon name="alertCircle" size={13} />
              {noChannel ? "Sem canal de envio, fica registrada mas não dispara." : "Sem contato do cliente, fica registrada mas não dispara."}
            </span>
          )}
        </div>
      </div>

      <footer className="flex justify-end gap-2 border-t border-[var(--border-hair)] px-6 py-3.5">
        <button type="button" className="btn" onClick={onClose}>
          Cancelar
        </button>
        <SubmitButton pendingLabel="Salvando…" disabled={!clientId || value === null}>
          <Icon name="check" size={16} />
          {charge ? "Salvar cobrança" : "Cadastrar cobrança"}
        </SubmitButton>
      </footer>
    </ActionForm>
  );
}
