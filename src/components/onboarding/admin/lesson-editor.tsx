"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { saveLesson } from "@/actions/onboarding";
import {
  LESSON_TYPE_LABEL,
  type ChecklistItem,
  type Lesson,
  type LessonType,
} from "@/lib/onboarding/types";
import { Icon } from "@/components/icon";
import { Modal } from "./modal";
import { ImageUpload } from "./image-upload";

const TYPES: LessonType[] = ["text", "video", "link", "document", "checklist", "tool"];

/** Editor de aula. Campos condicionais ao tipo; conteúdo em Markdown (o admin
 *  nunca escreve HTML). Um formulário só, com upload de thumbnail opcional. */
export function LessonEditor({
  moduleId,
  lesson,
  onClose,
  onSaved,
}: {
  moduleId: number;
  lesson: Lesson | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveLesson, null);
  const [type, setType] = useState<LessonType>(lesson?.type ?? "text");
  const [thumb, setThumb] = useState<string | null>(lesson?.thumbUrl ?? null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(lesson?.checklist ?? []);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state?.ok) onSaved();
  }, [state, onSaved]);

  const showContent = type === "text" || type === "document" || type === "video" || type === "tool" || type === "link";
  const showVideo = type === "video";
  const showExternal = type === "link" || type === "document" || type === "tool";
  const showThumb = type === "video" || type === "document" || type === "link";
  const showIcon = type === "tool";
  const showChecklist = type === "checklist";

  return (
    <Modal open onClose={onClose} title={lesson ? "Editar aula" : "Nova aula"} size="lg">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="moduleId" value={moduleId} />
        {lesson && <input type="hidden" name="id" value={lesson.id} />}
        <input type="hidden" name="thumbUrl" value={thumb ?? ""} />
        <input type="hidden" name="checklist" value={JSON.stringify(checklist)} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_180px]">
          <label className="block">
            <span className="eyebrow mb-1 block">Título</span>
            <input name="title" defaultValue={lesson?.title} className="field" required autoFocus />
          </label>
          <label className="block">
            <span className="eyebrow mb-1 block">Tipo</span>
            <select
              name="type"
              className="field"
              value={type}
              onChange={(e) => setType(e.target.value as LessonType)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {LESSON_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="eyebrow mb-1 block">Descrição curta (opcional)</span>
          <input name="description" defaultValue={lesson?.description} className="field" />
        </label>

        {showVideo && (
          <label className="block">
            <span className="eyebrow mb-1 block">URL do vídeo (YouTube, Vimeo ou Loom)</span>
            <input name="videoUrl" defaultValue={lesson?.videoUrl ?? ""} className="field" placeholder="https://youtu.be/..." />
          </label>
        )}

        {showExternal && (
          <label className="block">
            <span className="eyebrow mb-1 block">URL de destino</span>
            <input name="externalUrl" defaultValue={lesson?.externalUrl ?? ""} className="field" placeholder="https://..." />
          </label>
        )}

        {showIcon && (
          <label className="block">
            <span className="eyebrow mb-1 block">Ícone (emoji, opcional)</span>
            <input name="icon" defaultValue={lesson?.icon ?? ""} className="field" placeholder="ex.: 🎨" />
          </label>
        )}

        {showContent && (
          <div>
            <span className="eyebrow mb-1 block">
              {type === "text" ? "Conteúdo" : "Notas / instruções"} (Markdown)
            </span>
            <MarkdownToolbar textareaRef={contentRef} />
            <textarea
              ref={contentRef}
              name="content"
              defaultValue={lesson?.content}
              rows={type === "text" ? 12 : 5}
              className="field font-mono text-[13px]"
              placeholder="Escreva em Markdown: **negrito**, # título, - lista, [link](url)…"
            />
          </div>
        )}

        {showChecklist && <ChecklistBuilder items={checklist} onChange={setChecklist} />}

        {showThumb && (
          <div>
            <span className="eyebrow mb-1 block">Thumbnail (opcional)</span>
            <ImageUpload value={thumb} onChange={setThumb} kind="thumb" aspect="16/9" />
          </div>
        )}

        {state?.error && <p className="text-[13px] text-vermelho-fg">{state.error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending}>
            {pending && <span className="spinner" aria-hidden />}
            {lesson ? "Salvar" : "Criar aula"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Insere Markdown ao redor da seleção do textarea. Puro — recebe o elemento. */
function wrapSelection(ta: HTMLTextAreaElement, before: string, after = before) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const sel = value.slice(s, e) || "texto";
  ta.value = value.slice(0, s) + before + sel + after + value.slice(e);
  ta.focus();
  ta.selectionStart = s + before.length;
  ta.selectionEnd = s + before.length + sel.length;
}

/** Prefixa a linha atual (título, item de lista, citação). Puro. */
function prefixLine(ta: HTMLTextAreaElement, prefix: string) {
  const { selectionStart: s, value } = ta;
  const lineStart = value.lastIndexOf("\n", s - 1) + 1;
  ta.value = value.slice(0, lineStart) + prefix + value.slice(lineStart);
  ta.focus();
  ta.selectionStart = ta.selectionEnd = s + prefix.length;
}

/** Barra de atalhos que insere Markdown no cursor — o admin não digita marcação.
 *  Os descritores são puros; o ref só é lido dentro do onClick (event handler). */
function MarkdownToolbar({ textareaRef }: { textareaRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const btns: { label: string; apply: (ta: HTMLTextAreaElement) => void }[] = [
    { label: "Negrito", apply: (ta) => wrapSelection(ta, "**") },
    { label: "Título", apply: (ta) => prefixLine(ta, "## ") },
    { label: "Lista", apply: (ta) => prefixLine(ta, "- ") },
    { label: "Citação", apply: (ta) => prefixLine(ta, "> ") },
    { label: "Link", apply: (ta) => wrapSelection(ta, "[", "](https://)") },
  ];
  return (
    <div className="mb-1.5 flex flex-wrap gap-1">
      {btns.map((b) => (
        <button
          key={b.label}
          type="button"
          onClick={() => {
            const ta = textareaRef.current;
            if (ta) b.apply(ta);
          }}
          className="rounded-md border border-[var(--border-hair)] bg-ink-850 px-2 py-1 text-[11px] font-semibold text-ink-300 hover:bg-ink-800 hover:text-ink-100"
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}

/** Construtor de checklist: itens com id estável (casam com o progresso). */
function ChecklistBuilder({
  items,
  onChange,
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}) {
  const add = () => onChange([...items, { id: `it_${Date.now()}`, text: "" }]);
  const set = (id: string, text: string) => onChange(items.map((i) => (i.id === id ? { ...i, text } : i)));
  const remove = (id: string) => onChange(items.filter((i) => i.id !== id));
  return (
    <div>
      <span className="eyebrow mb-1 block">Itens da checklist</span>
      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2">
            <input
              value={it.text}
              onChange={(e) => set(it.id, e.target.value)}
              className="field"
              placeholder="Tarefa a concluir"
            />
            <button
              type="button"
              className="btn btn-sm btn-icon"
              onClick={() => remove(it.id)}
              title="Remover item"
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-sm mt-2" onClick={add}>
        <Icon name="plus" size={14} />
        Adicionar item
      </button>
    </div>
  );
}
