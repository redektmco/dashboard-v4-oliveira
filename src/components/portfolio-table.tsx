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
  Chip,
  ChipSep,
  TableScroll,
  Toolbar,
  ToolbarLabel,
  ToolbarRow,
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
  const porFiltro = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => {
          if (r.band) acc[r.band] += 1;
          return acc;
        },
        { vermelho: 0, amarelo: 0, verde: 0 } as Record<Band, number>,
      ),
    [filtered],
  );
  const porBanda = useMemo(
    () =>
      rows.reduce(
        (acc, r) => {
          if (r.band) acc[r.band] += 1;
          return acc;
        },
        { vermelho: 0, amarelo: 0, verde: 0 } as Record<Band, number>,
      ),
    [rows],
  );

  const ordenacao: [string, string][] = [
    ["risk", "Risco"],
    ["score", "Score"],
    ["delta", "Variação 7d"],
    ["mrr", "MRR"],
    ["renewal", "Renovação"],
    ["name", "Nome"],
  ];
  // Quantos recortes fogem do padrão — o que o botão "Limpar" apaga.
  const ativos = [band !== "todas", conf !== "todas", type !== "todos", owner !== "todos", trend !== "todas"].filter(
    Boolean,
  ).length;

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
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <label className="relative min-w-0 flex-1 sm:flex-none">
            <Icon
              name="search"
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500"
            />
            <span className="sr-only">Buscar cliente</span>
            <input
              className="field pl-9 sm:w-[190px]"
              placeholder="Buscar cliente…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <label className="flex flex-none items-center gap-1.5">
            <Icon name="sort" size={14} className="shrink-0 text-ink-500" />
            <span className="sr-only">Ordenar</span>
            <select
              className="field w-auto"
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
      }
    >
      {/* ---- recortes: chips à vista, como num console ----
          Os cinco selects moravam atrás de um botão "Filtros" porque, abertos,
          empurravam a carteira para fora da dobra. Como chips eles cabem em
          duas linhas de 30px, e o recorte ativo é legível sem abrir nada. */}
      <div className="border-b border-[var(--border-hair)] px-3 py-2.5">
        <Toolbar>
          <ToolbarRow>
            <ToolbarLabel>Banda</ToolbarLabel>
            {([["todas", "Todas"], ["vermelho", "Vermelho"], ["amarelo", "Amarelo"], ["verde", "Verde"]] as const).map(
              ([v, l]) => (
                <Chip key={v} active={band === v} onClick={() => setBand(v as never)} count={v === "todas" ? undefined : porBanda[v as Band]}>
                  {l}
                </Chip>
              ),
            )}
            <ChipSep />
            <ToolbarLabel>7 dias</ToolbarLabel>
            {([["todas", "Qualquer"], ["caindo", "Caindo"], ["subindo", "Subindo"]] as const).map(([v, l]) => (
              <Chip key={v} active={trend === v} onClick={() => setTrend(v as never)}>
                {l}
              </Chip>
            ))}
          </ToolbarRow>

          <ToolbarRow>
            <ToolbarLabel>Tipo</ToolbarLabel>
            {([["todos", "Todos"], ["lead_gen", "Lead Gen"], ["ecommerce", "E-commerce"], ["branding", "Branding"]] as const).map(
              ([v, l]) => (
                <Chip key={v} active={type === v} onClick={() => setType(v as never)}>
                  {l}
                </Chip>
              ),
            )}
            <ChipSep />
            <ToolbarLabel>Confiança</ToolbarLabel>
            {([["todas", "Toda"], ["alta", "Alta"], ["media", "Média"], ["baixa", "Baixa"]] as const).map(([v, l]) => (
              <Chip key={v} active={conf === v} onClick={() => setConf(v as never)}>
                {l}
              </Chip>
            ))}
            <ChipSep />
            <label className="flex flex-none items-center gap-1.5">
              <span className="chip-label">Responsável</span>
              <select
                className="field w-auto"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                aria-label="Responsável"
              >
                <option value="todos">GT / Account</option>
                {owners.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
            {ativos > 0 && (
              <>
                <span className="spacer" />
                <button type="button" onClick={limpar} className="chip">
                  <Icon name="x" size={13} />
                  Limpar {ativos}
                </button>
              </>
            )}
          </ToolbarRow>
        </Toolbar>
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
      <TableScroll tall>
        <table className="data-table is-dense is-pinned">
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
          {filtered.length > 0 && (
            <tfoot>
              <tr>
                <td>
                  TOTAL
                  <span className="ml-1.5 text-[11px] font-semibold text-ink-400">
                    {filtered.length} conta{filtered.length > 1 ? "s" : ""}
                  </span>
                </td>
                <td colSpan={6} className="text-[11px] font-semibold text-ink-400">
                  {porFiltro.vermelho} vermelho · {porFiltro.amarelo} amarelo · {porFiltro.verde} verde
                </td>
                <td className="tnum text-right">{brl(mrrShown)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </TableScroll>
      </div>
    </Panel>
  );
}
