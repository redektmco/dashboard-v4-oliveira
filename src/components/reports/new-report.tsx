"use client";

import { useState } from "react";
import { createReportAction, createTemplateAction } from "@/actions/reports";
import { ActionForm, SubmitButton } from "@/components/form-controls";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";
import { PRESET_LABEL, type PeriodPreset } from "@/lib/reports/metrics";

type ClientOpt = { id: number; name: string };
export type BaseOpt = { value: string; label: string; group: "Em branco" | "Modelos da V4" | "Modelos da unidade" };

function BaseSelect({ bases, value, onChange }: { bases: BaseOpt[]; value: string; onChange: (v: string) => void }) {
  const groups = ["Modelos da V4", "Modelos da unidade", "Em branco"] as const;
  return (
    <label className="block">
      <span className="label">Começar de</span>
      <select name="base" className="field mt-1" value={value} onChange={(e) => onChange(e.target.value)}>
        {groups.map((g) => {
          const opts = bases.filter((b) => b.group === g);
          return opts.length ? (
            <optgroup key={g} label={g}>
              {opts.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </optgroup>
          ) : null;
        })}
      </select>
    </label>
  );
}

/** Novo relatório: cliente, período e ponto de partida. Abre o editor ao criar. */
export function NewReportButton({
  clients,
  bases,
  initialBase,
  label = "Novo relatório",
  className = "btn-primary",
}: {
  clients: ClientOpt[];
  bases: BaseOpt[];
  initialBase?: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState(initialBase ?? bases[0]?.value ?? "blank:a4");
  const [preset, setPreset] = useState<PeriodPreset | "custom">("last_month");

  return (
    <>
      <button type="button" className={`btn shrink-0 ${className}`} onClick={() => setOpen(true)}>
        <Icon name="plus" size={14} />
        {label}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo relatório"
        description="Escolha o cliente e o período: os números de Meta Ads, Google Ads, CRM e Health Score entram sozinhos."
      >
        <ActionForm action={createReportAction}>
          <label className="block">
            <span className="label">Cliente</span>
            <select name="clientId" className="field mt-1" defaultValue="" required autoFocus>
              <option value="" disabled>
                Selecione…
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <BaseSelect bases={bases} value={base} onChange={setBase} />
          <label className="block">
            <span className="label">Período</span>
            <select name="preset" className="field mt-1" value={preset} onChange={(e) => setPreset(e.target.value as PeriodPreset | "custom")}>
              {(Object.keys(PRESET_LABEL) as PeriodPreset[]).map((k) => (
                <option key={k} value={k}>
                  {PRESET_LABEL[k]}
                </option>
              ))}
              <option value="custom">Personalizado…</option>
            </select>
          </label>
          {preset === "custom" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label">De</span>
                <input type="date" name="start" required className="field mt-1" />
              </label>
              <label className="block">
                <span className="label">Até</span>
                <input type="date" name="end" required className="field mt-1" />
              </label>
            </div>
          )}
          <label className="block">
            <span className="label">Título (opcional)</span>
            <input name="title" className="field mt-1" placeholder="Ex.: Relatório de outubro" />
            <span className="mt-1 block text-[11px] text-ink-500">Em branco: &ldquo;Relatório &lt;cliente&gt;&rdquo;.</span>
          </label>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <SubmitButton pendingLabel="Criando…">Criar e abrir o construtor</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}

/** Novo modelo da unidade: nome e ponto de partida. */
export function NewTemplateButton({ bases }: { bases: BaseOpt[] }) {
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState(bases[0]?.value ?? "blank:a4");
  return (
    <>
      <button type="button" className="btn shrink-0" onClick={() => setOpen(true)}>
        <Icon name="layers" size={14} />
        Novo modelo
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo modelo"
        description="Monte uma vez e use em qualquer cliente: o modelo guarda páginas e blocos, os números trocam sozinhos."
        size="sm"
      >
        <ActionForm action={createTemplateAction}>
          <label className="block">
            <span className="label">Nome</span>
            <input name="title" required autoFocus className="field mt-1" placeholder="Ex.: Mensal — lead gen" />
          </label>
          <BaseSelect bases={bases.filter((b) => b.group !== "Modelos da unidade")} value={base} onChange={setBase} />
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <SubmitButton pendingLabel="Criando…">Criar e editar</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}
