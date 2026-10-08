"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ACCOUNT_TYPE_LABEL, type AccountType, type Band } from "@/lib/model/types";
import { Icon, type IconName } from "../icon";
import { Modal } from "../modal";
import { ScriptPanel, type Scale } from "../checkin-script";
import { BAND_TEXT, Initials, Pill } from "../kit";
import { PageHead } from "../page-head";

export type QueueRow = {
  id: number;
  name: string;
  type: AccountType;
  account: string | null;
  gt: string | null;
  lastDate: string | null;
  lastBy: string | null;
  /** Dias desde o último check-in; `null` = nunca registrado. */
  age: number | null;
  score: number | null;
  band: Band | null;
  risk: boolean;
};

type GroupBy = "account" | "gt" | "nenhum";
type Fresh = "fresca" | "vencendo" | "vencida" | "nunca";

const GROUP_LABEL: Record<GroupBy, string> = { account: "Account", gt: "GT", nenhum: "Nenhum" };
const NONE: Record<GroupBy, string> = { account: "Sem Account", gt: "Sem GT", nenhum: "Todas as contas" };
const BAND_ORDER: Record<Band, number> = { vermelho: 0, amarelo: 1, verde: 2 };
const FRESH_ORDER: Record<Fresh, number> = { nunca: 0, vencida: 0, vencendo: 1, fresca: 2 };
/** Faixa de "vencendo": a última semana antes do limite. */
const WARN_WINDOW = 7;

const FRESH_STYLE: Record<Fresh, { icon: IconName; color: string }> = {
  fresca: { icon: "checkCircle", color: "text-verde-fg" },
  vencendo: { icon: "clockAlert", color: "text-amarelo-fg" },
  vencida: { icon: "alertCircle", color: "text-vermelho-fg" },
  nunca: { icon: "circleDashed", color: "text-ink-500" },
};

function freshOf(r: QueueRow, limit: number): Fresh {
  if (r.age === null) return "nunca";
  if (r.age > limit) return "vencida";
  return r.age >= limit - WARN_WINDOW ? "vencendo" : "fresca";
}

const keyOf = (r: QueueRow, by: GroupBy) => (by === "account" ? r.account : by === "gt" ? r.gt : null) ?? "";

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Fila de check-in (lista da jornada do Account): cobertura de leitura,
 * contas agrupadas por responsável com a prioridade dentro de cada grupo e,
 * ao lado, as contas por onde começar.
 */
