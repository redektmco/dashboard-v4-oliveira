"use client";

import { useState } from "react";
import { targetKeysFor } from "@/lib/model/catalog";
import { ACCOUNT_TYPE_LABEL, type AccountType, type Client, type User } from "@/lib/model/types";
import { saveClient } from "@/actions";
import { ActionForm, SubmitButton } from "./form-controls";
import { Modal } from "./modal";
import { NumberField } from "./number-field";

export type ClientFormClient = Client & { gt_name: string | null; account_name: string | null };

/**
 * Cadastro/edição de cliente num modal. Os campos essenciais ficam à vista;
 * as metas — que só importam no cadastro e na recalibração — ficam numa
 * seção recolhível, aberta por padrão só quando o cliente ainda não tem meta.
 */
export function ClientDialog({
  open,
  onClose,
  users,
  client,
  targets,
}: {
  open: boolean;
  onClose: () => void;
  users: User[];
  client: ClientFormClient | null;
  targets: Record<string, number>;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={client ? `Editar ${client.name}` : "Novo cliente"}
      description="As metas são a base das réguas do score: o número que chega das integrações é medido contra elas."
      size="md"
    >
      <ClientFields key={client?.id ?? "novo"} users={users} client={client} targets={targets} onDone={onClose} />
    </Modal>
  );
}

function ClientFields({
  users,
  client,
  targets,
  onDone,
}: {
  users: User[];
  client: ClientFormClient | null;
  targets: Record<string, number>;
  onDone: () => void;
}) {
  const [type, setType] = useState<AccountType>(client?.account_type ?? "lead_gen");
  // Quem saiu do time não aparece na lista, mas segue como opção enquanto
  // for o atual do cliente — senão salvar a ficha apagaria o vínculo calado.
  const keep = (list: User[], id: number | null | undefined, name: string | null | undefined, role: User["role"]) =>
    id && name && !list.some((u) => u.id === id) ? [...list, { id, name: `${name} (inativo)`, role }] : list;
  const gts = keep(users.filter((u) => u.role === "gt"), client?.gt_user_id, client?.gt_name, "gt");
  const accounts = keep(users.filter((u) => u.role === "account"), client?.account_user_id, client?.account_name, "account");
  const semMeta = Object.keys(targets).length === 0;

  return (
    <ActionForm action={saveClient} onSuccess={onDone}>
      {client && <input type="hidden" name="id" value={client.id} />}

      <label className="block">
        <span className="label">Nome</span>
        <input name="name" required defaultValue={client?.name} className="field mt-1" autoFocus={!client} />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Tipo de conta</span>
          <select name="account_type" value={type} onChange={(e) => setType(e.target.value as AccountType)} className="field mt-1">
            {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">MRR (R$)</span>
          <span className="mt-1 block">
            <NumberField name="mrr" step="0.01" defaultValue={client?.mrr ?? ""} placeholder="0,00" />
          </span>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">GT</span>
          <select name="gt_user_id" defaultValue={client?.gt_user_id ?? ""} className="field mt-1">
            <option value="">—</option>
            {gts.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Account</span>
          <select name="account_user_id" defaultValue={client?.account_user_id ?? ""} className="field mt-1">
            <option value="">—</option>
            {accounts.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="label">Data de renovação</span>
        <input type="date" name="renewal_date" defaultValue={client?.renewal_date ?? ""} className="field mt-1" />
      </label>

      <details className="rounded-lg border border-[var(--border-hair)] px-3 py-2.5" open={!client?.contract_code}>
        <summary className="cursor-pointer text-[13px] font-semibold text-ink-200">Contrato</summary>
        <p className="mt-2 text-[11.5px] text-ink-500">
          Puxado automaticamente quando o cliente pede cancelamento (Churn).
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Nº do contrato</span>
            <input name="contract_code" defaultValue={client?.contract_code ?? ""} placeholder="CT-2024-001" className="field mt-1" />
          </label>
          <label className="block">
            <span className="label">Início do contrato</span>
            <input type="date" name="contract_start" defaultValue={client?.contract_start ?? ""} className="field mt-1" />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="label">Serviços (separados por vírgula)</span>
          <input
            name="services"
            defaultValue={(client?.services ?? []).join(", ")}
            placeholder="Tráfego pago, Social media"
            className="field mt-1"
          />
        </label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Fidelidade (meses)</span>
            <span className="mt-1 block">
              <NumberField name="fidelity_months" step="1" defaultValue={client?.fidelity_months ?? ""} placeholder="—" />
            </span>
          </label>
          <label className="block">
            <span className="label">Aviso prévio (dias)</span>
            <span className="mt-1 block">
              <NumberField name="notice_days" step="1" defaultValue={client?.notice_days ?? ""} placeholder="30" />
            </span>
          </label>
        </div>
      </details>

      <details className="rounded-lg border border-[var(--border-hair)] px-3 py-2.5" open={semMeta}>
        <summary className="cursor-pointer text-[13px] font-semibold text-ink-200">
          Metas de {ACCOUNT_TYPE_LABEL[type]}
          {semMeta && <span className="ml-2 text-[11px] font-semibold text-vermelho-fg">sem meta, não há régua</span>}
        </summary>
        <p className="mt-2 text-[11.5px] text-ink-500">
          O GT pode ajustar na semana; o valor informado passa a ser a meta vigente.
        </p>
        <div className="mt-2 space-y-2">
          {targetKeysFor(type).map((t) => (
            <label key={t.key} className="grid grid-cols-[1fr_136px] items-center gap-2">
              <span className="text-xs text-ink-300">{t.label}</span>
              <NumberField
                name={t.key}
                step={t.decimals ? "0.01" : "1"}
                defaultValue={targets[t.key] ?? ""}
                placeholder="—"
                align="right"
              />
            </label>
          ))}
        </div>
        <label className="mt-3 block">
          <span className="label">Metas valem a partir de</span>
          <input type="date" name="effective_from" defaultValue={new Date().toISOString().slice(0, 10)} className="field mt-1" />
        </label>
      </details>

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onDone}>
          Cancelar
        </button>
        <SubmitButton pendingLabel={client ? "Salvando…" : "Cadastrando…"}>
          {client ? "Salvar alterações" : "Cadastrar cliente"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
