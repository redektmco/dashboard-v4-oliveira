"use client";

import { useState } from "react";
import { createSocialProject } from "@/actions/social";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";
import { ActionForm, SubmitButton } from "@/components/form-controls";

type ClientOpt = { id: number; name: string };

/** Botão + modal de novo projeto. Ao criar, o workspace do projeto abre direto. */
export function NewProjectButton({ clients }: { clients: ClientOpt[] }) {
  const [open, setOpen] = useState(false);
  const [linked, setLinked] = useState(true);

  return (
    <>
      <button className="btn btn-primary shrink-0" onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} />
        Novo projeto
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo projeto de aprovação"
        description="Um projeto é um link de aprovação para o cliente — por campanha, mês ou entrega."
      >
        <ActionForm action={createSocialProject}>
          <label className="block">
            <span className="label">Título</span>
            <input name="title" required autoFocus className="field mt-1" placeholder="Ex.: Campanha Outubro — Feed e Stories" />
          </label>
          {linked ? (
            <label className="block">
              <span className="label">Cliente da carteira</span>
              <select name="clientId" className="field mt-1" defaultValue="" required>
                <option value="" disabled>
                  Selecione…
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button type="button" className="mt-1 text-[12px] font-semibold text-ink-400 hover:text-ink-100" onClick={() => setLinked(false)}>
                Cliente ainda não está na carteira?
              </button>
            </label>
          ) : (
            <label className="block">
              <span className="label">Nome do cliente</span>
              <input name="clientName" required className="field mt-1" placeholder="Ex.: Padaria Estrela" />
              <button type="button" className="mt-1 text-[12px] font-semibold text-ink-400 hover:text-ink-100" onClick={() => setLinked(true)}>
                Escolher da carteira
              </button>
            </label>
          )}
          <label className="block">
            <span className="label">@ do Instagram (para o preview)</span>
            <input name="igHandle" className="field mt-1 font-mono text-sm" placeholder="ex.: padariaestrela" />
            <span className="mt-1 block text-[11px] text-ink-500">Em branco: usa o nome do cliente.</span>
          </label>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <SubmitButton pendingLabel="Criando…">Criar e abrir</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}
