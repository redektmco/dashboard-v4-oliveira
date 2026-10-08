"use client";

import { useState, useTransition } from "react";
import { connectGoogleAccount, removeGoogleAccount, setGoogleAccountPaused, syncGoogleNow } from "@/actions";
import { ActionForm, SubmitButton } from "../form-controls";
import { Modal } from "../modal";
import { toast } from "../toast";
import { Icon } from "../icon";

export function SyncGoogleButton({ disabled }: { disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn h-8"
      disabled={pending || disabled}
      aria-busy={pending}
      onClick={() =>
        start(async () => {
          const r = await syncGoogleNow();
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

export type GoogleLinkView = { customerId: string; label: string; client: string; active: boolean; error: string | null };

/** Vincular e gerenciar as contas do Google Ads de cada cliente. */
export function GoogleAccountsButton({
  configured,
  clients,
  links,
}: {
  configured: boolean;
  clients: { id: number; label: string }[];
  links: GoogleLinkView[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const run = (fn: () => ReturnType<typeof removeGoogleAccount>) =>
    start(async () => {
      const r = await fn();
      if (r?.error) toast(r.error, { tone: "error" });
      else if (r?.ok) toast(r.ok);
    });

  return (
    <>
      <button type="button" className="btn btn-ghost h-8 px-2.5 text-ink-300" onClick={() => setOpen(true)}>
        <Icon name="sliders" size={15} />
        Contas
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Contas do Google Ads"
        description="Cada cliente é vinculado ao ID da sua conta de anúncio. Um cliente pode ter mais de uma: os números somam, junto com o Meta."
      >
        <div className="space-y-4">
          {!configured && (
            <p className="rounded-lg bg-vermelho-dim px-3 py-2 text-[13px] font-semibold text-vermelho-fg">
              Credencial não configurada. Defina GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_SA_EMAIL e GOOGLE_SA_PRIVATE_KEY na Vercel.
            </p>
          )}

          {links.length > 0 && (
            <ul className="divide-y divide-[var(--border-hair)] rounded-lg border border-[var(--border-hair)]">
              {links.map((l) => (
                <li key={l.customerId} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-ink-100">{l.client}</p>
                    <p className="truncate text-[12px] text-ink-500">
                      {l.label}
                      {!l.active && " · pausada"}
                    </p>
                    {l.error && <p className="mt-0.5 text-[12px] text-vermelho-fg">{l.error}</p>}
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={pending}
                    onClick={() => run(() => setGoogleAccountPaused(l.customerId, l.active))}
                  >
                    {l.active ? "Pausar" : "Reativar"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm text-vermelho-fg"
                    disabled={pending}
                    onClick={() => run(() => removeGoogleAccount(l.customerId))}
                  >
                    Desvincular
                  </button>
                </li>
              ))}
            </ul>
          )}

          <ActionForm action={connectGoogleAccount} onSuccess={() => setOpen(false)}>
            <p className="label">Vincular nova conta</p>
            <label className="block">
              <span className="text-[13px] font-medium text-ink-300">Cliente</span>
              <select name="client_id" required className="field mt-1.5" defaultValue="" disabled={!configured}>
                <option value="" disabled>
                  Selecione…
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[13px] font-medium text-ink-300">ID da conta do Google Ads</span>
              <input name="customer_id" required inputMode="numeric" placeholder="124-444-3600" className="field mt-1.5" autoComplete="off" disabled={!configured} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                Fechar
              </button>
              <SubmitButton pendingLabel="Vinculando…" disabled={!configured}>
                <Icon name="plus" size={14} />
                Vincular conta
              </SubmitButton>
            </div>
          </ActionForm>
        </div>
      </Modal>
    </>
  );
}
