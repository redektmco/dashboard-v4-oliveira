"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  REASONS,
  STATUS,
  addDays,
  dateLong,
  daysUntil,
  inDays,
  isOpen,
  money,
  reasonLabel,
  type ChurnRequest,
  type ChurnStatus,
} from "@/lib/churn/types";
import { Icon } from "../icon";
import { Initials } from "../kit";
import { CountChip, FilterSelect, downloadCsv } from "./controls";
import { TONE, TonePill } from "./ui";

type Period = "30" | "90" | "180" | "365" | "todos";
type Sort = "fim" | "solicitada" | "mrr" | "cliente";
type Chip = "todas" | "abertas" | ChurnStatus;

const PAGE = 10;
const PERIODS: { value: Period; label: string }[] = [
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "180", label: "Últimos 6 meses" },
  { value: "365", label: "Últimos 12 meses" },
  { value: "todos", label: "Todo o período" },
];
const SORTS: { value: Sort; label: string }[] = [
  { value: "fim", label: "Previsão de encerramento" },
  { value: "solicitada", label: "Solicitada em" },
  { value: "mrr", label: "Receita mensal" },
  { value: "cliente", label: "Cliente" },
];
const COLS = "lg:grid-cols-[minmax(0,1fr)_176px_150px_104px_92px_130px_100px_32px]";

/**
 * Tabela de solicitações (Churn 01): busca, filtros, chips por status e
 * ordenação. Solicitação aberta aparece sempre; o período recorta as
 * concluídas pela data de conclusão.
 */
