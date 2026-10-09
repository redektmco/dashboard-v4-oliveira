"use client";

import { agoLabel, type CrmRow } from "@/lib/crm/board";
import { INTERACTION_LABEL } from "@/lib/crm/interactions";
import type { ColumnId } from "@/lib/crm/columns";
import { STAGE_LABEL } from "@/lib/model/types";
import { BAND_STYLE, brl } from "../ui";
import { Icon } from "../icon";

/**
 * O conteúdo de cada célula, isolado dos dois invólucros que o usam: a linha
 * da tabela (≥1024px) e o cartão do celular. Mudar como a saúde é mostrada é
 * mexer num lugar só.
 */

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const firstName = (n: string | null) => (n ? n.trim().split(/\s+/)[0] : null);

/* ------------------------------ saúde ------------------------------ */

export function Health({ row }: { row: CrmRow }) {
  const s = row.band ? BAND_STYLE[row.band] : null;
  if (!s) return <span className="text-[13px] text-ink-500">Sem score</span>;
  return (
    <span className="flex items-center gap-2">
      <span className="tnum text-[14px] font-semibold text-ink-100">{row.score === null ? "—" : Math.round(row.score)}</span>
      <span className={`truncate text-[12px] ${s.fg}`}>{s.label}</span>
      <Trend delta={row.delta7} />
    </span>
  );
}

export function Trend({ delta }: { delta: number | null }) {
  if (delta === null || Math.abs(delta) < 0.5) return <span className="text-[12px] text-ink-500">—</span>;
  const down = delta < 0;
  return (
    <span className={`tnum text-[12px] font-semibold ${down ? "text-vermelho-fg" : "text-verde-fg"}`}>
      {down ? "▼" : "▲"}
      {Math.abs(Math.round(delta))}
    </span>
  );
}

/* ------------------------------ etapa ------------------------------ */

const STAGE_TONE: Record<string, string> = {
  onboarding: "text-azul-fg",
  estavel: "text-ink-300",
  expansao: "text-verde-fg",
  renovacao: "text-amarelo-fg",
  retencao: "text-vermelho-fg",
};

export function StageCell({ row }: { row: CrmRow }) {
  return (
    <span className={`truncate text-[13px] ${STAGE_TONE[row.stage]}`} title={row.stageManual ? "Etapa definida à mão" : undefined}>
      {STAGE_LABEL[row.stage]}
      {row.stageManual && <span className="ml-1 text-ink-600">•</span>}
    </span>
  );
}

/* ------------------------- última interação ------------------------ */

export function LastInteraction({ row }: { row: CrmRow }) {
  if (!row.lastInteraction) return <span className="text-[13px] text-ink-500">Sem registro</span>;
  const { days, kind } = row.lastInteraction;
  // Mais de 21 dias sem contato é o que a tela precisa gritar.
  const cold = days > 21;
  return (
    <span className="flex min-w-0 flex-col">
      <span className={`truncate text-[13px] ${cold ? "text-amarelo-fg" : "text-ink-200"}`}>{agoLabel(days)}</span>
      <span className="truncate text-[12px] text-ink-500">{INTERACTION_LABEL[kind]}</span>
    </span>
  );
}

/* --------------------------- próxima ação -------------------------- */

export function NextActionCell({ row }: { row: CrmRow }) {
  const a = row.nextAction;
  if (!a) return <span className="text-[13px] text-ink-500">—</span>;
  const late = a.status === "Atrasada";
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-[13px] text-ink-200">{a.title}</span>
      <span className={`truncate text-[12px] ${late ? "text-vermelho-fg" : "text-ink-500"}`}>
        {a.due}
        {a.owner ? ` · ${a.owner}` : ""}
      </span>
    </span>
  );
}

/* ---------------------------- pendências --------------------------- */

export function Pendencias({ row }: { row: CrmRow }) {
  const n = row.pendencias.length;
  if (!n) return <span className="text-[13px] text-ink-600">—</span>;
  const blocks = row.pendencias.some((p) => p.severity === "bloqueia");
  return (
    <span
      className={`flex items-center gap-1.5 text-[13px] font-semibold ${blocks ? "text-vermelho-fg" : "text-amarelo-fg"}`}
      title={row.pendencias.map((p) => p.label).join(" · ")}
    >
      <Icon name={blocks ? "alertCircle" : "alert"} size={14} />
      <span className="tnum">{n}</span>
    </span>
  );
}

