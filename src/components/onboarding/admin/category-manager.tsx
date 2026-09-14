"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteCategoryAction,
  reorderCategoriesAction,
  saveCategory,
  setCategoryStatusAction,
} from "@/actions/onboarding";
import { CONTENT_STATUS_LABEL, type Category } from "@/lib/onboarding/types";
import { Icon } from "@/components/icon";
import { ConfirmDialog, Modal } from "./modal";
import { ImageUpload } from "./image-upload";
import { useDragList } from "./use-drag-list";

const STATUS_CLS: Record<string, string> = {
  draft: "bg-ink-800 text-ink-300",
  published: "bg-verde-dim text-verde-fg",
  archived: "bg-amarelo-dim text-amarelo-fg",
};

export function CategoryManager({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const { list, itemProps } = useDragList(categories, (c) => c.id, (ids) =>
    reorderCategoriesAction(ids),
  );
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [pendingId, startStatus] = useTransition();
  const [delPending, startDelete] = useTransition();

  const togglePublish = (c: Category) =>
    startStatus(() => setCategoryStatusAction(c.id, c.status === "published" ? "draft" : "published"));

  const confirmDelete = () => {
    if (!deleting) return;
    startDelete(async () => {
      await deleteCategoryAction(deleting.id);
      setDeleting(null);
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-ink-400">Arraste para reordenar. A ordem vale para o funcionário.</p>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
          <Icon name="plus" size={15} />
          Nova categoria
        </button>
      </div>

      {list.length === 0 ? (
        <div className="panel px-5 py-10 text-center text-sm text-ink-400">
          Nenhuma categoria ainda. Crie a primeira.
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((c) => (
            <li
              key={c.id}
              {...itemProps(c.id)}
              className="panel flex items-center gap-3 p-3 data-[dragging]:opacity-50"
            >
              <span className="ob-drag shrink-0 text-ink-600" title="Arrastar">
                <Icon name="grip" size={16} />
              </span>
              <span className="h-9 w-16 shrink-0 overflow-hidden rounded-md bg-ink-850">
                {c.bannerUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- thumb externa (Blob)
                  <img src={c.bannerUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-ink-600">
                    <Icon name="image" size={16} />
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink-100">{c.title}</span>
                <span className="block truncate text-[12px] text-ink-500">/{c.slug}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLS[c.status]}`}>
                {CONTENT_STATUS_LABEL[c.status]}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={`/onboarding/admin/conteudo/${c.id}`}
                  className="btn btn-sm"
                  title="Gerenciar módulos e aulas"
                >
                  <Icon name="layers" size={14} />
                  <span className="hidden sm:inline">Módulos</span>
                </Link>
                <button
                  type="button"
                  className="btn btn-sm btn-icon"
                  title={c.status === "published" ? "Despublicar" : "Publicar"}
                  onClick={() => togglePublish(c)}
                  disabled={pendingId}
                >
                  <Icon name={c.status === "published" ? "eyeOff" : "eye"} size={15} />
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-icon"
                  title="Editar"
                  onClick={() => setEditing(c)}
                >
                  <Icon name="pencil" size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-icon"
                  title="Excluir"
                  onClick={() => setDeleting(c)}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <CategoryEditor
          category={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        pending={delPending}
        title="Excluir categoria"
        message={
          <>
            Excluir <strong className="text-ink-100">{deleting?.title}</strong> apaga também seus módulos, aulas e o
            progresso associado. Esta ação não pode ser desfeita.
          </>
        }
      />
    </div>
  );
}

function CategoryEditor({
  category,
  onClose,
  onSaved,
}: {
  category: Category | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveCategory, null);
  const [banner, setBanner] = useState<string | null>(category?.bannerUrl ?? null);

  useEffect(() => {
    if (state?.ok) onSaved();
  }, [state, onSaved]);

  return (
    <Modal open onClose={onClose} title={category ? "Editar categoria" : "Nova categoria"} size="lg">
      <form action={formAction} className="space-y-4">
        {category && <input type="hidden" name="id" value={category.id} />}
        <input type="hidden" name="bannerUrl" value={banner ?? ""} />

        <label className="block">
          <span className="eyebrow mb-1 block">Título</span>
          <input name="title" defaultValue={category?.title} className="field" required autoFocus />
        </label>

        <label className="block">
          <span className="eyebrow mb-1 block">Descrição curta</span>
          <textarea name="description" defaultValue={category?.description} rows={2} className="field" />
        </label>

        <label className="block">
          <span className="eyebrow mb-1 block">Ícone (emoji ou nome, opcional)</span>
          <input name="icon" defaultValue={category?.icon ?? ""} className="field" placeholder="ex.: 🎯 ou award" />
        </label>

        <div>
          <span className="eyebrow mb-1 block">Banner (a arte enviada pela empresa)</span>
          <ImageUpload value={banner} onChange={setBanner} kind="banner" aspect="16/6" hint="Proporção 16:6 recomendada" />
        </div>

        {state?.error && <p className="text-[13px] text-vermelho-fg">{state.error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={pending} aria-busy={pending}>
            {pending && <span className="spinner" aria-hidden />}
            {category ? "Salvar" : "Criar categoria"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
