"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { importClientsSheet } from "@/actions";
import type { CrmRow, CrmSummary } from "@/lib/crm/board";
import { CORE_COLUMNS, visibleColumns, type ColumnId } from "@/lib/crm/columns";
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
import { SidePanel } from "../side-panel";
import { ActionMenu } from "../action-menu";
import { Icon } from "../icon";
import { brl, Empty } from "../ui";
import { CrmBulkBar } from "./crm-bulk-bar";
import { CrmFilters } from "./crm-filters";
import { CrmQuickPanel } from "./crm-quick-panel";
import { CrmTable } from "./crm-table";

/**
 * Clientes — o CRM da carteira.
 *
 * O servidor entrega a carteira inteira pronta (ver `lib/crm/board`); daqui
 * para baixo é tudo em memória: aba, filtros, ordenação e seleção. São
 * dezenas de contas, não milhares — paginar no servidor custaria mais do que
 * resolve, e filtrar no cliente mantém a tela instantânea.
 *
 * Os filtros sobrevivem à navegação via `sessionStorage`: sair para a ficha
 * e voltar não desfaz a triagem. Links de fora (`?c=`, `?filtro=`, `?seq=`)
 * têm precedência sobre o que estava guardado.
 */

const PAGE = 25;
const STORE = "crm-clientes";

type Stored = { view: View; filters: Filters; columns: ColumnId[]; sort: SortKey; dir: SortDir };

export function ClientsCrm({
  rows,
  summary,
  users,
  isAdmin,
  metaReady,
  linkedAccounts,
}: {
  rows: CrmRow[];
  summary: CrmSummary;
  users: User[];
  isAdmin: boolean;
  /** Token do usuário de sistema da Meta configurado na Vercel. */
  metaReady: boolean;
  /** Contas de anúncio já vinculadas a algum cliente. */
  linkedAccounts: string[];
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Aba, filtros, colunas e ordenação andam juntos: é "a triagem atual", e é
  // ela inteira que vai e volta do `sessionStorage` numa tacada só.
  const legacy = fromLegacyFilter(params.get("filtro"));
  const [triage, setTriage] = useState<Stored>(() => ({
    view: legacy.view,
    filters: legacy.filters,
    columns: CORE_COLUMNS,
    sort: "risco",
    dir: "desc",
  }));
  const { view, filters, columns, sort, dir } = triage;
  const patch = (p: Partial<Stored>) => setTriage((t) => ({ ...t, ...p }));

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [openId, setOpenId] = useState<number | null>(null);
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
      const raw = sessionStorage.getItem(STORE);
      if (!raw) return;
      const s = JSON.parse(raw) as Stored;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restaurar do sessionStorage só pode acontecer depois da hidratação: ler no corpo do render quebraria o SSR.
      setTriage((t) => ({ ...t, ...s, filters: { ...EMPTY_FILTERS, ...s.filters } }));
    } catch {
      // sessionStorage bloqueado (aba anônima, política do navegador):
      // a tela abre no padrão, que é um estado válido.
    }
  }, [hasLegacy]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ view, filters, columns, sort, dir } satisfies Stored));
    } catch {
      /* idem */
    }
  }, [view, filters, columns, sort, dir]);

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

  /* -------------------- links de fora: ?c= e ?seq= ------------------- */
  const cParam = params.get("c");
  const seqParam = params.get("seq");
  const [handled, setHandled] = useState<string | null>(null);
  const key = `${cParam}|${seqParam}|${params.get("filtro")}`;
  if (handled !== key) {
    setHandled(key);
    if (cParam && rows.some((r) => r.id === Number(cParam))) setOpenId(Number(cParam));
    else if (seqParam && list[0]) setOpenId(list[0].id);
  }

  const row = rows.find((r) => r.id === openId) ?? null;
  const idx = row ? list.findIndex((r) => r.id === row.id) : -1;

  const go = (step: number) => {
    if (!list.length) return;
    const i = idx < 0 ? 0 : (idx + step + list.length) % list.length;
    setOpenId(list[i].id);
    setPage(Math.floor(i / PAGE));
  };

  const close = () => {
    setOpenId(null);
    if (cParam || seqParam) router.replace(pathname, { scroll: false });
  };

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

      <Indicators summary={summary} />

      {/* abas de visualização */}
      <div className="subnav subnav--plain no-scrollbar -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
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

      <CrmFilters
        filters={filters}
        onChange={(f) => retriage({ filters: f })}
        accounts={accounts}
        gts={gts}
        columns={columns}
        onColumns={(c) => patch({ columns: c })}
      />

      {selectedRows.length > 0 && (
        <CrmBulkBar
          rows={selectedRows}
          users={users}
          isAdmin={isAdmin}
          onClear={() => setSelected(new Set())}
          archivedView={view === "arquivados"}
        />
      )}

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
            onOpen={(id) => setOpenId((v) => (v === id ? null : id))}
            openId={openId}
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

      <SidePanel open={Boolean(row)} onClose={close} label="Visualização rápida do cliente" width={440}>
        {row && (
          <CrmQuickPanel
            key={row.id}
            row={row}
            position={idx >= 0 ? { i: idx + 1, n: list.length } : null}
            onPrev={() => go(-1)}
            onNext={() => go(1)}
            onClose={close}
            isAdmin={isAdmin}
            metaReady={metaReady}
            linkedAccounts={linkedAccounts}
          />
        )}
      </SidePanel>

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

const uniq = (list: (string | null)[]) => [...new Set(list.filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, "pt-BR"));
