"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AccountType, Band, Confidence } from "@/lib/model/types";
import { initials } from "@/lib/social/clients";
import { BAND_STYLE, brl } from "../ui";
import { Icon } from "../icon";

export type Row = {
  id: number;
  name: string;
  type: string;
  typeKey: AccountType;
  gt: string;
  account: string;
  mrr: number;
  renewal: string | null;
  renewalIn: number | null;
  score: number | null;
  band: Band | null;
  confidence: Confidence;
  delta7: number | null;
};

type Quick = "todas" | Band | "sem_score";
type SortKey = "risk" | "score" | "delta" | "mrr" | "renewal" | "name";

const PAGE = 8;
const BAND_ORDER: Record<Band, number> = { vermelho: 0, amarelo: 1, verde: 2 };
const SORTS: [SortKey, string][] = [
  ["risk", "Risco"],
  ["score", "Score"],
  ["delta", "Variação 7d"],
  ["mrr", "MRR"],
  ["renewal", "Renovação"],
  ["name", "Nome"],
];
const COLS = "grid-cols-[minmax(0,1fr)_auto_16px] md:grid-cols-[minmax(0,1fr)_140px_80px_100px_16px] xl:grid-cols-[minmax(0,1fr)_140px_80px_150px_100px_130px_16px]";

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const dec = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Carteira: chips por banda, busca, filtros extras e ordenação, em cima de uma
 * tabela de linhas clicáveis. Mostra 8 contas por vez; "Ver todas" abre o resto.
 */