/* ------------------------ colunas opcionais ------------------------ */

function Targets({ row }: { row: CrmRow }) {
  const { set, total } = row.targets;
  if (!total) return <span className="text-[13px] text-ink-500">—</span>;
  return (
    <span className={`tnum text-[13px] ${set === 0 ? "text-vermelho-fg" : set < total ? "text-amarelo-fg" : "text-ink-200"}`}>
      {set}/{total}
    </span>
  );
}

function Sources({ row }: { row: CrmRow }) {
  if (!row.leadSources.length) return <span className="text-[13px] text-vermelho-fg">Sem fonte</span>;
  return (
    <span className="truncate text-[13px] text-ink-300" title={row.leadSources.join(" · ")}>
      {row.leadSources.join(" · ")}
    </span>
  );
}

function Charge({ row }: { row: CrmRow }) {
  if (!row.charge) return <span className="text-[13px] text-ink-500">—</span>;
  return (
    <span className="flex min-w-0 flex-col">
      <span className="tnum truncate text-[13px] text-ink-200">{brl(row.charge.amount)}</span>
      <span className={`truncate text-[12px] ${row.charge.willSend ? "text-ink-500" : "text-amarelo-fg"}`}>
        {row.charge.willSend ? ddmm(row.charge.dueDate) : "sem canal"}
      </span>
    </span>
  );
}

function Renewal({ row }: { row: CrmRow }) {
  if (!row.renewalDate) return <span className="text-[13px] text-ink-500">—</span>;
  const late = row.renewalIn !== null && row.renewalIn < 0;
  const soon = row.renewalIn !== null && row.renewalIn <= 30;
  return (
    <span className={`tnum truncate text-[13px] ${late ? "text-vermelho-fg" : soon ? "text-amarelo-fg" : "text-ink-300"}`}>
      {late ? `Vencida · ${ddmm(row.renewalDate)}` : ddmm(row.renewalDate)}
    </span>
  );
}

/** A célula de cada coluna configurável, pelo id. */
export function Cell({ id, row }: { id: ColumnId; row: CrmRow }) {
  switch (id) {
    case "saude":
      return <Health row={row} />;
    case "etapa":
      return <StageCell row={row} />;
    case "mrr":
      return <span className="tnum text-[14px] font-medium text-ink-100">{brl(row.mrr)}</span>;
    case "interacao":
      return <LastInteraction row={row} />;
    case "proxima":
      return <NextActionCell row={row} />;
    case "pendencias":
      return <Pendencias row={row} />;
    case "metas":
      return <Targets row={row} />;
    case "fonte":
      return <Sources row={row} />;
    case "cobranca":
      return <Charge row={row} />;
    case "inicio":
      return <span className="tnum truncate text-[13px] text-ink-300">{row.since ? ddmm(row.since) : "—"}</span>;
    case "renovacao":
      return <Renewal row={row} />;
    case "servicos":
      return (
        <span className="truncate text-[13px] text-ink-300" title={row.services.join(" · ")}>
          {row.services.length ? row.services.join(" · ") : "—"}
        </span>
      );
    case "tarefas":
      return <span className="tnum text-[13px] text-ink-200">{row.openTasks || "—"}</span>;
  }
}

/* ------------------------- identificação --------------------------- */

export function ClientCell({ row }: { row: CrmRow }) {
  const people = [row.accountName && firstName(row.accountName), row.gtName && `GT ${firstName(row.gtName)}`]
    .filter(Boolean)
    .join(" · ");
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-800 text-[11px] font-semibold text-ink-300"
      >
        {initials(row.name)}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[14px] font-medium text-ink-100">{row.name}</span>
          {row.churn && (
            <span className="shrink-0 rounded-full bg-vermelho-dim px-1.5 py-px text-[10px] font-semibold text-vermelho-fg">
              Churn solicitado
            </span>
          )}
          {!row.active && (
            <span className="shrink-0 rounded-full bg-ink-800 px-1.5 py-px text-[10px] font-semibold text-ink-400">Arquivado</span>
          )}
        </span>
        <span className="truncate text-[12px] text-ink-500">{people || row.typeLabel}</span>
      </span>
    </span>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "–";
}
