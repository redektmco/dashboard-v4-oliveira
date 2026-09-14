// ============================================================
// Repositório do Onboarding / LMS sobre Postgres (Neon).
//
// Único módulo que toca as tabelas ob_*. Mapeia linhas (snake_case)
// para o domínio camelCase de ./types. Regra de ouro do driver HTTP:
// cada query é um round-trip — então as telas puxam em lote (o dashboard
// é UMA query agregada, a página de categoria são DUAS), nunca uma query
// por item num laço.
// ============================================================
import { cache } from "react";
import { all, one, run } from "../db";
import type {
  Category,
  CategoryWithProgress,
  ChecklistItem,
  ContentStatus,
  Lesson,
  LessonType,
  Module,
  ModuleWithLessons,
  ProgressStatus,
} from "./types";

/* ------------------------------- mapeamento ------------------------------ */

type CategoryRow = {
  id: number;
  slug: string;
  title: string;
  description: string;
  banner_url: string | null;
  icon: string | null;
  ord: number;
  status: ContentStatus;
  is_demo: number;
};

const toCategory = (r: CategoryRow): Category => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  description: r.description,
  bannerUrl: r.banner_url,
  icon: r.icon,
  ord: r.ord,
  status: r.status,
  isDemo: Boolean(r.is_demo),
});

const CATEGORY_COLS =
  "id, slug, title, description, banner_url, icon, ord, status, is_demo";

type ModuleRow = {
  id: number;
  category_id: number;
  title: string;
  description: string;
  ord: number;
  status: ContentStatus;
};

const toModule = (r: ModuleRow): Module => ({
  id: r.id,
  categoryId: r.category_id,
  title: r.title,
  description: r.description,
  ord: r.ord,
  status: r.status,
});

type LessonRow = {
  id: number;
  module_id: number;
  title: string;
  description: string;
  type: LessonType;
  content: string;
  video_url: string | null;
  external_url: string | null;
  thumb_url: string | null;
  icon: string | null;
  checklist: ChecklistItem[] | string;
  ord: number;
  status: ContentStatus;
};

const parseChecklist = (v: ChecklistItem[] | string | null): ChecklistItem[] => {
  if (!v) return [];
  const arr = typeof v === "string" ? (JSON.parse(v) as ChecklistItem[]) : v;
  return Array.isArray(arr) ? arr : [];
};

const toLesson = (r: LessonRow): Lesson => ({
  id: r.id,
  moduleId: r.module_id,
  title: r.title,
  description: r.description,
  type: r.type,
  content: r.content,
  videoUrl: r.video_url,
  externalUrl: r.external_url,
  thumbUrl: r.thumb_url,
  icon: r.icon,
  checklist: parseChecklist(r.checklist),
  ord: r.ord,
  status: r.status,
});

const LESSON_COLS =
  "id, module_id, title, description, type, content, video_url, external_url, thumb_url, icon, checklist, ord, status";

const MODULE_COLS = "id, category_id, title, description, ord, status";

/* Colunas leves para o esqueleto (sidebar/índice): sem `content`, que é o
   campo pesado — a aula aberta é a única que carrega o corpo inteiro. */
const LESSON_LITE_COLS =
  "id, module_id, title, description, type, video_url, external_url, thumb_url, icon, ord, status";

const asProgress = (s: string | null): ProgressStatus =>
  s === "done" ? "done" : s === "in_progress" ? "in_progress" : "not_started";

/* ============================ leitura — funcionário ====================== */

/**
 * Dashboard do funcionário: as categorias publicadas com o progresso já
 * agregado. UMA query — conta aulas publicadas e concluídas por categoria
 * num só round-trip, em vez de varrer a árvore inteira.
 */
