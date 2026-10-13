"use client";

import { useState, useTransition } from "react";
import { createLeadSource, removeLeadSource, restoreLeadSourceAction } from "@/actions/goals";
import { ActionForm, SubmitButton } from "../form-controls";
import { Modal } from "../modal";
import { toast } from "../toast";
import { Icon } from "../icon";

/**
 * Os controles de fontes de leads da aba Forecast e fontes.
 *
 * Remover fonte **arquiva** no servidor, e é isso que torna o
 * "Desfazer" do toast honesto: o botão não desfaz um efeito local, ele chama
 * a ação inversa e a linha volta com o mesmo id. Um toast que oferece
 * desfazer sem ter como reverter é pior do que não oferecer.
 */

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
          <label className="block">
            <span className="label">Nome da fonte *</span>
            <input name="name" className="field mt-1" placeholder="Portais imobiliários" required maxLength={60} />
            <span className="mt-1 block text-[11px] leading-[16px] text-ink-500">
              Use o mesmo texto que chega no campo de origem do lead — é por ele que a contagem casa.
            </span>
          </label>
          <label className="block">
            <span className="label">Observação</span>
            <input name="note" className="field mt-1" placeholder="ZAP e VivaReal · importação manual" maxLength={120} />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
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