export function RequestsBoard({ requests, owners, today }: { requests: ChurnRequest[]; owners: string[]; today: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<Period>("90");
  const [status, setStatus] = useState<"todos" | ChurnStatus>("todos");
  const [reason, setReason] = useState("todos");
  const [owner, setOwner] = useState("todos");
  const [chip, setChip] = useState<Chip>("todas");
  const [sort, setSort] = useState<Sort>("fim");
  const [page, setPage] = useState(0);

  const inPeriod = useMemo(() => {
    const since = period === "todos" ? "" : addDays(today, -Number(period));
    return requests.filter((r) => isOpen(r.status) || !since || (r.closed_at ?? r.updated_at).slice(0, 10) >= since);
  }, [requests, period, today]);

  const base = useMemo(() => {
    const term = q.trim().toLowerCase();
    return inPeriod.filter(
      (r) =>
        (status === "todos" || r.status === status) &&
        (reason === "todos" || r.main_reason === reason) &&
        (owner === "todos" || r.owner_name === owner) &&
        (!term || r.client_name.toLowerCase().includes(term) || (r.contract_code ?? "").toLowerCase().includes(term) || r.code.toLowerCase().includes(term)),
    );
  }, [inPeriod, q, status, reason, owner]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { todas: base.length, abertas: base.filter((r) => isOpen(r.status)).length };
    for (const s of Object.keys(STATUS)) c[s] = base.filter((r) => r.status === s).length;
    return c;
  }, [base]);

  const list = useMemo(() => {
    const out = base.filter((r) => chip === "todas" || (chip === "abertas" ? isOpen(r.status) : r.status === chip));
    const endOf = (r: ChurnRequest) => (isOpen(r.status) ? (r.desired_end ?? "9999") : "9999" + (r.effective_end ?? r.closed_at ?? ""));
    const cmp: Record<Sort, (a: ChurnRequest, b: ChurnRequest) => number> = {
      fim: (a, b) => endOf(a).localeCompare(endOf(b)),
      solicitada: (a, b) => b.requested_at.localeCompare(a.requested_at),
      mrr: (a, b) => b.mrr - a.mrr,
      cliente: (a, b) => a.client_name.localeCompare(b.client_name, "pt-BR"),
    };
    return out.sort(cmp[sort]);
  }, [base, chip, sort]);

  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = list.slice(cur * PAGE, cur * PAGE + PAGE);
  const reset = () => setPage(0);

  const exportCsv = () =>
    downloadCsv(
      `churn-solicitacoes-${today}.csv`,
      ["Solicitação", "Cliente", "Contrato", "Status", "Motivo principal", "Responsável", "Solicitada em", "Encerramento desejado", "Receita mensal"],
      list.map((r) => [
        r.code,
        r.client_name,
        r.contract_code ?? "",
        STATUS[r.status].label,
        reasonLabel(r.main_reason),
        r.owner_name ?? "",
        r.requested_at,
        r.effective_end ?? r.desired_end ?? "",
        r.mrr,
      ]),
    );

  const chips: { key: Chip; label: string; dot?: string }[] = [
    { key: "todas", label: "Todas" },
    { key: "abertas", label: "Abertas" },
    ...(Object.keys(STATUS) as ChurnStatus[]).map((s) => ({ key: s, label: STATUS[s].short, dot: TONE[STATUS[s].tone].dot })),
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border-hair)] bg-ink-900" aria-labelledby="sol-title">
      <header className="flex flex-col gap-3.5 px-4 pb-3.5 pt-[18px] sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-[3px]">
            <h2 id="sol-title" className="text-[15px] font-semibold text-ink-100">
              Solicitações de cancelamento
            </h2>
            <p className="flex items-center gap-1.5 text-[12px] text-ink-500">
              <Icon name="info" size={13} className="shrink-0" />
              Somente pedidos já realizados pelo cliente — este módulo não faz previsão de churn.
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={exportCsv}>
              <Icon name="download" size={14} />
              Exportar
            </button>
            <FilterSelect label="Ordenar por" value={sort} options={SORTS} onChange={(v) => (setSort(v), reset())} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative w-full sm:w-[260px]">
            <span className="sr-only">Buscar cliente ou contrato</span>
            <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
            <input
              value={q}
              onChange={(e) => (setQ(e.target.value), reset())}
              placeholder="Buscar cliente ou contrato…"
              className="field field--deep !h-8 !min-h-8 pl-9 !text-[13px]"
            />
          </label>
          <FilterSelect icon="calendar" label="Período" value={period} options={PERIODS} onChange={(v) => (setPeriod(v), reset())} active />
          <FilterSelect
            icon="circleDot"
            label="Status"
            value={status}
            active={status !== "todos"}
            options={[{ value: "todos", label: "Todos" }, ...(Object.keys(STATUS) as ChurnStatus[]).map((s) => ({ value: s, label: STATUS[s].label }))]}
            onChange={(v) => (setStatus(v), reset())}
          />
          <FilterSelect
            icon="tag"
            label="Motivo"
            value={reason}
            active={reason !== "todos"}
            options={[{ value: "todos", label: "Todos" }, ...Object.entries(REASONS).map(([value, label]) => ({ value, label }))]}
            onChange={(v) => (setReason(v), reset())}
          />
          <FilterSelect
            icon="user"
            label="Responsável"
            value={owner}
            active={owner !== "todos"}
            options={[{ value: "todos", label: "Todos" }, ...owners.map((o) => ({ value: o, label: o }))]}
            onChange={(v) => (setOwner(v), reset())}
          />
        </div>

        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {chips.map((c) => (
            <CountChip key={c.key} active={chip === c.key} onClick={() => (setChip(c.key), reset())} label={c.label} count={counts[c.key] ?? 0} dot={c.dot} />
          ))}
        </div>
      </header>

      <div className={`hidden gap-3.5 border-y border-[var(--border-hair)] px-5 py-[9px] text-[12px] text-ink-500 lg:grid ${COLS}`}>
        <span>Cliente / contrato</span>
        <span>Status</span>
        <span>Motivo principal</span>
        <span>Responsável</span>
        <span>Solicitada em</span>
        <span>Encerramento</span>
        <span>Receita mensal</span>
        <span />
      </div>

      {shown.length === 0 && (
        <div className="border-t border-[var(--border-hair)] px-5 py-12 text-center lg:border-t-0">
          <p className="text-[13px] text-ink-300">
            {requests.length === 0 ? "Nenhuma solicitação de cancelamento registrada." : "Nenhuma solicitação com esses filtros."}
          </p>
          {requests.length === 0 && (
            <Link href="/churn/nova" className="btn btn-light mt-4">
              <Icon name="plus" size={15} />
              Registrar a primeira
            </Link>
          )}
        </div>
      )}

      {shown.map((r) => (
        <div
          key={r.id}
          role="link"
          tabIndex={0}
          onClick={() => router.push(`/churn/${r.id}`)}
          onKeyDown={(e) => e.key === "Enter" && router.push(`/churn/${r.id}`)}
          className={`grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-2 border-b border-[var(--border-hair)] px-4 py-[11px] hover:bg-ink-850/60 sm:px-5 ${COLS}`}
        >
          <div className="min-w-0">
            <Link href={`/churn/${r.id}`} className="block truncate text-[14px] text-ink-100" onClick={(e) => e.stopPropagation()}>
              {r.client_name}
            </Link>
            <span className="block truncate text-[12px] text-ink-500">
              {[r.contract_code ?? r.code, r.services.join(" + ")].filter(Boolean).join(" · ")}
            </span>
          </div>
          <div className="justify-self-end lg:justify-self-start">
            <TonePill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</TonePill>
          </div>
          <span className="col-span-2 truncate text-[13px] text-ink-300 lg:col-span-1">{reasonLabel(r.main_reason)}</span>
          <span className="hidden min-w-0 items-center gap-2 lg:flex">
            <Initials name={r.owner_name} size={22} />
            <span className="truncate text-[13px] text-ink-300">{r.owner_name?.split(" ")[0] ?? "—"}</span>
          </span>
          <span className="hidden text-[13px] text-ink-300 lg:block">{dateLong(r.requested_at)}</span>
          <EndCell r={r} today={today} />
          <span className="flex items-baseline gap-0.5 justify-self-end lg:justify-self-start">
            <span className={`tnum text-[13px] ${r.status === "cancelado" ? "text-ink-500" : "text-ink-100"}`}>{money(r.mrr)}</span>
            <span className="text-[11px] text-ink-500">/mês</span>
          </span>
          <span className="hidden h-[30px] w-[30px] place-items-center rounded-lg bg-ink-850 text-ink-300 lg:grid" aria-hidden>
            <Icon name="chevronRight" size={14} />
          </span>
        </div>
      ))}

      <footer className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <span className="text-[12px] text-ink-500">
          Exibindo {shown.length} de {list.length} {list.length === 1 ? "solicitação" : "solicitações"} · {PERIODS.find((p) => p.value === period)!.label.toLowerCase()}
        </span>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-ink-500">
              Página {cur + 1} de {pages}
            </span>
            <button type="button" className="btn btn-sm btn-icon" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Página anterior">
              <Icon name="chevronLeft" size={14} />
            </button>
            <button type="button" className="btn btn-sm btn-icon" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Próxima página">
              <Icon name="chevronRight" size={14} />
            </button>
          </div>
        )}
      </footer>
    </section>
  );
}

