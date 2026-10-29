"use client";

import type { Client } from "@/lib/model/types";
import { CLIENT_STATUSES, STATUS_LABEL, REVENUE_MODELS, REVENUE_LABEL, clientStatus } from "@/lib/client-lifecycle";
import { saveClientClassification } from "@/actions/client-classification";
import { Modal } from "../modal";
import { ActionForm, SubmitButton } from "../form-controls";
import { NumberField } from "../number-field";

export function ClassificationDialog({ client, open, onClose }: { client: Client; open: boolean; onClose: () => void }) {
  return <Modal open={open} onClose={onClose} title={`Situação e receita · ${client.name}`} size="md">
    <ActionForm action={saveClientClassification} onSuccess={onClose}>
      <input type="hidden" name="id" value={client.id} />
      <p className="text-[13px] leading-5 text-ink-300">Altere somente com contrato ou confirmação do responsável. O histórico será mantido. Pausados, encerrados e aguardando início ficam fora dos indicadores atuais.</p>
      <label className="block"><span className="label">Situação operacional</span>
        <select name="lifecycle_status" defaultValue={client.lifecycle_status ?? ""} className="field mt-1">
          <option value="">Manter situação legada: {STATUS_LABEL[clientStatus(client)]}</option>
          {CLIENT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </label>
      <label className="block"><span className="label">Natureza da receita</span>
        <select name="revenue_model" defaultValue={client.revenue_model ?? ""} className="field mt-1">
          <option value="">Não classificada · manter declaração existente</option>
          {REVENUE_MODELS.map((r) => <option key={r} value={r}>{REVENUE_LABEL[r]}</option>)}
        </select>
      </label>
      <label className="block"><span className="label">Parcela mensal recorrente declarada (R$)</span>
        <NumberField name="mrr" defaultValue={client.mrr} step="0.01" min={0} required />
        <span className="text-[11px] text-ink-400">Em contratos pontuais, o valor fica preservado no cadastro e não entra no MRR. Em contratos mistos, informe só a parcela recorrente.</span>
      </label>
      <label className="block"><span className="label">Fonte da confirmação</span><input name="source" required minLength={5} maxLength={500} className="field mt-1" placeholder="Contrato, documento ou confirmação do responsável" /></label>
      <label className="flex items-start gap-2 text-[13px] text-ink-300"><input name="confirmed" type="checkbox" required className="mt-1" />Conferi a situação e a receita na fonte informada e confirmo a alteração.</label>
      <div className="modal-actions"><button type="button" className="btn" onClick={onClose}>Cancelar</button><SubmitButton pendingLabel="Atualizando…">Confirmar cadastro</SubmitButton></div>
    </ActionForm>
  </Modal>;
}
