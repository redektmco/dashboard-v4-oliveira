"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  changeMetaLeadMetric,
  connectMetaAccount,
  enableIntegration,
  loadMetaAdAccounts,
  removeIntegration,
  removeMetaAccount,
  rotateIntegration,
  setIntegrationCrmName,
  setIntegrationPaused,
  setMetaAccountPaused,
  removeGoogleAccount,
  setGoogleAccountPaused,
  connectGoogleAccount,
  loadGoogleAccounts,
  changeClientLeadSource,
  resyncClientMedia,
} from "@/actions";
import type { AdAccount } from "@/lib/meta/graph";
import { formatCustomerId, type GoogleAccount } from "@/lib/google/metrics";
import { LEAD_METRIC_LABEL, type LeadMetric } from "@/lib/meta/metrics";
import { LEAD_SOURCE_LABEL, LEAD_SOURCES, type LeadSource } from "@/lib/model/types";
import type { ActionResult } from "@/lib/action";
import { ActionMenu, type MenuItem } from "../action-menu";
import { ActionForm, SubmitButton } from "../form-controls";
import { ConfirmDialog, Modal } from "../modal";
import { CopyField } from "../copy-field";
import { toast } from "../toast";
import { Icon } from "../icon";
import { Pill, Segmented } from "../kit";

export const CRMS = ["RD Station", "Kommo", "HubSpot", "Zapier / Make", "Formulário próprio", "Outro"] as const;

const notify = (r: ActionResult) => {
  if (r?.error) toast(r.error, { tone: "error" });
  else if (r?.ok) toast(r.ok);
};

/* ------------------------------ Meta Ads ------------------------------ */

type Platform = "meta" | "google";

const LEAD_SOURCE_HINT: Record<LeadSource, string> = {
  campaign: "Padrão. Vale só a conversão das campanhas (Meta + Google). O webhook segue registrando, mas não entra no score.",
  webhook: "Vale o que chega pelo webhook do CRM; semana sem lead no webhook usa a conversão da campanha.",
  both: "Soma o webhook com a conversão das campanhas. Se o mesmo lead cai nos dois, conta duas vezes.",
};

/** Fonte dos leads do cliente — campo do formulário de vínculo. */
function LeadSourceField({ initial }: { initial: LeadSource }) {
  const [value, setValue] = useState<LeadSource>(initial);
  return (
    <label className="block">
      <span className="label">Fonte dos leads do cliente</span>
      <select name="lead_source" className="field mt-1" value={value} onChange={(e) => setValue(e.target.value as LeadSource)}>
        {LEAD_SOURCES.map((s) => (
          <option key={s} value={s}>
            {LEAD_SOURCE_LABEL[s]}
          </option>
        ))}
      </select>
      <span className="mt-1 block text-[11px] text-ink-500">{LEAD_SOURCE_HINT[value]}</span>
    </label>
  );
}

