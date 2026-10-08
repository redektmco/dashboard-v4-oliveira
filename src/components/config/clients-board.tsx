"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { importClientsSheet, loadTargetSuggestions, removeClient, saveClientTargets, setClientArchived } from "@/actions";
import type { User } from "@/lib/model/types";
import { fmtBR, parseBR, type TargetField } from "@/lib/model/target-fields";
import type { ClientFootprint, TargetSuggestion } from "@/lib/repo";
import { ClientDialog, type ClientFormClient } from "../client-form";
import { ActionForm, SubmitButton } from "../form-controls";
import { ConfirmDialog, ImpactList, Modal } from "../modal";
import { SidePanel } from "../side-panel";
import { toast } from "../toast";
import { Icon, type IconName } from "../icon";
import { ColLabel, Letter } from "../kit";
import { PageHead } from "../page-head";
import { MetaConnectDialog, MetaLinkRow, WebhookBox, type MetaLinkView, type WebhookView } from "./connections";

export type BoardClient = ClientFormClient & {
  next_checkin_at: string | null;
  typeLabel: string;
  targets: Record<string, number>;
  fields: TargetField[];
  footprint: ClientFootprint;
  meta: MetaLinkView[];
  hook: WebhookView | null;
  charge: { amount: number; dueDate: string; channels: string; willSend: boolean } | null;
};

type Filter = "todos" | "sem_meta" | "sem_fonte" | "arquivados";

const FILTER_LABEL: Record<Filter, string> = {
  todos: "clientes",
  sem_meta: "sem meta",
  sem_fonte: "sem fonte de leads",
  arquivados: "arquivados",
};

const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const first = (n: string | null) => (n ? n.trim().split(/\s+/)[0] : "—");

const hasMeta = (r: BoardClient) => r.fields.some((f) => r.targets[f.key] !== undefined);
const hasSource = (r: BoardClient) => Boolean(r.hook?.active) || r.meta.some((m) => m.active);


/**
 * Clientes (menu lateral). A lista mostra o que falta (meta, fonte de
 * leads, cobrança) e o painel ao lado resolve um cliente de cada vez —
 * com "Salvar e ir para o próximo" para atravessar a fila dos pendentes.
 */
