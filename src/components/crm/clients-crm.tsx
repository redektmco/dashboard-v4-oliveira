"use client";

import { ModularScreen } from "@/components/workspace/modular-screen";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { importClientsSheet } from "@/actions";
import type { CrmRow, CrmSummary } from "@/lib/crm/board";
import { CORE_COLUMNS, visibleColumns, type ColumnId } from "@/lib/crm/columns";
import { GROUP_BY, type GroupBy } from "@/lib/crm/kanban";
import {
  applyAll,
  countViews,
  EMPTY_FILTERS,
  fromLegacyFilter,
  SORT_LABEL,
  VIEWS,
  type Filters,
  type SortDir,
  type SortKey,
  type View,
} from "@/lib/crm/views";
import type { User } from "@/lib/model/types";
import { ActionForm, SubmitButton } from "../form-controls";
import { Modal } from "../modal";
import { PageHead } from "../page-head";
import { ActionMenu } from "../action-menu";
import { Icon } from "../icon";
import { brl, Empty } from "../ui";
import { CrmBulkBar } from "./crm-bulk-bar";
import { CrmFilters } from "./crm-filters";
import { CrmKanban } from "./crm-kanban";
import { CrmTable } from "./crm-table";

/**
 * Clientes — o CRM da carteira.
 *
 * O servidor entrega a carteira inteira pronta (ver `lib/crm/board`); daqui
 * para baixo é tudo em memória: aba, filtros, ordenação e seleção. São
 * dezenas de contas, não milhares — paginar no servidor custaria mais do que
 * resolve, e filtrar no cliente mantém a tela instantânea.
 *
 * Clicar numa conta abre a ficha. O painel rápido (forecast, fontes de
 * dados, webhook do CRM) mora em Performance › Metas.
 *
 * Os filtros sobrevivem à navegação via `sessionStorage`: sair para a ficha
 * e voltar não desfaz a triagem. Links de fora (`?filtro=`) têm precedência
 * sobre o que estava guardado; `?c=` (link antigo do painel) abre a ficha.
 * Sem nada guardado, a tela já abre filtrada pela pessoa logada: o Account
 * nas contas dele, o GT nas dele.
 */

const PAGE = 25;
const LAYOUTS = [
  { id: "lista", label: "Lista", icon: "layoutList" },
  { id: "kanban", label: "Kanban", icon: "layers" },
] as const;
const STORE = "crm-clientes:v2";

/** Lista (tabela) ou kanban por etapa — os dois desenham a mesma triagem. */
type Layout = "lista" | "kanban";

type Stored = { view: View; filters: Filters; columns: ColumnId[]; sort: SortKey; dir: SortDir; layout: Layout; groupBy: GroupBy };