/** Fonte dos leads no painel do cliente: troca na hora e recalcula o score. */
export function LeadSourcePicker({ clientId, value }: { clientId: number; value: LeadSource }) {
  const [current, setCurrent] = useState<LeadSource>(value);
  const [pending, start] = useTransition();
  return (
    <label className="flex flex-col gap-1 rounded-lg bg-ink-850 px-3 py-2">
      <span className="flex items-center gap-2">
        <Icon name="filter" size={15} className="shrink-0 text-ink-300" />
        <span className="flex-1 text-[12px] text-ink-300">Leads contam de</span>
        {pending && <span className="spinner" aria-hidden />}
        <select
          value={current}
          disabled={pending}
          aria-label="Fonte dos leads"
          className="min-w-0 bg-transparent text-right text-[13px] text-ink-100 outline-none"
          onChange={(e) => {
            const next = e.target.value as LeadSource;
            const prev = current;
            setCurrent(next);
            start(async () => {
              const r = await changeClientLeadSource(clientId, next);
              if (r?.error) setCurrent(prev);
              notify(r);
            });
          }}
        >
          {LEAD_SOURCES.map((s) => (
            <option key={s} value={s}>
              {LEAD_SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
      </span>
      <span className="text-[11px] text-ink-500">{LEAD_SOURCE_HINT[current]}</span>
      <button
        type="button"
        className="mt-0.5 flex w-fit items-center gap-1.5 text-[11.5px] font-semibold text-ink-300 hover:text-ink-100 disabled:opacity-60"
        disabled={pending}
        title="Relê as 12 últimas semanas da Meta e do Google deste cliente e recalcula o score"
        onClick={(e) => {
          e.preventDefault();
          start(async () => notify(await resyncClientMedia(clientId)));
        }}
      >
        <Icon name="refresh" size={12} />
        Atualizar da Meta agora
      </button>
    </label>
  );
}

/**
 * Vincular conta de anúncio. Lista todas as contas que o usuário de sistema
 * enxerga; com `clientId` o cliente já vem escolhido (painel do cliente).
 * Com `google`, a janela ganha a escolha entre Meta Ads e Google Ads.
 */
export function MetaConnectDialog({
  open,
  onClose,
  clientId,
  clients = [],
  linked,
  metaReady = true,
  google,
  leadSource,
}: {
  open: boolean;
  onClose: () => void;
  clientId?: number;
  clients?: { id: number; label: string }[];
  linked: string[];
  /** Token do usuário de sistema da Meta configurado. */
  metaReady?: boolean;
  /** Habilita a aba do Google Ads: credencial pronta e contas já vinculadas. */
  google?: { ready: boolean; linked: string[] };
  /** Fonte dos leads atual do cliente; sem ela, o vínculo não mexe na escolha. */
  leadSource?: LeadSource;
}) {
  const [platform, setPlatform] = useState<Platform>(metaReady || !google ? "meta" : "google");
  const [accounts, setAccounts] = useState<AdAccount[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [gAccounts, setGAccounts] = useState<GoogleAccount[] | null>(null);
  const [gError, setGError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // As contas só são buscadas na Meta / no Google quando a aba abre pela primeira vez.
  useEffect(() => {
    if (!open || platform !== "meta" || !metaReady || accounts || loadError) return;
    let alive = true;
    loadMetaAdAccounts().then((r) => {
      if (!alive) return;
      if (r.error) setLoadError(r.error);
      else {
        setAccounts(r.accounts ?? []);
        setWarning(r.warning ?? null);
      }
    });
    return () => {
      alive = false;
    };
  }, [open, platform, metaReady, accounts, loadError]);

  useEffect(() => {
    if (!open || platform !== "google" || !google?.ready || gAccounts || gError) return;
    let alive = true;
    loadGoogleAccounts().then((r) => {
      if (!alive) return;
      if (r.error) setGError(r.error);
      else setGAccounts(r.accounts ?? []);
    });
    return () => {
      alive = false;
    };
  }, [open, platform, google?.ready, gAccounts, gError]);

  const linkedSet = useMemo(() => new Set(linked), [linked]);
  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (accounts ?? []).filter(
      (a) => !linkedSet.has(a.id) && (!q || a.name.toLowerCase().includes(q) || a.id.includes(q) || (a.business ?? "").toLowerCase().includes(q)),
    );
  }, [accounts, linkedSet, query]);
  // Contas que o usuário de sistema já lê primeiro; as sem acesso vêm depois, desabilitadas.
  const ready = options.filter((a) => a.access);
  const blocked = options.filter((a) => !a.access);

  const gLinked = google?.linked;
  const gLinkedSet = useMemo(() => new Set(gLinked ?? []), [gLinked]);
  const gOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return (gAccounts ?? []).filter((a) => !gLinkedSet.has(a.id) && (!q || a.name.toLowerCase().includes(q) || (digits !== "" && a.id.includes(digits))));
  }, [gAccounts, gLinkedSet, query]);

  const clientField = clientId ? (
    <input type="hidden" name="client_id" value={clientId} />
  ) : (
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
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Vincular conta de anúncio"
      description={
        platform === "google"
          ? "Lista todas as contas de cliente da MCC. Um cliente pode ter mais de uma conta: os números somam, junto com o Meta."
          : "Lista todas as contas que o usuário de sistema enxerga, em todas as BMs. Um cliente pode ter mais de uma conta: os números somam."
      }
    >
      {google && (
        <div className="mb-4">
          <Segmented<Platform>
            full
            value={platform}
            onChange={(p) => {
              setPlatform(p);
              setQuery("");
            }}
            options={[
              { value: "meta", label: "Meta Ads" },
              { value: "google", label: "Google Ads" },
            ]}
          />
        </div>
      )}
      {platform === "google" ? (
        !google?.ready ? (
          <p className="rounded-lg bg-vermelho-dim px-3 py-2 text-[13px] font-semibold text-vermelho-fg">
            Credencial do Google Ads não configurada — veja Performance › Integrações.
          </p>
        ) : !gAccounts && !gError ? (
          <p className="flex items-center gap-2 py-6 text-[13px] text-ink-400">
            <span className="spinner" aria-hidden /> Buscando contas na MCC…
          </p>
        ) : (
          <ActionForm action={connectGoogleAccount} onSuccess={onClose}>
            {clientField}
            {gAccounts ? (
              <label className="block">
                <span className="label">Conta do Google Ads</span>
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar por nome ou ID…" className="field mt-1" />
                <select name="customer_id" required className="field mt-2" size={Math.min(8, Math.max(3, gOptions.length))}>
                  {gOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {formatCustomerId(a.id)}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] text-ink-500">
                  {gAccounts.length === 0 ? "A MCC não tem contas de cliente ativas." : `${gOptions.length} conta(s) disponível(is)`}
                  {gLinkedSet.size > 0 && ` · ${gLinkedSet.size} já vinculada(s) não aparecem`}
                </span>
              </label>
            ) : (
              <>
                <p className="rounded-lg bg-vermelho-dim px-3 py-2 text-[13px] font-semibold text-vermelho-fg">{gError}</p>
                <label className="block">
                  <span className="label">Ou informe o ID da conta do cliente</span>
                  <input name="customer_id" required inputMode="numeric" placeholder="123-456-7890" className="field mt-1" autoComplete="off" />
                </label>
              </>
            )}
            {leadSource && <LeadSourceField initial={leadSource} />}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={onClose}>
                Cancelar
              </button>
              <SubmitButton pendingLabel="Importando 12 semanas…">Vincular e importar</SubmitButton>
            </div>
          </ActionForm>
        )
      ) : !metaReady ? (
        <p className="rounded-lg bg-vermelho-dim px-3 py-2 text-[13px] font-semibold text-vermelho-fg">
          Token do usuário do sistema da Meta não configurado — veja Performance › Integrações.
        </p>
      ) : loadError ? (
        <p className="rounded-lg bg-vermelho-dim px-3 py-2 text-[13px] font-semibold text-vermelho-fg">{loadError}</p>
      ) : !accounts ? (
        <p className="flex items-center gap-2 py-6 text-[13px] text-ink-400">
          <span className="spinner" aria-hidden /> Buscando contas na Meta…
        </p>
      ) : (
        <ActionForm action={connectMetaAccount} onSuccess={onClose}>
          {clientField}
          <label className="block">
            <span className="label">Conta de anúncio</span>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar por nome, BM ou ID…" className="field mt-1" />
            <select name="ad_account_id" required className="field mt-2" size={Math.min(8, Math.max(3, options.length))}>
              {ready.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.business ? ` — ${a.business}` : ""}
                  {a.status !== 1 ? " (inativa)" : ""}
                </option>
              ))}
              {blocked.length > 0 && (
                <optgroup label="Sem acesso — atribuir ao usuário de sistema na BM">
                  {blocked.map((a) => (
                    <option key={a.id} value={a.id} disabled>
                      {a.name}
                      {a.business ? ` — ${a.business}` : ""}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <span className="mt-1 block text-[11px] text-ink-500">
              {ready.length} conta(s) disponível(is)
              {blocked.length > 0 && ` · ${blocked.length} sem acesso`}
              {linkedSet.size > 0 && ` · ${linkedSet.size} já vinculada(s) não aparecem`}
            </span>
          </label>
          {warning && <p className="rounded-lg bg-amarelo-dim px-3 py-2 text-[12px] leading-[17px] text-amarelo-fg">{warning}</p>}
          {blocked.length > 0 && (
            <p className="rounded-lg bg-ink-850 px-3 py-2 text-[12px] leading-[17px] text-ink-300">
              Conta sem acesso existe na BM, mas não foi atribuída ao usuário de sistema da unidade — sem isso a Meta não entrega os números. Para
              liberar: Gerenciador de Negócios › Configurações do negócio › Usuários › Usuários do sistema › escolha o usuário › Atribuir ativos ›
              Contas de anúncio › marque a conta (Ver desempenho já basta). Depois, feche e abra esta janela.
            </p>
          )}
          {/* Formulário + conversas para todos; quem precisar de outra regra
              troca depois no menu da conta vinculada. */}
          <input type="hidden" name="lead_metric" value="both" />
          {leadSource && <LeadSourceField initial={leadSource} />}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>
              Cancelar
            </button>
            <SubmitButton pendingLabel="Importando 12 semanas…">Vincular e importar</SubmitButton>
          </div>
        </ActionForm>
      )}
    </Modal>
  );
}

export type MetaLinkView = {
  adAccountId: string;
  name: string;
  leadMetric: LeadMetric;
  active: boolean;
  lastSync: string;
  error: string | null;
  /** Alerta do vigia: evento de conversão que o painel não contou. */
  unread?: string | null;
};

/** Uma conta vinculada, com o menu de métrica, pausar e desvincular. */
export function MetaLinkRow({ link }: { link: MetaLinkView }) {
  const [removing, setRemoving] = useState(false);
  const menu: MenuItem[] = [
    ...(["both", "lead", "messaging"] as LeadMetric[])
      .filter((m) => m !== link.leadMetric)
      .map<MenuItem>((m) => ({
        label: `Lead = ${LEAD_METRIC_LABEL[m].toLowerCase()}`,
        icon: "filter",
        onSelect: async () => notify(await changeMetaLeadMetric(link.adAccountId, m)),
      })),
    link.active
      ? { label: "Pausar", icon: "lock", hint: "Números voltam para o input manual", onSelect: async () => notify(await setMetaAccountPaused(link.adAccountId, true)) }
      : { label: "Reativar", icon: "refresh", onSelect: async () => notify(await setMetaAccountPaused(link.adAccountId, false)) },
    "separator",
    { label: "Desvincular", icon: "x", danger: true, onSelect: () => setRemoving(true) },
  ];
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-ink-850 px-3 py-2">
      <Icon name="megaphone" size={15} className="shrink-0 text-ink-300" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-ink-100">{link.name}</div>
        <div className="truncate text-[11px] text-ink-400">
          {link.adAccountId} · lead = {LEAD_METRIC_LABEL[link.leadMetric].toLowerCase()} · sync {link.lastSync}
        </div>
        {link.error && <div className="truncate text-[11px] text-vermelho-fg">{link.error}</div>}
        {!link.error && link.unread && (
          <div className="text-[11px] leading-snug text-amarelo-fg" title={link.unread}>
            {link.unread}
          </div>
        )}
      </div>
      {!link.active && <Pill tone="neutro">Pausada</Pill>}
      <ActionMenu items={menu} label={`Ações de ${link.name}`} size="sm" />
      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        title={`Desvincular ${link.name}?`}
        confirmLabel="Desvincular"
        pendingLabel="Desvinculando…"
        onConfirm={() => removeMetaAccount(link.adAccountId)}
      >
        <p>Os números importados são apagados e essas semanas ficam sem dado de performance. O score dos últimos 90 dias é recalculado.</p>
      </ConfirmDialog>
    </div>
  );
}

/* ----------------------------- Google Ads ----------------------------- */

export type GoogleLinkRowView = {
  customerId: string;
  name: string;
  active: boolean;
  lastSync: string;
  error: string | null;
  /** Alerta do vigia: ação de conversão fora de "Conversões". */
  unread?: string | null;
};

/**
 * Uma conta do Google vinculada ao cliente, com pausar e desvincular — o
 * par da `MetaLinkRow`. O Google não tem escolha de métrica de lead: a API
 * devolve conversões já consolidadas.
 */
export function GoogleLinkRow({ link }: { link: GoogleLinkRowView }) {
  const [removing, setRemoving] = useState(false);
  const menu: MenuItem[] = [
    link.active
      ? {
          label: "Pausar",
          icon: "lock",
          hint: "Números voltam para o input manual",
          onSelect: async () => notify(await setGoogleAccountPaused(link.customerId, true)),
        }
      : { label: "Reativar", icon: "refresh", onSelect: async () => notify(await setGoogleAccountPaused(link.customerId, false)) },
    "separator",
    { label: "Desvincular", icon: "x", danger: true, onSelect: () => setRemoving(true) },
  ];
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-ink-850 px-3 py-2">
      <Icon name="search" size={15} className="shrink-0 text-ink-300" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-ink-100">{link.name}</div>
        <div className="truncate text-[11px] text-ink-400">
          {formatCustomerId(link.customerId)} · sync {link.lastSync}
        </div>
        {link.error && <div className="truncate text-[11px] text-vermelho-fg">{link.error}</div>}
        {!link.error && link.unread && (
          <div className="text-[11px] leading-snug text-amarelo-fg" title={link.unread}>
            {link.unread}
          </div>
        )}
      </div>
      {!link.active && <Pill tone="neutro">Pausada</Pill>}
      <ActionMenu items={menu} label={`Ações de ${link.name}`} size="sm" />
      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        title={`Desvincular ${link.name}?`}
        confirmLabel="Desvincular"
        pendingLabel="Desvinculando…"
        onConfirm={() => removeGoogleAccount(link.customerId)}
      >
        <p>Os números importados são apagados e essas semanas ficam sem dado de performance. O score dos últimos 90 dias é recalculado.</p>
      </ConfirmDialog>
    </div>
  );
}

/* ------------------------------ CRM ------------------------------ */

export type WebhookView = {
  url: string;
  active: boolean;
  crmName: string | null;
  lastEvent: string;
  weekLeads: number;
  totalLeads: number;
};

/** Webhook de leads de um cliente: gerar, copiar, trocar CRM, pausar, girar, remover. */
export function WebhookBox({ clientId, hook }: { clientId: number; hook: WebhookView | null }) {
  const [dialog, setDialog] = useState<"rotate" | "remove" | null>(null);
  const [crm, setCrm] = useState<string>(hook?.crmName ?? "RD Station");

  if (!hook)
    return (
      <ActionForm action={enableIntegration} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="client_id" value={clientId} />
        <label className="min-w-[160px] flex-1">
          <span className="text-[12px] font-medium text-ink-300">CRM do cliente</span>
          <select name="crm_name" value={crm} onChange={(e) => setCrm(e.target.value)} className="field mt-1">
            {CRMS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <SubmitButton className="" pendingLabel="Gerando…">
          <Icon name="webhook" size={15} />
          Gerar URL do webhook
        </SubmitButton>
      </ActionForm>
    );

  const menu: MenuItem[] = [
    hook.active
      ? { label: "Pausar", icon: "lock", hint: "Leads voltam para o input manual", onSelect: async () => notify(await setIntegrationPaused(clientId, true)) }
      : { label: "Reativar", icon: "refresh", onSelect: async () => notify(await setIntegrationPaused(clientId, false)) },
    { label: "Gerar novo endereço", icon: "key", hint: "Invalida o atual", onSelect: () => setDialog("rotate") },
    "separator",
    { label: "Remover integração", icon: "x", danger: true, onSelect: () => setDialog("remove") },
  ];

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-ink-850 p-3">
      <div className="flex items-center gap-2">
        <Icon name="webhook" size={15} className="shrink-0 text-ink-300" />
        <select
          value={hook.crmName ?? ""}
          onChange={async (e) => notify(await setIntegrationCrmName(clientId, e.target.value))}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink-100 outline-none"
          aria-label="CRM de origem"
        >
          <option value="">CRM não informado</option>
          {CRMS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {!hook.active && <Pill tone="neutro">Pausado</Pill>}
        <ActionMenu items={menu} label="Ações do webhook" size="sm" />
      </div>
      <CopyField value={hook.url} />
      <span className="text-[11px] text-ink-400">
        {hook.weekLeads} lead(s) nesta semana · {hook.totalLeads} no total · último em {hook.lastEvent}
      </span>
      <ConfirmDialog
        open={dialog === "rotate"}
        onClose={() => setDialog(null)}
        title="Gerar novo endereço?"
        confirmLabel="Gerar novo"
        tone="default"
        onConfirm={() => rotateIntegration(clientId)}
      >
        <p>O endereço atual para de funcionar na hora. Cole o novo no CRM para não perder leads.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "remove"}
        onClose={() => setDialog(null)}
        title="Remover a integração?"
        confirmLabel="Remover"
        onConfirm={() => removeIntegration(clientId)}
      >
        <p>Os leads já recebidos continuam no histórico; novas chamadas ao webhook passam a ser recusadas.</p>
      </ConfirmDialog>
    </div>
  );
}
