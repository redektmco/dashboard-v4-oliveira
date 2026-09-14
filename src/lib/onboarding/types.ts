// ============================================================
// Tipos de domínio do Onboarding / LMS interno.
// Hierarquia: Categoria > Módulo > Aula; progresso por usuário.
// CamelCase no domínio; o repositório (./db) mapeia do snake_case.
// ============================================================

/**
 * Resultado padrão das Server Actions usadas em formulário (`useActionState`):
 * `ok` vira mensagem de sucesso; `error` aparece no próprio formulário.
 */
export type ActionResult = { ok?: string; error?: string } | null;

/** Rascunho não aparece para o funcionário; arquivado sai de tudo. */
export type ContentStatus = "draft" | "published" | "archived";

export const CONTENT_STATUS_LABEL: Record<ContentStatus, string> = {
  draft: "Rascunho",
  published: "Publicado",
  archived: "Arquivado",
};

/** Formato da aula — decide o que o front renderiza. */
export type LessonType = "text" | "video" | "link" | "document" | "checklist" | "tool";

export const LESSON_TYPE_LABEL: Record<LessonType, string> = {
  text: "Texto",
  video: "Vídeo",
  link: "Link externo",
  document: "Documento",
  checklist: "Checklist",
  tool: "Ferramenta / acesso",
};

/** Estado de conclusão de uma aula para um funcionário. */
export type ProgressStatus = "not_started" | "in_progress" | "done";

/** Item de checklist de uma aula. `id` é estável para casar com o progresso. */
export type ChecklistItem = { id: string; text: string };

export type Category = {
  id: number;
  slug: string;
  title: string;
  description: string;
  bannerUrl: string | null;
  icon: string | null;
  ord: number;
  status: ContentStatus;
  isDemo: boolean;
};

export type Module = {
  id: number;
  categoryId: number;
  title: string;
  description: string;
  ord: number;
  status: ContentStatus;
};

export type Lesson = {
  id: number;
  moduleId: number;
  title: string;
  description: string;
  type: LessonType;
  content: string;
  videoUrl: string | null;
  externalUrl: string | null;
  thumbUrl: string | null;
  icon: string | null;
  checklist: ChecklistItem[];
  ord: number;
  status: ContentStatus;
};

/** Contagem de aulas concluídas / total, com o percentual derivado. */
export type ProgressCount = { done: number; total: number };

export const pct = ({ done, total }: ProgressCount): number =>
  total === 0 ? 0 : Math.round((done / total) * 100);

/** Categoria do dashboard do funcionário, já com o progresso agregado. */
export type CategoryWithProgress = Category & { progress: ProgressCount };

/** Aula com o estado de progresso do usuário resolvido (para a navegação). */
export type LessonWithProgress = Lesson & {
  progressStatus: ProgressStatus;
  checklistState: string[];
};

/** Módulo com suas aulas (já resolvidas para o usuário) — página da categoria. */
export type ModuleWithLessons = Module & { lessons: LessonWithProgress[] };
