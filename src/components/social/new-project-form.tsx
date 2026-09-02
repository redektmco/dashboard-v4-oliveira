"use client";

import { useState } from "react";
import { createSocialProject } from "@/actions/social";
import { Icon } from "@/components/icon";

type ClientOpt = { id: number; name: string };

export function NewProjectForm({ clients }: { clients: ClientOpt[] }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} />
        Novo projeto de aprovação
      </button>
    );
  }

  return (
    <form
      action={createSocialProject}
      className="panel space-y-3 px-5 py-4"
    >
      <h2 className="font-display text-[17px] font-semibold text-ink-100">
        Novo projeto de aprovação
      </h2>
      <label className="block">
        <span className="label">Título</span>
        <input
          name="title"
          required
          autoFocus
          className="field mt-1"
          placeholder="Ex.: Campanha Outubro — Feed"
        />
      </label>
      <label className="block">
        <span className="label">Cliente da carteira</span>
        <select name="clientId" className="field mt-1" defaultValue="">
          <option value="">— selecionar cliente —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">@ do Instagram (para o preview)</span>
        <input
          name="igHandle"
          className="field mt-1 font-mono text-sm"
          placeholder="ex.: padariaestrela"
        />
        <span className="mt-1 block text-[11px] text-ink-500">
          Em branco: usa o nome do cliente.
        </span>
      </label>
      <div className="flex gap-2">
        <button className="btn btn-primary">
          <Icon name="check" size={14} />
          Criar projeto
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
