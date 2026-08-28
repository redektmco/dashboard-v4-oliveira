"use client";

import { useState } from "react";
import Link from "next/link";
import { targetKeysFor } from "@/lib/model/catalog";
import { ACCOUNT_TYPE_LABEL, type AccountType, type Client, type User } from "@/lib/model/types";
import { upsertClient } from "@/actions";
import { NumberField } from "./number-field";
import { Panel } from "./ui";

export function ClientForm({
  users,
  client,
  targets,
}: {
  users: User[];
  client: (Client & { gt_name: string | null; account_name: string | null }) | null;
  targets: Record<string, number>;
}) {
  const [type, setType] = useState<AccountType>(client?.account_type ?? "lead_gen");
  const gts = users.filter((u) => u.role === "gt");
  const accounts = users.filter((u) => u.role === "account");

  return (
    <Panel
      title={client ? `Editar ${client.name}` : "Novo cliente"}
      subtitle="As metas aqui pré-preenchem o formulário semanal do GT."
      right={
        client ? (
          <Link href="/config" className="btn py-1 text-xs">
            Novo
          </Link>
        ) : null
      }
    >
      <form action={upsertClient} className="space-y-3 px-4 py-4">
        {client && <input type="hidden" name="id" value={client.id} />}

        <label className="block">
          <span className="label">Nome</span>
          <input name="name" required defaultValue={client?.name} className="field mt-1" />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Tipo de conta</span>
            <select
              name="account_type"
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
              className="field mt-1"
            >
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
            <select
              name="account_user_id"
              defaultValue={client?.account_user_id ?? ""}
              className="field mt-1"
            >
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
          <input
            type="date"
            name="renewal_date"
            defaultValue={client?.renewal_date ?? ""}
            className="field mt-1"
          />
        </label>

        <div className="border-t border-[var(--border-hair)] pt-3">
          <h3 className="label">Metas de {ACCOUNT_TYPE_LABEL[type]}</h3>
          <p className="mt-1 text-[11px] text-ink-500">
            Base das réguas A e B. O GT pode ajustar na semana; o valor informado passa a ser a meta
            vigente.
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
            <input
              type="date"
              name="effective_from"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="field mt-1"
            />
          </label>
        </div>

        <button className="btn btn-primary w-full justify-center">
          {client ? "Salvar alterações" : "Cadastrar cliente"}
        </button>
      </form>
    </Panel>
  );
}
