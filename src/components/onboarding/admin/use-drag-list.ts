"use client";

import { useRef, useState, type DragEvent } from "react";

/**
 * Reordenação por arrastar, com HTML5 nativo (sem dependência). Mantém a lista
 * localmente e só chama `onReorder` uma vez, ao soltar, com a nova ordem de ids
 * — nunca uma requisição por movimento. Otimista: a UI já reflete a ordem nova
 * antes da persistência.
 */
export function useDragList<T>(
  initial: T[],
  getId: (item: T) => number,
  onReorder: (orderedIds: number[]) => void,
) {
  const [list, setList] = useState<T[]>(initial);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const dirty = useRef(false);

  // Re-sincroniza quando o servidor manda uma lista nova (após revalidação),
  // ajustando o estado durante o render — o padrão recomendado do React para
  // derivar estado de props, sem o efeito que dispara renders em cascata.
  const idsKey = initial.map(getId).join(",");
  const [prevKey, setPrevKey] = useState(idsKey);
  if (prevKey !== idsKey) {
    setPrevKey(idsKey);
    setList(initial);
  }

  const onDragStart = (id: number) => (e: DragEvent) => {
    // Impede que arrastar uma aula dispare também o arraste do módulo pai.
    e.stopPropagation();
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragEnter = (overId: number) => () => {
    if (draggingId === null || draggingId === overId) return;
    setList((cur) => {
      const from = cur.findIndex((x) => getId(x) === draggingId);
      const to = cur.findIndex((x) => getId(x) === overId);
      if (from === -1 || to === -1) return cur;
      const next = cur.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      dirty.current = true;
      return next;
    });
  };

  const onDragEnd = () => {
    setDraggingId(null);
    if (dirty.current) {
      dirty.current = false;
      onReorder(list.map(getId));
    }
  };

  const itemProps = (id: number) => ({
    draggable: true,
    onDragStart: onDragStart(id),
    onDragEnter: onDragEnter(id),
    onDragEnd,
    onDragOver: (e: DragEvent) => e.preventDefault(),
    "data-dragging": draggingId === id ? "" : undefined,
  });

  return { list, itemProps, draggingId };
}