export function ClientsCrm({
  rows,
  summary,
  users,
  isAdmin,
  me,
}: {
  rows: CrmRow[];
  summary: CrmSummary;
  users: User[];
  isAdmin: boolean;
  /** Quem está logado: Account e GT abrem a lista já filtrada nas próprias contas. */
  me: { id: number; name: string; role: User["role"]; roles?: string[] };
}) {
  const storageKey = `${STORE}:${me.id}`;
  const params = useSearchParams();
  const router = useRouter();

  // Aba, filtros, colunas e ordenação andam juntos: é "a triagem atual", e é
  // ela inteira que vai e volta do `sessionStorage` numa tacada só.
  const legacy = fromLegacyFilter(params.get("filtro"));
  const [triage, setTriage] = useState<Stored>(() => ({
    view: legacy.view,
    filters: { ...legacy.filters, ...loginFilter(me, rows) },
    columns: CORE_COLUMNS,
    sort: "risco",
    dir: "desc",
    layout: "lista",
    groupBy: "etapa",
  }));
  const { view, filters, columns, sort, dir, layout, groupBy } = triage;
  const patch = (p: Partial<Stored>) => setTriage((t) => ({ ...t, ...p }));

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(0);
  const [importing, setImporting] = useState(false);
  const [wide, setWide] = useState(true);
  const [xl, setXl] = useState(true);

  /* --------- larguras: a tabela só existe a partir de 1024px --------- */
  useEffect(() => {
    const lg = window.matchMedia("(min-width: 1024px)");
    const big = window.matchMedia("(min-width: 1280px)");
    const sync = () => {
      setWide(lg.matches);
      setXl(big.matches);
    };
    sync();
    lg.addEventListener("change", sync);
    big.addEventListener("change", sync);
    return () => {
      lg.removeEventListener("change", sync);
      big.removeEventListener("change", sync);
    };
  }, []);

  /* ------- persistência da triagem entre idas e vindas da ficha ------ */
  const hasLegacy = params.get("filtro") !== null;
  useEffect(() => {
    if (hasLegacy) return; // o link de fora manda
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return;
      const s = JSON.parse(raw) as Stored;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restaurar do sessionStorage só pode acontecer depois da hidratação: ler no corpo do render quebraria o SSR.
      setTriage((t) => ({
        ...t,
        ...s,
        filters: { ...EMPTY_FILTERS, ...s.filters },
        groupBy: GROUP_BY.some((g) => g.id === s.groupBy) ? s.groupBy : t.groupBy,
      }));
    } catch {
      // sessionStorage bloqueado (aba anônima, política do navegador):
      // a tela abre no padrão, que é um estado válido.
    }
  }, [hasLegacy, storageKey]);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ view, filters, columns, sort, dir, layout, groupBy } satisfies Stored));
    } catch {
      /* idem */
    }
  }, [view, filters, columns, sort, dir, layout, groupBy, storageKey]);

  /* ---------------- listas derivadas (tudo em memória) --------------- */
  const counts = useMemo(() => countViews(rows), [rows]);
  const list = useMemo(() => applyAll(rows, view, filters, sort, dir), [rows, view, filters, sort, dir]);

  const accounts = useMemo(() => uniq(rows.map((r) => r.accountName)), [rows]);
  const gts = useMemo(() => uniq(rows.map((r) => r.gtName)), [rows]);
  const cols = useMemo(() => visibleColumns(columns, xl), [columns, xl]);

  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = list.slice(cur * PAGE, cur * PAGE + PAGE);

  // Trocar de aba/filtro volta para a primeira página — ficar na página 4 de
  // uma lista que agora tem 2 páginas é um vazio sem explicação.
  const retriage = (p: Partial<Stored>) => {
    patch(p);
    setPage(0);
  };

  /* ------------- clicar abre a ficha; ?c= antigo também --------------- */
  const open = (id: number) => router.push(`/clientes/${id}`);
  const cParam = params.get("c");
  useEffect(() => {
    if (cParam && /^\d+$/.test(cParam)) router.replace(`/clientes/${cParam}`);
  }, [cParam, router]);

  /* --------------------------- seleção ------------------------------ */
  const toggle = (id: number, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggleAll = (on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      for (const r of shown) {
        if (on) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });

  const selectedRows = rows.filter((r) => selected.has(r.id));

  const onSort = (k: SortKey) =>
    retriage(sort === k ? { dir: dir === "asc" ? "desc" : "asc" } : { sort: k, dir: k === "nome" ? "asc" : "desc" });

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        crumbs={[{ label: "CRM" }]}
        title="Clientes"
        description="Saúde, relacionamento, forecast e cobrança de cada conta da carteira em um só lugar."
        actions={
          <div className="flex gap-2">
            {isAdmin && (
              <button className="btn" onClick={() => setImporting(true)}>
                <Icon name="upload" size={16} />
                Importar planilha
              </button>
            )}
            <Link href="/clientes/novo" className="btn btn-light">
              <Icon name="plus" size={16} />
              Novo cliente
            </Link>
            <ActionMenu
              items={[
                { label: "Definir forecast pendente", icon: "target", onSelect: () => retriage({ view: "todos", filters: { ...EMPTY_FILTERS, targets: "pendentes" } }) },
                { label: "Conectar fontes de leads", icon: "webhook", onSelect: () => retriage({ view: "todos", filters: { ...EMPTY_FILTERS, source: "sem" } }) },
                "separator",
                { label: "Ver arquivados", icon: "history", onSelect: () => retriage({ view: "arquivados" }) },
              ]}
            />
          </div>
        }
      />

      <ModularScreen screen="clientes" modules={[
{ id: "overview", label: "Resumo da carteira", kind: "metrics", defaultWidth: 'full' as const, content: <><Indicators summary={summary} /></> },
{ id: "views", label: "Visualizações", kind: "overview", defaultWidth: 'full' as const, content: <><div className="flex items-center gap-3">
        <div className="subnav subnav--plain no-scrollbar -ml-4 min-w-0 flex-1 overflow-x-auto pl-4 lg:ml-0 lg:pl-0">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              onClick={() => {
                retriage({ view: v.id });
                setSelected(new Set());
              }}
            >
              {v.label}
              <span className="tnum ml-1.5 text-ink-500">{counts[v.id]}</span>
            </button>
          ))}
        </div>
        <div className="seg seg--sm shrink-0" role="radiogroup" aria-label="Visualização">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={layout === l.id}
              aria-label={l.label}
              title={l.label}
              className={layout === l.id ? "on" : ""}
              onClick={() => {
                patch({ layout: l.id });
                setSelected(new Set());
              }}
            >
              <Icon name={l.icon} size={14} />
              <span className="hidden sm:inline">{l.label}</span>
            </button>
          ))}
        </div>
      </div></> },
{ id: "filters", label: "Filtros e colunas", kind: "filters", defaultWidth: 'full' as const, content: <><CrmFilters
        filters={filters}
        onChange={(f) => retriage({ filters: f })}
        accounts={accounts}
        gts={gts}
        columns={columns}
        onColumns={(c) => patch({ columns: c })}
      /></> },
{ id: "clients", label: "Clientes e ações", kind: "list", defaultWidth: 'full' as const, content: <>{layout === "lista" && selectedRows.length > 0 && (
        <CrmBulkBar
          rows={selectedRows}
          users={users}
          isAdmin={isAdmin}
          onClear={() => setSelected(new Set())}
          archivedView={view === "arquivados"}
        />
      )}
{layout === "kanban" && list.length > 0 ? (
        <CrmKanban
          rows={list}
          users={users}
          groupBy={groupBy}
          onGroupBy={(g) => patch({ groupBy: g })}
          openId={null}
          onOpen={open}
        />
      ) : (
        <section className="panel">
          {shown.length === 0 ? (
            <div className="px-4 py-12">
              <Empty
                action={
                  <button type="button" className="btn btn-sm" onClick={() => retriage({ filters: { ...EMPTY_FILTERS } })}>
                    Limpar filtros
                  </button>
                }
              >
                {rows.length === 0
                  ? "Nenhum cliente cadastrado ainda."
                  : "Nenhum cliente com esses filtros. Os filtros continuam aplicados — limpe-os para ver a carteira inteira."}
              </Empty>
            </div>
          ) : (
            <CrmTable
              rows={shown}
              columns={cols}
              wide={wide}
              selected={selected}
              onToggle={toggle}
              onToggleAll={toggleAll}
              onOpen={open}
              openId={null}
              sort={sort}
              dir={dir}
              onSort={onSort}
            />
          )}

          {list.length > 0 && (
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-hair)] px-4 py-3 text-[13px] sm:px-5">
              <span className="text-ink-500">
                Mostrando {cur * PAGE + 1}–{cur * PAGE + shown.length} de {list.length}{" "}
                {list.length === 1 ? "cliente" : "clientes"} · ordenado por {SORT_LABEL[sort]}
              </span>
              {pages > 1 && (
                <span className="flex items-center gap-1">
                  <PageBtn icon="chevronLeft" label="Anterior" disabled={cur === 0} onClick={() => setPage(cur - 1)} />
                  <span className="tnum px-2 text-ink-400">
                    {cur + 1} / {pages}
                  </span>
                  <PageBtn icon="chevronRight" label="Próxima" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} />
                </span>
              )}
            </footer>
          )}
        </section>
      )}</> }
]} />

      <ImportDialog open={importing} onClose={() => setImporting(false)} />
    </div>
  );
}

