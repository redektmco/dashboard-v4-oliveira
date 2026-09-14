"use client";

import { useState } from "react";
import { enableIntegration, removeIntegration, rotateIntegration, setIntegrationPaused } from "@/actions";
import { ActionMenu, type MenuItem } from "./action-menu";
import { ActionForm, SubmitButton } from "./form-controls";
import { ConfirmDialog, Modal } from "./modal";
import { CopyField } from "./copy-field";
import { toast } from "./toast";
import { Icon } from "./icon";
import { Empty, SectionHeader } from "./ui";

export type IntegrationItem = {
  clientId: number;
  clientName: string;
  typeLabel: string;
  leadGen: boolean;
  clientActive: boolean;
  active: boolean;
  url: string;
  weekLeads: number;
  prevWeekLeads: number;
  totalLeads: number;
  lastEvent: string;
};

export function IntegrationsManager({
  items,
  available,
  base,
}: {
  items: IntegrationItem[];
  available: { id: number; label: string }[];
  base: string;
}) {
  const [connecting, setConnecting] = useState(false);
  const [dialog, setDialog] = useState<{ kind: "rotate" | "remove"; it: IntegrationItem } | null>(null);

  const menu = (it: IntegrationItem): MenuItem[] => [
    it.active
      ? {
          label: "Pausar",
          icon: "lock",
          hint: "Leads voltam para o input manual",
          onSelect: async () => {
            const r = await setIntegrationPaused(it.clientId, true);
            if (r?.error) toast(r.error, { tone: "error" });
            else if (r?.ok) toast(r.ok);
          },
        }
      : {
          label: "Reativar",
          icon: "refresh",
          onSelect: async () => {
            const r = await setIntegrationPaused(it.clientId, false);
            if (r?.error) toast(r.error, { tone: "error" });
            else if (r?.ok) toast(r.ok);
          },
        },
    { label: "Gerar novo endereço", icon: "key", hint: "Invalida o atual", onSelect: () => setDialog({ kind: "rotate", it }) },
    "separator",
    { label: "Remover integração", icon: "x", danger: true, onSelect: () => setDialog({ kind: "remove", it }) },
  ];

  return (
    <>
      <SectionHeader
        title="Integrações"
        description="CRM por webhook: cada lead recebido conta na semana e entra direto na régua de leads do score, sem digitação."
        actions={
          available.length > 0 && (
            <button className="btn btn-primary" onClick={() => setConnecting(true)}>
              <Icon name="plug" size={14} />
              Conectar cliente
            </button>
          )
        }
      />

      <section className="panel">
        {items.length === 0 ? (
          <Empty
            action={
              available.length > 0 && (
                <button className="btn btn-primary" onClick={() => setConnecting(true)}>
                  <Icon name="plug" size={14} />
                  Conectar o primeiro cliente
                </button>
              )
            }
          >
            Nenhuma integração ainda. Conecte um cliente para gerar o endereço do webhook.
          </Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-hair)]">
            {items.map((it) => (
              <li key={it.clientId} className="px-4 py-4 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-[15px] font-semibold text-ink-100">{it.clientName}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          it.active ? "bg-verde-dim text-verde-fg" : "bg-ink-850 text-ink-400"
                        }`}
                      >
                        {it.active ? "ativa" : "pausada"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-500">
                      {it.typeLabel}
                      {!it.leadGen && " · leads informativos (não pontuam)"}
                      {!it.clientActive && " · cliente arquivado"}
                    </div>
                  </div>
                  <ActionMenu items={menu(it)} label={`Ações da integração de ${it.clientName}`} />
                </div>

                <div className="mt-3">
                  <CopyField value={it.url} />
                </div>

                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-ink-400">
                  <span>
                    Esta semana: <strong className="tnum text-ink-100">{it.weekLeads}</strong> leads
                  </span>
                  <span>
                    Semana anterior: <strong className="tnum text-ink-200">{it.prevWeekLeads}</strong>
                  </span>
                  <span>
                    Acumulado: <strong className="tnum text-ink-200">{it.totalLeads}</strong>
                  </span>
                  <span>Último evento: {it.lastEvent}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="panel group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
          <div>
            <h3 className="font-display text-[15px] font-semibold text-ink-100">Como conectar o CRM</h3>
            <p className="mt-0.5 text-[12.5px] text-ink-400">RD Station, Kommo, HubSpot, Zapier/Make ou formulário próprio.</p>
          </div>
          <Icon name="chevronDown" size={16} className="shrink-0 text-ink-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-4 border-t border-[var(--border-hair)] px-4 py-4 text-[13px] leading-relaxed text-ink-300 sm:px-5">
          <div>
            <div className="eyebrow">1 · Método e formato</div>
            <p className="mt-1 text-ink-400">
              <code className="rounded bg-ink-850 px-1.5 py-0.5 font-mono text-[12px] text-ink-100">POST</code> com corpo
              JSON. Aceitamos qualquer payload — <strong>cada requisição conta 1 lead</strong>. Se o CRM mandar um
              identificador estável (<code className="font-mono text-[12px]">id</code>,{" "}
              <code className="font-mono text-[12px]">email</code> ou <code className="font-mono text-[12px]">phone</code>,
              no topo ou dentro de <code className="font-mono text-[12px]">lead</code>/
              <code className="font-mono text-[12px]">data</code>), usamos para não contar o mesmo lead duas vezes.
            </p>
          </div>
          <pre className="table-scroll rounded-lg bg-black p-3 font-mono text-[12px] text-ink-200">
            {`curl -X POST "${base}/api/integrations/webhook/<token>" \\
  -H "Content-Type: application/json" \\
  -d '{ "email": "novo.lead@cliente.com", "phone": "+55...", "origem": "meta" }'`}
          </pre>
          <div>
            <div className="eyebrow">2 · Onde entra no score</div>
            <p className="mt-1 text-ink-400">
              A contagem da semana-ritual vira o valor de <strong>“Leads gerados na semana”</strong> das contas de geração
              — substitui o número manual e é comparada à meta de leads vigente. Sem meta cadastrada não há régua. O GT
              segue preenchendo CPL, verba, MQL e as observações.
            </p>
          </div>
          <div>
            <div className="eyebrow">3 · Segurança</div>
            <p className="mt-1 text-ink-400">
              O token na URL autentica o cliente. Se vazar, use <strong>Gerar novo endereço</strong> e reconfigure o CRM —
              o endereço antigo para de contar na hora.
            </p>
          </div>
        </div>
      </details>

      <Modal
        open={connecting}
        onClose={() => setConnecting(false)}
        title="Conectar cliente ao CRM"
        description="Gera o endereço do webhook. Só contas de geração de lead alimentam o score; as demais contam de forma informativa."
        size="sm"
      >
        <ActionForm action={enableIntegration} onSuccess={() => setConnecting(false)}>
          <label className="block">
            <span className="label">Cliente</span>
            <select name="client_id" required className="field mt-1" defaultValue="">
              <option value="" disabled>
                Selecione…
              </option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setConnecting(false)}>
              Cancelar
            </button>
            <SubmitButton pendingLabel="Gerando…">Gerar webhook</SubmitButton>
          </div>
        </ActionForm>
      </Modal>

      <ConfirmDialog
        open={dialog?.kind === "rotate"}
        onClose={() => setDialog(null)}
        title="Gerar um novo endereço?"
        confirmLabel="Gerar novo endereço"
        tone="default"
        pendingLabel="Gerando…"
        onConfirm={() => rotateIntegration(dialog!.it.clientId)}
      >
        <p>
          O endereço atual de <strong className="text-ink-100">{dialog?.it.clientName}</strong> para de contar leads na
          hora. Você vai precisar colar o novo endereço no CRM.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.kind === "remove"}
        onClose={() => setDialog(null)}
        title={`Remover a integração de ${dialog?.it.clientName ?? ""}?`}
        confirmLabel="Remover integração"
        pendingLabel="Removendo…"
        onConfirm={() => removeIntegration(dialog!.it.clientId)}
      >
        <p>
          O webhook deixa de existir e os leads da semana voltam a vir do preenchimento manual do GT. Os{" "}
          {dialog?.it.totalLeads ?? 0} lead(s) já recebidos continuam guardados.
        </p>
      </ConfirmDialog>
    </>
  );
}
