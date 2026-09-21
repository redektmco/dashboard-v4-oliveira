"use client";

import { useMemo, useState, useTransition } from "react";
import { pauseCharge, saveCharge, testDispatchNow } from "@/actions/billing";
import type { BillingChargeRow, DispatchLogEntry } from "@/lib/billing/types";
import { ActionForm, SubmitButton } from "./form-controls";
import { ActionMenu, type MenuItem } from "./action-menu";
import { Modal } from "./modal";
import { Empty, SectionHeader, TableScroll, dateBR } from "./ui";
import { NumberField } from "./number-field";
import { toast } from "./toast";
import { Icon } from "./icon";

type ClientContact = { id: number; name: string; billingEmail: string | null; billingPhone: string | null };

// `brl()` de ui.tsx arredonda para o real inteiro (serve pro MRR, que é
// aproximado); cobrança é valor de fatura de verdade, então mantém os centavos.
const brlCents = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const RECURRENCE_LABEL: Record<BillingChargeRow["recurrence"], string> = {
  unica: "Única",
  mensal: "Mensal",
};

const CHANNEL_LABEL: Record<DispatchLogEntry["channel"], string> = {
  email: "E-mail",
  whatsapp: "WhatsApp",
};

export function BillingManager({
  clients,
  charges,
  log,
  emailConfigured,
  whatsappConfigured,
}: {
  clients: ClientContact[];
  charges: BillingChargeRow[];
  log: DispatchLogEntry[];
  emailConfigured: boolean;
  whatsappConfigured: boolean;
}) {
  const [editing, setEditing] = useState<BillingChargeRow | "new" | null>(null);
  const [dispatching, startDispatch] = useTransition();
  const contactByClient = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const menu = (c: BillingChargeRow): MenuItem[] => [
    { label: "Editar", icon: "pencil", onSelect: () => setEditing(c) },
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

  return (
    <>
      {!emailConfigured && !whatsappConfigured && (
        <div className="rounded-lg border border-[rgba(255,192,42,0.35)] bg-amarelo-dim px-4 py-3 text-[13px] text-amarelo-fg">
          Nenhum canal de envio configurado — as cobranças ficam registradas, mas nada é disparado de verdade até
          configurar <code className="font-mono text-[12px]">RESEND_API_KEY</code>/
          <code className="font-mono text-[12px]">BILLING_FROM_EMAIL</code> (e-mail) e/ou{" "}
          <code className="font-mono text-[12px]">WHATSAPP_TOKEN</code>/
          <code className="font-mono text-[12px]">WHATSAPP_PHONE_ID</code>/
          <code className="font-mono text-[12px]">WHATSAPP_TEMPLATE_NAME</code> (WhatsApp) no ambiente.
        </div>
      )}

      <SectionHeader
        title="Cobranças"
        description="Cada parcela dispara automaticamente no vencimento, 0h. Recorrência mensal avança sozinha para o mês seguinte depois de cada disparo."
        actions={
          <>
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
              {dispatching ? <span className="spinner" aria-hidden /> : <Icon name="refresh" size={14} />}
              {dispatching ? "Disparando…" : "Testar disparo agora"}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
              <Icon name="plusCircle" size={14} />
              Nova cobrança
            </button>
          </>
        }
      />

      <section className="panel">
        {charges.length === 0 ? (
          <Empty action={<button className="btn btn-primary" onClick={() => setEditing("new")}>Cadastrar a primeira cobrança</button>}>
            Nenhuma cobrança cadastrada ainda.
          </Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-hair)]">
            {charges.map((c) => (
              <li key={c.id} className="px-4 py-4 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-[15px] font-semibold text-ink-100">{c.clientName}</span>
                      <span className="rounded-full bg-ink-850 px-2 py-0.5 text-[11px] font-semibold text-ink-300">
                        {RECURRENCE_LABEL[c.recurrence]}
                      </span>
                      {!c.active && (
                        <span className="rounded-full bg-ink-850 px-2 py-0.5 text-[11px] font-semibold text-ink-500">
                          encerrada
                        </span>
                      )}
                      {c.active && !c.billingEmail && !c.billingPhone && (
                        <span className="rounded-full bg-vermelho-dim px-2 py-0.5 text-[11px] font-semibold text-vermelho-fg">
                          sem contato
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-500">{c.description}</div>
                  </div>
                  <ActionMenu items={menu(c)} label={`Ações da cobrança de ${c.clientName}`} />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-ink-400">
                  <span className="tnum font-semibold text-ink-100">{brlCents(c.amount)}</span>
                  <span>
                    Vencimento: <strong className="tnum text-ink-200">{dateBR(c.dueDate)}</strong>
                  </span>
                  {c.billingEmail && <span>✉ {c.billingEmail}</span>}
                  {c.billingPhone && <span>WhatsApp: {c.billingPhone}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SectionHeader title="Histórico de disparo" description="Cada tentativa de envio, sucesso ou falha, com a abertura do e-mail quando rastreável." />
      <section className="panel">
        {log.length === 0 ? (
          <Empty>Nenhum disparo ainda.</Empty>
        ) : (
          <TableScroll>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Cobrança</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Canal</th>
                  <th>Status</th>
                  <th>Enviado em</th>
                  <th>Aberto</th>
                </tr>
              </thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id}>
                    <td>{l.clientName}</td>
                    <td className="max-w-[220px] truncate">{l.description}</td>
                    <td className="tnum">{dateBR(l.dueDate)}</td>
                    <td className="tnum">{brlCents(l.amount)}</td>
                    <td>{CHANNEL_LABEL[l.channel]}</td>
                    <td>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          l.status === "sent" ? "bg-verde-dim text-verde-fg" : "bg-vermelho-dim text-vermelho-fg"
                        }`}
                        title={l.error ?? undefined}
                      >
                        {l.status === "sent" ? "enviado" : "falhou"}
                      </span>
                    </td>
                    <td className="tnum">{dateBR(l.sentAt.slice(0, 10))}</td>
                    <td>{l.channel === "email" ? (l.openedAt ? "sim" : "não") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </section>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Nova cobrança" : `Editar cobrança de ${editing?.clientName ?? ""}`}
        description="O contato de cobrança do cliente é salvo junto — é para onde a fatura vai no vencimento."
        size="md"
      >
        {editing !== null && (
          <ChargeFields
            charge={editing === "new" ? null : editing}
            clients={clients}
            contactByClient={contactByClient}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}

function ChargeFields({
  charge,
  clients,
  contactByClient,
  onDone,
}: {
  charge: BillingChargeRow | null;
  clients: ClientContact[];
  contactByClient: Map<number, ClientContact>;
  onDone: () => void;
}) {
  const [clientId, setClientId] = useState<number | "">(charge?.clientId ?? "");
  const contact = typeof clientId === "number" ? contactByClient.get(clientId) : undefined;

  return (
    <ActionForm action={saveCharge} onSuccess={onDone}>
      {charge && <input type="hidden" name="id" value={charge.id} />}

      <label className="block">
        <span className="label">Cliente</span>
        {charge ? (
          // Cliente não muda numa edição — troca de dono é outra cobrança.
          // `disabled` faria o navegador não enviar o campo, por isso o
          // valor de verdade vai num hidden e o select fica só de exibição.
          <>
            <input type="hidden" name="client_id" value={charge.clientId} />
            <select className="field mt-1" value={charge.clientId} disabled>
              <option value={charge.clientId}>{charge.clientName}</option>
            </select>
          </>
        ) : (
          <select
            name="client_id"
            required
            className="field mt-1"
            value={clientId}
            onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : "")}
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
        )}
      </label>

      <label className="block">
        <span className="label">Descrição</span>
        <input
          name="description"
          required
          defaultValue={charge?.description}
          placeholder="Ex.: Mensalidade de gestão"
          className="field mt-1"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Valor (R$)</span>
          <span className="mt-1 block">
            <NumberField name="amount" step="0.01" defaultValue={charge?.amount ?? ""} placeholder="0,00" />
          </span>
        </label>
        <label className="block">
          <span className="label">Vencimento</span>
          <input type="date" name="due_date" required defaultValue={charge?.dueDate} className="field mt-1" />
        </label>
      </div>

      <label className="block">
        <span className="label">Recorrência</span>
        <select name="recurrence" defaultValue={charge?.recurrence ?? "unica"} className="field mt-1">
          <option value="unica">Única</option>
          <option value="mensal">Mensal — avança sozinha para o próximo mês após cada disparo</option>
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">E-mail de cobrança</span>
          <input
            type="email"
            name="billing_email"
            key={`email-${clientId}`}
            defaultValue={charge?.billingEmail ?? contact?.billingEmail ?? ""}
            placeholder="financeiro@cliente.com"
            className="field mt-1"
          />
        </label>
        <label className="block">
          <span className="label">WhatsApp de cobrança</span>
          <input
            name="billing_phone"
            key={`phone-${clientId}`}
            defaultValue={charge?.billingPhone ?? contact?.billingPhone ?? ""}
            placeholder="+55 11 91234-5678"
            className="field mt-1"
          />
        </label>
      </div>

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onDone}>
          Cancelar
        </button>
        <SubmitButton pendingLabel={charge ? "Salvando…" : "Cadastrando…"}>
          {charge ? "Salvar alterações" : "Cadastrar cobrança"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
