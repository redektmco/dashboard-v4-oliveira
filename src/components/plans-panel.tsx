"use client";

import { useState } from "react";
import { changePlanStatus, removePlan, savePlan } from "@/actions";
import type { Plan } from "@/lib/repo";
import { ActionMenu, type MenuItem } from "./action-menu";
import { ActionForm, SubmitButton } from "./form-controls";
import { ConfirmDialog, Modal } from "./modal";
import { toast } from "./toast";
import { Icon } from "./icon";
import { Empty, dateBR } from "./ui";

const STATUS: Record<Plan["status"], { label: string; cls: string }> = {
  aberto: { label: "Aberto", cls: "bg-amarelo-dim text-amarelo-fg" },
  em_andamento: { label: "Em andamento", cls: "bg-ink-800 text-ink-200" },
  concluido: { label: "Concluído", cls: "bg-verde-dim text-verde-fg" },
  cancelado: { label: "Cancelado", cls: "bg-ink-850 text-ink-500" },
};

/** Risco vira tarefa. Sem API paga: abre o ClickUp já preenchido. */
function clickupUrl(base: string, client: string, p: Plan) {
  const q = new URLSearchParams({
    name: `[Health Score] ${client} — ${p.risk}`,
    description: `${p.plan}${p.due_date ? `\n\nPrazo: ${p.due_date}` : ""}`,
  });
  return `${base}?${q}`;
}

/**
 * Planos de ação do cliente. A lista mostra risco, dono, prazo e status; o
 * formulário de novo plano saiu da página e virou modal, e as mudanças de
 * status foram para o ⋯ — antes cada linha tinha um select e um botão "ok".
 */
export function PlansPanel({
  plans,
  clientId,
  clientName,
  defaultOwner,
  today,
  clickupBase,
}: {
  plans: Plan[];
  clientId: number;
  clientName: string;
  defaultOwner: string;
  today: string;
  clickupBase: string;
}) {
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const [deleting, setDeleting] = useState<Plan | null>(null);
  const open = plans.filter((p) => p.status === "aberto" || p.status === "em_andamento");
  const closed = plans.filter((p) => p.status === "concluido" || p.status === "cancelado");

  const status = async (p: Plan, s: Plan["status"]) => {
    const r = await changePlanStatus(p.id, s);
    if (r?.error) toast(r.error, { tone: "error" });
    else if (r?.ok) toast(r.ok);
  };

  const menu = (p: Plan): MenuItem[] => {
    const items: MenuItem[] = [];
    if (p.status === "aberto") items.push({ label: "Marcar em andamento", icon: "clock", onSelect: () => void status(p, "em_andamento") });
    if (p.status === "aberto" || p.status === "em_andamento") {
      items.push({ label: "Concluir", icon: "check", onSelect: () => void status(p, "concluido") });
      items.push({ label: "Cancelar plano", icon: "x", hint: "Não vai adiante, fica no histórico", onSelect: () => void status(p, "cancelado") });
    } else {
      items.push({ label: "Reabrir", icon: "refresh", onSelect: () => void status(p, "aberto") });
    }
    items.push(
      { label: "Editar", icon: "settings", onSelect: () => setEditing(p) },
      { label: "Abrir tarefa no ClickUp", icon: "external", href: clickupUrl(clickupBase, clientName, p), external: true },
      "separator",
      { label: "Excluir", icon: "x", danger: true, hint: "Para registro feito por engano", onSelect: () => setDeleting(p) },
    );
    return items;
  };

  const row = (p: Plan) => {
    const late = p.due_date && p.due_date < today && (p.status === "aberto" || p.status === "em_andamento");
    return (
      <li key={p.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink-100">{p.risk}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[p.status].cls}`}>{STATUS[p.status].label}</span>
          </div>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-400">{p.plan}</p>
          <p className="mt-1 text-[12px] text-ink-500">
            {p.owner} ·{" "}
            <span className={late ? "font-semibold text-vermelho-fg" : ""}>
              {p.due_date ? `prazo ${dateBR(p.due_date)}${late ? " (atrasado)" : ""}` : "sem prazo"}
            </span>
          </p>
        </div>
        <ActionMenu items={menu(p)} label="Ações do plano" />
      </li>
    );
  };

  const target = editing && editing !== "new" ? editing : null;

  return (
    <section className="panel">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--border-hair)] px-4 py-3.5 sm:px-5">
        <div>
          <h2 className="font-display text-[16px] font-semibold text-ink-100">Planos de ação</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-400">
            {open.length} em aberto · para cada risco: plano, dono e prazo.
          </p>
        </div>
        <button className="btn btn-sm shrink-0" onClick={() => setEditing("new")}>
          <Icon name="plus" size={13} />
          Novo plano
        </button>
      </header>

      {plans.length === 0 ? (
        <Empty>Nenhum plano registrado.</Empty>
      ) : (
        <>
          {open.length > 0 && <ul className="divide-y divide-[var(--border-hair)]">{open.map(row)}</ul>}
          {closed.length > 0 && (
            <details className="border-t border-[var(--border-hair)]">
              <summary className="cursor-pointer px-4 py-2.5 text-[12.5px] font-semibold text-ink-400 hover:text-ink-100 sm:px-5">
                {closed.length} concluído(s) ou cancelado(s)
              </summary>
              <ul className="divide-y divide-[var(--border-hair)] opacity-80">{closed.map(row)}</ul>
            </details>
          )}
        </>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={target ? "Editar plano" : "Novo plano de ação"}>
        <ActionForm action={savePlan} onSuccess={() => setEditing(null)} key={target?.id ?? "new"}>
          <input type="hidden" name="client_id" value={clientId} />
          {target && <input type="hidden" name="id" value={target.id} />}
          <label className="block">
            <span className="label">Risco</span>
            <input
              name="risk"
              required
              autoFocus
              defaultValue={target?.risk}
              className="field mt-1"
              placeholder="Ex.: CPL 40% acima da meta há 3 semanas"
            />
          </label>
          <label className="block">
            <span className="label">Plano</span>
            <textarea name="plan" required rows={3} defaultValue={target?.plan} className="field mt-1" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Dono</span>
              <input name="owner" required className="field mt-1" defaultValue={target?.owner ?? defaultOwner} />
            </label>
            <label className="block">
              <span className="label">Prazo</span>
              <input type="date" name="due_date" defaultValue={target?.due_date ?? ""} className="field mt-1" />
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <SubmitButton>{target ? "Salvar" : "Registrar plano"}</SubmitButton>
          </div>
        </ActionForm>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Excluir este plano?"
        confirmLabel="Excluir plano"
        pendingLabel="Excluindo…"
        onConfirm={() => removePlan(deleting!.id)}
      >
        <p>
          Use só para registro feito por engano. Plano que não vai adiante deve ser <strong className="text-ink-100">cancelado</strong>{" "}
          — assim o histórico da conta mostra que o risco foi tratado.
        </p>
      </ConfirmDialog>
    </section>
  );
}
