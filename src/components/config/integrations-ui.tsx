"use client";

import { useState, useTransition } from "react";
import { syncMetaNow } from "@/actions";
import { Modal } from "../modal";
import { CopyField } from "../copy-field";
import { toast } from "../toast";
import { Icon } from "../icon";
import { CRMS, MetaConnectDialog } from "./connections";

export function SyncMetaButton({ disabled }: { disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn h-8"
      disabled={pending || disabled}
      aria-busy={pending}
      onClick={() =>
        start(async () => {
          const r = await syncMetaNow();
          if (r?.error) toast(r.error, { tone: "error" });
          else if (r?.ok) toast(r.ok);
        })
      }
    >
      {pending ? <span className="spinner" aria-hidden /> : <Icon name="refresh" size={16} />}
      {pending ? "Sincronizando…" : "Sincronizar agora"}
    </button>
  );
}

/** "Usuário do sistema": de onde vem o acesso à Meta e o atalho para vincular. */
export function SystemUserButton({
  configured,
  clients,
  linked,
}: {
  configured: boolean;
  clients: { id: number; label: string }[];
  linked: string[];
}) {
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ghost h-8 px-2.5 text-ink-300" onClick={() => setOpen(true)}>
        <Icon name="sliders" size={15} />
        Usuário do sistema
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Usuário do sistema da Meta" description="O acesso às contas de anúncio vem de um único usuário de sistema da unidade no Business Manager.">
        <div className="space-y-3 text-[13px] leading-relaxed text-ink-300">
          <p>
            Status:{" "}
            {configured ? (
              <strong className="text-verde-fg">token configurado</strong>
            ) : (
              <strong className="text-vermelho-fg">token não configurado</strong>
            )}
            .
          </p>
          <p>
            O token vive só na variável <code className="rounded bg-ink-850 px-1 font-mono text-[12px]">META_ACCESS_TOKEN</code> da Vercel — nunca no banco. Precisa do escopo{" "}
            <code className="rounded bg-ink-850 px-1 font-mono text-[12px]">ads_read</code> e acesso às BMs dos clientes.
          </p>
          <p>Cada cliente é vinculado à sua conta de anúncio no painel do cliente (Clientes › Fonte de leads) ou aqui.</p>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={() => setOpen(false)}>
            Fechar
          </button>
          {configured && (
            <button
              type="button"
              className="btn btn-light"
              onClick={() => {
                setOpen(false);
                setConnecting(true);
              }}
            >
              <Icon name="plus" size={14} />
              Vincular conta a um cliente
            </button>
          )}
        </div>
      </Modal>
      <MetaConnectDialog open={connecting} onClose={() => setConnecting(false)} clients={clients} linked={linked} />
    </>
  );
}

/** "Testar webhook": a URL, um comando de teste e o que esperar. */
export function TestWebhookButton({ url, lastEvent }: { url: string; lastEvent: string }) {
  const [open, setOpen] = useState(false);
  const curl = `curl -X POST '${url}' -H 'Content-Type: application/json' -d '{"email":"teste@exemplo.com","nome":"Lead de teste"}'`;
  return (
    <>
      <button type="button" className="btn h-[30px] shrink-0" onClick={() => setOpen(true)}>
        Testar webhook
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Testar o webhook" description={`Último lead recebido: ${lastEvent}.`}>
        <div className="space-y-3">
          <div>
            <span className="label">URL do cliente</span>
            <div className="mt-1">
              <CopyField value={url} />
            </div>
          </div>
          <div>
            <span className="label">Envio de teste</span>
            <p className="mt-1 text-[12px] text-ink-400">
              Mande um lead de teste pelo próprio CRM ou rode o comando abaixo. Ele conta como lead da semana — use um e-mail de teste para não confundir.
            </p>
            <div className="mt-1.5">
              <CopyField value={curl} />
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-light" onClick={() => setOpen(false)}>
            Fechar
          </button>
        </div>
      </Modal>
    </>
  );
}

const STEP2: Record<(typeof CRMS)[number], string> = {
  "RD Station": "No RD Station: Integrações → Webhooks → Criar, gatilho “Conversão”.",
  Kommo: "No Kommo: Configurações → Integrações → Webhooks, evento “Lead adicionado”.",
  HubSpot: "No HubSpot: Automação → Fluxos de trabalho, ação “Enviar webhook” (POST) quando o contato é criado.",
  "Zapier / Make": "No Zapier ou Make: gatilho do formulário/CRM → ação de webhook (POST, JSON) para a URL.",
  "Formulário próprio": "No seu formulário: ao enviar, faça um POST com os dados do lead (JSON) para a URL.",
  Outro: "Em qualquer sistema: um POST (JSON) para a URL a cada lead novo. Mande id ou e-mail para não contar duplicado.",
};

/** "Como conectar o CRM": escolhe o CRM e mostra o passo a passo. */
export function CrmGuide({ host }: { host: string }) {
  const [crm, setCrm] = useState<(typeof CRMS)[number]>("RD Station");
  const steps = [
    "No painel do cliente, em Fonte de leads, gere a URL do webhook.",
    STEP2[crm],
    "Cole a URL e envie um lead de teste — ele aparece aqui em até 1 minuto.",
  ];
  return (
    <div id="como-conectar" className="flex scroll-mt-6 flex-col gap-4 rounded-xl border border-[var(--border-hair)] bg-ink-900 p-5">
      <div className="grid grid-cols-3 gap-2">
        {CRMS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCrm(c)}
            aria-pressed={crm === c}
            className={`flex h-10 items-center justify-center rounded-lg border px-1 text-center text-[12px] ${
              crm === c ? "border-ink-400 bg-ink-800 font-semibold text-ink-100" : "border-[var(--border-hair)] bg-ink-850 text-ink-300 hover:text-ink-100"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <ol className="flex flex-col gap-3 border-t border-[var(--border-hair)] pt-3.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[11px] font-semibold text-ink-300">{i + 1}</span>
            <span className="text-[13px] leading-5 text-ink-300">{s}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] text-ink-400">Formato da URL</span>
        <code className="block overflow-x-auto whitespace-nowrap rounded-md border border-[var(--border-hair)] bg-ink-950 px-2.5 py-2 font-mono text-[11px] text-ink-300">
          {host}/api/integrations/webhook/&lt;token-do-cliente&gt;
        </code>
      </div>
    </div>
  );
}
