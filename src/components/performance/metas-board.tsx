"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { loadTargetSuggestions, saveClientTargets } from "@/actions";
import type { TargetSuggestion } from "@/lib/repo";
import { fmtBR, parseBR, type TargetField } from "@/lib/model/target-fields";
import { ConfigPage } from "../config-shell";
import { SidePanel } from "../side-panel";
import { toast } from "../toast";
import { Icon, type IconName } from "../icon";
import { ColLabel, Letter, PageTitle, Pill } from "../kit";

export type MetaRow = {
  id: number;
  name: string;
  typeLabel: string;
  gt: string | null;
  fields: TargetField[];
  targets: Record<string, number>;
  sources: { label: string; error: boolean }[];
  /** Semana-ritual em curso, como as integrações contaram. */
  week: { spend: number | null; leads: number | null } | null;
};

type Filter = "todos" | "sem_meta" | "sem_fonte";

const FILTER_LABEL: Record<Filter, string> = { todos: "clientes", sem_meta: "sem forecast", sem_fonte: "sem fonte de dados" };

const brl0 = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const first = (n: string | null) => (n ? n.trim().split(/\s+/)[0] : "—");

const noop = () => () => {};
/** true só no navegador — o painel é um portal e não existe no HTML do servidor. */
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

const hasMeta = (r: MetaRow) => r.fields.some((f) => r.targets[f.key] !== undefined);
const valueOf = (f: TargetField, v: number) => `${f.prefix ? `${f.prefix} ` : ""}${fmtBR(v, f.decimals)}${f.suffix ?? ""}`;

/**
 * Performance › Metas: uma linha por conta com a régua vigente e de onde vem
 * o número da semana. O painel ao lado ajusta as metas de uma conta — no
 * filtro "Sem forecast", com "Salvar e ir para a próxima" para zerar a fila.
 */
export function MetasBoard({ rows, weekLabel }: { rows: MetaRow[]; weekLabel: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialFilter = params.get("filtro") as Filter;
  const [filter, setFilter] = useState<Filter>(["todos", "sem_meta", "sem_fonte"].includes(initialFilter) ? initialFilter : "todos");
  const [selected, setSelected] = useState<number | null>(null);
  const mounted = useMounted();

  const lists: Record<Filter, MetaRow[]> = {
    todos: rows,
    sem_meta: rows.filter((r) => !hasMeta(r)),
    sem_fonte: rows.filter((r) => !r.sources.length),
  };
  const list = lists[filter];

  // Links da ficha do cliente e das pendências: ?c=<id> abre a conta.
  const cParam = params.get("c");
  const [handled, setHandled] = useState<string | null>(null);
  if (handled !== cParam) {
    setHandled(cParam);
    if (cParam && rows.some((r) => r.id === Number(cParam))) setSelected(Number(cParam));
  }

  const row = rows.find((r) => r.id === selected) ?? null;
  const idx = row ? list.findIndex((r) => r.id === row.id) : -1;
  const nextId = filter === "sem_meta" && idx >= 0 && list.length > 1 ? list[(idx + 1) % list.length].id : null;

  const close = () => {
    setSelected(null);
    if (params.get("c")) router.replace(pathname + (filter !== "todos" ? `?filtro=${filter}` : ""), { scroll: false });
  };

  const chips: { f: Filter; label: string; tone: "vermelho" | "neutro" }[] = [
    { f: "todos", label: "Todos", tone: "neutro" },
    { f: "sem_meta", label: "Sem forecast", tone: "vermelho" },
    { f: "sem_fonte", label: "Sem fonte de dados", tone: "vermelho" },
  ];

  return (
    <ConfigPage>
      <PageTitle
        title="Metas"
        description={
          <>
            O número da semana vem das integrações — Meta Ads, Google Ads e CRM —, sem preenchimento manual. Aqui fica a régua: a meta de cada conta.
            Semana em curso: <strong className="text-ink-100">{weekLabel}</strong>.
          </>
        }
      />

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

      <div className="overflow-hidden rounded-xl border border-[var(--border-hair)] bg-ink-900">
        <div className="hidden h-[37.5px] items-center gap-4 border-b border-[var(--border-hair)] px-4 md:flex">
          <ColLabel className="w-[220px] shrink-0">Cliente</ColLabel>
          <ColLabel className="flex-1">Forecast vigente</ColLabel>
          <ColLabel className="w-[170px] shrink-0">Fonte de dados</ColLabel>
          <ColLabel className="w-[120px] shrink-0 text-right">Semana em curso</ColLabel>
          <span className="w-3.5" />
        </div>
        {list.map((r, i) => {
          const on = r.id === selected;
          const meta = hasMeta(r);
          const set = r.fields.filter((f) => r.targets[f.key] !== undefined);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelected(r.id)}
              className={`relative flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors md:min-h-[58px] md:flex-row md:items-center md:gap-4 md:py-2.5 ${
                on ? "bg-ink-850" : "hover:bg-ink-850/60"
              } ${i < list.length - 1 ? "border-b border-[var(--border-hair)]" : ""}`}
            >
              {on && <span className="absolute inset-y-0 left-0 w-0.5 bg-v4-red" aria-hidden />}
              <span className="flex min-w-0 items-center gap-2.5 md:w-[220px] md:shrink-0">
                <Letter name={r.name} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-medium text-ink-100">{r.name}</span>
                  <span className="truncate text-[11px] text-ink-400">
                    {r.typeLabel} · GT {first(r.gt)}
                  </span>
                </span>
                <Icon name="chevronRight" size={14} className="shrink-0 text-ink-500 md:hidden" />
              </span>

              <span className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1 text-[12px] md:pl-0">
                {meta ? (
                  set.map((f) => (
                    <span key={f.key} className="whitespace-nowrap text-ink-400">
                      {f.label} <span className="tnum font-semibold text-ink-100">{valueOf(f, r.targets[f.key])}</span>
                    </span>
                  ))
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-vermelho-fg">
                    <Icon name="alertCircle" size={13} />
                    Sem meta — o score não é calculado
                  </span>
                )}
              </span>

              <span className="flex flex-wrap gap-1 md:w-[170px] md:shrink-0">
                {r.sources.length ? (
                  r.sources.map((s) => (
                    <Pill key={s.label} tone={s.error ? "amarelo" : "neutro"}>
                      {s.label}
                    </Pill>
                  ))
                ) : (
                  <Pill tone="vermelho">Nenhuma</Pill>
                )}
              </span>

              <span className="tnum flex gap-3 text-[12px] text-ink-300 md:w-[120px] md:shrink-0 md:flex-col md:items-end md:gap-0">
                {r.week ? (
                  <>
                    {r.week.leads !== null && <span>{r.week.leads} leads</span>}
                    {r.week.spend !== null && <span className="text-ink-400">{brl0(r.week.spend)}</span>}
                  </>
                ) : (
                  <span className="hidden text-ink-500 md:inline">—</span>
                )}
              </span>
              <Icon name="chevronRight" size={14} className={`hidden shrink-0 md:block ${on ? "text-ink-100" : "text-ink-500"}`} />
            </button>
          );
        })}
        {!list.length && (
          <p className="px-4 py-10 text-center text-[13px] text-ink-400">
            {filter === "todos" ? "Nenhum cliente ativo na carteira." : `Nenhum cliente ${FILTER_LABEL[filter]}. Tudo em dia.`}
          </p>
        )}
      </div>

      <SidePanel open={Boolean(row) && mounted} onClose={close} label="Forecast da conta" width={460}>
        {row && (
          <TargetsPanel
            key={row.id}
            row={row}
            position={idx >= 0 ? `${idx + 1} de ${list.length} ${FILTER_LABEL[filter]}` : "Fora da lista atual"}
            nextId={nextId}
            onNext={setSelected}
            onClose={close}
          />
        )}
      </SidePanel>
    </ConfigPage>
  );
}

