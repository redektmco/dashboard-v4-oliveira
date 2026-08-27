"use client";

import { useMemo, useState } from "react";
import type { AccountType, Band, Confidence } from "@/lib/model/types";
import {
  BandChip,
  ClientLink,
  ConfidenceTag,
  Delta,
  Panel,
  ScoreBar,
  Sparkline,
  bandFg,
  brl,
} from "./ui";

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

  return (
    <Panel
      title="Carteira detalhada"
      subtitle={`${filtered.length} de ${rows.length} contas · ${brl(mrrShown)} de MRR no filtro`}
      right={
        <input
          className="field max-w-[200px]"
          placeholder="Buscar cliente…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      }
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-hair)] px-4 py-3">
        <Select label="Banda" value={band} onChange={(v) => setBand(v as never)}
          options={[["todas", "Todas as bandas"], ["vermelho", "Vermelho"], ["amarelo", "Amarelo"], ["verde", "Verde"]]} />
        <Select label="Confiança" value={conf} onChange={(v) => setConf(v as never)}
          options={[["todas", "Toda confiança"], ["alta", "Alta"], ["media", "Média"], ["baixa", "Baixa"]]} />
        <Select label="Tipo" value={type} onChange={(v) => setType(v as never)}
          options={[["todos", "Todos os tipos"], ["lead_gen", "Geração de Lead"], ["ecommerce", "E-commerce"], ["branding", "Branding"]]} />
        <Select label="Responsável" value={owner} onChange={setOwner}
          options={[["todos", "GT / Account"], ...owners.map((o) => [o, o] as [string, string])]} />
        <Select label="Tendência" value={trend} onChange={(v) => setTrend(v as never)}
          options={[["todas", "Qualquer tendência"], ["caindo", "Caindo (7d)"], ["subindo", "Subindo (7d)"]]} />
        <div className="ml-auto">
          <Select label="Ordenar" value={sort} onChange={(v) => setSort(v as SortKey)}
            options={[["risk", "Risco"], ["score", "Score"], ["delta", "Variação 7d"], ["mrr", "MRR"], ["renewal", "Renovação"], ["name", "Nome"]]} />
        </div>
      </div>

      <div className="overflow-x-auto">
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
      </div>
    </Panel>
  );
}

function Select({
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
    <label className="flex items-center gap-1.5">
      <span className="sr-only">{label}</span>
      <select
        className="field w-auto py-1.5 text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
