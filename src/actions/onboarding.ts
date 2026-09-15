"use server";

// ============================================================
// Server Actions do Onboarding / LMS.
//
// Progresso: qualquer funcionário logado (requireUser). CMS: só admin
// (requireAdmin). O front faz atualização otimista; estas actions
// persistem e revalidam. Toda validação de entrada vive aqui — o
// repositório (lib/onboarding/db) só executa.
// ============================================================

import { revalidatePath } from "next/cache";
import { requireAdmin, requireUser } from "@/lib/auth";
import * as repo from "@/lib/onboarding/db";
import type {
  ActionResult,
  ChecklistItem,
  ContentStatus,
  LessonType,
} from "@/lib/onboarding/types";
import { isEmbeddableVideo } from "@/lib/onboarding/video";

const str = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() ?? "";
const num = (f: FormData, k: string) => {
  const v = Number(f.get(k));
  return Number.isFinite(v) ? v : null;
};

const LESSON_TYPES: LessonType[] = ["text", "video", "link", "document", "checklist", "tool"];
const isLessonType = (t: string): t is LessonType => (LESSON_TYPES as string[]).includes(t);
const isStatus = (s: string): s is ContentStatus =>
  s === "draft" || s === "published" || s === "archived";

/** Revalida o portal inteiro (funcionário) e o CMS. `layout` cobre o aninhado. */
function revalidateAll() {
  revalidatePath("/onboarding", "layout");
}

/* ============================== progresso =============================== */

/** Abre a aula (marca "em andamento"). Idempotente, chamado em segundo plano. */
export async function openLessonAction(lessonId: number): Promise<void> {
  const me = await requireUser();
  await repo.openLesson(me.id, lessonId);
}

/** Marca/desmarca a aula como concluída. */
export async function markLessonComplete(
  lessonId: number,
  done: boolean,
  categorySlug: string,
): Promise<void> {
  const me = await requireUser();
  await repo.setLessonDone(me.id, lessonId, done);
  revalidatePath("/onboarding");
  if (categorySlug) revalidatePath(`/onboarding/${categorySlug}`, "layout");
}

/** Persiste os itens de checklist marcados. */
export async function saveChecklistState(lessonId: number, checkedIds: string[]): Promise<void> {
  const me = await requireUser();
  await repo.setChecklistState(me.id, lessonId, checkedIds.filter((s) => typeof s === "string"));
}

/* ============================ CMS — categorias ========================== */

export async function saveCategory(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = num(formData, "id");
  const title = str(formData, "title");
  const description = str(formData, "description");
  const icon = str(formData, "icon") || null;
  const bannerUrl = str(formData, "bannerUrl") || null;
  if (!title) return { error: "Informe o título da categoria." };

  if (id) {
    await repo.updateCategory(id, { title, description, icon, bannerUrl });
    revalidateAll();
    return { ok: "Categoria atualizada." };
  }
  const slug = await repo.uniqueSlug(title);
  const ord = await repo.nextOrd("ob_categories", null);
  await repo.createCategory({ slug, title, description, icon, ord });
  revalidateAll();
  return { ok: "Categoria criada." };
}

export async function setCategoryStatusAction(id: number, status: string): Promise<void> {
  await requireAdmin();
  if (!isStatus(status)) return;
  await repo.setCategoryStatus(id, status);
  revalidateAll();
}

export async function deleteCategoryAction(id: number): Promise<ActionResult> {
  await requireAdmin();
  await repo.deleteCategory(id);
  revalidateAll();
  return { ok: "Categoria excluída." };
}

/* ============================= CMS — módulos ============================ */

export async function saveModule(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = num(formData, "id");
  const categoryId = num(formData, "categoryId");
  const title = str(formData, "title");
  const description = str(formData, "description");
  if (!title) return { error: "Informe o título do módulo." };

  if (id) {
    await repo.updateModule(id, { title, description });
    revalidateAll();
    return { ok: "Módulo atualizado." };
  }
  if (!categoryId) return { error: "Categoria não informada." };
  const ord = await repo.nextOrd("ob_modules", { col: "category_id", id: categoryId });
  await repo.createModule({ categoryId, title, description, ord });
  revalidateAll();
  return { ok: "Módulo criado." };
}