export async function listDashboard(userId: number): Promise<CategoryWithProgress[]> {
  const rows = await all<CategoryRow & { total: number; done: number }>(
    `SELECT ${CATEGORY_COLS.split(", ").map((c) => `c.${c}`).join(", ")},
            COUNT(l.id)::int AS total,
            COUNT(p.lesson_id)::int AS done
       FROM ob_categories c
       LEFT JOIN ob_modules m ON m.category_id = c.id AND m.status = 'published'
       LEFT JOIN ob_lessons l ON l.module_id = m.id AND l.status = 'published'
       LEFT JOIN ob_progress p
         ON p.lesson_id = l.id AND p.user_id = ? AND p.status = 'done'
      WHERE c.status = 'published'
      GROUP BY c.id
      ORDER BY c.ord, c.id`,
    [userId],
  );
  return rows.map((r) => ({ ...toCategory(r), progress: { done: r.done, total: r.total } }));
}

export const getPublishedCategoryBySlug = cache(
  async (slug: string): Promise<Category | null> => {
    const r = await one<CategoryRow>(
      `SELECT ${CATEGORY_COLS} FROM ob_categories WHERE slug = ? AND status = 'published'`,
      [slug],
    );
    return r ? toCategory(r) : null;
  },
);

/**
 * Esqueleto da categoria (módulos publicados + aulas publicadas, leves) já
 * com o estado de progresso do usuário. DUAS queries (módulos, aulas+progresso)
 * montadas em memória — sem N+1. Serve o índice da categoria e a sidebar.
 * `cache` deduplica entre layout e página no mesmo request.
 */
export const getOutline = cache(
  async (categoryId: number, userId: number): Promise<ModuleWithLessons[]> => {
    const [modules, lessons] = await Promise.all([
      all<ModuleRow>(
        `SELECT ${MODULE_COLS} FROM ob_modules
          WHERE category_id = ? AND status = 'published' ORDER BY ord, id`,
        [categoryId],
      ),
      all<LessonRow & { p_status: string | null }>(
        `SELECT ${LESSON_LITE_COLS.split(", ").map((c) => `l.${c}`).join(", ")},
                p.status AS p_status
           FROM ob_lessons l
           JOIN ob_modules m ON m.id = l.module_id
           LEFT JOIN ob_progress p ON p.lesson_id = l.id AND p.user_id = ?
          WHERE m.category_id = ? AND l.status = 'published' AND m.status = 'published'
          ORDER BY m.ord, l.ord, l.id`,
        [userId, categoryId],
      ),
    ]);

    const byModule = new Map<number, ModuleWithLessons>();
    for (const m of modules) byModule.set(m.id, { ...toModule(m), lessons: [] });
    for (const l of lessons) {
      const mod = byModule.get(l.module_id);
      if (!mod) continue;
      mod.lessons.push({
        ...toLesson({ ...l, content: "", checklist: [] }),
        progressStatus: asProgress(l.p_status),
        checklistState: [],
      });
    }
    return [...byModule.values()];
  },
);

/** Uma aula publicada por completo + o progresso do usuário. */
export async function getLesson(
  lessonId: number,
  userId: number,
): Promise<(Lesson & { progressStatus: ProgressStatus; checklistState: string[] }) | null> {
  const r = await one<LessonRow & { p_status: string | null; checklist_state: string[] | string }>(
    `SELECT ${LESSON_COLS.split(", ").map((c) => `l.${c}`).join(", ")},
            p.status AS p_status, p.checklist_state
       FROM ob_lessons l
       LEFT JOIN ob_progress p ON p.lesson_id = l.id AND p.user_id = ?
      WHERE l.id = ? AND l.status = 'published'`,
    [userId, lessonId],
  );
  if (!r) return null;
  const state = typeof r.checklist_state === "string"
    ? (JSON.parse(r.checklist_state || "[]") as string[])
    : (r.checklist_state ?? []);
  return {
    ...toLesson(r),
    progressStatus: asProgress(r.p_status),
    checklistState: Array.isArray(state) ? state : [],
  };
}