function TargetsPanel({
  row,
  position,
  nextId,
  onNext,
  onClose,
}: {
  row: MetaRow;
  position: string;
  nextId: number | null;
  onNext: (id: number) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(row.fields.map((f) => [f.key, row.targets[f.key] !== undefined ? fmtBR(row.targets[f.key], f.decimals) : ""])),
  );
  const [suggestions, setSuggestions] = useState<TargetSuggestion[] | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    loadTargetSuggestions(row.id).then((s) => alive && setSuggestions(s));
    return () => {
      alive = false;
    };
  }, [row.id]);

  const sug = useMemo(() => new Map((suggestions ?? []).map((s) => [s.key, s])), [suggestions]);
  const anySuggestion = (suggestions ?? []).some((s) => s.suggestion !== null);
  const dirty = row.fields.some((f) => parseBR(values[f.key] ?? "") !== (row.targets[f.key] ?? null));

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
      if (thenNext && nextId) onNext(nextId);
    });

  const sourceIcon: IconName = row.sources.length ? "checkCircle" : "alertCircle";

  return (
    <>
      <header className="flex flex-col gap-3 border-b border-[var(--border-hair)] px-6 pb-5 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-ink-400">{position}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-strong)] bg-ink-850 text-ink-300 hover:text-ink-100"
          >
            <Icon name="x" size={15} />
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <Link href={`/clientes/${row.id}`} className="font-display text-[20px] font-semibold tracking-[-0.3px] text-ink-100 hover:underline">
            {row.name}
          </Link>
          <span className="text-[12px] text-ink-300">
            {row.typeLabel} · GT {first(row.gt)}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        <section className="flex items-start gap-3 rounded-lg bg-ink-850 px-3 py-2.5">
          <Icon name={sourceIcon} size={16} className={`mt-0.5 shrink-0 ${row.sources.length ? "text-verde-fg" : "text-vermelho-fg"}`} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[12px] font-semibold text-ink-100">
              {row.sources.length ? row.sources.map((s) => s.label).join(" · ") : "Nenhuma fonte de dados"}
            </span>
            <span className="text-[12px] text-ink-400">
              {row.sources.length
                ? "O número da semana chega sozinho e é medido contra o forecast abaixo."
                : "Sem integração o score fica sem o número da semana. Vincule Meta Ads, Google Ads ou CRM no painel do cliente, em Clientes."}
            </span>
          </div>
        </section>

        <section className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-ink-100">Forecast semanal</span>
            <span className="text-[12px] text-ink-400">Valem a partir de hoje e são a base das réguas do score.</span>
          </div>
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
        </section>
      </div>

      <footer className="flex items-center gap-2 border-t border-[var(--border-hair)] px-6 py-3.5">
        <button type="button" onClick={onClose} className="text-[13px] font-medium text-ink-300 hover:text-ink-100">
          Fechar
        </button>
        <span className="flex-1" />
        {nextId && (
          <button type="button" className="btn" disabled={pending} onClick={() => save(true)}>
            {dirty ? "Salvar e ir para a próxima" : "Próxima"}
            <Icon name="arrowRight" size={15} />
          </button>
        )}
        <button type="button" className="btn btn-primary" disabled={!dirty || pending} aria-busy={pending} onClick={() => save(false)}>
          {pending && <span className="spinner" aria-hidden />}
          Salvar metas
        </button>
      </footer>
    </>
  );
}
