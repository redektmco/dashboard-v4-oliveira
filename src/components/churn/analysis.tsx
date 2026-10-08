"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  OUTCOME,
  REASONS,
  STRATEGIES,
  dateBr,
  money,
  moneyK,
  monthsBetween,
  reasonLabel,
  strategyLabel,
  tenure,
  type AttemptResult,
  type ChurnRequest,
} from "@/lib/churn/types";
import { Icon } from "../icon";
import { FilterSelect, Switch, downloadCsv } from "./controls";
import { CHURN_TABS, ChurnHeader, TonePill } from "./ui";

type Period = "ytd" | "12m" | "6m" | "prev";
type Attempt = { requestId: number; strategy: string; result: AttemptResult; at: string };
type Win = { from: string; to: string };

const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const closedDay = (r: ChurnRequest) => (r.closed_at ?? r.updated_at).slice(0, 10);
const shiftYear = (iso: string, n: number) => `${Number(iso.slice(0, 4)) + n}${iso.slice(4)}`;
const monthLabel = (ym: string) => MES[Number(ym.slice(5, 7)) - 1];
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const BUCKETS: [string, number, number][] = [
  ["< 6m", 0, 6],
  ["6–12m", 6, 12],
  ["1–2a", 12, 24],
  ["2–3a", 24, 36],
  ["> 3a", 36, Infinity],
];

function windowOf(p: Period, today: string): Win {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const back = (months: number) => {
    const d = new Date(Date.UTC(y, m - 1 - (months - 1), 1));
    return d.toISOString().slice(0, 10);
  };
  if (p === "ytd") return { from: `${y}-01-01`, to: today };
  if (p === "prev") return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  return { from: back(p === "12m" ? 12 : 6), to: today };
}