/** Busca global leve: aulas publicadas cujo título/descrição/conteúdo batem. */
export async function searchLessons(
  query: string,
  limit = 20,
): Promise<{ lessonId: number; title: string; categorySlug: string; categoryTitle: string; moduleTitle: string }[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  return all(
    `SELECT l.id AS "lessonId", l.title,
            c.slug AS "categorySlug", c.title AS "categoryTitle", m.title AS "moduleTitle"
       FROM ob_lessons l
       JOIN ob_modules m ON m.id = l.module_id
       JOIN ob_categories c ON c.id = m.category_id
      WHERE l.status = 'published' AND m.status = 'published' AND c.status = 'published'
        AND (l.title ILIKE ? OR l.description ILIKE ? OR l.content ILIKE ?)
      ORDER BY (l.title ILIKE ?) DESC, c.ord, m.ord, l.ord
      LIMIT ?`,
    [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, limit],
  );
}

/* ============================== leitura — admin ========================== */

export const listAllCategories = () =>
  all<CategoryRow>(`SELECT ${CATEGORY_COLS} FROM ob_categories ORDER BY ord, id`).then((r) =>
    r.map(toCategory),
  );

export const adminGetCategory = (id: number) =>
  one<CategoryRow>(`SELECT ${CATEGORY_COLS} FROM ob_categories WHERE id = ?`, [id]).then((r) =>
    r ? toCategory(r) : null,
  );

export const adminGetCategoryBySlug = (slug: string) =>
  one<CategoryRow>(`SELECT ${CATEGORY_COLS} FROM ob_categories WHERE slug = ?`, [slug]).then((r) =>
    r ? toCategory(r) : null,
  );

/** Árvore completa da categoria para o CMS — todos os status. Duas queries. */
export async function adminOutline(
  categoryId: number,
): Promise<{ module: Module; lessons: Lesson[] }[]> {
  const [modules, lessons] = await Promise.all([
    all<ModuleRow>(`SELECT ${MODULE_COLS} FROM ob_modules WHERE category_id = ? ORDER BY ord, id`, [
      categoryId,
    ]),
    all<LessonRow>(
      `SELECT ${LESSON_COLS.split(", ").map((c) => `l.${c}`).join(", ")}
         FROM ob_lessons l JOIN ob_modules m ON m.id = l.module_id
        WHERE m.category_id = ? ORDER BY m.ord, l.ord, l.id`,
      [categoryId],
    ),
  ]);
  const byModule = new Map<number, Lesson[]>();
  for (const l of lessons) {
    const arr = byModule.get(l.module_id) ?? [];
    arr.push(toLesson(l));
    byModule.set(l.module_id, arr);
  }
  return modules.map((m) => ({ module: toModule(m), lessons: byModule.get(m.id) ?? [] }));
}

export const adminGetLesson = (id: number) =>
  one<LessonRow>(`SELECT ${LESSON_COLS} FROM ob_lessons WHERE id = ?`, [id]).then((r) =>
    r ? toLesson(r) : null,
  );

export const getModule = (id: number) =>
  one<ModuleRow>(`SELECT ${MODULE_COLS} FROM ob_modules WHERE id = ?`, [id]).then((r) =>
    r ? toModule(r) : null,
  );

/** Números do painel admin numa query só. */
export async function adminStats(): Promise<{
  categories: number;
  modules: number;
  lessons: number;
  published: number;
}> {
  const r = await one<{ categories: number; modules: number; lessons: number; published: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM ob_categories) AS categories,
       (SELECT COUNT(*)::int FROM ob_modules) AS modules,
       (SELECT COUNT(*)::int FROM ob_lessons) AS lessons,
       (SELECT COUNT(*)::int FROM ob_lessons WHERE status = 'published') AS published`,
  );
  return r ?? { categories: 0, modules: 0, lessons: 0, published: 0 };
}

/**
 * Progresso do time: por funcionário ativo, aulas concluídas / total publicado
 * e a última atividade. O total é o mesmo para todos (denominador global),
 * calculado uma vez; a query traz o numerador por usuário.
 */
export async function teamProgress(): Promise<
  { userId: number; name: string; role: string; done: number; total: number; lastActivity: string | null }[]
> {
  const total =
    (await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ob_lessons WHERE status = 'published'`))
      ?.n ?? 0;
  const rows = await all<{ userId: number; name: string; role: string; done: number; lastActivity: string | null }>(
    `SELECT u.id AS "userId", u.name, u.role,
            COUNT(p.id) FILTER (WHERE p.status = 'done')::int AS done,
            MAX(p.updated_at)::text AS "lastActivity"
       FROM users u
       LEFT JOIN ob_progress p ON p.user_id = u.id
      WHERE u.active = 1
      GROUP BY u.id
      ORDER BY done DESC, u.name`,
  );
  return rows.map((r) => ({ ...r, total }));
}

