"use client";

import { hasRole } from "@/lib/roles";

import { useOptimistic, useState, useTransition } from "react";
import { bulkAssignOwner, setRelationshipStage } from "@/actions/crm";
import type { ActionResult } from "@/lib/action";
import type { CrmRow } from "@/lib/crm/board";
import { DRAGGABLE, GROUP_BY, laneOf, lanesFor, NONE, type GroupBy, type LaneTone } from "@/lib/crm/kanban";
import type { Stage, User } from "@/lib/model/types";
import { ActionMenu } from "../action-menu";
import { FilterSelect } from "../churn/controls";
import { toast } from "../toast";
import { brl } from "../ui";
import { ClientCell, Health, NextActionCell, Pendencias } from "./crm-cells";

/**
 * Clientes em kanban. As colunas vêm do "Agrupar por": etapa, saúde,
 * Account, GT ou renovação (ver `lib/crm/kanban`).
 *
 * Recebe a lista já filtrada pela aba e pelos filtros — o kanban é só outro
 * jeito de desenhar a mesma triagem, não outra tela. Dentro de cada coluna
 * a ordem é a da ordenação escolhida.
 *
 * Onde a coluna é um campo editável, arrastar o cartão muda o cliente:
 * etapa fixa `stage_override` (igual a "Alterar etapa" da barra em massa),
 * Account/GT troca o responsável. Como arrastar não existe no toque, o menu
 * do cartão faz o mesmo.
 */

const DOT: Record<LaneTone, string> = {
  azul: "bg-azul",
  verde: "bg-verde",
  amarelo: "bg-amarelo",
  vermelho: "bg-vermelho",
  ink: "bg-ink-500",
};

const GROUP_LABEL = Object.fromEntries(GROUP_BY.map((g) => [g.id, g.label])) as Record<GroupBy, string>;

type Move = { id: number; by: GroupBy; lane: string };

function applyMove(r: CrmRow, m: Move): CrmRow {
  const person = m.lane === NONE ? null : m.lane;
  if (m.by === "etapa") return { ...r, stage: m.lane as Stage, stageManual: true };
  if (m.by === "account") return { ...r, accountName: person };
  if (m.by === "gt") return { ...r, gtName: person };
  return r;
}