function monthsOf(w: Win) {
  const out: string[] = [];
  let [y, m] = [Number(w.from.slice(0, 4)), Number(w.from.slice(5, 7))];
  const end = w.to.slice(0, 7);
  while (`${y}-${String(m).padStart(2, "0")}` <= end) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

const winLabel = (w: Win) => {
  const a = `${MES[Number(w.from.slice(5, 7)) - 1]}${w.from.slice(0, 4) !== w.to.slice(0, 4) ? ` ${w.from.slice(0, 4)}` : ""}`;
  return `${a} – ${MES[Number(w.to.slice(5, 7)) - 1]} ${w.to.slice(0, 4)}`;
};

/**
 * Churn 06 — por que os clientes saem e quanto a retenção funciona. Tudo é
 * calculado sobre as solicitações concluídas (retidas e canceladas), pela
 * data de conclusão; a comparação usa a mesma janela do ano anterior.
 */
export function ChurnAnalysis({
  requests,
  attempts,
  clients,
  owners,
  today,
}: {
  requests: ChurnRequest[];
  attempts: Attempt[];
  clients: { id: number; active: boolean; services: string[] }[];
  owners: string[];
  today: string;
}) {
  const [period, setPeriod] = useState<Period>("ytd");
  const [owner, setOwner] = useState("todos");
  const [service, setService] = useState("todos");
  const [reason, setReason] = useState("todos");
  const [compare, setCompare] = useState(true);
  const [tab, setTab] = useState<"todas" | "cancelado" | "retido">("todas");
  const [all, setAll] = useState(false);

  const win = windowOf(period, today);
  const prevWin = { from: shiftYear(win.from, -1), to: shiftYear(win.to, -1) };
  const services = useMemo(() => [...new Set(requests.flatMap((r) => r.services))].sort(), [requests]);

  const pick = (w: Win) =>
    requests.filter((r) => {
      const d = closedDay(r);
      return (
        d >= w.from &&
        d <= w.to &&
        (owner === "todos" || r.owner_name === owner) &&
        (service === "todos" || r.services.includes(service)) &&
        (reason === "todos" || (r.final_reason ?? r.main_reason) === reason)
      );
    });
  const cur = pick(win);
  const prev = pick(prevWin);
  const canc = cur.filter((r) => r.status === "cancelado");
  const ret = cur.filter((r) => r.status === "retido");
  const pCanc = prev.filter((r) => r.status === "cancelado");
  const pRet = prev.filter((r) => r.status === "retido");
  const lost = canc.reduce((a, r) => a + r.mrr, 0);
  const pLost = pCanc.reduce((a, r) => a + r.mrr, 0);
  const kept = ret.reduce((a, r) => a + (r.new_mrr ?? r.mrr), 0);
  const pKept = pRet.reduce((a, r) => a + (r.new_mrr ?? r.mrr), 0);
  const stay = (list: ChurnRequest[]) => list.map((r) => monthsBetween(r.client_since, r.effective_end ?? closedDay(r)) ?? 0);
  const stayNow = stay(canc);
  const avg = (l: number[]) => (l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : null);
  const median = (l: number[]) => {
    if (!l.length) return null;
    const s = [...l].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
  };
  const avgStay = avg(stayNow);
  const pAvgStay = avg(stay(pCanc));
  const success = pct(ret.length, cur.length);
  const pSuccess = pct(pRet.length, prev.length);

  // Volume por mês
  const months = monthsOf(win);
  const vol = months.map((ym) => ({
    ym,
    canc: canc.filter((r) => closedDay(r).startsWith(ym)).length,
    ret: ret.filter((r) => closedDay(r).startsWith(ym)).length,
    prev: pCanc.filter((r) => closedDay(r).startsWith(shiftYear(ym, -1))).length,
  }));
  const volMax = Math.max(1, ...vol.map((v) => Math.max(v.canc, v.ret, compare ? v.prev : 0)));
  const peak = vol.reduce((a, v) => (v.canc > a.canc ? v : a), vol[0] ?? { ym: "", canc: 0, ret: 0, prev: 0 });

  // Motivos (motivo final dos cancelados)
  const reasons = Object.keys(REASONS)
    .map((k) => {
      const l = canc.filter((r) => (r.final_reason ?? r.main_reason) === k);
      return { k, n: l.length, mrr: l.reduce((a, r) => a + r.mrr, 0) };
    })
    .filter((x) => x.n)
    .sort((a, b) => b.n - a.n || b.mrr - a.mrr);
  const reasonMax = Math.max(1, ...reasons.map((r) => r.n));

  // Serviços: cancelamentos ÷ contratos com o serviço no período
  const svc = services
    .map((s) => {
      const l = canc.filter((r) => r.services.includes(s));
      const base = clients.filter((c) => c.services.includes(s) && c.active).length + l.length;
      return { s, n: l.length, rate: pct(l.length, base), mrr: l.reduce((a, r) => a + r.mrr, 0) };
    })
    .filter((x) => x.n)
    .sort((a, b) => b.rate - a.rate || b.n - a.n);
  const rateMax = Math.max(1, ...svc.map((x) => x.rate));

  // Retenção por estratégia (tentativas respondidas no período)
  const curIds = new Set(cur.map((r) => r.id));
  const strat = Object.keys(STRATEGIES)
    .map((k) => {
      const l = attempts.filter((a) => a.strategy === k && a.result !== "aguardando" && curIds.has(a.requestId));
      const ok = l.filter((a) => a.result === "aceita" || a.result === "contraproposta_aceita").length;
      return { k, total: l.length, ok };
    })
    .filter((x) => x.total)
    .sort((a, b) => b.ok / b.total - a.ok / a.total);

  // Permanência até o cancelamento
  const buckets = BUCKETS.map(([label, a, b]) => ({ label, n: stayNow.filter((m) => m >= a && m < b).length }));
  const bMax = Math.max(1, ...buckets.map((b) => b.n));
  const topBucket = buckets.reduce((a, b) => (b.n > a.n ? b : a), buckets[0]);

  // Histórico
  const hist = [...cur].filter((r) => tab === "todas" || r.status === tab).sort((a, b) => closedDay(b).localeCompare(closedDay(a)));
  const shown = all ? hist : hist.slice(0, 7);

  const exportCsv = () =>
    downloadCsv(
      `churn-historico-${today}.csv`,
      ["Solicitação", "Cliente", "Contrato", "Resultado", "Motivo final", "Serviços", "Responsável", "Concluída em", "Permanência (meses)", "Tentativas", "MRR"],
      hist.map((r) => [
        r.code,
        r.client_name,
        r.contract_code ?? "",
        r.outcome ? OUTCOME[r.outcome].short : r.status,
        reasonLabel(r.final_reason ?? r.main_reason),
        r.services.join(" + "),
        r.owner_name ?? "",
        closedDay(r),
        monthsBetween(r.client_since, r.effective_end ?? closedDay(r)) ?? "",
        r.attempts,
        r.status === "cancelado" ? -r.mrr : (r.new_mrr ?? r.mrr),
      ]),
    );

  const periods: { value: Period; label: string }[] = (["ytd", "12m", "6m", "prev"] as Period[]).map((p) => ({ value: p, label: winLabel(windowOf(p, today)) }));

  return (
    <>
      <ChurnHeader
        crumbs={[{ href: "/churn", label: "Churn" }]}
        title="Histórico e análise"
        tabs={CHURN_TABS}
        description="Entenda por que os clientes saem e quanto as tentativas de retenção estão funcionando."
        actions={
          <button type="button" className="btn" onClick={exportCsv}>
            <Icon name="download" size={15} />
            Exportar
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect label="Período" value={period} options={periods} onChange={setPeriod} active />
        <FilterSelect label="Responsável" value={owner} active={owner !== "todos"} options={[{ value: "todos", label: "Todos" }, ...owners.map((o) => ({ value: o, label: o }))]} onChange={setOwner} />
        <FilterSelect label="Serviço" value={service} active={service !== "todos"} options={[{ value: "todos", label: "Todos" }, ...services.map((s) => ({ value: s, label: s }))]} onChange={setService} />
        <FilterSelect
          label="Motivo"
          value={reason}
          active={reason !== "todos"}
          options={[{ value: "todos", label: "Todos" }, ...Object.entries(REASONS).map(([value, label]) => ({ value, label }))]}
          onChange={setReason}
        />
        <span className="flex-1" />
        <label className="flex items-center gap-2 text-[12px] text-ink-100">
          <Switch checked={compare} onChange={setCompare} label="Comparar com o ano anterior" />
          Comparar com {winLabel(prevWin)}
        </label>
      </div>

      {/* --------------------------------- KPIs --------------------------------- */}
      <section className="grid grid-cols-2 overflow-hidden rounded-xl border border-[var(--border-hair)] bg-ink-900 md:grid-cols-3 xl:grid-cols-6" aria-label="Indicadores">
        <Kpi label="Cancelamentos efetivados" value={String(canc.length)} unit="clientes" delta={compare ? deltaN(canc.length, pCanc.length, true) : null} prev={`vs. ${pCanc.length}`} compare={compare} />
        <Kpi label="Clientes retidos" value={String(ret.length)} unit="clientes" delta={compare ? deltaN(ret.length, pRet.length, false) : null} prev={`vs. ${pRet.length}`} compare={compare} />
        <Kpi
          label="Sucesso da retenção"
          value={`${success}%`}
          unit={`${ret.length} de ${cur.length}`}
          delta={compare && prev.length ? { text: `${success - pSuccess >= 0 ? "+" : "−"}${Math.abs(success - pSuccess)} p.p.`, good: success >= pSuccess } : null}
          prev={`vs. ${pSuccess}%`}
          compare={compare}
        />
        <Kpi label="Receita recorrente perdida" value={moneyK(lost)} unit="/mês" delta={compare ? deltaPct(lost, pLost, true) : null} prev={`vs. ${moneyK(pLost)}`} compare={compare} />
        <Kpi label="Receita preservada" value={moneyK(kept)} unit="/mês" delta={compare ? deltaPct(kept, pKept, false) : null} prev={`vs. ${moneyK(pKept)}`} compare={compare} />
        <Kpi
          label="Permanência média"
          value={avgStay === null ? "—" : `${avgStay} ${avgStay === 1 ? "mês" : "meses"}`}
          delta={compare && avgStay !== null && pAvgStay !== null ? { text: `${avgStay - pAvgStay >= 0 ? "+" : "−"}${Math.abs(avgStay - pAvgStay)} m`, good: avgStay >= pAvgStay } : null}
          prev={pAvgStay === null ? "sem base" : `vs. ${pAvgStay} meses`}
          compare={compare}
        />
      </section>

      {/* ------------------------- volume + motivos ------------------------- */}
      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card title="Volume de solicitações concluídas" subtitle={`Por mês de conclusão${compare ? ` · ${win.from.slice(0, 4)} vs. mesmo período de ${prevWin.from.slice(0, 4)}` : ""}`}
          legend={
            <span className="flex flex-wrap gap-3.5">
              {compare && <Legend cls="bg-ink-700" label={`Cancelados ${prevWin.from.slice(0, 4)}`} />}
              <Legend cls="bg-vermelho" label={`Cancelados ${win.to.slice(0, 4)}`} />
              <Legend cls="bg-verde" label={`Retidos ${win.to.slice(0, 4)}`} />
            </span>
          }
        >
          <div className="flex gap-2">
            <div className="flex h-[150px] w-5 flex-col justify-between text-right text-[11px] text-ink-500" aria-hidden>
              {[volMax, Math.round(volMax / 2), 0].filter((v, i, a) => a.indexOf(v) === i).map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex h-[150px] items-end justify-around gap-1 border-b border-ink-700">
                {vol.map((v) => (
                  <div key={v.ym} className="flex h-full items-end gap-[2px]" title={`${monthLabel(v.ym)}: ${v.canc} cancelados, ${v.ret} retidos${compare ? ` · ${v.prev} cancelados em ${Number(v.ym.slice(0, 4)) - 1}` : ""}`}>
                    {compare && <Col h={v.prev / volMax} cls="bg-ink-700" />}
                    <Col h={v.canc / volMax} cls="bg-vermelho" />
                    <Col h={v.ret / volMax} cls="bg-verde" />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-around text-[11px] text-ink-500">
                {vol.map((v) => (
                  <span key={v.ym} className={v.ym === peak.ym && peak.canc > 0 ? "text-ink-100" : ""}>
                    {monthLabel(v.ym)}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <p className="flex items-start gap-2 rounded-lg bg-ink-850 px-3 py-2.5 text-[12px] text-ink-300">
            <Icon name="info" size={14} className="mt-px shrink-0" />
            {peak.canc > 0
              ? `Pico em ${monthLabel(peak.ym).toLowerCase()}: ${peak.canc} ${peak.canc === 1 ? "cancelamento" : "cancelamentos"}. ${ret.length} ${ret.length === 1 ? "conta retida" : "contas retidas"} no período${compare ? ` (${pRet.length} no ano anterior)` : ""}.`
              : "Nenhum cancelamento concluído no período."}
          </p>
        </Card>

        <Card title="Principais motivos de saída" subtitle={`Motivo final · ${canc.length} ${canc.length === 1 ? "cancelamento efetivado" : "cancelamentos efetivados"}`}>
          {reasons.length === 0 && <Empty />}
          <ul className="flex flex-col gap-3.5">
            {reasons.map((r, i) => (
              <li key={r.k} className="flex flex-col gap-[7px]" title={`${reasonLabel(r.k)}: ${r.n} · ${money(r.mrr)}/mês`}>
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink-100">{reasonLabel(r.k)}</span>
                  <span className="text-[12px] text-ink-500">{moneyK(r.mrr)}</span>
                  <span className="tnum text-[12px] text-ink-100">
                    {r.n} · {pct(r.n, canc.length)}%
                  </span>
                </span>
                <span className="h-1.5 overflow-hidden rounded-[3px] bg-ink-800">
                  <span className={`block h-full rounded-[3px] ${i === 0 ? "bg-vermelho" : "bg-ink-500"}`} style={{ width: `${(r.n / reasonMax) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* ------------------- serviços + retenção + permanência ------------------- */}
      <div className="grid items-stretch gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_340px_300px]">
        <Card title="Serviços com maior incidência" subtitle="Taxa = cancelamentos ÷ contratos com o serviço no período">
          {svc.length === 0 ? (
            <Empty />
          ) : (
            <table className="w-full text-[12px]">
              <thead className="text-[11px] text-ink-500">
                <tr className="border-b border-[var(--border-hair)]">
                  <th className="pb-2 text-left font-normal">Serviço</th>
                  <th className="w-11 pb-2 text-left font-normal">Canc.</th>
                  <th className="w-[120px] pb-2 text-left font-normal">Taxa</th>
                  <th className="w-20 pb-2 text-left font-normal">MRR perdida</th>
                </tr>
              </thead>
              <tbody>
                {svc.map((x) => {
                  const hot = x.rate >= 10;
                  return (
                    <tr key={x.s} className="border-b border-[var(--border-hair)] last:border-b-0">
                      <td className="py-[9px] text-[13px] text-ink-100">{x.s}</td>
                      <td className="py-[9px] text-ink-300">{x.n}</td>
                      <td className="py-[9px]">
                        <span className="flex items-center gap-2">
                          <span className="h-1 w-[76px] overflow-hidden rounded-sm bg-ink-800">
                            <span className={`block h-full rounded-sm ${hot ? "bg-vermelho" : "bg-ink-500"}`} style={{ width: `${(x.rate / rateMax) * 100}%` }} />
                          </span>
                          <span className={hot ? "text-vermelho-fg" : "text-ink-100"}>{x.rate}%</span>
                        </span>
                      </td>
                      <td className="py-[9px] text-ink-300">{moneyK(x.mrr)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Sucesso da retenção" subtitle="Por estratégia · tentativas respondidas">
          {strat.length === 0 && <Empty />}
          <ul className="flex flex-col gap-3">
            {strat.map((s) => {
              const p = pct(s.ok, s.total);
              return (
                <li key={s.k} className="flex flex-col gap-1.5" title={`${strategyLabel(s.k)}: ${s.ok} de ${s.total} tentativas aceitas`}>
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink-100">{strategyLabel(s.k)}</span>
                    <span className="text-[12px] text-ink-500">
                      {s.ok}/{s.total}
                    </span>
                    <span className={`tnum w-9 text-right text-[12px] ${p >= 50 ? "text-verde-fg" : "text-ink-100"}`}>{p}%</span>
                  </span>
                  <span className="flex h-1.5 gap-[2px]">
                    {Array.from({ length: s.total }).map((_, i) => (
                      <span key={i} className={`flex-1 rounded-[2px] ${i < s.ok ? "bg-verde" : "bg-ink-800"}`} />
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card
          title="Permanência até o cancelamento"
          subtitle={avgStay === null ? "Sem cancelamentos no período" : `Média de ${avgStay} meses · mediana ${median(stayNow)}`}
        >
          <div className="flex flex-col gap-2">
            <div className="flex h-[120px] items-end gap-2.5 border-b border-ink-700">
              {buckets.map((b) => (
                <div key={b.label} className="flex h-full flex-1 flex-col items-center justify-end gap-[5px]" title={`${b.label}: ${b.n}`}>
                  <span className="tnum text-[11px] text-ink-100">{b.n}</span>
                  <span
                    className={`w-full rounded-t-[4px] ${b === topBucket && b.n > 0 ? "bg-ink-300" : "bg-ink-800"}`}
                    style={{ height: `${Math.max(b.n ? 6 : 2, (b.n / bMax) * 90)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2.5 text-[11px] text-ink-500">
              {buckets.map((b) => (
                <span key={b.label} className="flex-1 text-center">
                  {b.label}
                </span>
              ))}
            </div>
          </div>
          {canc.length > 0 && (
            <p className="text-[12px] text-ink-300">
              {pct(topBucket.n, canc.length)}% dos cancelamentos ocorreram com {topBucket.label} de contrato.
            </p>
          )}
        </Card>
      </div>

      {/* -------------------------------- histórico -------------------------------- */}
      <section className="overflow-hidden rounded-xl border border-[var(--border-hair)] bg-ink-900">
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3.5 pt-4">
          <div className="space-y-[3px]">
            <h2 className="text-[15px] font-semibold text-ink-100">Histórico de solicitações concluídas</h2>
            <p className="text-[12px] text-ink-500">{cur.length} concluídas no período · retidas e canceladas permanecem disponíveis para consulta</p>
          </div>
          <div className="flex gap-1.5">
            {(
              [
                ["todas", "Todas", cur.length],
                ["cancelado", "Canceladas", canc.length],
                ["retido", "Retidas", ret.length],
              ] as const
            ).map(([k, label, n]) => (
              <button
                key={k}
                type="button"
                aria-pressed={tab === k}
                onClick={() => setTab(k)}
                className={`flex h-[30px] items-center gap-1.5 rounded-lg px-[11px] text-[13px] ${tab === k ? "bg-ink-800 text-ink-100" : "text-ink-300 hover:text-ink-100"}`}
              >
                {label}
                <span className="tnum text-ink-500">{n}</span>
              </button>
            ))}
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[12px]">
            <thead className="border-y border-[var(--border-hair)] text-ink-500">
              <tr>
                {["Cliente", "Resultado", "Motivo final", "Serviço", "Responsável", "Concluída em", "Permanência", "Tent.", "MRR"].map((h) => (
                  <th key={h} className="px-3 py-[9px] text-left font-normal first:pl-5 last:pr-5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-[13px] text-ink-400">
                    Nenhuma solicitação concluída no período.
                  </td>
                </tr>
              )}
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border-hair)] hover:bg-ink-850/60">
                  <td className="py-[11px] pl-5 pr-3">
                    <Link href={`/churn/${r.id}`} className="block text-[13px] text-ink-100 hover:underline">
                      {r.client_name}
                    </Link>
                    <span className="text-[11px] text-ink-500">{r.contract_code ?? r.code}</span>
                  </td>
                  <td className="px-3 py-[11px]">
                    {r.outcome && <TonePill tone={OUTCOME[r.outcome].tone}>{r.outcome === "cancelado" ? "Cancelado" : OUTCOME[r.outcome].short}</TonePill>}
                  </td>
                  <td className="px-3 py-[11px] text-ink-300">{reasonLabel(r.final_reason ?? r.main_reason)}</td>
                  <td className="px-3 py-[11px] text-ink-300">{r.services[0] ?? "—"}</td>
                  <td className="px-3 py-[11px] text-ink-300">{r.owner_name?.split(" ")[0] ?? "—"}</td>
                  <td className="px-3 py-[11px] text-ink-300">{dateBr(closedDay(r))}</td>
                  <td className="px-3 py-[11px] text-ink-300">{tenure(r.client_since, r.effective_end ?? closedDay(r))}</td>
                  <td className={`px-3 py-[11px] ${r.attempts ? "text-ink-300" : "text-ink-500"}`}>{r.attempts}</td>
                  <td className={`py-[11px] pl-3 pr-5 ${r.status === "cancelado" ? "text-vermelho-fg" : "text-verde-fg"}`}>
                    {r.status === "cancelado" ? `− ${money(r.mrr)}` : `+ ${money(r.new_mrr ?? r.mrr)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="flex items-center justify-between gap-3 bg-ink-950/60 px-5 py-3">
          <span className="text-[12px] text-ink-500">
            Mostrando {shown.length} de {hist.length}
          </span>
          {hist.length > 7 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(!all)}>
              <Icon name={all ? "chevronUp" : "arrowRight"} size={14} />
              {all ? "Mostrar menos" : "Ver histórico completo"}
            </button>
          )}
        </footer>
      </section>
    </>
  );
}

function deltaN(cur: number, prev: number, lowerIsBetter: boolean) {
  const d = cur - prev;
  return { text: `${d >= 0 ? "+" : "−"}${Math.abs(d)}`, good: lowerIsBetter ? d <= 0 : d >= 0 };
}
function deltaPct(cur: number, prev: number, lowerIsBetter: boolean) {
  if (!prev) return null;
  const d = Math.round(((cur - prev) / prev) * 100);
  return { text: `${d >= 0 ? "+" : "−"}${Math.abs(d)}%`, good: lowerIsBetter ? d <= 0 : d >= 0 };
}

function Kpi({
  label,
  value,
  unit,
  delta,
  prev,
  compare,
}: {
  label: string;
  value: string;
  unit?: string;
  delta: { text: string; good: boolean } | null;
  prev: string;
  compare: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-r border-[var(--border-hair)] px-[18px] py-4 xl:border-b-0 xl:last:border-r-0">
      <span className="text-[12px] leading-4 text-ink-500 md:min-h-8">{label}</span>
      <span className="flex items-baseline gap-[5px]">
        <span className="tnum font-display text-[22px] font-semibold leading-none text-ink-100">{value}</span>
        {unit && <span className="text-[12px] text-ink-500">{unit}</span>}
      </span>
      {compare && (
        <span className="flex items-center gap-1.5 text-[12px]">
          {delta && <span className={delta.good ? "text-verde-fg" : "text-vermelho-fg"}>{delta.text}</span>}
          <span className="text-ink-500">{prev}</span>
        </span>
      )}
    </div>
  );
}

function Card({ title, subtitle, legend, children }: { title: string; subtitle: string; legend?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-[var(--border-hair)] bg-ink-900 px-5 pb-5 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-[3px]">
          <h2 className="text-[14px] font-semibold text-ink-100">{title}</h2>
          <p className="text-[12px] text-ink-500">{subtitle}</p>
        </div>
        {legend}
      </div>
      {children}
    </section>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-ink-300">
      <span className={`h-2 w-2 rounded-[2px] ${cls}`} />
      {label}
    </span>
  );
}

function Col({ h, cls }: { h: number; cls: string }) {
  return <span className={`w-2.5 rounded-t-[4px] sm:w-3 ${cls}`} style={{ height: h > 0 ? `${Math.max(3, h * 100)}%` : "0" }} />;
}

function Empty() {
  return <p className="py-6 text-center text-[12px] text-ink-500">Sem dados no período.</p>;
}
