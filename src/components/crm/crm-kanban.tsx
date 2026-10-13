"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setRelationshipStage } from "@/actions/crm";
import type { CrmRow } from "@/lib/crm/board";
import { STAGE_LABEL, type Stage } from "@/lib/model/types";
import { ActionMenu } from "../action-menu";
import { toast } from "../toast";
import { brl } from "../ui";
import { ClientCell, Health, NextActionCell, Pendencias } from "./crm-cells";

/**
 * Clientes em kanban, uma coluna por etapa do relacionamento.
 *
 * Recebe a lista já filtrada pela aba e pelos filtros — o kanban é só outro
 * jeito de desenhar a mesma triagem, não outra tela. Dentro de cada coluna
 * a ordem é a da ordenação escolhida.
 *
 * Arrastar um cartão para outra coluna fixa a etapa à mão (`stage_override`),
 * igual a "Alterar etapa" da barra em massa. Como arrastar não existe no
 * toque, o menu do cartão faz o mesmo.
 */

const STAGES = Object.keys(STAGE_LABEL) as Stage[];

const STAGE_DOT: Record<Stage, string> = {
  onboarding: "bg-azul",
  estavel: "bg-ink-500",
  expansao: "bg-verde",
  renovacao: "bg-amarelo",
  retencao: "bg-vermelho",
};

export function CrmKanban({ rows, onOpen, openId }: { rows: CrmRow[]; onOpen: (id: number) => void; openId: number | null }) {
  const [, start] = useTransition();
  const [board, move] = useOptimistic(rows, (rs, m: { id: number; stage: Stage }) =>
    rs.map((r) => (r.id === m.id ? { ...r, stage: m.stage, stageManual: true } : r)),
  );
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<Stage | null>(null);

  const moveTo = (row: CrmRow, stage: Stage) => {
    if (row.stage === stage) return;
    start(async () => {
      move({ id: row.id, stage });
      const r = await setRelationshipStage(row.id, stage);
      if (r?.error) toast(r.error, { tone: "error" });
      else if (r?.ok) toast(r.ok);
    });
  };

  const drop = (stage: Stage, e: React.DragEvent) => {
    e.preventDefault();
    setOver(null);
    setDragging(null);
    const id = Number(e.dataTransfer.getData("text/plain"));
    const row = board.find((r) => r.id === id);
    if (row) moveTo(row, stage);
  };

  return (
    <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
      {STAGES.map((stage) => {
        const cards = board.filter((r) => r.stage === stage);
        const mrr = cards.reduce((s, r) => s + r.mrr, 0);
        const target = over === stage && dragging !== null;
        return (
          <section
            key={stage}
            aria-label={STAGE_LABEL[stage]}
            className={`panel flex min-w-[264px] flex-1 basis-0 snap-start flex-col ${target ? "ring-1 ring-v4-red" : ""}`}
            onDragOver={(e) => {
              if (dragging === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (over !== stage) setOver(stage);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === stage ? null : o));
            }}
            onDrop={(e) => drop(stage, e)}
          >
            <header className="flex items-center justify-between gap-2 border-b border-[var(--border-hair)] px-3 py-2.5">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[stage]}`} />
                <span className="truncate text-[13px] font-semibold text-ink-100">{STAGE_LABEL[stage]}</span>
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
                  dragging={dragging === r.id}
                  onOpen={onOpen}
                  onMove={(s) => moveTo(r, s)}
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
  );
}

function KanbanCard({
  row,
  open,
  dragging,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  row: CrmRow;
  open: boolean;
  dragging: boolean;
  onOpen: (id: number) => void;
  onMove: (stage: Stage) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`relative flex cursor-grab flex-col gap-2 rounded-lg border p-2.5 transition-colors active:cursor-grabbing ${
        open ? "border-v4-red bg-ink-850" : "border-[var(--border-hair)] bg-ink-900 hover:bg-ink-850"
      } ${dragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-1">
        <button type="button" onClick={() => onOpen(row.id)} className="flex min-w-0 flex-1 text-left" aria-expanded={open}>
          <ClientCell row={row} />
        </button>
        <ActionMenu
          size="sm"
          label={`Ações de ${row.name}`}
          items={[
            {
              label: "Abrir ficha completa",
              icon: "chevronRight",
              href: `/clientes/${row.id}`,
            },
            "separator",
            ...STAGES.map((s) => ({
              label: `Mover para ${STAGE_LABEL[s]}`,
              icon: "arrowRight" as const,
              disabled: s === row.stage,
              onSelect: () => onMove(s),
            })),
          ]}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <Health row={row} />
        <span className="tnum shrink-0 text-[13px] font-medium text-ink-100">{brl(row.mrr)}</span>
      </div>

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
