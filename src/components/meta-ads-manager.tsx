"use client";

import { useMemo, useState } from "react";
import {
  changeMetaLeadMetric,
  connectMetaAccount,
  loadMetaAdAccounts,
  removeMetaAccount,
  setMetaAccountPaused,
  syncMetaNow,
} from "@/actions";
import type { AdAccount } from "@/lib/meta/graph";
import { LEAD_METRIC_LABEL, type LeadMetric } from "@/lib/meta/metrics";
import type { ActionResult } from "@/lib/action";
import { ActionMenu, type MenuItem } from "./action-menu";
import { ActionForm, SubmitButton } from "./form-controls";
import { ConfirmDialog, Modal } from "./modal";
import { toast } from "./toast";
import { Icon } from "./icon";
import { Empty, SectionHeader } from "./ui";

/** Números de uma semana já no formato do tipo de conta. */
export type MetaWeekView = { spend: number; leads: number; revenue: number; reach: number };

export type MetaAccountItem = {
  adAccountId: string;
  name: string;
  clientName: string;
  typeLabel: string;
  kind: "lead_gen" | "ecommerce" | "branding";
  active: boolean;
  leadMetric: LeadMetric;
  lastSync: string;
  error: string | null;
  current: MetaWeekView | null;
  previous: MetaWeekView | null;
  currentLabel: string;
  previousLabel: string;
};

const money = (n: number, cents = false) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
const int = (n: number) => n.toLocaleString("pt-BR");

/** As três colunas que importam em cada tipo de conta. */
function metrics(kind: MetaAccountItem["kind"], w: MetaWeekView | null): { label: string; value: string }[] {
  if (!w) return [{ label: "Verba", value: "—" }];
  const spend = { label: "Verba", value: money(w.spend) };
  if (kind === "lead_gen") {
    return [
      spend,
      { label: "Leads", value: int(w.leads) },
      { label: "CPL", value: w.leads > 0 ? money(w.spend / w.leads, true) : "—" },
    ];
  }
  if (kind === "ecommerce") {
    return [
      spend,
      { label: "Faturamento", value: money(w.revenue) },
      { label: "ROAS", value: w.spend > 0 ? (w.revenue / w.spend).toFixed(2).replace(".", ",") : "—" },
    ];
  }
  return [spend, { label: "Alcance", value: int(w.reach) }];
}