export function ClientsBoard({
  rows,
  users,
  isAdmin,
  metaReady,
  linkedAccounts,
}: {
  rows: BoardClient[];
  users: User[];
  isAdmin: boolean;
  metaReady: boolean;
  linkedAccounts: string[];
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialFilter = (params.get("filtro") as Filter) || "todos";
  const [filter, setFilter] = useState<Filter>(["todos", "sem_meta", "sem_fonte", "arquivados"].includes(initialFilter) ? initialFilter : "todos");
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<BoardClient | "new" | null>(null);
  const [archiving, setArchiving] = useState<BoardClient | null>(null);
  const [deleting, setDeleting] = useState<BoardClient | null>(null);
  const [importing, setImporting] = useState(false);

  const ativos = rows.filter((r) => r.active);
  const lists: Record<Filter, BoardClient[]> = {
    todos: ativos,
    sem_meta: ativos.filter((r) => !hasMeta(r)),
    sem_fonte: ativos.filter((r) => !hasSource(r)),
    arquivados: rows.filter((r) => !r.active),
  };
  const list = lists[filter];

  // Links de Pendências e da ficha: ?c=<id> abre o cliente, ?seq=1 abre o primeiro da fila.
  const cParam = params.get("c");
  const seqParam = params.get("seq");
  const [handled, setHandled] = useState<string | null>(null);
  const key = `${cParam}|${seqParam}|${initialFilter}`;
  if (handled !== key) {
    setHandled(key);
    if (cParam && rows.some((r) => r.id === Number(cParam))) setSelected(Number(cParam));
    else if (seqParam && list[0]) setSelected(list[0].id);
  }

  const row = rows.find((r) => r.id === selected) ?? null;
  // Posição na fila atual; cliente que saiu da fila (ex.: ganhou meta) segue aberto.
  const idx = row ? list.findIndex((r) => r.id === row.id) : -1;

  const go = (step: number) => {
    if (!list.length) return;
    const i = idx < 0 ? 0 : (idx + step + list.length) % list.length;
    setSelected(list[i].id);
  };

  const close = () => {
    setSelected(null);
    if (params.get("c") || params.get("seq")) router.replace(pathname, { scroll: false });
  };

  const startBatch = () => {
    setFilter("sem_meta");
    setSelected(lists.sem_meta[0]?.id ?? null);
  };

  const chips: { f: Filter; label: string; tone: "vermelho" | "neutro" }[] = [
    { f: "todos", label: "Todos", tone: "neutro" },
    { f: "sem_meta", label: "Sem meta", tone: "vermelho" },
    { f: "sem_fonte", label: "Sem fonte de leads", tone: "vermelho" },
    { f: "arquivados", label: "Arquivados", tone: "neutro" },
  ];

  const panel = row && (
    <ClientPanel
      key={row.id}
      row={row}
      position={idx >= 0 ? { i: idx + 1, n: list.length, label: FILTER_LABEL[filter] } : null}
      onPrev={() => go(-1)}
      onNext={() => go(1)}
      onClose={close}
      onAfterSave={(nextId) => setSelected(nextId)}
      nextId={idx >= 0 && list.length > 1 ? list[(idx + 1) % list.length].id : null}
      sequence={filter !== "todos" && filter !== "arquivados"}
      onEdit={() => setEditing(row)}
      onArchive={() => setArchiving(row)}
      onRestore={async () => {
        const r = await setClientArchived(row.id, false);
        if (r?.error) toast(r.error, { tone: "error" });
        else if (r?.ok) toast(r.ok);
      }}
      onDelete={() => setDeleting(row)}
      isAdmin={isAdmin}
      metaReady={metaReady}
      linkedAccounts={linkedAccounts}
    />
  );

  return (
    <div className="flex items-start gap-6">
      <div className="flex w-full min-w-0 flex-1 flex-col gap-5">
        <PageHead
          crumbs={[{ label: "Cadastro" }]}
          title="Clientes"
          description="Cadastro, metas e fontes de dados de cada cliente da carteira."
          actions={
            <div className="flex gap-2">
              {isAdmin && (
                <button className="btn" onClick={() => setImporting(true)}>
                  <Icon name="upload" size={16} />
                  Importar planilha
                </button>
              )}
              <button className="btn" onClick={() => setEditing("new")}>
                <Icon name="plus" size={16} />
                Novo cliente
              </button>
            </div>
          }
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:px-0">
            {chips.map((c) => {
              const on = filter === c.f;
              const n = lists[c.f].length;
              return (
                <button
                  key={c.f}
                  type="button"
                  onClick={() => setFilter(c.f)}
                  aria-pressed={on}
                  className={`flex h-[30px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] ${
                    on ? "border-[var(--border-strong)] bg-ink-800 font-semibold text-ink-100" : "border-[var(--border-hair)] text-ink-300 hover:text-ink-100"
                  }`}
                >
                  {c.label}
                  <span className={`tnum font-semibold ${c.tone === "vermelho" && n > 0 ? "text-vermelho-fg" : "text-ink-400"}`}>{n}</span>
                </button>
              );
            })}
          </div>
          <span className="flex-1" />
          {lists.sem_meta.length > 0 && (
            <button type="button" onClick={startBatch} className="btn btn-ghost h-9 px-2.5 text-ink-300">
              <Icon name="layers3" size={15} />
              Definir metas em lote ({lists.sem_meta.length})
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--border-hair)] bg-ink-900">
          <div className="hidden h-[37.5px] items-center gap-3 border-b border-[var(--border-hair)] px-4 sm:flex">
            <ColLabel className="flex-1">Cliente</ColLabel>
            <ColLabel className="w-[92px]">Metas</ColLabel>
            <ColLabel className="w-[92px]">Leads</ColLabel>
            <ColLabel className="w-[92px]">Cobrança</ColLabel>
            <span className="w-3.5" />
          </div>
          {list.map((r, i) => {
            const on = r.id === selected;
            const meta = hasMeta(r);
            const src = r.meta.some((m) => m.active) && r.hook?.active ? "Meta + CRM" : r.hook?.active ? "CRM" : r.meta.some((m) => m.active) ? "Meta Ads" : null;
            const nMetas = r.fields.filter((f) => r.targets[f.key] !== undefined).length;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r.id)}
                className={`relative flex min-h-[55.5px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  on ? "bg-ink-850" : "hover:bg-ink-850/60"
                } ${i < list.length - 1 ? "border-b border-[var(--border-hair)]" : ""}`}
              >
                {on && <span className="absolute inset-y-0 left-0 w-0.5 bg-v4-red" aria-hidden />}
                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Letter name={r.name} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[13px] font-medium text-ink-100">{r.name}</span>
                    <span className="truncate text-[11px] text-ink-400">
                      {first(r.gt_name)} · {first(r.account_name)}
                    </span>
                  </span>
                </span>
                <Status className="hidden sm:flex" ok={meta} label={meta ? `${nMetas} ${nMetas === 1 ? "meta" : "metas"}` : "Sem meta"} />
                <Status className="hidden sm:flex" ok={Boolean(src)} label={src ?? "Nenhuma"} />
                <span className="hidden w-[92px] items-center gap-1.5 sm:flex">
                  {r.charge ? (
                    <>
                      <Icon name={r.charge.willSend ? "checkCircle" : "alertCircle"} size={14} className={r.charge.willSend ? "text-verde-fg" : "text-amarelo-fg"} />
                      <span className="text-[12px] text-ink-300">Ativa</span>
                    </>
                  ) : (
                    <span className="text-[12px] text-ink-400">—</span>
                  )}
                </span>
                <span className="flex gap-1 sm:hidden">
                  {!meta && <span className="rounded bg-vermelho-dim px-1.5 py-0.5 text-[11px] text-vermelho-fg">sem meta</span>}
                  {!src && <span className="rounded bg-vermelho-dim px-1.5 py-0.5 text-[11px] text-vermelho-fg">sem fonte</span>}
                </span>
                <Icon name="chevronRight" size={14} className={`shrink-0 ${on ? "text-ink-100" : "text-ink-500"}`} />
              </button>
            );
          })}
          {!list.length && (
            <p className="px-4 py-10 text-center text-[13px] text-ink-400">
              {filter === "arquivados"
                ? "Nenhum cliente arquivado. Arquivar tira o cliente da carteira sem apagar o histórico."
                : filter === "todos"
                  ? "Nenhum cliente ativo na carteira."
                  : `Nenhum cliente ${FILTER_LABEL[filter]}. Tudo em dia.`}
            </p>
          )}
        </div>
      </div>

      {/* Painel: coluna ao lado no desktop, tela cheia no celular. */}
      {row && (
        <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-[420px] shrink-0 flex-col overflow-hidden rounded-xl border border-[var(--border-strong)] bg-ink-900 lg:flex">
          {panel}
        </aside>
      )}
      <MobilePanel open={Boolean(row)} onClose={close}>
        {panel}
      </MobilePanel>

      <ClientDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        users={users}
        client={editing && editing !== "new" ? editing : null}
        targets={editing && editing !== "new" ? editing.targets : {}}
      />

      <ConfirmDialog
        open={Boolean(archiving)}
        onClose={() => setArchiving(null)}
        title={`Arquivar ${archiving?.name ?? ""}?`}
        confirmLabel="Arquivar"
        tone="default"
        pendingLabel="Arquivando…"
        onConfirm={() => setClientArchived(archiving!.id, true)}
      >
        <p>
          O cliente sai da carteira, da triagem e dos formulários de GT e Account. Todo o histórico fica guardado e você pode restaurar a qualquer
          momento em “Arquivados”.
        </p>
        {archiving?.footprint.integration && <p className="text-[12.5px] text-amarelo-fg">A integração de CRM continua recebendo leads enquanto não for pausada.</p>}
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Excluir ${deleting?.name ?? ""} definitivamente?`}
        confirmLabel="Excluir cliente"
        pendingLabel="Excluindo…"
        requireText={deleting?.name}
        onConfirm={async () => {
          const r = await removeClient(deleting!.id, deleting!.name);
          if (!r?.error) setSelected(null);
          return r;
        }}
      >
        <p>Some da carteira com todo o histórico. Não dá para desfazer.</p>
        {deleting && (
          <ImpactList
            items={[
              { label: "snapshot(s) de performance", count: deleting.footprint.perf },
              { label: "check-in(s) do Account", count: deleting.footprint.checkins },
              { label: "plano(s) de ação", count: deleting.footprint.plans },
              { label: "lead(s) recebidos do CRM", count: deleting.footprint.leads },
              ...(deleting.footprint.integration ? [{ label: "integração de CRM (o webhook para de contar)" }] : []),
              { label: "projeto(s) de Social media — continuam existindo, só perdem o vínculo", count: deleting.footprint.projects, tone: "muted" as const },
            ]}
          />
        )}
        <p className="text-[12.5px] text-ink-500">Cliente que só saiu da carteira? Prefira arquivar.</p>
      </ConfirmDialog>

      <Modal
        open={importing}
        onClose={() => setImporting(false)}
        title="Importar clientes da planilha"
        description="Planilha de Gestão de Projetos exportada do Google Sheets em CSV (Arquivo → Fazer download → .csv)."
        size="sm"
      >
        <ActionForm action={importClientsSheet} onSuccess={() => setImporting(false)}>
          <label className="block">
            <span className="label">Arquivo .csv</span>
            <input type="file" name="file" accept=".csv,text/csv" required className="field mt-1" />
          </label>
          <ul className="list-disc space-y-1 pl-4 text-[12.5px] text-ink-400">
            <li>Lê CLIENTE, MRR, GT, ACC, E-MAIL, CONTATO, MÍDIA GERIDA e E-COMMERCE; linhas de total são ignoradas.</li>
            <li>
              Cliente que já existe (mesmo nome) é <strong className="text-ink-100">atualizado</strong>: MRR e time. Reimportar não duplica.
            </li>
            <li>Com link de e-commerce vira conta de e-commerce; o resto, geração de lead — ajuste depois se preciso.</li>
            <li>Mídia gerida mensal vira a meta semanal de verba, quando ainda não houver.</li>
          </ul>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setImporting(false)}>
              Cancelar
            </button>
            <SubmitButton pendingLabel="Importando…">Importar</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
    </div>
  );
}

function Status({ ok, label, className = "" }: { ok: boolean; label: string; className?: string }) {
  return (
    <span className={`w-[92px] items-center gap-1.5 ${className}`}>
      <Icon name={ok ? "checkCircle" : "xCircle"} size={14} className={`shrink-0 ${ok ? "text-verde-fg" : "text-vermelho-fg"}`} />
      <span className="truncate text-[12px] text-ink-300">{label}</span>
    </span>
  );
}

/** No celular o painel vira tela cheia; no desktop ele já está na coluna. */
function MobilePanel({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return (
    <SidePanel open={open && mobile} onClose={onClose} label="Configurar cliente" width={460}>
      {children}
    </SidePanel>
  );
}

/* ------------------------------------------------------------------ */
/* Painel "Configurar cliente"                                         */
/* ------------------------------------------------------------------ */

type StepState = "ok" | "pendente" | "parcial";

function StepIcon({ s }: { s: StepState }) {
  const m: Record<StepState, { icon: IconName; cls: string }> = {
    ok: { icon: "checkCircle", cls: "text-verde-fg" },
    pendente: { icon: "alertCircle", cls: "text-vermelho-fg" },
    parcial: { icon: "circleDashed", cls: "text-amarelo-fg" },
  };
  return <Icon name={m[s].icon} size={18} stroke={1.75} className={`shrink-0 ${m[s].cls}`} />;
}

function ClientPanel({
  row,
  position,
  onPrev,
  onNext,
  onClose,
  onAfterSave,
  nextId,
  sequence,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  isAdmin,
  metaReady,
  linkedAccounts,
}: {
  row: BoardClient;
  position: { i: number; n: number; label: string } | null;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onAfterSave: (nextId: number | null) => void;
  nextId: number | null;
  sequence: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  isAdmin: boolean;
  metaReady: boolean;
  linkedAccounts: string[];
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(row.fields.map((f) => [f.key, row.targets[f.key] !== undefined ? fmtBR(row.targets[f.key], f.decimals) : ""])),
  );
  const [suggestions, setSuggestions] = useState<TargetSuggestion[] | null>(null);
  const [openSource, setOpenSource] = useState(!hasSource(row) && hasMeta(row));
  const [connecting, setConnecting] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    loadTargetSuggestions(row.id).then((s) => alive && setSuggestions(s));
    return () => {
      alive = false;
    };
  }, [row.id]);

  const meta = hasMeta(row);
  const source = hasSource(row);
  const dados = Boolean(row.gt_user_id && row.account_user_id);
  const cobranca = Boolean(row.charge?.willSend);
  const steps = [dados, meta, source, cobranca];
  const done = steps.filter(Boolean).length;
  const missing = [!dados && "dados do time", !meta && "metas", !source && "fonte de leads", !cobranca && "cobrança"].filter(Boolean) as string[];
  const sug = useMemo(() => new Map((suggestions ?? []).map((s) => [s.key, s])), [suggestions]);
  const anySuggestion = (suggestions ?? []).some((s) => s.suggestion !== null);
  const dirty = row.fields.some((f) => {
    const v = parseBR(values[f.key] ?? "");
    return v !== (row.targets[f.key] ?? null);
  });

  const applySuggestion = () =>
    setValues((cur) => {
      const next = { ...cur };
      for (const f of row.fields) {
        const s = sug.get(f.key);
        if (s?.suggestion != null) next[f.key] = fmtBR(s.suggestion, f.decimals);
      }
      return next;
    });

  const save = (thenNext: boolean) =>
    start(async () => {
      if (dirty) {
        const payload = Object.fromEntries(row.fields.map((f) => [f.key, parseBR(values[f.key] ?? "")]));
        const r = await saveClientTargets(row.id, payload);
        if (r?.error) {
          toast(r.error, { tone: "error" });
          return;
        }
        if (r?.ok) toast(r.ok);
      }
      if (thenNext) onAfterSave(nextId);
    });

  const metaLine = `${row.typeLabel} · ${brl0(row.mrr)}/mês${row.renewal_date ? ` · renova ${row.renewal_date.slice(5, 7)}/${row.renewal_date.slice(0, 4)}` : ""}`;
  const sourceSub = [
    row.meta.length ? `Meta Ads: ${row.meta.map((m) => m.name).join(", ")}` : "Meta Ads não vinculado",
    row.hook ? `CRM: ${row.hook.crmName ?? "webhook"}${row.hook.active ? "" : " (pausado)"}` : "CRM não conectado",
  ].join(" · ");

  return (
    <>
      <header className="flex flex-col gap-3.5 border-b border-[var(--border-hair)] px-6 pb-5 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-ink-400">{position ? `${position.i} de ${position.n} ${position.label}` : "Fora da lista atual"}</span>
          <div className="flex gap-1">
            {[
              { icon: "chevronUp" as IconName, label: "Anterior", on: onPrev },
              { icon: "chevronDown" as IconName, label: "Próximo", on: onNext },
              { icon: "x" as IconName, label: "Fechar", on: onClose },
            ].map((b) => (
              <button
                key={b.label}
                type="button"
                onClick={b.on}
                aria-label={b.label}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-strong)] bg-ink-850 text-ink-300 hover:text-ink-100"
              >
                <Icon name={b.icon} size={15} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Link href={`/clientes/${row.id}`} className="font-display text-[20px] font-semibold tracking-[-0.3px] text-ink-100 hover:underline">
            {row.name}
          </Link>
          <span className="text-[12px] text-ink-300">{metaLine}</span>
        </div>
        <div className="flex gap-1" aria-hidden>
          {steps.map((ok, i) => (
            <span key={i} className={`h-[3px] flex-1 rounded-sm ${ok ? "bg-verde" : "bg-ink-800"}`} />
          ))}
        </div>
        <span className="text-[12px] text-ink-400">
          {done} de 4 etapas{missing.length ? ` · ${missing.length === 1 ? "falta" : "faltam"} ${missing.slice(0, -1).join(", ")}${missing.length > 1 ? " e " : ""}${missing[missing.length - 1]}` : " · tudo configurado"}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
        {/* Dados do cliente */}
        <Step
          state={dados ? "ok" : "parcial"}
          title="Dados do cliente"
          sub={`GT ${first(row.gt_name)} · Account ${first(row.account_name)}`}
          right={
            <button type="button" onClick={onEdit} className="text-[12px] font-medium text-ink-300 hover:text-ink-100">
              Editar
            </button>
          }
        >
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
            {row.active ? (
              <button type="button" onClick={onArchive} className="text-ink-400 hover:text-ink-100">
                Arquivar cliente
              </button>
            ) : (
              <button type="button" onClick={onRestore} className="text-ink-400 hover:text-ink-100">
                Restaurar para a carteira
              </button>
            )}
            {isAdmin && (
              <button type="button" onClick={onDelete} className="text-vermelho-fg/80 hover:text-vermelho-fg">
                Excluir definitivamente
              </button>
            )}
          </div>
        </Step>

        {/* Metas */}
        <Step
          state={meta ? "ok" : "pendente"}
          title="Metas semanais"
          sub={meta ? `${row.fields.filter((f) => row.targets[f.key] !== undefined).length} meta(s) vigente(s) · base das réguas do score` : "Sem meta o score não é calculado"}
          right={!meta ? <span className="text-[12px] font-medium text-vermelho-fg">Pendente</span> : undefined}
        >
          {anySuggestion && (
            <div className="flex items-center gap-2.5 rounded-lg bg-ink-850 px-3 py-2.5">
              <Icon name="sparkles" size={14} className="shrink-0 text-ink-300" />
              <span className="min-w-0 flex-1 text-[12px] text-ink-300">Sugestão pela média dos últimos 90 dias (+10%)</span>
              <button type="button" onClick={applySuggestion} className="text-[12px] font-semibold text-ink-100 hover:underline">
                Aplicar
              </button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {row.fields.map((f) => {
              const s = sug.get(f.key);
              return (
                <label key={f.key} className="flex flex-col gap-1.5">
                  <span className="truncate text-[12px] font-medium text-ink-300">{f.label}</span>
                  <span className="flex h-[38px] items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-ink-950 px-3 focus-within:border-ink-400">
                    {f.prefix && <span className="text-[13px] text-ink-400">{f.prefix}</span>}
                    <input
                      inputMode="decimal"
                      value={values[f.key] ?? ""}
                      onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                      placeholder="—"
                      className="tnum min-w-0 flex-1 bg-transparent text-[14px] text-ink-100 outline-none placeholder:text-ink-500"
                    />
                    {f.suffix && <span className="text-[13px] text-ink-400">{f.suffix}</span>}
                  </span>
                  <span className="text-[11px] text-ink-400">
                    {suggestions === null ? "…" : s?.avg != null ? `média 90d: ${fmtBR(Math.round(s.avg * 10) / 10, f.decimals)}` : "sem histórico"}
                  </span>
                </label>
              );
            })}
          </div>
          {!sequence && (
            <div className="flex justify-end">
              <button type="button" className="btn btn-sm" disabled={!dirty || pending} onClick={() => save(false)} aria-busy={pending}>
                {pending && <span className="spinner" aria-hidden />}
                Salvar metas
              </button>
            </div>
          )}
        </Step>

        {/* Fonte de leads */}
        <Step
          state={source ? "ok" : "parcial"}
          title="Fonte de leads"
          sub={sourceSub}
          right={
            <button type="button" onClick={() => setOpenSource(!openSource)} className="text-[12px] font-medium text-ink-300 hover:text-ink-100">
              {openSource ? "Fechar" : "Configurar"}
            </button>
          }
        >
          {openSource &&
            (isAdmin ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <span className="text-[12px] font-medium text-ink-300">CRM por webhook</span>
                  <WebhookBox clientId={row.id} hook={row.hook} />
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[12px] font-medium text-ink-300">Meta Ads</span>
                  {row.meta.map((m) => (
                    <MetaLinkRow key={m.adAccountId} link={m} />
                  ))}
                  {metaReady ? (
                    <button type="button" className="btn btn-sm w-fit" onClick={() => setConnecting(true)}>
                      <Icon name="plus" size={14} />
                      Vincular conta de anúncio
                    </button>
                  ) : (
                    <span className="text-[12px] text-ink-400">Token do usuário do sistema não configurado — veja Integrações.</span>
                  )}
                </div>
                <MetaConnectDialog open={connecting} onClose={() => setConnecting(false)} clientId={row.id} linked={linkedAccounts} />
              </div>
            ) : (
              <p className="text-[12px] text-ink-400">Conectar CRM e Meta Ads é com um administrador da unidade.</p>
            ))}
        </Step>

        {/* Cobrança */}
        <Step
          state={cobranca ? "ok" : "parcial"}
          title="Cobrança"
          sub={
            row.charge
              ? `${brl0(row.charge.amount)} · vence ${ddmmyyyy(row.charge.dueDate)}${row.charge.channels ? ` · ${row.charge.channels}` : " · sem contato"}`
              : "Nenhuma cobrança cadastrada"
          }
          right={
            isAdmin ? (
              <Link href={row.charge ? `/config/cobranca?c=${row.id}` : `/config/cobranca?novo=${row.id}`} className="text-[12px] font-medium text-ink-300 hover:text-ink-100">
                {row.charge ? "Ver" : "Criar"}
              </Link>
            ) : undefined
          }
          last
        />
      </div>

      <footer className="flex items-center gap-2 border-t border-[var(--border-hair)] px-6 py-3.5">
        {sequence && nextId ? (
          <button type="button" onClick={() => onAfterSave(nextId)} className="text-[13px] font-medium text-ink-300 hover:text-ink-100">
            Pular
          </button>
        ) : (
          <button type="button" onClick={onClose} className="text-[13px] font-medium text-ink-300 hover:text-ink-100">
            Fechar
          </button>
        )}
        <span className="flex-1" />
        {sequence ? (
          <button type="button" className="btn btn-primary" disabled={pending || (!dirty && !nextId)} aria-busy={pending} onClick={() => save(true)}>
            {pending ? <span className="spinner" aria-hidden /> : <Icon name="arrowRight" size={16} />}
            {nextId ? "Salvar e ir para o próximo" : "Salvar"}
          </button>
        ) : (
          <Link href={`/clientes/${row.id}`} className="btn">
            Abrir ficha
            <Icon name="arrowRight" size={15} />
          </Link>
        )}
      </footer>
    </>
  );
}

function Step({
  state,
  title,
  sub,
  right,
  children,
  last,
}: {
  state: StepState;
  title: string;
  sub: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <section className={`flex flex-col gap-3.5 py-4 ${last ? "" : "border-b border-[var(--border-hair)]"}`}>
      <div className="flex items-center gap-3">
        <StepIcon s={state} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[13px] font-semibold text-ink-100">{title}</span>
          <span className="text-[12px] text-ink-400">{sub}</span>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
