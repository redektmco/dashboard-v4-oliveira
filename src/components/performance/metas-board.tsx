"use client";

import { ModularScreen } from "@/components/workspace/modular-screen";

import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { loadTargetSuggestions, saveClientTargets } from "@/actions";
import type { TargetSuggestion } from "@/lib/repo";
import type { CrmRow } from "@/lib/crm/board";
import { lineTone } from "@/lib/crm/forecast-view";
import { linkedSources, type SourceState } from "@/lib/crm/sources";
import { fmtBR, parseBR, type TargetField } from "@/lib/model/target-fields";
import { ConfigPage } from "../config-shell";
import { SidePanel } from "../side-panel";
import { toast } from "../toast";
import { Icon } from "../icon";
import { ColLabel, Letter, PageTitle, Pill, type Tone } from "../kit";
import { BAND_STYLE } from "../ui";
import { Block, CrmQuickPanel } from "../crm/crm-quick-panel";

export type MetaRow = {
  /** A mesma linha de Clientes e da ficha: score, forecast × realizado, fontes e conexões. */
  crm: CrmRow;
  fields: TargetField[];
  targets: Record<string, number>;
};

type Filter = "todos" | "sem_meta" | "sem_fonte";

const FILTER_LABEL: Record<Filter, string> = { todos: "clientes", sem_meta: "sem forecast", sem_fonte: "sem fonte de dados" };

const first = (n: string | null) => (n ? n.trim().split(/\s+/)[0] : "—");

const noop = () => () => {};
/** true só no navegador — o painel é um portal e não existe no HTML do servidor. */
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

const hasMeta = (r: MetaRow) => r.fields.some((f) => r.targets[f.key] !== undefined);
const sourcesOf = (r: MetaRow) => linkedSources(r.crm.sources);

/** Mesmas cores da aba Forecast e fontes da ficha. */
export const SOURCE_TONE: Record<SourceState, Tone> = { conectada: "verde", erro: "vermelho", pendente: "amarelo" };
const ACTUAL_TONE: Record<string, string> = {
  verde: "text-verde-fg",
  amarelo: "text-amarelo-fg",
  vermelho: "text-vermelho-fg",
  neutro: "text-ink-100",
};

/**
 * Performance › Metas: uma linha por conta com o forecast × realizado (o que
 * o score leu), as fontes de dados e a saúde. O painel ao lado é o painel da
 * conta — o mesmo de Clientes — com o forecast editável e a configuração das
 * fontes e do webhook do CRM. No filtro "Sem forecast", "Salvar e ir para a
 * próxima" zera a fila.
 */
