"use client";

import { useState, useTransition } from "react";
import {
  createGoal,
  createLeadSource,
  removeGoal,
  removeLeadSource,
  restoreGoalAction,
  restoreLeadSourceAction,
} from "@/actions/goals";
import { ActionForm, SubmitButton } from "../form-controls";
import { Modal } from "../modal";
import { toast } from "../toast";
import { Icon } from "../icon";

/**
 * Os controles da aba Metas e integrações.
 *
 * Remover meta ou fonte **arquiva** no servidor, e é isso que torna o
 * "Desfazer" do toast honesto: o botão não desfaz um efeito local, ele chama
 * a ação inversa e a linha volta com o mesmo id. Um toast que oferece
 * desfazer sem ter como reverter é pior do que não oferecer.
 */

/* ------------------------------- metas ------------------------------- */

export function NewGoalButton({ clientId, clientName }: { clientId: number; clientName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn h-8">
        <Icon name="plus" size={16} />
        Nova meta
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nova meta"
        description={`O compromisso do período para ${clientName}.`}
        cardClassName="modal-card--form"
      >
        <ActionForm action={createGoal} onSuccess={() => setOpen(false)}>
          <input type="hidden" name="client_id" value={clientId} />
          <label className="field">
            <span className="field-label">Nome da meta *</span>
            <input name="label" className="input" placeholder="Leads qualificados" required maxLength={80} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">
              <span className="field-label">Valor *</span>
              <input name="target" className="input" placeholder="200" inputMode="decimal" required />
            </label>
            <label className="field">
              <span className="field-label">Período</span>
              <select name="period" className="input" defaultValue="mensal">
                <option value="mensal">Mensal</option>
                <option value="trimestral">Trimestral</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span className="field-label">O número é</span>
            <select name="direction" className="input" defaultValue="piso">
              <option value="piso">Piso — quanto mais, melhor (leads, visitas, vendas)</option>
              <option value="teto">Teto — quanto menos, melhor (CPL, custo por venda)</option>
            </select>
            <span className="field-hint">
              Piso é julgado pelo ritmo do período. Teto é comparado direto com o limite.
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">
              <span className="field-label">Chave no formulário do GT</span>
              <input name="metric" className="input" placeholder="leads" maxLength={40} />
              <span className="field-hint">Liga a meta ao que o GT já preenche. Em branco, fica sem leitura.</span>
            </label>
            <label className="field">
              <span className="field-label">Escopo</span>
              <input name="scope" className="input" placeholder="todas as fontes" maxLength={60} />
            </label>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-light" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <SubmitButton pendingLabel="Criando…">Criar meta</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

export function GoalRowActions({ id, label }: { id: number; label: string }) {
  const [pending, start] = useTransition();
  const remove = () =>
    start(async () => {
      const r = await removeGoal(id);
      if (r?.error) {
        toast(r.error, { tone: "error" });
        return;
      }
      toast(r?.ok ?? `Meta "${label}" removida.`, {
        action: {
          label: "Desfazer",
          onClick: () =>
            start(async () => {
              const back = await restoreGoalAction(id);
              if (back?.error) toast(back.error, { tone: "error" });
            }),
        },
        duration: 7000,
      });
    });

  return <RowRemove onClick={remove} pending={pending} title={`Remover a meta ${label}`} />;
}

/* ---------------------------- fontes de leads --------------------------- */

export function NewSourceButton({ clientId, clientName }: { clientId: number; clientName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn h-8">
        <Icon name="plus" size={16} />
        Nova fonte
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nova fonte de leads"
        description={`Fonte sem API, informada na mão, para ${clientName}.`}
        cardClassName="modal-card--form"
      >
        <ActionForm action={createLeadSource} onSuccess={() => setOpen(false)}>
          <input type="hidden" name="client_id" value={clientId} />
          <label className="field">
            <span className="field-label">Nome da fonte *</span>
            <input name="name" className="input" placeholder="Portais imobiliários" required maxLength={60} />
            <span className="field-hint">
              Use o mesmo texto que chega no campo de origem do lead — é por ele que a contagem casa.
            </span>
          </label>
          <label className="field">
            <span className="field-label">Observação</span>
            <input name="note" className="input" placeholder="ZAP e VivaReal · importação manual" maxLength={120} />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn btn-light" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <SubmitButton pendingLabel="Cadastrando…">Cadastrar fonte</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

export function SourceRowActions({ id, name }: { id: number; name: string }) {
  const [pending, start] = useTransition();
  const remove = () =>
    start(async () => {
      const r = await removeLeadSource(id);
      if (r?.error) {
        toast(r.error, { tone: "error" });
        return;
      }
      toast(r?.ok ?? `Fonte "${name}" removida.`, {
        action: {
          label: "Desfazer",
          onClick: () =>
            start(async () => {
              const back = await restoreLeadSourceAction(id);
              if (back?.error) toast(back.error, { tone: "error" });
            }),
        },
        duration: 7000,
      });
    });

  return <RowRemove onClick={remove} pending={pending} title={`Remover a fonte ${name}`} />;
}

function RowRemove({ onClick, pending, title }: { onClick: () => void; pending: boolean; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      title={title}
      aria-label={title}
      className="grid h-7 w-7 place-items-center rounded-md text-ink-500 transition-colors hover:bg-ink-800 hover:text-vermelho-fg disabled:opacity-50"
    >
      <Icon name={pending ? "refresh" : "trash"} size={14} />
    </button>
  );
}