export function CrmKanban({
  rows,
  users,
  groupBy,
  onGroupBy,
  onOpen,
  openId,
}: {
  rows: CrmRow[];
  users: User[];
  groupBy: GroupBy;
  onGroupBy: (g: GroupBy) => void;
  onOpen: (id: number) => void;
  openId: number | null;
}) {
  const [, start] = useTransition();
  const [board, move] = useOptimistic(rows, (rs, m: Move) => rs.map((r) => (r.id === m.id ? applyMove(r, m) : r)));
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const draggable = DRAGGABLE[groupBy];
  const role = groupBy === "account" ? "account" : "gt";
  const people = groupBy === "account" || groupBy === "gt" ? users.filter((u) => hasRole(u, role)).map((u) => u.name) : [];
  const lanes = lanesFor(groupBy, board, people);

  const save = (row: CrmRow, lane: string): Promise<ActionResult> => {
    if (groupBy === "etapa") return setRelationshipStage(row.id, lane as Stage);
    const field = groupBy === "account" ? "account_user_id" : "gt_user_id";
    if (lane === NONE) return bulkAssignOwner([row.id], field, null);
    const user = users.find((u) => hasRole(u, role) && u.name === lane);
    if (!user) return Promise.resolve({ error: `${lane} não está mais cadastrado como ${GROUP_LABEL[groupBy]}.` });
    return bulkAssignOwner([row.id], field, user.id);
  };

  const moveTo = (row: CrmRow, lane: string) => {
    if (!draggable || laneOf(groupBy, row) === lane) return;
    start(async () => {
      move({ id: row.id, by: groupBy, lane });
      const r = await save(row, lane);
      if (r?.error) toast(r.error, { tone: "error" });
      else if (r?.ok) toast(r.ok);
    });
  };

  const drop = (lane: string, e: React.DragEvent) => {
    e.preventDefault();
    setOver(null);
    setDragging(null);
    const id = Number(e.dataTransfer.getData("text/plain"));
    const row = board.find((r) => r.id === id);
    if (row) moveTo(row, lane);
  };

  const moveLabel = (label: string) => (groupBy === "etapa" ? `Mover para ${label}` : `${GROUP_LABEL[groupBy]}: ${label}`);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <FilterSelect
          icon="layers"
          label="Agrupar por"
          value={groupBy}
          onChange={onGroupBy}
          options={GROUP_BY.map((g) => ({ value: g.id, label: g.label }))}
          active
        />
        <span className="text-[12px] text-ink-500">
          {draggable
            ? `Arraste o cartão para outra coluna para mudar ${groupBy === "etapa" ? "a etapa" : `o ${GROUP_LABEL[groupBy]}`}.`
            : groupBy === "saude"
              ? "A saúde vem do Health Score — aqui é só visualização."
              : "A renovação vem do contrato — aqui é só visualização."}
        </span>
      </div>

      <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
        {lanes.map((lane) => {
          const cards = board.filter((r) => laneOf(groupBy, r) === lane.key);
          const mrr = cards.reduce((s, r) => s + r.mrr, 0);
          const target = over === lane.key && dragging !== null;
          return (
            <section
              key={lane.key}
              aria-label={lane.label}
              className={`panel flex min-w-[264px] flex-1 basis-0 snap-start flex-col ${target ? "ring-1 ring-v4-red" : ""}`}
              onDragOver={(e) => {
                if (dragging === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== lane.key) setOver(lane.key);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === lane.key ? null : o));
              }}
              onDrop={(e) => drop(lane.key, e)}
            >
              <header className="flex items-center justify-between gap-2 border-b border-[var(--border-hair)] px-3 py-2.5">
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${DOT[lane.tone]}`} />
                  <span className="truncate text-[13px] font-semibold text-ink-100">{lane.label}</span>
                  <span className="tnum text-[12px] text-ink-500">{cards.length}</span>
                </span>
                <span className="tnum shrink-0 text-[12px] text-ink-500">{brl(mrr)}</span>
              </header>

              <ul className="flex min-h-[120px] flex-col gap-2 p-2">
                {cards.length === 0 && (
                  <li className="grid flex-1 place-items-center rounded-lg border border-dashed border-[var(--border-hair)] px-3 py-6 text-center text-[12px] text-ink-600">
                    {target ? "Soltar aqui" : "Nenhum cliente"}
                  </li>
                )}
                {cards.map((r) => (
                  <KanbanCard
                    key={r.id}
                    row={r}
                    open={openId === r.id}
                    draggable={draggable}
                    dragging={dragging === r.id}
                    onOpen={onOpen}
                    moves={
                      draggable
                        ? lanes.map((l) => ({
                            label: moveLabel(l.label),
                            icon: "arrowRight" as const,
                            disabled: l.key === lane.key,
                            onSelect: () => moveTo(r, l.key),
                          }))
                        : []
                    }
                    footnote={groupBy === "renovacao" && r.renewalDate ? `Renovação em ${dmy(r.renewalDate)}` : null}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", String(r.id));
                      e.dataTransfer.effectAllowed = "move";
                      setDragging(r.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                  />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function KanbanCard({
  row,
  open,
  draggable,
  dragging,
  onOpen,
  moves,
  footnote,
  onDragStart,
  onDragEnd,
}: {
  row: CrmRow;
  open: boolean;
  draggable: boolean;
  dragging: boolean;
  onOpen: (id: number) => void;
  moves: { label: string; icon: "arrowRight"; disabled: boolean; onSelect: () => void }[];
  footnote: string | null;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <li
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      className={`relative flex flex-col gap-2 rounded-lg border p-2.5 transition-colors ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      } ${open ? "border-v4-red bg-ink-850" : "border-[var(--border-hair)] bg-ink-900 hover:bg-ink-850"} ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start gap-1">
        <button type="button" onClick={() => onOpen(row.id)} className="flex min-w-0 flex-1 text-left" aria-expanded={open}>
          <ClientCell row={row} />
        </button>
        <ActionMenu
          size="sm"
          label={`Ações de ${row.name}`}
          items={[
            { label: "Abrir ficha completa", icon: "chevronRight", href: `/clientes/${row.id}` },
            ...(moves.length ? (["separator", ...moves] as const) : []),
          ]}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Health row={row} />
        <span className="tnum shrink-0 text-[13px] font-medium text-ink-100">{brl(row.mrr)}</span>
      </div>

      {footnote && <span className="tnum text-[12px] text-ink-400">{footnote}</span>}

      {(row.nextAction || row.pendencias.length > 0) && (
        <div className="flex items-end justify-between gap-2 border-t border-[var(--border-hair)] pt-2">
          <span className="min-w-0 flex-1">
            <NextActionCell row={row} />
          </span>
          <Pendencias row={row} />
        </div>
      )}
    </li>
  );
}