/* --------------------------- indicadores --------------------------- */

function Indicators({ summary: s }: { summary: CrmSummary }) {
  const total = s.saudaveis + s.atencao + s.criticos || 1;
  const items = [
    { label: "Clientes ativos", value: s.ativos, hint: `${brl(s.mrrTotal)} MRR` },
    { label: "Saudáveis", value: s.saudaveis, hint: `${pct(s.saudaveis, s.ativos)} da carteira`, tone: "text-verde-fg" },
    { label: "Em atenção", value: s.atencao, hint: `${pct(s.atencao, s.ativos)} da carteira`, tone: "text-amarelo-fg" },
    { label: "Risco crítico", value: s.criticos, hint: `${brl(s.mrrEmRisco)} em risco`, tone: "text-vermelho-fg" },
    { label: "Churn solicitado", value: s.churn, hint: s.churn ? "em retenção ativa" : "nenhum em aberto", tone: s.churn ? "text-vermelho-fg" : undefined },
  ];
  return (
    <section className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((i) => (
          <div key={i.label} className="flex min-w-0 flex-col gap-0.5">
            <span className="eyebrow truncate">{i.label}</span>
            <span className="flex min-w-0 items-baseline gap-2">
              <span className={`tnum font-display text-[24px] font-semibold ${i.tone ?? "text-ink-100"}`}>{i.value}</span>
              <span className="truncate text-[12px] text-ink-500">{i.hint}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="flex h-[3px] overflow-hidden rounded-full bg-ink-850" role="img" aria-label="Distribuição da carteira por saúde">
        <span className="bg-verde" style={{ width: `${(s.saudaveis / total) * 100}%` }} />
        <span className="bg-amarelo" style={{ width: `${(s.atencao / total) * 100}%` }} />
        <span className="bg-vermelho" style={{ width: `${(s.criticos / total) * 100}%` }} />
      </div>
    </section>
  );
}

const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "0%");

function PageBtn({ icon, label, disabled, onClick }: { icon: "chevronLeft" | "chevronRight"; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className="btn btn-sm btn-icon" aria-label={label} disabled={disabled} onClick={onClick}>
      <Icon name={icon} size={15} />
    </button>
  );
}

/* ------------------------ importar planilha ------------------------ */

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Importar planilha de clientes"
      description="CSV exportado da planilha de Gestão de Projetos. Clientes já cadastrados são atualizados, não duplicados."
      size="sm"
    >
      <ActionForm action={importClientsSheet} onSuccess={onClose}>
        <label className="flex flex-col gap-1.5">
          <span className="label">Arquivo CSV</span>
          <input type="file" name="file" accept=".csv,text/csv" required className="field" />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <SubmitButton pendingLabel="Importando…">Importar</SubmitButton>
        </div>
      </ActionForm>
    </Modal>
  );
}

/**
 * Filtro inicial pela pessoa logada: Account vê as contas em que é Account,
 * GT as que é GT. Só aplica se ela de fato tem conta na carteira — senão a
 * tela abriria vazia sem explicação. Coordenação e social veem tudo.
 */
function loginFilter(me: { name: string; role: User["role"] }, rows: CrmRow[]): Partial<Filters> {
  if (me.role === "account" && rows.some((r) => r.accountName === me.name)) return { account: me.name };
  if (me.role === "gt" && rows.some((r) => r.gtName === me.name)) return { gt: me.name };
  return {};
}

const uniq = (list: (string | null)[]) => [...new Set(list.filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
