"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { blockRect, BLOCKS, cellSize } from "@/lib/reports/layout";
import { PAGE, PAGE_PAD, type Block, type Page } from "@/lib/reports/types";
import { BlockView, HEADING_PX, PageView, TEXT_PX, type RenderCtx } from "./blocks";

/**
 * Uma página no editor. Memorizada: arrastar um bloco redesenha só as páginas
 * envolvidas, não o relatório inteiro (cada gráfico custa).
 */

export type Dir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const DIRS: Dir[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

/** Bloco em movimento ou redimensionando, com a posição de prévia. */
export type Drag = {
  kind: "move" | "resize";
  block: Block;
  fromPage: string;
  toPage: string;
  x: number;
  y: number;
  w: number;
  h: number;
};
export type Ghost = { pageId: string; x: number; y: number; w: number; h: number };

/** Ações da página, estáveis entre renders (o editor guarda num ref). */
export type PageHandlers = {
  register: (pageId: string, el: HTMLDivElement | null) => void;
  blockDown: (e: React.PointerEvent, pageId: string, block: Block) => void;
  handleDown: (e: React.PointerEvent, pageId: string, block: Block, dir: Dir) => void;
  pageDown: (pageId: string) => void;
  startEdit: (blockId: string) => void;
  commitText: (pageId: string, blockId: string, text: string) => void;
  endEdit: () => void;
  duplicate: (pageId: string, blockId: string) => void;
  remove: (pageId: string, blockId: string) => void;
  order: (pageId: string, blockId: string, to: "front" | "back") => void;
  dragOver: (e: React.DragEvent, pageId: string) => void;
  drop: (e: React.DragEvent, pageId: string) => void;
  dragLeave: (pageId: string) => void;
};

export const EditorPage = memo(function EditorPage({
  page,
  ctx,
  scale,
  selectedId,
  editingId,
  drag,
  ghost,
  handlers,
}: {
  page: Page;
  ctx: RenderCtx;
  scale: number;
  selectedId: string | null;
  editingId: string | null;
  drag: Drag | null;
  ghost: Ghost | null;
  handlers: PageHandlers;
}) {
  const { w, h } = PAGE[ctx.format];
  const { cw, ch } = cellSize(ctx.format);
  const h_ = handlers;

  // Blocos desta página, com a prévia do arrasto aplicada.
  let blocks = page.blocks;
  if (drag) {
    const id = drag.block.id;
    const preview = { ...drag.block, x: drag.x, y: drag.y, w: drag.w, h: drag.h } as Block;
    if (drag.fromPage === page.id && drag.toPage !== page.id) blocks = blocks.filter((b) => b.id !== id);
    else if (drag.toPage === page.id && drag.fromPage !== page.id) blocks = [...blocks, preview];
    else if (drag.toPage === page.id) blocks = blocks.map((b) => (b.id === id ? preview : b));
  }
  const selected = selectedId ? blocks.find((b) => b.id === selectedId) : undefined;
  const showGrid = Boolean(ghost) || Boolean(drag && drag.toPage === page.id);

  return (
    <div
      ref={(el) => h_.register(page.id, el)}
      className="rp-scaled rp-shadow"
      style={{ width: w * scale, height: h * scale }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("rp-page")) h_.pageDown(page.id);
      }}
      onDragOver={(e) => h_.dragOver(e, page.id)}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) h_.dragLeave(page.id);
      }}
      onDrop={(e) => h_.drop(e, page.id)}
    >
      <PageView
        page={page}
        ctx={ctx}
        style={{ transform: `scale(${scale})`, ["--inv" as string]: String(1 / scale) }}
      >
        {blocks.map((b) => (
          <div
            key={b.id}
            className="rp-edit-block"
            style={blockRect(ctx.format, b)}
            data-selected={b.id === selectedId ? "" : undefined}
            data-dragging={drag?.block.id === b.id ? "" : undefined}
            onPointerDown={(e) => editingId !== b.id && h_.blockDown(e, page.id, b)}
            onDoubleClick={() => (b.type === "heading" || b.type === "text") && h_.startEdit(b.id)}
          >
            <BlockView block={b} ctx={ctx} />
            {editingId === b.id && (b.type === "heading" || b.type === "text") && (
              <InlineText
                block={b}
                onCommit={(text) => h_.commitText(page.id, b.id, text)}
                onDone={h_.endEdit}
              />
            )}
            {b.id === selectedId &&
              editingId !== b.id &&
              DIRS.map((d) => (
                <span key={d} className="rp-handle" data-dir={d} onPointerDown={(e) => h_.handleDown(e, page.id, b, d)} />
              ))}
          </div>
        ))}
      </PageView>

      {showGrid && (
        <div
          className="rp-grid-overlay"
          style={{
            left: PAGE_PAD * scale,
            top: PAGE_PAD * scale,
            right: PAGE_PAD * scale,
            bottom: PAGE_PAD * scale,
            backgroundSize: `${cw * scale}px ${ch * scale}px`,
          }}
        />
      )}
      {ghost && (
        <div
          className="rp-ghost"
          style={(() => {
            const r = blockRect(ctx.format, ghost);
            return { left: r.left * scale, top: r.top * scale, width: r.width * scale, height: r.height * scale };
          })()}
        />
      )}

      {selected && !drag && editingId !== selected.id && (
        <BlockBar
          block={selected}
          rect={blockRect(ctx.format, selected)}
          scale={scale}
          onDuplicate={() => h_.duplicate(page.id, selected.id)}
          onRemove={() => h_.remove(page.id, selected.id)}
          onFront={() => h_.order(page.id, selected.id, "front")}
          onBack={() => h_.order(page.id, selected.id, "back")}
          onGrab={(e) => h_.blockDown(e, page.id, selected)}
        />
      )}
    </div>
  );
});

