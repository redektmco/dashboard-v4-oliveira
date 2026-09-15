"use client";

import { useMemo, useState } from "react";
import type { AccountType, Band, Confidence } from "@/lib/model/types";
import {
  BandChip,
  CardList,
  CardMeta,
  CardRow,
  ClientLink,
  ConfidenceTag,
  Delta,
  Panel,
  ScoreBar,
  Sparkline,
  TableScroll,
  bandFg,
  brl,
} from "./ui";
import { Icon } from "./icon";

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
  rawBand: Band | null;
  confidence: Confidence;
  delta7: number | null;
  overrides: string[];
  history: (number | null)[];
  perfAge: number | null;
  checkinAge: number | null;
  openPlans: number;
};

type SortKey = "risk" | "score" | "delta" | "mrr" | "name" | "renewal";

const BAND_ORDER: Record<Band, number> = { vermelho: 0, amarelo: 1, verde: 2 };

export function PortfolioTable({ rows }: { rows: Row[] }) {
  const [band, setBand] = useState<"todas" | Band>("todas");
  const [conf, setConf] = useState<"todas" | Confidence>("todas");
  const [type, setType] = useState<"todos" | AccountType>("todos");
  const [owner, setOwner] = useState("todos");
  const [trend, setTrend] = useState<"todas" | "caindo" | "subindo">("todas");
  const [sort, setSort] = useState<SortKey>("risk");
  const [q, setQ] = useState("");
  // Os filtros vivem recolhidos em toda tela: expostos ocupariam a faixa
  // inteira acima da tabela e empurrariam a carteira para fora da dobra.
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  const owners = useMemo(
    () => Array.from(new Set(rows.flatMap((r) => [r.gt, r.account]))).filter((o) => o !== "—").sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const out = rows.filter((r) => {
      if (band !== "todas" && r.band !== band) return false;
      if (conf !== "todas" && r.confidence !== conf) return false;
      if (type !== "todos" && r.typeKey !== type) return false;
      if (owner !== "todos" && r.gt !== owner && r.account !== owner) return false;
      if (trend === "caindo" && !((r.delta7 ?? 0) < 0)) return false;
      if (trend === "subindo" && !((r.delta7 ?? 0) > 0)) return false;
      if (q && !r.name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
    const cmp: Record<SortKey, (a: Row, b: Row) => number> = {
      risk: (a, b) =>
        BAND_ORDER[a.band ?? "vermelho"] - BAND_ORDER[b.band ?? "vermelho"] ||
        (a.score ?? 0) - (b.score ?? 0),
      score: (a, b) => (a.score ?? 999) - (b.score ?? 999),
      delta: (a, b) => (a.delta7 ?? 0) - (b.delta7 ?? 0),
      mrr: (a, b) => b.mrr - a.mrr,
      name: (a, b) => a.name.localeCompare(b.name),
      renewal: (a, b) => (a.renewalIn ?? 9999) - (b.renewalIn ?? 9999),
    };
    return [...out].sort(cmp[sort]);
  }, [rows, band, conf, type, owner, trend, q, sort]);

  const mrrShown = filtered.reduce((a, r) => a + r.mrr, 0);

  // Um único descritor por filtro alimenta o painel recolhível — mesma lista
  // em toda tela, sem como uma largura ganhar um filtro que a outra não tem.
  const filtros: { label: string; value: string; onChange: (v: string) => void; padrao: string; options: [string, string][] }[] = [
    {
      label: "Banda",
      value: band,
      onChange: (v) => setBand(v as never),
      padrao: "todas",
      options: [["todas", "Todas as bandas"], ["vermelho", "Vermelho"], ["amarelo", "Amarelo"], ["verde", "Verde"]],
    },
    {
      label: "Confiança",
      value: conf,
      onChange: (v) => setConf(v as never),
      padrao: "todas",
      options: [["todas", "Toda confiança"], ["alta", "Alta"], ["media", "Média"], ["baixa", "Baixa"]],
    },
    {
      label: "Tipo",
      value: type,
      onChange: (v) => setType(v as never),
      padrao: "todos",
      options: [["todos", "Todos os tipos"], ["lead_gen", "Geração de Lead"], ["ecommerce", "E-commerce"], ["branding", "Branding"]],
    },
    {
      label: "Responsável",
      value: owner,
      onChange: setOwner,
      padrao: "todos",
      options: [["todos", "GT / Account"], ...owners.map((o) => [o, o] as [string, string])],
    },
    {
      label: "Tendência",
      value: trend,
      onChange: (v) => setTrend(v as never),
      padrao: "todas",
      options: [["todas", "Qualquer tendência"], ["caindo", "Caindo (7d)"], ["subindo", "Subindo (7d)"]],
    },
  ];
  const ordenacao: [string, string][] = [
    ["risk", "Risco"],
    ["score", "Score"],
    ["delta", "Variação 7d"],
    ["mrr", "MRR"],
    ["renewal", "Renovação"],
    ["name", "Nome"],
  ];
  // Com a gaveta fechada, o número é a única pista de que há filtro ativo.
  const ativos = filtros.filter((f) => f.value !== f.padrao).length;

  const limpar = () => {
    setBand("todas");
    setConf("todas");
    setType("todos");
    setOwner("todos");
    setTrend("todas");
  };

  return (
    <Panel
      title="Carteira detalhada"
      subtitle={`${filtered.length} de ${rows.length} contas · ${brl(mrrShown)} de MRR no filtro`}
      right={
        <div className="relative w-full sm:w-auto">
          <Icon
            name="search"
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500"
          />
          <input
            className="field pl-9 sm:max-w-[200px]"
            placeholder="Buscar cliente…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      }
    >
      {/* ---- filtros: um controle só, desktop e celular ----
          Antes o desktop mostrava os cinco selects sempre abertos, competindo
          com a tabela; agora vivem atrás do botão "Filtros" (com o contador de
          ativos), como já era no celular. Buscar e ordenar seguem sempre à mão
          — são o que muda a leitura da lista, não o recorte dela. */}
      <div className="border-b border-[var(--border-hair)]">
        <div className="flex items-center gap-2 px-4 py-2.5">
          <button
            type="button"
            onClick={() => setFiltrosAbertos((v) => !v)}
            aria-expanded={filtrosAbertos}
            className="btn btn-sm"
          >
            <Icon name="filter" size={14} />
            Filtros
            {ativos > 0 && (
              <span className="tnum rounded-full bg-v4-red px-1.5 font-mono text-[10px] font-bold text-white">
                {ativos}
              </span>
            )}
            <Icon
              name="chevronDown"
              size={13}
              className={`transition-transform duration-200 ${filtrosAbertos ? "rotate-180" : ""}`}
            />
          </button>
          {/* Limpar à vista quando há filtro ativo — no desktop ao lado do
              botão; no celular ele desce para dentro do painel aberto. */}
          {ativos > 0 && (
            <button type="button" onClick={limpar} className="btn btn-sm btn-ghost hidden sm:inline-flex">
              <Icon name="x" size={13} />
              Limpar {ativos}
            </button>
          )}
          <label className="ml-auto flex min-w-0 items-center gap-1.5">
            <Icon name="sort" size={14} className="shrink-0 text-ink-500" />
            <span className="sr-only">Ordenar</span>
            <select
              className="field w-auto py-1.5 text-xs"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Ordenar"
            >
              {ordenacao.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filtrosAbertos && (
          <div className="grid grid-cols-2 gap-2.5 border-t border-[var(--border-hair)] px-4 py-3 sm:grid-cols-3 lg:grid-cols-5">
            {filtros.map((f) => (
              <label key={f.label} className="block">
                <span className="label">{f.label}</span>
                <select
                  className="field mt-1"
                  value={f.value}
                  onChange={(e) => f.onChange(e.target.value)}
                  aria-label={f.label}
                >
                  {f.options.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {ativos > 0 && (
              <button type="button" onClick={limpar} className="btn btn-sm col-span-2 justify-center sm:hidden">
                <Icon name="x" size={13} />
                Limpar {ativos} filtro{ativos > 1 ? "s" : ""}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---- cartões no celular ---- */}
      <CardList>
        {filtered.map((r) => (
          <CardRow key={r.id} critical={r.band === "vermelho"}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <ClientLink id={r.id} name={r.name} />
                <div className="mt-0.5 text-[11px] text-ink-500">
                  {r.type} · GT {r.gt}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Delta value={r.delta7} />
                <span className={`tnum font-display text-2xl font-bold leading-none ${bandFg(r.band)}`}>
                  {r.score === null ? "—" : Math.round(r.score)}
                </span>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2.5">
              <div className="min-w-0 flex-1">
                <ScoreBar value={r.score} />
              </div>
              <BandChip band={r.band} />
            </div>

            <CardMeta
              items={[
                { label: "MRR", value: <span className="tnum">{brl(r.mrr)}</span> },
                {
                  label: "Renova em",
                  value: r.renewalIn === null ? "—" : `${r.renewalIn}d`,
                  className: `tnum ${r.renewalIn !== null && r.renewalIn <= 30 ? "text-amarelo-fg" : ""}`,
                },
                { label: "Account", value: r.account },
                {
                  label: "Confiança",
                  value: (
                    <span className="flex flex-col gap-0.5">
                      <ConfidenceTag c={r.confidence} compact />
                      <span className="text-[10.5px] text-ink-500">
                        perf {r.perfAge === null ? "nunca" : `${r.perfAge}d`} · chk{" "}
                        {r.checkinAge === null ? "nunca" : `${r.checkinAge}d`}
                      </span>
                    </span>
                  ),
                },
              ]}
            />

            {(r.overrides.length > 0 || r.openPlans > 0) && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {r.overrides.map((o) => (
                  <span
                    key={o}
                    className="rounded-sm bg-vermelho-dim px-1.5 py-0.5 text-[11px] font-semibold text-vermelho-fg"
                  >
                    {o}
                  </span>
                ))}
                {r.openPlans > 0 && (
                  <span className="text-[11px] font-semibold text-v4-red">
                    {r.openPlans} plano{r.openPlans > 1 ? "s" : ""} em aberto
                  </span>
                )}
              </div>
            )}
          </CardRow>
        ))}
        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-ink-400">
            Nenhuma conta com esses filtros.
          </div>
        )}
      </CardList>

      {/* ---- tabela no desktop ---- */}
      <div className="hidden lg:block">
      <TableScroll>
        <table className="data-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Score</th>
              <th>Tendência (6 sem.)</th>
              <th>7d</th>
              <th>Confiança</th>
              <th>Sinal</th>
              <th>Responsáveis</th>
              <th className="text-right">MRR</th>
              <th>Renova</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td className="min-w-[190px]">
                  <ClientLink id={r.id} name={r.name} />
                  <div className="mt-0.5 text-xs text-ink-500">{r.type}</div>
                </td>
                <td className="min-w-[130px]">
                  <div className="flex items-center gap-2">
                    <span
                      className={`tnum font-display text-xl font-bold leading-none ${bandFg(r.band)}`}
                    >
                      {r.score === null ? "—" : Math.round(r.score)}
                    </span>
                    <BandChip band={r.band} />
                  </div>
                  <div className="mt-1.5 w-[110px]">
                    <ScoreBar value={r.score} />
                  </div>
                </td>
                <td>
                  <Sparkline points={r.history.slice(-42)} />
                </td>
                <td>
                  <Delta value={r.delta7} />
                </td>
                <td>
                  <ConfidenceTag c={r.confidence} compact />
                  <div className="mt-0.5 text-[11px] text-ink-500">
                    perf {r.perfAge === null ? "nunca" : `${r.perfAge}d`} · chk{" "}
                    {r.checkinAge === null ? "nunca" : `${r.checkinAge}d`}
                  </div>
                </td>
                <td className="max-w-[220px]">
                  {r.overrides.length ? (
                    <div className="flex flex-wrap gap-1">
                      {r.overrides.map((o) => (
                        <span
                          key={o}
                          className="rounded-sm bg-vermelho-dim px-1.5 py-0.5 text-[11px] font-semibold text-vermelho-fg"
                        >
                          {o}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-ink-600">—</span>
                  )}
                  {r.openPlans > 0 && (
                    <div className="mt-1 text-[11px] font-semibold text-v4-red">
                      {r.openPlans} plano{r.openPlans > 1 ? "s" : ""} em aberto
                    </div>
                  )}
                </td>
                <td className="text-xs text-ink-300">
                  <div>GT {r.gt}</div>
                  <div className="text-ink-500">AM {r.account}</div>
                </td>
                <td className="tnum text-right text-ink-300">{brl(r.mrr)}</td>
                <td
                  className={`tnum text-xs ${
                    r.renewalIn !== null && r.renewalIn <= 30 ? "text-amarelo-fg" : "text-ink-400"
                  }`}
                >
                  {r.renewalIn === null ? "—" : `${r.renewalIn}d`}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-sm text-ink-400">
                  Nenhuma conta com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableScroll>
      </div>
    </Panel>
  );
}