/* ============================== escrita — CMS ============================ */

/** Slug a partir do título, garantido único (sufixa -2, -3… se colidir). */
export async function uniqueSlug(title: string): Promise<string> {
  const base =
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "categoria";
  const taken = await all<{ slug: string }>(
    `SELECT slug FROM ob_categories WHERE slug = ? OR slug LIKE ?`,
    [base, `${base}-%`],
  );
  if (!taken.some((t) => t.slug === base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.some((t) => t.slug === candidate)) return candidate;
  }
}

export async function createCategory(c: {
  slug: string;
  title: string;
  description: string;
  icon: string | null;
  ord: number;
  isDemo?: boolean;
}): Promise<number> {
  const r = await one<{ id: number }>(
    `INSERT INTO ob_categories (slug, title, description, icon, ord, is_demo)
     VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    [c.slug, c.title, c.description, c.icon, c.ord, c.isDemo ? 1 : 0],
  );
  return Number(r!.id);
}

export const updateCategory = (
  id: number,
  c: { title: string; description: string; icon: string | null; bannerUrl: string | null },
) =>
  run(
    `UPDATE ob_categories SET title = ?, description = ?, icon = ?, banner_url = ? WHERE id = ?`,
    [c.title, c.description, c.icon, c.bannerUrl, id],
  );

export const setCategoryStatus = (id: number, status: ContentStatus) =>
  run(`UPDATE ob_categories SET status = ? WHERE id = ?`, [status, id]);

export const deleteCategory = (id: number) =>
  run(`DELETE FROM ob_categories WHERE id = ?`, [id]);

export async function createModule(m: {
  categoryId: number;
  title: string;
  description: string;
  ord: number;
}): Promise<number> {
  const r = await one<{ id: number }>(
    `INSERT INTO ob_modules (category_id, title, description, ord) VALUES (?, ?, ?, ?) RETURNING id`,
    [m.categoryId, m.title, m.description, m.ord],
  );
  return Number(r!.id);
}

export const updateModule = (id: number, m: { title: string; description: string }) =>
  run(`UPDATE ob_modules SET title = ?, description = ? WHERE id = ?`, [m.title, m.description, id]);

export const setModuleStatus = (id: number, status: ContentStatus) =>
  run(`UPDATE ob_modules SET status = ? WHERE id = ?`, [status, id]);

export const deleteModule = (id: number) => run(`DELETE FROM ob_modules WHERE id = ?`, [id]);

export type LessonInput = {
  title: string;
  description: string;
  type: LessonType;
  content: string;
  videoUrl: string | null;
  externalUrl: string | null;
  thumbUrl: string | null;
  icon: string | null;
  checklist: ChecklistItem[];
};

export async function createLesson(moduleId: number, ord: number, l: LessonInput): Promise<number> {
  const r = await one<{ id: number }>(
    `INSERT INTO ob_lessons
       (module_id, ord, title, description, type, content, video_url, external_url, thumb_url, icon, checklist)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb) RETURNING id`,
    [
      moduleId,
      ord,
      l.title,
      l.description,
      l.type,
      l.content,
      l.videoUrl,
      l.externalUrl,
      l.thumbUrl,
      l.icon,
      JSON.stringify(l.checklist),
    ],
  );
  return Number(r!.id);
}

export const updateLesson = (id: number, l: LessonInput) =>
  run(
    `UPDATE ob_lessons SET title = ?, description = ?, type = ?, content = ?,
        video_url = ?, external_url = ?, thumb_url = ?, icon = ?, checklist = ?::jsonb
      WHERE id = ?`,
    [
      l.title,
      l.description,
      l.type,
      l.content,
      l.videoUrl,
      l.externalUrl,
      l.thumbUrl,
      l.icon,
      JSON.stringify(l.checklist),
      id,
    ],
  );

export const setLessonStatus = (id: number, status: ContentStatus) =>
  run(`UPDATE ob_lessons SET status = ? WHERE id = ?`, [status, id]);

export const deleteLesson = (id: number) => run(`DELETE FROM ob_lessons WHERE id = ?`, [id]);

/**
 * Reordena um nível inteiro num único round-trip: um UPDATE ... FROM (VALUES).
 * `orderedIds` já vem na ordem nova; o índice vira o `ord`. Evita uma query
 * por item (o que o briefing pede em "não gerar requisições desnecessárias").
 */
async function reorder(table: "ob_categories" | "ob_modules" | "ob_lessons", orderedIds: number[]) {
  if (orderedIds.length === 0) return;
  const tuples = orderedIds.map(() => "(?,?)").join(",");
  const params = orderedIds.flatMap((id, i) => [id, i]);
  await run(
    `UPDATE ${table} AS t SET ord = v.ord::int
       FROM (VALUES ${tuples}) AS v(id, ord)
      WHERE t.id = v.id::int`,
    params,
  );
}

export const reorderCategories = (ids: number[]) => reorder("ob_categories", ids);
export const reorderModules = (ids: number[]) => reorder("ob_modules", ids);
export const reorderLessons = (ids: number[]) => reorder("ob_lessons", ids);

/** `ord` do próximo item ao criar (fim da lista). */
export async function nextOrd(
  table: "ob_categories" | "ob_modules" | "ob_lessons",
  where: { col: string; id: number } | null,
): Promise<number> {
  const r = await one<{ n: number | null }>(
    `SELECT MAX(ord) AS n FROM ${table}${where ? ` WHERE ${where.col} = ?` : ""}`,
    where ? [where.id] : [],
  );
  return (r?.n ?? -1) + 1;
}

/* ============================ escrita — progresso ======================== */

/** Abre a aula: cria a linha "em andamento" se ainda não existe. */
export const openLesson = (userId: number, lessonId: number) =>
  run(
    `INSERT INTO ob_progress (user_id, lesson_id, status)
     VALUES (?, ?, 'in_progress')
     ON CONFLICT (user_id, lesson_id) DO NOTHING`,
    [userId, lessonId],
  );

/** Marca/desmarca a aula como concluída. */
export const setLessonDone = (userId: number, lessonId: number, done: boolean) =>
  run(
    `INSERT INTO ob_progress (user_id, lesson_id, status, completed_at, updated_at)
     VALUES (?, ?, ?, ?, now())
     ON CONFLICT (user_id, lesson_id)
       DO UPDATE SET status = excluded.status,
                     completed_at = excluded.completed_at,
                     updated_at = now()`,
    [userId, lessonId, done ? "done" : "in_progress", done ? new Date().toISOString() : null],
  );

/** Persiste os itens de checklist marcados (array de ids). */
export const setChecklistState = (userId: number, lessonId: number, checkedIds: string[]) =>
  run(
    `INSERT INTO ob_progress (user_id, lesson_id, status, checklist_state, updated_at)
     VALUES (?, ?, 'in_progress', ?::jsonb, now())
     ON CONFLICT (user_id, lesson_id)
       DO UPDATE SET checklist_state = excluded.checklist_state, updated_at = now()`,
    [userId, lessonId, JSON.stringify(checkedIds)],
  );