/** Barrinha sobre o bloco selecionado: nome (arrasta), duplicar, camadas, excluir. */
function BlockBar({
  block,
  rect,
  scale,
  onDuplicate,
  onRemove,
  onFront,
  onBack,
  onGrab,
}: {
  block: Block;
  rect: { left: number; top: number; width: number };
  scale: number;
  onDuplicate: () => void;
  onRemove: () => void;
  onFront: () => void;
  onBack: () => void;
  onGrab: (e: React.PointerEvent) => void;
}) {
  const top = rect.top * scale - 40;
  return (
    <div
      className="rp-block-bar"
      style={{ left: rect.left * scale, top: top < 2 ? rect.top * scale + 6 : top }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="rp-block-bar-label" onPointerDown={onGrab}>
        <Icon name="grip" size={13} className="mr-1" />
        {BLOCKS[block.type].label}
      </span>
      <button type="button" title="Duplicar (Ctrl+D)" aria-label="Duplicar" onClick={onDuplicate}>
        <Icon name="copy" size={14} />
      </button>
      <button type="button" title="Trazer para frente" aria-label="Trazer para frente" onClick={onFront}>
        <Icon name="arrowUp" size={14} />
      </button>
      <button type="button" title="Enviar para trás" aria-label="Enviar para trás" onClick={onBack}>
        <Icon name="arrowDown" size={14} />
      </button>
      <button type="button" title="Excluir (Delete)" aria-label="Excluir" onClick={onRemove}>
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}

/** Escrever direto na página (dois cliques no título ou no texto). */
function InlineText({
  block,
  onCommit,
  onDone,
}: {
  block: Extract<Block, { type: "heading" | "text" }>;
  onCommit: (text: string) => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState(block.text);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);
  const heading = block.type === "heading";
  return (
    <textarea
      ref={ref}
      className={`rp-inline-edit ${heading ? "font-display font-bold" : ""}`}
      style={{
        fontSize: heading ? HEADING_PX[block.size as keyof typeof HEADING_PX] : TEXT_PX[block.size as keyof typeof TEXT_PX],
        lineHeight: heading ? 1.08 : 1.5,
        textAlign: block.align,
        background: "var(--rp-bg)",
        color: "var(--rp-fg)",
      }}
      value={text}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        setText(e.target.value);
        onCommit(e.target.value);
      }}
      onBlur={onDone}
      onKeyDown={(e) => {
        if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
          e.preventDefault();
          onDone();
        }
      }}
    />
  );
}