export function Portfolio({ rows, mrrTotal }: { rows: Row[]; mrrTotal: number }) {
  const [quick, setQuick] = useState<Quick>("todas");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("risk");
  const [filters, setFilters] = useState(false);
  const [type, setType] = useState<"todos" | AccountType>("todos");
  const [conf, setConf] = useState<"todas" | Confidence>("todas");
  const [trend, setTrend] = useState<"todas" | "caindo" | "subindo">("todas");
  const [owner, setOwner] = useState("todos");
  const [all, setAll] = useState(false);

  const owners = useMemo(
    () => Array.from(new Set(rows.flatMap((r) => [r.gt, r.account]))).filter((o) => o !== "—").sort(),
    [rows],
  );
  const counts = useMemo(() => {
    const c = { todas: rows.length, vermelho: 0, amarelo: 0, verde: 0, sem_score: 0 };
    for (const r of rows) c[r.band ?? "sem_score"]++;
    return c;
  }, [rows]);

  const active = [type !== "todos", conf !== "todas", trend !== "todas", owner !== "todos"].filter(Boolean).length;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (quick === "sem_score" ? r.band !== null : quick !== "todas" && r.band !== quick) return false;
      if (type !== "todos" && r.typeKey !== type) return false;
      if (conf !== "todas" && r.confidence !== conf) return false;
      if (owner !== "todos" && r.gt !== owner && r.account !== owner) return false;
      if (trend === "caindo" && !((r.delta7 ?? 0) < 0)) return false;
      if (trend === "subindo" && !((r.delta7 ?? 0) > 0)) return false;
      return !term || r.name.toLowerCase().includes(term);
    });
    const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
      risk: (a, b) =>
        (a.band ? BAND_ORDER[a.band] : 3) - (b.band ? BAND_ORDER[b.band] : 3) || (a.score ?? 0) - (b.score ?? 0) || b.mrr - a.mrr,
      score: (a, b) => (a.score ?? 999) - (b.score ?? 999),
      delta: (a, b) => (a.delta7 ?? 0) - (b.delta7 ?? 0),
      mrr: (a, b) => b.mrr - a.mrr,
      renewal: (a, b) => (a.renewalIn ?? 9999) - (b.renewalIn ?? 9999),
      name: (a, b) => a.name.localeCompare(b.name, "pt-BR"),
    };
    return out.sort(cmp[sort]);
  }, [rows, quick, q, sort, type, conf, trend, owner]);

  const shown = all ? filtered : filtered.slice(0, PAGE);
  const clear = () => {
    setType("todos");
    setConf("todas");
    setTrend("todas");
    setOwner("todos");
  };

  const chips: [Quick, string][] = [
    ["todas", "Todas"],
    ["vermelho", "Crítico"],
    ["amarelo", "Atenção"],
    ["verde", "Saudável"],
    ["sem_score", "Sem score"],
  ];

  return (
    <section className="panel" aria-labelledby="carteira-title">
      <header className="flex flex-col gap-3 px-4 pb-4 pt-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 id="carteira-title" className="font-display text-[17px] font-semibold text-ink-100">
            Carteira
          </h2>
          <p className="mt-1 text-[13px] text-ink-400">
            {rows.length} contas · {brl(mrrTotal)} de MRR · selecione uma conta para ver os detalhes
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative w-full min-w-0 sm:w-auto sm:flex-none">
            <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
            <span className="sr-only">Buscar cliente</span>
            <input className="field h-9 pl-9 sm:w-[240px]" placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <button type="button" className="btn" aria-expanded={filters} onClick={() => setFilters((v) => !v)}>
            <Icon name="sliders" size={15} />
            Filtros
            {active > 0 && <span className="tnum rounded-full bg-v4-red px-1.5 text-[11px] font-semibold text-white">{active}</span>}
          </button>
          <label className="btn relative !gap-1.5 !pr-2">
            <Icon name="sort" size={15} />
            <span className="sr-only">Ordenar por</span>
            <select
              className="cursor-pointer appearance-none bg-transparent pr-5 text-[13px] font-medium text-ink-100 outline-none"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Ordenar por"
            >
              {SORTS.map(([v, l]) => (
                <option key={v} value={v} className="bg-ink-900">
                  {l}
                </option>
              ))}
            </select>
            <Icon name="chevronDown" size={13} className="pointer-events-none absolute right-2.5 text-ink-400" />
          </label>
        </div>
      </header>

      {filters && (
        <div className="mx-4 mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border-hair)] bg-ink-950 p-3 sm:mx-6">
          <FilterSelect label="Tipo" value={type} onChange={(v) => setType(v as typeof type)}
            options={[["todos", "Todos"], ["lead_gen", "Lead Gen"], ["ecommerce", "E-commerce"], ["branding", "Branding"]]} />
          <FilterSelect label="Confiança" value={conf} onChange={(v) => setConf(v as typeof conf)}
            options={[["todas", "Toda"], ["alta", "Alta"], ["media", "Média"], ["baixa", "Baixa"]]} />
          <FilterSelect label="Últimos 7 dias" value={trend} onChange={(v) => setTrend(v as typeof trend)}
            options={[["todas", "Qualquer"], ["caindo", "Caindo"], ["subindo", "Subindo"]]} />
          <FilterSelect label="Responsável" value={owner} onChange={setOwner}
            options={[["todos", "GT / Account"], ...owners.map((o) => [o, o] as [string, string])]} />
          {active > 0 && (
            <button type="button" className="btn btn-ghost btn-sm ml-auto" onClick={clear}>
              <Icon name="x" size={13} />
              Limpar
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 px-4 pb-3 sm:px-6" role="tablist" aria-label="Recorte por banda">
        {chips.map(([v, l]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={quick === v}
            onClick={() => setQuick(v)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors ${
              quick === v ? "bg-ink-800 text-ink-100" : "text-ink-300 hover:bg-ink-850 hover:text-ink-100"
            }`}
          >
            {l}
            <span className="tnum text-ink-500">{counts[v]}</span>
          </button>
        ))}
      </div>

      <div className={`grid ${COLS} items-center gap-4 border-y border-[var(--border-hair)] px-4 py-2.5 text-[12px] font-medium text-ink-500 sm:px-6`}>
        <span>Cliente</span>
        <span>Score</span>
        <span className="hidden md:block">7 dias</span>
        <span className="hidden xl:block">Responsável</span>
        <span className="hidden md:block">MRR</span>
        <span className="hidden xl:block">Renovação</span>
        <span aria-hidden />
      </div>

      <ul>
        {shown.map((r) => {
          const s = r.band ? BAND_STYLE[r.band] : null;
          const late = r.renewalIn !== null && r.renewalIn < 0;
          const soon = r.renewalIn !== null && r.renewalIn <= 30;
          return (
            <li key={r.id} className="border-b border-[var(--border-hair)] last:border-b-0">
              <Link href={`/clientes/${r.id}`} className={`grid ${COLS} items-center gap-4 px-4 py-3 transition-colors hover:bg-ink-850 sm:px-6`}>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-ink-100">{r.name}</span>
                  <span className="block truncate text-[12px] text-ink-500">{r.type}</span>
                </span>
                <span className="flex items-center gap-2">
                  {s ? (
                    <>
                      <span className="tnum text-[14px] font-semibold text-ink-100">{r.score === null ? "—" : Math.round(r.score)}</span>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium ${s.chip}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                        {s.label}
                      </span>
                    </>
                  ) : (
                    <span className="text-[13px] text-ink-500">Sem score</span>
                  )}
                </span>
                <span className="tnum hidden text-[13px] md:block">
                  {r.delta7 === null || Math.abs(r.delta7) < 0.05 ? (
                    <span className="text-ink-500">—</span>
                  ) : r.delta7 < 0 ? (
                    <span className="font-semibold text-vermelho-fg">↓ {dec(-r.delta7)}</span>
                  ) : (
                    <span className="font-semibold text-verde-fg">↑ {dec(r.delta7)}</span>
                  )}
                </span>
                <span className="hidden items-center gap-2 xl:flex">
                  {r.gt === "—" ? (
                    <span className="text-[13px] text-ink-500">—</span>
                  ) : (
                    <>
                      <span aria-hidden className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-ink-800 text-[9px] font-semibold text-ink-300">
                        {initials(r.gt)}
                      </span>
                      <span className="truncate text-[13px] text-ink-300">{r.gt}</span>
                    </>
                  )}
                </span>
                <span className="tnum hidden text-[14px] font-medium text-ink-100 md:block">{brl(r.mrr)}</span>
                <span className={`tnum hidden text-[13px] xl:block ${soon ? "font-medium text-amarelo-fg" : "text-ink-500"}`}>
                  {r.renewal ? (late ? `Vencida · ${ddmm(r.renewal)}` : ddmm(r.renewal)) : "—"}
                </span>
                <Icon name="chevronRight" size={16} className="text-ink-500" />
              </Link>
            </li>
          );
        })}
        {filtered.length === 0 && <li className="px-6 py-10 text-center text-sm text-ink-400">Nenhuma conta com esses filtros.</li>}
      </ul>

      {filtered.length > 0 && (
        <footer className="flex items-center justify-between border-t border-[var(--border-hair)] px-4 py-3.5 text-[13px] sm:px-6">
          <span className="text-ink-500">
            Mostrando {shown.length} de {filtered.length} contas
          </span>
          {filtered.length > PAGE && (
            <button type="button" onClick={() => setAll((v) => !v)} className="inline-flex items-center gap-1.5 font-medium text-ink-300 hover:text-ink-100">
              {all ? "Mostrar menos" : "Ver todas"}
              <Icon name={all ? "chevronUp" : "arrowRight"} size={14} />
            </button>
          )}
        </footer>
      )}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-ink-500">{label}</span>
      <select className="field h-9 w-auto min-w-[130px]" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
