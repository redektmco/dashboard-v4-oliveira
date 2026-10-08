"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { connectGoogleAccount, loadGoogleAccounts, removeGoogleAccount, setGoogleAccountPaused, syncGoogleNow } from "@/actions";
import { formatCustomerId, type GoogleAccount } from "@/lib/google/metrics";
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
  const [accounts, setAccounts] = useState<GoogleAccount[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState("");
  const [clientId, setClientId] = useState("");

  // As contas só são buscadas no Google quando o diálogo abre pela primeira vez.
  useEffect(() => {
    if (!open || !configured || accounts || loadError) return;
    let alive = true;
    loadGoogleAccounts().then((r) => {
      if (!alive) return;
      if (r.error) setLoadError(r.error);
      else setAccounts(r.accounts ?? []);
    });
    return () => {
      alive = false;
    };
  }, [open, configured, accounts, loadError]);

  const linked = useMemo(() => new Set(links.map((l) => l.customerId)), [links]);
  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (accounts ?? []).filter((a) => !linked.has(a.id) && (!q || a.name.toLowerCase().includes(q) || a.id.includes(q.replace(/\D/g, "") || "\u0000")));
  }, [accounts, linked, query]);

  // Conta escolhida → sugere o cliente de mesmo nome, se houver e ainda não escolhido.
  const pick = (id: string) => {
    setPicked(id);
    const acc = accounts?.find((a) => a.id === id);
    if (!acc || clientId) return;
    const name = acc.name.toLowerCase();
    const match = clients.find((c) => {
      const label = c.label.split(" · ")[0].toLowerCase();
      return label === name || label.includes(name) || name.includes(label);
    });
    if (match) setClientId(String(match.id));
  };

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
        description="Lista todas as contas de cliente da MCC. Escolha a conta e o cliente dela. Um cliente pode ter mais de uma conta: os números somam, junto com o Meta."
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

          <ActionForm
            action={connectGoogleAccount}
            onSuccess={() => {
              setOpen(false);
              setPicked("");
              setClientId("");
              setQuery("");
            }}
          >
            <p className="label">Vincular nova conta</p>
            <label className="block">
              <span className="text-[13px] font-medium text-ink-300">Cliente</span>
              <select name="client_id" required className="field mt-1.5" value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={!configured}>
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
            {accounts ? (
              <div className="space-y-1.5">
                <span className="text-[13px] font-medium text-ink-300">Conta do Google Ads</span>
                <input
                  className="field"
                  placeholder={`Buscar entre ${options.length} conta(s) disponíveis…`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Buscar conta"
                />
                <select name="customer_id" required size={6} className="field !h-auto" value={picked} onChange={(e) => pick(e.target.value)} aria-label="Conta do Google Ads">
                  {options.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {formatCustomerId(a.id)}
                    </option>
                  ))}
                </select>
                {options.length === 0 && (
                  <p className="text-[12px] text-ink-500">{accounts.length === 0 ? "A MCC não tem contas de cliente ativas." : "Nenhuma conta livre com essa busca — as já vinculadas não aparecem."}</p>
                )}
              </div>
            ) : loadError ? (
              <div className="space-y-2">
                <p className="rounded-lg bg-vermelho-dim px-3 py-2 text-[13px] font-semibold text-vermelho-fg">{loadError}</p>
                <label className="block">
                  <span className="text-[13px] font-medium text-ink-300">Ou informe o ID da conta do cliente</span>
                  <input name="customer_id" required inputMode="numeric" placeholder="123-456-7890" className="field mt-1.5" autoComplete="off" />
                </label>
              </div>
            ) : configured ? (
              <p className="flex items-center gap-2 py-3 text-[13px] text-ink-400">
                <span className="spinner" aria-hidden /> Buscando contas na MCC…
              </p>
            ) : null}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                Fechar
              </button>
              <SubmitButton pendingLabel="Vinculando…" disabled={!configured || (Boolean(accounts) && !picked)}>
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