function EndCell({ r, today }: { r: ChurnRequest; today: string }) {
  if (r.status === "retido")
    return (
      <span className="flex flex-col gap-0.5">
        <span className="hidden text-[13px] text-ink-500 lg:block">—</span>
        <span className="text-[12px] text-verde-fg">Retido em {dateLong((r.closed_at ?? r.updated_at).slice(0, 10)).slice(0, 6)}</span>
      </span>
    );
  if (r.status === "cancelado") {
    const future = r.effective_end && r.effective_end > today;
    return (
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] text-ink-300">{dateLong(r.effective_end)}</span>
        <span className="text-[12px] text-ink-500">{future ? `Encerra ${inDays(today, r.effective_end)}` : "Encerrado"}</span>
      </span>
    );
  }
  const d = r.desired_end ? daysUntil(today, r.desired_end) : null;
  const warn = d !== null && d <= 7;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-[13px] text-ink-300">{dateLong(r.desired_end)}</span>
      {d !== null && (
        <span className={`flex items-center gap-1 text-[12px] ${d < 0 ? "text-vermelho-fg" : warn ? "text-amarelo-fg" : "text-ink-500"}`}>
          {warn && <Icon name="clockAlert" size={12} />}
          {inDays(today, r.desired_end)}
        </span>
      )}
    </span>
  );
}