export function CheckinQueue({ rows, limit, scales }: { rows: QueueRow[]; limit: number; scales: Scale[] }) {
  const [groupBy, setGroupBy] = useState<GroupBy>("account");
  const [chip, setChip] = useState<string>("__todas");
  const [q, setQ] = useState("");
  const [script, setScript] = useState(false);
  const [picker, setPicker] = useState(false);

  const isFresh = (r: QueueRow) => r.age !== null && r.age <= limit;

  const fresh = rows.filter(isFresh).length;
  const never = rows.filter((r) => r.age === null).length;
  const criticalUnread = rows.filter((r) => r.band === "vermelho" && !isFresh(r)).length;
  const flags = rows.filter((r) => r.risk && isFresh(r)).length;

  // Comece por aqui: score baixo e nenhuma leitura recente que o confirme.
  const start = useMemo(
    () =>
      rows
        .filter((r) => !(r.age !== null && r.age <= limit) && (r.band === "vermelho" || r.band === "amarelo"))
        .sort((a, b) => BAND_ORDER[a.band!] - BAND_ORDER[b.band!] || (a.score ?? 0) - (b.score ?? 0))
        .slice(0, 4),
    [rows, limit],
  );

  const groups = useMemo(() => {
    const by = new Map<string, QueueRow[]>();
    for (const r of rows) by.set(keyOf(r, groupBy), [...(by.get(keyOf(r, groupBy)) ?? []), r]);
    const sortRows = (list: QueueRow[]) =>
      [...list].sort(
        (a, b) =>
          FRESH_ORDER[freshOf(a, limit)] - FRESH_ORDER[freshOf(b, limit)] ||
          (a.band ? BAND_ORDER[a.band] : 3) - (b.band ? BAND_ORDER[b.band] : 3) ||
          a.name.localeCompare(b.name, "pt-BR"),
      );
    return [...by.entries()]
      .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "pt-BR")))
      .map(([key, list]) => ({ key, label: key || NONE[groupBy], rows: sortRows(list) }));
  }, [rows, groupBy, limit]);

  const term = q.trim().toLowerCase();
  const visible = groups
    .filter((g) => chip === "__todas" || g.key === chip)
    .map((g) => ({ ...g, rows: term ? g.rows.filter((r) => r.name.toLowerCase().includes(term)) : g.rows }))
    .filter((g) => g.rows.length);
  const shownCount = visible.reduce((a, g) => a + g.rows.length, 0);
  const pct = rows.length ? (fresh / rows.length) * 100 : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ------------------------------ cabeçalho ------------------------------ */}
      <PageHead
        crumbs={[{ label: "Account" }]}
        title="Check-ins"
        description="Registre sua leitura do relacionamento logo após a call — cerca de 3 minutos por conta."
        actions={
          <>
            <label className="relative w-full sm:w-[240px]">
              <span className="sr-only">Buscar cliente</span>
              <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente…" className="field pl-9" />
            </label>
            <button type="button" className="btn btn-ghost" onClick={() => setScript(true)}>
              <Icon name="scrollText" size={15} />
              Roteiro da ligação
            </button>
            <button type="button" className="btn btn-light" onClick={() => setPicker(true)}>
              <Icon name="plus" size={15} />
              Registrar check-in
            </button>
          </>
        }
      />

      {/* ------------------------------ cobertura ------------------------------ */}
      <section className="flex flex-col gap-5 rounded-xl border border-[var(--border-hair)] bg-ink-900 px-5 py-5 lg:flex-row lg:items-center lg:gap-8 lg:px-6" aria-label="Cobertura de leitura">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] text-ink-300">Cobertura de leitura</span>
            <span className="text-[12px] text-ink-500">Leitura fresca = registrada nos últimos {limit} dias</span>
          </div>
          <div className="flex flex-wrap items-end gap-2.5">
            <span className="tnum font-display text-[28px] font-semibold leading-none text-ink-100">
              {fresh} de {rows.length}
            </span>
            <span className="text-[14px] text-ink-300">contas com leitura fresca</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-[3px] bg-ink-800">
            <div className="h-full rounded-[3px] bg-verde" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <span className="hidden h-16 w-px bg-[var(--border-hair)] lg:block" aria-hidden />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:flex lg:gap-8">
          <Metric dot="bg-ink-500" label="Nunca registradas" value={never} hint="Sem leitura não é risco" />
          <Metric dot="bg-vermelho" label="Score crítico sem leitura" value={criticalUnread} hint="Confirme estas primeiro" />
          <Metric dot="bg-amarelo" label="Flags de risco ativas" value={flags} hint="Cada flag gera plano de ação" />
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* -------------------------------- fila -------------------------------- */}
        <section className="min-w-0 overflow-hidden rounded-xl border border-[var(--border-hair)] bg-ink-900" aria-labelledby="fila-title">
          <header className="flex flex-col gap-3.5 px-4 pb-3.5 pt-[18px] sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 space-y-[3px]">
                <h2 id="fila-title" className="text-[15px] font-semibold text-ink-100">
                  Fila de check-in
                </h2>
                <p className="text-[12px] text-ink-500">
                  Agrupado por {GROUP_LABEL[groupBy]} · prioridade dentro do grupo · tipo exibido quando não for Geração de Lead
                </p>
              </div>
              <label className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border-hair)] px-2.5 text-[12px]">
                <span className="text-ink-500">Agrupar por</span>
                <select
                  value={groupBy}
                  onChange={(e) => {
                    setGroupBy(e.target.value as GroupBy);
                    setChip("__todas");
                  }}
                  className="cursor-pointer bg-transparent pr-1 font-medium text-ink-100 outline-none"
                >
                  {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => (
                    <option key={g} value={g} className="bg-ink-900">
                      {GROUP_LABEL[g]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {groupBy !== "nenhum" && (
              <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
                <QChip active={chip === "__todas"} onClick={() => setChip("__todas")} label="Todas" count={rows.length} />
                {groups.map((g) => (
                  <QChip key={g.key} active={chip === g.key} onClick={() => setChip(g.key)} label={g.label} count={g.rows.length} />
                ))}
              </div>
            )}
          </header>

          <div className="hidden grid-cols-[minmax(0,1fr)_160px_140px_96px] gap-4 border-y border-[var(--border-hair)] px-5 py-[9px] text-[12px] text-ink-500 md:grid">
            <span>Cliente</span>
            <span>Última leitura</span>
            <span>Score atual</span>
            <span />
          </div>

          {visible.length === 0 && (
            <p className="border-t border-[var(--border-hair)] px-5 py-10 text-center text-[13px] text-ink-400">
              Nenhuma conta encontrada{term ? ` para “${q.trim()}”` : ""}.
            </p>
          )}

          {visible.map((g) => {
            const read = g.rows.filter(isFresh).length;
            const orphan = g.key === "" && groupBy !== "nenhum";
            return (
              <div key={g.key}>
                {groupBy !== "nenhum" && (
                  <div className="flex flex-wrap items-center gap-2.5 border-b border-t border-[var(--border-hair)] bg-ink-850 px-4 py-2.5 first:border-t-0 sm:px-5 md:border-t-0">
                    {orphan ? <Icon name="userX" size={16} className="text-amarelo-fg" /> : <Initials name={g.label} size={22} />}
                    <span className="text-[13px] font-medium text-ink-100">{g.label}</span>
                    <span className="text-[12px] text-ink-500">
                      {g.rows.length} {g.rows.length === 1 ? "conta" : "contas"}
                    </span>
                    <span className="flex-1" />
                    {orphan ? (
                      <>
                        <span className="hidden text-[12px] text-amarelo-fg sm:inline">Sem responsável, ninguém faz a leitura</span>
                        <Link href="/clientes" className="btn btn-ghost btn-sm text-ink-100">
                          <Icon name="userPlus" size={14} />
                          Atribuir {GROUP_LABEL[groupBy]}
                        </Link>
                      </>
                    ) : (
                      <>
                        <span className="text-[12px] text-ink-500">
                          {read} de {g.rows.length} com leitura
                        </span>
                        <span className="h-1 w-16 overflow-hidden rounded-sm bg-ink-800">
                          <span className="block h-full bg-verde" style={{ width: `${(read / g.rows.length) * 100}%` }} />
                        </span>
                      </>
                    )}
                  </div>
                )}
                {g.rows.map((r) => (
                  <QueueLine key={r.id} r={r} fresh={freshOf(r, limit)} />
                ))}
              </div>
            );
          })}

          <footer className="flex flex-col gap-3 px-4 py-3.5 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
            <span className="text-[12px] text-ink-500">
              {term ? `${shownCount} de ${rows.length} contas` : `${rows.length} contas`}
              {groupBy !== "nenhum" && ` · ${groups.length} ${groups.length === 1 ? "grupo" : "grupos"}`}
            </span>
            <div className="flex flex-wrap gap-x-3.5 gap-y-1.5">
              <Legend fresh="fresca" label={`Fresca ≤ ${limit} dias`} />
              <Legend fresh="vencendo" label={`Vencendo ${limit - WARN_WINDOW}–${limit} dias`} />
              <Legend fresh="vencida" label={`Vencida > ${limit} dias`} />
              <Legend fresh="nunca" label="Nunca registrada" />
            </div>
          </footer>
        </section>

        {/* -------------------------------- lateral -------------------------------- */}
        <aside className="flex flex-col gap-4">
          <section className="flex flex-col gap-3.5 rounded-xl border border-[var(--border-hair)] bg-ink-900 p-[18px]" aria-labelledby="start-title">
            <div className="space-y-1">
              <h2 id="start-title" className="text-[14px] font-semibold text-ink-100">
                Comece por aqui
              </h2>
              <p className="text-[12px] text-ink-500">Contas com score baixo e nenhuma leitura que o confirme.</p>
            </div>
            {start.length ? (
              <>
                <ol className="flex flex-col">
                  {start.map((r, i) => (
                    <li key={r.id} className="border-b border-[var(--border-hair)] last:border-b-0">
                      <Link href={`/account/${r.id}`} className="group flex items-center gap-3 py-2.5">
                        <span className="tnum grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-ink-800 text-[11px] text-ink-300">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-ink-100 group-hover:underline">{r.name}</span>
                          <span className="flex items-center gap-1.5 text-[12px]">
                            <span className={r.band === "vermelho" ? "text-vermelho-fg" : "text-amarelo-fg"}>Score {r.score}</span>
                            <span className="text-ink-500">·</span>
                            <span className="truncate text-ink-500">{r.account ?? "Sem Account"}</span>
                          </span>
                        </span>
                        <Icon name="chevronRight" size={15} className="shrink-0 text-ink-500" />
                      </Link>
                    </li>
                  ))}
                </ol>
                <Link
                  href={`/account/${start[0].id}${start.length > 1 ? `?fila=${start.slice(1).map((r) => r.id).join(",")}` : ""}`}
                  className="btn btn-light w-full"
                >
                  <Icon name="listStart" size={15} />
                  {start.length > 1 ? `Registrar as ${start.length} em sequência` : "Registrar check-in"}
                </Link>
              </>
            ) : (
              <p className="flex items-center gap-2 rounded-lg bg-ink-850 p-3 text-[12px] text-ink-300">
                <Icon name="checkCircle" size={15} className="shrink-0 text-verde-fg" />
                Nenhuma conta com score baixo sem leitura recente.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-3.5 rounded-xl border border-[var(--border-hair)] bg-ink-900 p-[18px]" aria-labelledby="how-title">
            <h2 id="how-title" className="text-[14px] font-semibold text-ink-100">
              Como funciona o check-in
            </h2>
            <ol className="flex flex-col gap-3.5">
              <Step icon="phone" title="Durante a call">
                Use o roteiro só como guia. Nada é aplicado como questionário ao cliente.
              </Step>
              <Step icon="squarePen" title="Logo depois">
                6 avaliações de 1 a 5 e fatos objetivos. O rascunho é salvo automaticamente.
              </Step>
              <Step icon="flag" title="Se houver risco">
                A flag de risco gera um plano de ação com responsável e prazo.
              </Step>
            </ol>
            <Link href="/config/modelo/detalhes" className="flex w-fit items-center gap-1.5 text-[13px] text-ink-300 hover:text-ink-100">
              <Icon name="book" size={15} />
              Como a leitura afeta o score
            </Link>
          </section>
        </aside>
      </div>

      <ScriptPanel open={script} onClose={() => setScript(false)} scales={scales} />
      <ClientPicker open={picker} onClose={() => setPicker(false)} rows={rows} />
    </div>
  );
}

function Metric({ dot, label, value, hint }: { dot: string; label: string; value: number; hint: string }) {
  return (
    <div className="flex flex-col gap-1.5 lg:w-[190px]">
      <span className="flex items-center gap-[7px] text-[13px] text-ink-300">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {label}
      </span>
      <span className="tnum font-display text-[24px] font-semibold leading-none text-ink-100">{value}</span>
      <span className="text-[12px] text-ink-500">{hint}</span>
    </div>
  );
}

function QChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-[30px] shrink-0 items-center gap-1.5 rounded-lg px-[11px] text-[13px] transition-colors ${
        active ? "bg-ink-800 text-ink-100" : "text-ink-300 hover:bg-ink-850 hover:text-ink-100"
      }`}
    >
      {label}
      <span className="tnum text-ink-500">{count}</span>
    </button>
  );
}

function QueueLine({ r, fresh }: { r: QueueRow; fresh: Fresh }) {
  const st = FRESH_STYLE[fresh];
  const reading =
    fresh === "nunca" ? "Nunca registrada" : `${ddmm(r.lastDate!)} · ${fresh === "vencida" ? `vencida há ${r.age}d` : `há ${r.age}d`}`;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-[var(--border-hair)] px-4 py-[11px] sm:px-5 md:grid-cols-[minmax(0,1fr)_160px_140px_96px]">
      <div className="min-w-0">
        <Link href={`/clientes/${r.id}`} className="block truncate text-[14px] text-ink-100 hover:underline">
          {r.name}
        </Link>
        {(r.type !== "lead_gen" || r.risk) && (
          <span className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-500">
            {r.type !== "lead_gen" && ACCOUNT_TYPE_LABEL[r.type]}
            {r.risk && <span className="font-medium text-vermelho-fg">risco explícito</span>}
          </span>
        )}
      </div>
      <div className="order-3 col-span-2 flex items-center gap-[7px] md:order-none md:col-span-1" title={r.lastBy ? `Por ${r.lastBy}` : undefined}>
        <Icon name={st.icon} size={14} className={`shrink-0 ${st.color}`} />
        <span className={`truncate text-[13px] ${fresh === "vencida" ? "text-vermelho-fg" : "text-ink-300"}`}>{reading}</span>
      </div>
      <div className="order-4 col-span-2 flex items-center gap-2 md:order-none md:col-span-1">
        {r.score === null || !r.band ? (
          <span className="text-[13px] text-ink-500">Sem score</span>
        ) : (
          <>
            <span className="tnum w-6 text-[14px] text-ink-100">{r.score}</span>
            <Pill tone={r.band} className="!text-[11px] !py-[3px] !px-2">
              {BAND_TEXT[r.band]}
            </Pill>
          </>
        )}
      </div>
      <div className="flex justify-end">
        <Link href={`/account/${r.id}`} className="flex h-[30px] items-center gap-1.5 rounded-lg bg-ink-850 px-2.5 text-[12px] text-ink-100 hover:bg-ink-800">
          <Icon name="plus" size={13} />
          Registrar
        </Link>
      </div>
    </div>
  );
}

function Legend({ fresh, label }: { fresh: Fresh; label: string }) {
  const st = FRESH_STYLE[fresh];
  return (
    <span className="flex items-center gap-[5px] text-[11px] text-ink-500">
      <Icon name={st.icon} size={12} className={st.color} />
      {label}
    </span>
  );
}

function Step({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] bg-ink-850 text-ink-300">
        <Icon name={icon} size={14} />
      </span>
      <span className="flex flex-col gap-[3px]">
        <span className="text-[13px] text-ink-100">{title}</span>
        <span className="text-[12px] leading-[17px] text-ink-300">{children}</span>
      </span>
    </li>
  );
}

/** "Registrar check-in" do cabeçalho: escolhe a conta e abre o formulário. */
function ClientPicker({ open, onClose, rows }: { open: boolean; onClose: () => void; rows: QueueRow[] }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const list = [...rows]
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .filter((r) => !term || r.name.toLowerCase().includes(term));
  return (
    <Modal open={open} onClose={onClose} title="Registrar check-in" description="Escolha a conta da call que acabou de acontecer." size="sm">
      <label className="relative block">
        <span className="sr-only">Buscar cliente</span>
        <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente…" className="field pl-9" />
      </label>
      <ul className="mt-3 max-h-[340px] overflow-y-auto rounded-lg border border-[var(--border-hair)]">
        {list.map((r) => (
          <li key={r.id} className="border-b border-[var(--border-hair)] last:border-b-0">
            <Link href={`/account/${r.id}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px] text-ink-100 hover:bg-ink-850">
              <span className="truncate">{r.name}</span>
              <span className="shrink-0 text-[12px] text-ink-500">{r.account ?? "Sem Account"}</span>
            </Link>
          </li>
        ))}
        {list.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-ink-400">Nenhuma conta encontrada.</li>}
      </ul>
    </Modal>
  );
}