export function MetasBoard({
  rows,
  weekLabel,
  isAdmin,
  metaReady,
  linkedAccounts,
  googleReady,
  linkedGoogle,
}: {
  rows: MetaRow[];
  weekLabel: string;
  isAdmin: boolean;
  metaReady: boolean;
  linkedAccounts: string[];
  googleReady: boolean;
  linkedGoogle: string[];
}) {
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
    sem_fonte: rows.filter((r) => !sourcesOf(r).length),
  };
  const list = lists[filter];

  // Links da ficha do cliente, de Clientes e das pendências: ?c=<id> abre a conta.
  const cParam = params.get("c");
  const [handled, setHandled] = useState<string | null>(null);
  if (handled !== cParam) {
    setHandled(cParam);
    if (cParam && rows.some((r) => r.crm.id === Number(cParam))) setSelected(Number(cParam));
  }

  const row = rows.find((r) => r.crm.id === selected) ?? null;
  const idx = row ? list.findIndex((r) => r.crm.id === row.crm.id) : -1;
  const nextId = filter === "sem_meta" && idx >= 0 && list.length > 1 ? list[(idx + 1) % list.length].crm.id : null;

  const go = (step: number) => {
    if (!list.length) return;
    const i = idx < 0 ? 0 : (idx + step + list.length) % list.length;
    setSelected(list[i].crm.id);
  };

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
            O número da semana vem das integrações — Meta Ads, Google Ads e CRM (leads e vendas) —, sem preenchimento manual. Aqui fica a régua:
            o forecast de cada conta, ao lado do realizado que o score leu. Última semana fechada:{" "}
            <strong className="text-ink-100">{weekLabel}</strong>.
          </>
        }
      />

      <ModularScreen screen="performance" modules={[
{ id: "filters", label: "Filtros de performance", kind: "filters", defaultWidth: 'full' as const, content: <><div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:px-0">
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
      </div></> },
{ id: "forecast", label: "Forecast e fontes", kind: "list", defaultWidth: 'full' as const, content: <><div className="overflow-hidden rounded-xl border border-[var(--border-hair)] bg-ink-900">
        <div className="hidden h-[37.5px] items-center gap-4 border-b border-[var(--border-hair)] px-4 md:flex">
          <ColLabel className="w-[220px] shrink-0">Cliente</ColLabel>
          <ColLabel className="flex-1">Realizado / forecast</ColLabel>
          <ColLabel className="w-[170px] shrink-0">Fontes de dados</ColLabel>
          <ColLabel className="w-[96px] shrink-0 text-right">Saúde</ColLabel>
          <span className="w-3.5" />
        </div>
        {list.map((r, i) => {
          const c = r.crm;
          const on = c.id === selected;
          const meta = hasMeta(r);
          const set = c.forecast.filter((f) => f.target !== null);
          const sources = sourcesOf(r);
          const band = c.band ? BAND_STYLE[c.band] : null;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(c.id)}
              className={`relative flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors md:min-h-[58px] md:flex-row md:items-center md:gap-4 md:py-2.5 ${
                on ? "bg-ink-850" : "hover:bg-ink-850/60"
              } ${i < list.length - 1 ? "border-b border-[var(--border-hair)]" : ""}`}
            >
              {on && <span className="absolute inset-y-0 left-0 w-0.5 bg-v4-red" aria-hidden />}
              <span className="flex min-w-0 items-center gap-2.5 md:w-[220px] md:shrink-0">
                <Letter name={c.name} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-medium text-ink-100">{c.name}</span>
                  <span className="truncate text-[11px] text-ink-400">
                    {c.typeLabel} · GT {first(c.gtName)}
                  </span>
                </span>
                <Icon name="chevronRight" size={14} className="shrink-0 text-ink-500 md:hidden" />
              </span>

              <span className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1 text-[12px]">
                {meta ? (
                  set.map((f) => (
                    <span key={f.key} className="whitespace-nowrap text-ink-400" title={f.note ?? f.period}>
                      {f.label}{" "}
                      <span className={`tnum font-semibold ${ACTUAL_TONE[lineTone(f.score)]}`}>{f.actual ?? "—"}</span>
                      <span className="tnum text-ink-500"> / {f.target}</span>
                    </span>
                  ))
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-vermelho-fg">
                    <Icon name="alertCircle" size={13} />
                    Sem forecast — o score não é calculado
                  </span>
                )}
              </span>

              <span className="flex flex-wrap gap-1 md:w-[170px] md:shrink-0">
                {sources.length ? (
                  sources.map((s) => (
                    <Pill key={s.id} tone={SOURCE_TONE[s.state]}>
                      {s.name}
                    </Pill>
                  ))
                ) : (
                  <Pill tone="vermelho">Nenhuma</Pill>
                )}
              </span>

              <span className="flex items-baseline gap-1.5 md:w-[96px] md:shrink-0 md:justify-end">
                <span className="tnum text-[14px] font-semibold text-ink-100">{c.score === null ? "—" : Math.round(c.score)}</span>
                <span className={`text-[11px] font-medium ${band ? band.fg : "text-ink-500"}`}>{band ? band.label : "Sem score"}</span>
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
      </div></> }
]} />

      <SidePanel open={Boolean(row) && mounted} onClose={close} label="Forecast e fontes da conta" width={460}>
        {row && (
          <AccountPanel
            key={row.crm.id}
            row={row}
            position={idx >= 0 ? { i: idx + 1, n: list.length } : null}
            nextId={nextId}
            onNext={setSelected}
            onPrev={() => go(-1)}
            onFwd={() => go(1)}
            onClose={close}
            isAdmin={isAdmin}
            metaReady={metaReady}
            linkedAccounts={linkedAccounts}
            googleReady={googleReady}
            linkedGoogle={linkedGoogle}
          />
        )}
      </SidePanel>
    </ConfigPage>
  );
}

