"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteLessonAction,
  deleteModuleAction,
  duplicateLessonAction,
  reorderLessonsAction,
  reorderModulesAction,
  saveModule,
  setLessonStatusAction,
  setModuleStatusAction,
} from "@/actions/onboarding";
import {
  CONTENT_STATUS_LABEL,
  LESSON_TYPE_LABEL,
  type Lesson,
  type Module,
} from "@/lib/onboarding/types";
import { Icon, type IconName } from "@/components/icon";
import { ConfirmDialog, Modal } from "./modal";
import { LessonEditor } from "./lesson-editor";
import { useDragList } from "./use-drag-list";

type Block = { module: Module; lessons: Lesson[] };

const STATUS_CLS: Record<string, string> = {
  draft: "bg-ink-800 text-ink-300",
  published: "bg-verde-dim text-verde-fg",
  archived: "bg-amarelo-dim text-amarelo-fg",
};
const TYPE_ICON: Record<string, IconName> = {
  text: "file",
  video: "play",
  link: "link",
  document: "file",
  checklist: "listCheck",
  tool: "wrench",
};

export function ContentTree({ categoryId, blocks }: { categoryId: number; blocks: Block[] }) {
  const { list, itemProps } = useDragList(blocks, (b) => b.module.id, (ids) => reorderModulesAction(ids));
  const [newModule, setNewModule] = useState(false);
  const router = useRouter();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-400">Arraste módulos e aulas para reordenar.</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setNewModule(true)}>
          <Icon name="plus" size={15} />
          Novo módulo
        </button>
      </div>

      {list.length === 0 ? (
        <div className="panel px-5 py-10 text-center text-sm text-ink-400">
          Nenhum módulo ainda. Crie o primeiro para começar a adicionar aulas.
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((b, i) => (
            <li key={b.module.id} {...itemProps(b.module.id)} className="data-[dragging]:opacity-50">
              <ModuleBlock index={i} module={b.module} lessons={b.lessons} onChanged={() => router.refresh()} />
            </li>
          ))}
        </ul>
      )}

      {newModule && (
        <ModuleEditor
          categoryId={categoryId}
          module={null}
          onClose={() => setNewModule(false)}
          onSaved={() => {
            setNewModule(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ModuleBlock({
  index,
  module,
  lessons,
  onChanged,
}: {
  index: number;
  module: Module;
  lessons: Lesson[];
  onChanged: () => void;
}) {
  const { list, itemProps } = useDragList(lessons, (l) => l.id, (ids) => reorderLessonsAction(ids));
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lessonEdit, setLessonEdit] = useState<Lesson | "new" | null>(null);
  const [lessonDelete, setLessonDelete] = useState<Lesson | null>(null);
  const [, startStatus] = useTransition();
  const [delPending, startDelete] = useTransition();
  const [lessonDelPending, startLessonDelete] = useTransition();

  const publishMod = () =>
    startStatus(() => setModuleStatusAction(module.id, module.status === "published" ? "draft" : "published"));
  const publishLesson = (l: Lesson) =>
    startStatus(() => setLessonStatusAction(l.id, l.status === "published" ? "draft" : "published"));
  const duplicate = (l: Lesson) => startStatus(async () => { await duplicateLessonAction(l.id); onChanged(); });

  return (
    <section className="panel">
      <header className="flex items-center gap-2.5 border-b border-[var(--border-hair)] px-3 py-2.5">
        <span className="ob-drag shrink-0 text-ink-600" title="Arrastar módulo">
          <Icon name="grip" size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="eyebrow">Módulo {String(index + 1).padStart(2, "0")}</span>
          <span className="block truncate font-display text-[15px] font-semibold text-ink-100">{module.title}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLS[module.status]}`}>
          {CONTENT_STATUS_LABEL[module.status]}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className="btn btn-sm btn-icon" title={module.status === "published" ? "Despublicar" : "Publicar"} onClick={publishMod}>
            <Icon name={module.status === "published" ? "eyeOff" : "eye"} size={15} />
          </button>
          <button type="button" className="btn btn-sm btn-icon" title="Editar módulo" onClick={() => setEditing(true)}>
            <Icon name="pencil" size={14} />
          </button>
          <button type="button" className="btn btn-sm btn-icon" title="Excluir módulo" onClick={() => setDeleting(true)}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      </header>

      <ul>
        {list.map((l) => (
          <li
            key={l.id}
            {...itemProps(l.id)}
            className="flex items-center gap-2.5 border-b border-[var(--border-hair)] px-3 py-2.5 last:border-0 data-[dragging]:opacity-50"
          >
            <span className="ob-drag shrink-0 text-ink-600" title="Arrastar aula">
              <Icon name="grip" size={14} />
            </span>
            <Icon name={TYPE_ICON[l.type] ?? "file"} size={15} className="shrink-0 text-ink-500" />
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink-100">{l.title}</span>
            <span className="hidden shrink-0 text-[11px] text-ink-500 sm:block">{LESSON_TYPE_LABEL[l.type]}</span>
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLS[l.status]}`}>
              {CONTENT_STATUS_LABEL[l.status]}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" className="btn btn-sm btn-icon" title={l.status === "published" ? "Despublicar" : "Publicar"} onClick={() => publishLesson(l)}>
                <Icon name={l.status === "published" ? "eyeOff" : "eye"} size={14} />
              </button>
              <button type="button" className="btn btn-sm btn-icon" title="Duplicar" onClick={() => duplicate(l)}>
                <Icon name="copy" size={14} />
              </button>
              <button type="button" className="btn btn-sm btn-icon" title="Editar aula" onClick={() => setLessonEdit(l)}>
                <Icon name="pencil" size={13} />
              </button>
              <button type="button" className="btn btn-sm btn-icon" title="Excluir aula" onClick={() => setLessonDelete(l)}>
                <Icon name="trash" size={13} />
              </button>
            </div>
          </li>
        ))}
        {list.length === 0 && (
          <li className="px-4 py-3 text-[13px] text-ink-500">Sem aulas. Adicione a primeira.</li>
        )}
      </ul>

      <div className="border-t border-[var(--border-hair)] px-3 py-2">
        <button type="button" className="btn btn-sm" onClick={() => setLessonEdit("new")}>
          <Icon name="plus" size={14} />
          Nova aula
        </button>
      </div>

      {editing && (
        <ModuleEditor
          categoryId={module.categoryId}
          module={module}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
      {lessonEdit && (
        <LessonEditor
          moduleId={module.id}
          lesson={lessonEdit === "new" ? null : lessonEdit}
          onClose={() => setLessonEdit(null)}
          onSaved={() => {
            setLessonEdit(null);
            onChanged();
          }}
        />
      )}

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => startDelete(async () => { await deleteModuleAction(module.id); setDeleting(false); onChanged(); })}
        pending={delPending}
        title="Excluir módulo"
        message={<>Excluir <strong className="text-ink-100">{module.title}</strong> apaga também suas aulas e o progresso relacionado.</>}
      />
      <ConfirmDialog
        open={Boolean(lessonDelete)}
        onClose={() => setLessonDelete(null)}
        onConfirm={() => startLessonDelete(async () => { if (lessonDelete) await deleteLessonAction(lessonDelete.id); setLessonDelete(null); onChanged(); })}
        pending={lessonDelPending}
        title="Excluir aula"
        message={<>Excluir <strong className="text-ink-100">{lessonDelete?.title}</strong>? Esta ação não pode ser desfeita.</>}
      />
    </section>
  );
}

function ModuleEditor({
  categoryId,
  module,
  onClose,
  onSaved,
}: {
  categoryId: number;
  module: Module | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveModule, null);
  useEffect(() => {
    if (state?.ok) onSaved();
  }, [state, onSaved]);
  return (
    <Modal open onClose={onClose} title={module ? "Editar módulo" : "Novo módulo"}>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="categoryId" value={categoryId} />
        {module && <input type="hidden" name="id" value={module.id} />}
        <label className="block">
          <span className="eyebrow mb-1 block">Título do módulo</span>
          <input name="title" defaultValue={module?.title} className="field" required autoFocus />
        </label>
        <label className="block">
          <span className="eyebrow mb-1 block">Descrição (opcional)</span>
          <textarea name="description" defaultValue={module?.description} rows={2} className="field" />
        </label>
        {state?.error && <p className="text-[13px] text-vermelho-fg">{state.error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending}>
            {pending && <span className="spinner" aria-hidden />}
            {module ? "Salvar" : "Criar módulo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