function WeekBlock({ title, sub, kind, w }: { title: string; sub: string; kind: MetaAccountItem["kind"]; w: MetaWeekView | null }) {
  return (
    <div className="rounded-lg border border-[var(--border-hair)] px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">{title}</span>
        <span className="text-[11px] text-ink-500">{sub}</span>
      </div>
      <dl className="mt-1.5 grid grid-cols-3 gap-2">
        {metrics(kind, w).map((m) => (
          <div key={m.label} className="min-w-0">
            <dt className="text-[11px] text-ink-500">{m.label}</dt>
            <dd className="tnum truncate font-display text-[15px] font-semibold text-ink-100">{m.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function MetaAdsManager({
  configured,
  items,
  clients,
}: {
  configured: boolean;
  items: MetaAccountItem[];
  clients: { id: number; label: string }[];
}) {
  const [connecting, setConnecting] = useState(false);
  const [accounts, setAccounts] = useState<AdAccount[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [removing, setRemoving] = useState<MetaAccountItem | null>(null);

  const linked = useMemo(() => new Set(items.map((i) => i.adAccountId)), [items]);
  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (accounts ?? []).filter(
      (a) =>
        !linked.has(a.id) &&
        (!q || a.name.toLowerCase().includes(q) || a.id.includes(q) || (a.business ?? "").toLowerCase().includes(q)),
    );
  }, [accounts, linked, query]);

  const notify = (r: ActionResult) => {
    if (r?.error) toast(r.error, { tone: "error" });
    else if (r?.ok) toast(r.ok);
  };

  async function openConnect() {
    setConnecting(true);
    setLoadError(null);
    if (accounts) return;
    const r = await loadMetaAdAccounts();
    if (r.error) setLoadError(r.error);
    else setAccounts(r.accounts ?? []);
  }

  async function sync() {
    setSyncing(true);
    const r = await syncMetaNow();
    setSyncing(false);
    notify(r);
  }

  const menu = (it: MetaAccountItem): MenuItem[] => [
    ...(["both", "lead", "messaging"] as LeadMetric[])
      .filter((m) => m !== it.leadMetric)
      .map<MenuItem>((m) => ({
        label: `Lead = ${LEAD_METRIC_LABEL[m].toLowerCase()}`,
        icon: "target",
        onSelect: async () => notify(await changeMetaLeadMetric(it.adAccountId, m)),
      })),
    it.active
      ? {
          label: "Pausar",
          icon: "lock",
          hint: "Números voltam para o input manual",
          onSelect: async () => notify(await setMetaAccountPaused(it.adAccountId, true)),
        }
      : {
          label: "Reativar",
          icon: "refresh",
          onSelect: async () => notify(await setMetaAccountPaused(it.adAccountId, false)),
        },
    "separator",
    { label: "Desvincular conta", icon: "x", danger: true, onSelect: () => setRemoving(it) },
  ];

  return (
    <>
      <SectionHeader
        title="Meta Ads"
        description="Verba, leads (formulário e conversas), faturamento e alcance puxados todo dia da API da Meta com o usuário de sistema da unidade. Preenche o que o GT deixa em branco e fecha a semana sozinho quando ninguém preencheu."
        actions={
          configured && (
            <>
              {items.length > 0 && (
                <button className="btn" onClick={sync} disabled={syncing} aria-busy={syncing}>
                  {syncing ? <span className="spinner" aria-hidden /> : <Icon name="refresh" size={14} />}
                  {syncing ? "Sincronizando…" : "Sincronizar agora"}
                </button>
              )}
              <button className="btn btn-primary" onClick={openConnect}>
                <Icon name="plug" size={14} />
                Vincular conta
              </button>
            </>
          )
        }
      />

      <section className="panel">
        {!configured ? (
          <Empty>
            <span className="block font-semibold text-ink-200">Token da Meta não configurado.</span>
            <span className="mt-1 block">
              Cadastre o token do usuário de sistema em <code className="font-mono text-[12px]">META_ACCESS_TOKEN</code>{" "}
              nas variáveis de ambiente da Vercel e faça um novo deploy.
            </span>
          </Empty>
        ) : items.length === 0 ? (
          <Empty
            action={
              <button className="btn btn-primary" onClick={openConnect}>
                <Icon name="plug" size={14} />
                Vincular a primeira conta
              </button>
            }
          >
            Nenhuma conta de anúncio vinculada. Vincule a conta do cliente para puxar os números sozinho.
          </Empty>
        ) : (
          <ul className="divide-y divide-[var(--border-hair)]">
            {items.map((it) => (
              <li key={it.adAccountId} className="px-4 py-4 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-[15px] font-semibold text-ink-100">{it.clientName}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          it.error
                            ? "bg-vermelho-dim text-vermelho-fg"
                            : it.active
                              ? "bg-verde-dim text-verde-fg"
                              : "bg-ink-850 text-ink-400"
                        }`}
                      >
                        {it.error ? "erro" : it.active ? "ativa" : "pausada"}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-ink-500">
                      {it.name} · <span className="font-mono">{it.adAccountId.replace("act_", "")}</span> · {it.typeLabel}
                      {it.kind === "lead_gen" && ` · lead = ${LEAD_METRIC_LABEL[it.leadMetric].toLowerCase()}`}
                    </div>
                  </div>
                  <ActionMenu items={menu(it)} label={`Ações da conta ${it.name}`} />
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <WeekBlock title="Semana em curso" sub={it.currentLabel} kind={it.kind} w={it.current} />
                  <WeekBlock title="Última semana fechada" sub={it.previousLabel} kind={it.kind} w={it.previous} />
                </div>

                <div className="mt-2 text-[12px] text-ink-500">
                  Última sincronização: {it.lastSync}
                  {it.error && <span className="mt-1 block text-vermelho-fg">{it.error}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={connecting}
        onClose={() => setConnecting(false)}
        title="Vincular conta de anúncio"
        description="Lista todas as contas que o usuário de sistema enxerga, em todas as BMs. Um cliente pode ter mais de uma conta: os números somam."
        size="md"
      >
        {loadError ? (
          <p className="rounded-lg bg-vermelho-dim px-3 py-2 text-[13px] font-semibold text-vermelho-fg">{loadError}</p>
        ) : !accounts ? (
          <p className="flex items-center gap-2 py-6 text-[13px] text-ink-400">
            <span className="spinner" aria-hidden /> Buscando contas na Meta…
          </p>
        ) : (
          <ActionForm action={connectMetaAccount} onSuccess={() => setConnecting(false)}>
            <label className="block">
              <span className="label">Cliente</span>
              <select name="client_id" required className="field mt-1" defaultValue="">
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
              <span className="label">Conta de anúncio</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrar por nome, BM ou ID…"
                className="field mt-1"
              />
              <select name="ad_account_id" required className="field mt-2" size={Math.min(8, Math.max(3, options.length))}>
                {options.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.business ? ` — ${a.business}` : ""}
                    {a.status !== 1 ? " (inativa)" : ""}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-ink-500">
                {options.length} conta(s) disponível(is){linked.size > 0 && ` · ${linked.size} já vinculada(s) não aparecem`}
              </span>
            </label>
            <label className="block">
              <span className="label">O que conta como lead</span>
              <select name="lead_metric" className="field mt-1" defaultValue="both">
                {(["both", "lead", "messaging"] as LeadMetric[]).map((m) => (
                  <option key={m} value={m}>
                    {LEAD_METRIC_LABEL[m]}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-ink-500">
                Campanha de WhatsApp/Direct gera conversas, não leads de formulário. Só vale para contas de geração de lead
                — se o cliente tiver CRM conectado, a contagem do CRM vence.
              </span>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setConnecting(false)}>
                Cancelar
              </button>
              <SubmitButton pendingLabel="Importando 12 semanas…">Vincular e importar</SubmitButton>
            </div>
          </ActionForm>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Desvincular ${removing?.name ?? ""}?`}
        confirmLabel="Desvincular"
        pendingLabel="Desvinculando…"
        onConfirm={() => removeMetaAccount(removing!.adAccountId)}
      >
        <p>
          Os números importados de <strong className="text-ink-100">{removing?.clientName}</strong> são apagados e as
          semanas voltam a depender só do preenchimento do GT. O score dos últimos 90 dias é recalculado.
        </p>
      </ConfirmDialog>
    </>
  );
}