/**
 * O painel da conta (mesmo desenho do de Clientes) com o forecast editável
 * no lugar do resumo e o rodapé de salvar.
 */
function AccountPanel({
  row,
  position,
  nextId,
  onNext,
  onPrev,
  onFwd,
  onClose,
  isAdmin,
  metaReady,
  linkedAccounts,
  googleReady,
  linkedGoogle,
}: {
  row: MetaRow;
  position: { i: number; n: number } | null;
  nextId: number | null;
  onNext: (id: number) => void;
  onPrev: () => void;
  onFwd: () => void;
  onClose: () => void;
  isAdmin: boolean;
  metaReady: boolean;
  linkedAccounts: string[];
  googleReady: boolean;
  linkedGoogle: string[];
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(row.fields.map((f) => [f.key, row.targets[f.key] !== undefined ? fmtBR(row.targets[f.key], f.decimals) : ""])),
  );
  const [suggestions, setSuggestions] = useState<TargetSuggestion[] | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let alive = true;
    loadTargetSuggestions(row.crm.id).then((s) => alive && setSuggestions(s));
    return () => {
      alive = false;
    };
  }, [row.crm.id]);

  const sug = useMemo(() => new Map((suggestions ?? []).map((s) => [s.key, s])), [suggestions]);
  const actual = useMemo(() => new Map(row.crm.forecast.map((f) => [f.key, f])), [row.crm.forecast]);
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
        const r = await saveClientTargets(row.crm.id, payload);
        if (r?.error) {
          toast(r.error, { tone: "error" });
          return;
        }
        if (r?.ok) toast(r.ok);
      }
      if (thenNext && nextId) onNext(nextId);
    });

  const forecast = (
    <Block
      title="Forecast semanal"
      action={
        anySuggestion ? (
          <button type="button" onClick={applySuggestion} className="flex items-center gap-1 text-[12px] font-semibold text-ink-300 hover:text-ink-100">
            <Icon name="sparkles" size={13} />
            Sugestão 90d +10%
          </button>
        ) : undefined
      }
    >
      <p className="text-[12px] text-ink-400">Vale a partir de hoje e é a base das réguas do score. Embaixo de cada campo, o realizado que o score leu.</p>
      <div className="grid grid-cols-2 gap-3 pt-1">
        {row.fields.map((f) => {
          const s = sug.get(f.key);
          const a = actual.get(f.key);
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
              <span className="flex flex-col text-[11px] leading-[15px] text-ink-400">
                <span title={a?.note}>
                  realizado:{" "}
                  <span className={`tnum ${ACTUAL_TONE[lineTone(a?.score ?? null)]}`}>{a?.actual ?? "—"}</span>
                  {a?.period ? ` · ${a.period}` : ""}
                </span>
                <span>
                  {suggestions === null ? "…" : s?.avg != null ? `média 90d: ${fmtBR(Math.round(s.avg * 10) / 10, f.decimals)}` : "sem histórico"}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </Block>
  );

  const footer = (
    <footer className="flex items-center gap-2 border-t border-[var(--border-hair)] px-4 py-3">
      <Link href={`/clientes/${row.crm.id}`} className="btn">
        Abrir ficha
        <Icon name="arrowRight" size={15} />
      </Link>
      <span className="flex-1" />
      {nextId && (
        <button type="button" className="btn" disabled={pending} onClick={() => save(true)}>
          {dirty ? "Salvar e próxima" : "Próxima"}
        </button>
      )}
      <button type="button" className="btn btn-primary" disabled={!dirty || pending} aria-busy={pending} onClick={() => save(false)}>
        {pending && <span className="spinner" aria-hidden />}
        Salvar metas
      </button>
    </footer>
  );

  return (
    <CrmQuickPanel
      row={row.crm}
      eyebrow="Forecast e fontes"
      forecast={forecast}
      footer={footer}
      position={position}
      onPrev={onPrev}
      onNext={onFwd}
      onClose={onClose}
      isAdmin={isAdmin}
      metaReady={metaReady}
      linkedAccounts={linkedAccounts}
      googleReady={googleReady}
      linkedGoogle={linkedGoogle}
    />
  );
}