export async function setModuleStatusAction(id: number, status: string): Promise<void> {
  await requireAdmin();
  if (!isStatus(status)) return;
  await repo.setModuleStatus(id, status);
  revalidateAll();
}

export async function deleteModuleAction(id: number): Promise<ActionResult> {
  await requireAdmin();
  await repo.deleteModule(id);
  revalidateAll();
  return { ok: "Módulo excluído." };
}

/* ============================== CMS — aulas ============================= */

function parseChecklist(raw: string): ChecklistItem[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is { id?: unknown; text?: unknown } => typeof x === "object" && x !== null)
      .map((x, i) => ({ id: String(x.id ?? `it_${i}`), text: String(x.text ?? "").trim() }))
      .filter((x) => x.text);
  } catch {
    return [];
  }
}

export async function saveLesson(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = num(formData, "id");
  const moduleId = num(formData, "moduleId");
  const title = str(formData, "title");
  const typeRaw = str(formData, "type");
  if (!title) return { error: "Informe o título da aula." };
  if (!isLessonType(typeRaw)) return { error: "Tipo de aula inválido." };

  const videoUrl = str(formData, "videoUrl") || null;
  const externalUrl = str(formData, "externalUrl") || null;
  if (typeRaw === "video") {
    if (!videoUrl) return { error: "Informe a URL do vídeo (YouTube, Vimeo ou Loom)." };
    if (!isEmbeddableVideo(videoUrl))
      return { error: "URL de vídeo não reconhecida. Use YouTube, Vimeo ou Loom." };
  }
  if ((typeRaw === "link" || typeRaw === "tool" || typeRaw === "document") && !externalUrl)
    return { error: "Informe a URL de destino." };

  const input = {
    title,
    description: str(formData, "description"),
    type: typeRaw,
    content: str(formData, "content"),
    videoUrl,
    externalUrl,
    thumbUrl: str(formData, "thumbUrl") || null,
    icon: str(formData, "icon") || null,
    checklist: parseChecklist(str(formData, "checklist")),
  };

  if (id) {
    await repo.updateLesson(id, input);
    revalidateAll();
    return { ok: "Aula atualizada." };
  }
  if (!moduleId) return { error: "Módulo não informado." };
  const ord = await repo.nextOrd("ob_lessons", { col: "module_id", id: moduleId });
  await repo.createLesson(moduleId, ord, input);
  revalidateAll();
  return { ok: "Aula criada." };
}

export async function setLessonStatusAction(id: number, status: string): Promise<void> {
  await requireAdmin();
  if (!isStatus(status)) return;
  await repo.setLessonStatus(id, status);
  revalidateAll();
}

export async function deleteLessonAction(id: number): Promise<ActionResult> {
  await requireAdmin();
  await repo.deleteLesson(id);
  revalidateAll();
  return { ok: "Aula excluída." };
}

/** Duplica uma aula no mesmo módulo, logo após a original. */
export async function duplicateLessonAction(id: number): Promise<ActionResult> {
  await requireAdmin();
  const l = await repo.adminGetLesson(id);
  if (!l) return { error: "Aula não encontrada." };
  const ord = await repo.nextOrd("ob_lessons", { col: "module_id", id: l.moduleId });
  await repo.createLesson(l.moduleId, ord, {
    title: `${l.title} (cópia)`,
    description: l.description,
    type: l.type,
    content: l.content,
    videoUrl: l.videoUrl,
    externalUrl: l.externalUrl,
    thumbUrl: l.thumbUrl,
    icon: l.icon,
    checklist: l.checklist,
  });
  revalidateAll();
  return { ok: "Aula duplicada." };
}

/* ============================== reordenação ============================= */

const cleanIds = (ids: unknown): number[] =>
  Array.isArray(ids) ? ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];

export async function reorderCategoriesAction(ids: number[]): Promise<void> {
  await requireAdmin();
  await repo.reorderCategories(cleanIds(ids));
  revalidateAll();
}

export async function reorderModulesAction(ids: number[]): Promise<void> {
  await requireAdmin();
  await repo.reorderModules(cleanIds(ids));
  revalidateAll();
}

export async function reorderLessonsAction(ids: number[]): Promise<void> {
  await requireAdmin();
  await repo.reorderLessons(cleanIds(ids));
  revalidateAll();
}
