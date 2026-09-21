// ============================================================
// Repositório de Social media sobre Postgres (Neon).
//
// Único módulo que toca a persistência das tabelas sm_*. Mapeia
// as linhas (snake_case) para o domínio camelCase de ./types.
// ============================================================
import { all, one, run } from "../db";
import { newId } from "./id";
import type {
  Asset,
  DecisionEvent,
  Post,
  PostFormat,
  Project,
  PostStatus,
  PublishStatus,
} from "./types";

/**
 * `timestamptz::text` sai como "2026-09-10 15:21:15.9-03" — espaço no lugar do
 * T e fuso sem os minutos. O `Date` do navegador recusa isso ("Invalid
 * Date"), então o domínio recebe ISO 8601 de verdade.
 */
function iso(s: string): string;
function iso(s: string | null): string | null;
function iso(s: string | null): string | null {
  if (!s) return null;
  const d = new Date(s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

/* ------------------------------ projetos ------------------------------ */

type ProjectRow = {
  id: string;
  client_id: number | null;
  title: string;
  client_name: string;
  ig_handle: string;
  guest_token: string;
  archived: number;
  ig_user_id: string | null;
  has_ig_token: boolean;
  created_by: number | null;
  created_at: string;
};

const PROJECT_SELECT = `
  SELECT p.id, p.client_id, p.title, p.client_name, p.ig_handle, p.guest_token,
         p.archived, p.ig_user_id, (p.ig_access_token IS NOT NULL) AS has_ig_token,
         p.created_by, p.created_at::text AS created_at
  FROM sm_projects p`;

function toProject(r: ProjectRow): Project {
  return {
    id: r.id,
    clientId: r.client_id,
    title: r.title,
    clientName: r.client_name,
    igHandle: r.ig_handle,
    guestToken: r.guest_token,
    archived: Boolean(r.archived),
    igUserId: r.ig_user_id,
    hasIgToken: Boolean(r.has_ig_token),
    createdBy: r.created_by,
    createdAt: iso(r.created_at),
  };
}

export async function listProjects(): Promise<Project[]> {
  const rows = await all<ProjectRow>(
    `${PROJECT_SELECT} WHERE p.archived = 0 ORDER BY p.created_at DESC`,
  );
  return rows.map(toProject);
}

/** Projetos arquivados — somem das listas e do link do cliente, mas não perdem nada. */
export async function listArchivedProjects(): Promise<Project[]> {
  const rows = await all<ProjectRow>(
    `${PROJECT_SELECT} WHERE p.archived = 1 ORDER BY p.created_at DESC`,
  );
  return rows.map(toProject);
}

export async function getProject(id: string): Promise<Project | null> {
  const r = await one<ProjectRow>(`${PROJECT_SELECT} WHERE p.id = ?`, [id]);
  return r ? toProject(r) : null;
}

export async function getProjectByToken(token: string): Promise<Project | null> {
  const r = await one<ProjectRow>(
    `${PROJECT_SELECT} WHERE p.guest_token = ? AND p.archived = 0`,
    [token],
  );
  return r ? toProject(r) : null;
}

export async function createProject(p: {
  id: string;
  clientId: number | null;
  title: string;
  clientName: string;
  igHandle: string;
  guestToken: string;
  createdBy: number | null;
}): Promise<Project> {
  await run(
    `INSERT INTO sm_projects (id, client_id, title, client_name, ig_handle, guest_token, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [p.id, p.clientId, p.title, p.clientName, p.igHandle, p.guestToken, p.createdBy],
  );
  return (await getProject(p.id))!;
}

export async function updateProject(
  id: string,
  patch: Partial<{
    title: string;
    clientName: string;
    clientId: number | null;
    igHandle: string;
    archived: boolean;
    igUserId: string | null;
    igAccessToken: string | null;
  }>,
): Promise<Project | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    vals.push(v);
  };
  if (patch.title !== undefined) set("title", patch.title);
  if (patch.clientName !== undefined) set("client_name", patch.clientName);
  if (patch.clientId !== undefined) set("client_id", patch.clientId);
  if (patch.igHandle !== undefined) set("ig_handle", patch.igHandle);
  if (patch.archived !== undefined) set("archived", patch.archived ? 1 : 0);
  if (patch.igUserId !== undefined) set("ig_user_id", patch.igUserId);
  if (patch.igAccessToken !== undefined) set("ig_access_token", patch.igAccessToken);
  if (!sets.length) return getProject(id);
  vals.push(id);
  await run(`UPDATE sm_projects SET ${sets.join(", ")} WHERE id = ?`, vals);
  return getProject(id);
}

/**
 * Exclui o projeto e seus posts (ON DELETE CASCADE). Devolve as URLs das
 * mídias para o chamador limpar o Blob — o banco não sabe apagar arquivo.
 */
export async function deleteProject(id: string): Promise<string[]> {
  const rows = await all<{ assets: Asset[] }>("SELECT assets FROM sm_posts WHERE project_id = ?", [id]);
  // Posts caem junto por ON DELETE CASCADE.
  await run("DELETE FROM sm_projects WHERE id = ?", [id]);
  return orphanUrls(rows.flatMap((r) => (Array.isArray(r.assets) ? r.assets.map((a) => a.url) : [])));
}

/* ------------------------------- posts -------------------------------- */

type PostRow = {
  id: string;
  project_id: string;
  ord: number;
  format: PostFormat;
  caption: string;
  assets: Asset[];
  status: PostStatus;
  decided_at: string | null;
  feedback: string | null;
  history: DecisionEvent[];
  created_at: string;
  scheduled_at: string | null;
  publish_status: PublishStatus;
  published_at: string | null;
  ig_media_id: string | null;
  publish_error: string | null;
};

const POST_SELECT = `
  SELECT id, project_id, ord, format, caption, assets, status,
         decided_at::text AS decided_at, feedback, history,
         created_at::text AS created_at, scheduled_at::text AS scheduled_at,
         publish_status, published_at::text AS published_at,
         ig_media_id, publish_error
  FROM sm_posts`;

function toPost(r: PostRow): Post {
  return {
    id: r.id,
    projectId: r.project_id,
    order: r.ord,
    format: r.format ?? "feed",
    caption: r.caption,
    assets: Array.isArray(r.assets) ? r.assets : [],
    status: r.status,
    decidedAt: iso(r.decided_at),
    feedback: r.feedback ?? undefined,
    history: Array.isArray(r.history) ? r.history : [],
    createdAt: iso(r.created_at),
    scheduledAt: iso(r.scheduled_at),
    publishStatus: r.publish_status,
    publishedAt: iso(r.published_at),
    igMediaId: r.ig_media_id,
    publishError: r.publish_error,
  };
}

export async function listPosts(projectId: string): Promise<Post[]> {
  const rows = await all<PostRow>(
    `${POST_SELECT} WHERE project_id = ? ORDER BY ord`,
    [projectId],
  );
  return rows.map(toPost);
}

export async function getPost(id: string): Promise<Post | null> {
  const r = await one<PostRow>(`${POST_SELECT} WHERE id = ?`, [id]);
  return r ? toPost(r) : null;
}

export type NewPost = {
  id: string;
  projectId: string;
  format: PostFormat;
  caption: string;
  assets: Asset[];
  /** Chave de idempotência do navegador: reenvio não duplica. */
  clientKey: string | null;
  /** "draft" guarda sem mostrar ao cliente; "pending" já entra no link. */
  status: Extract<PostStatus, "draft" | "pending">;
  /**
   * Data prevista de publicação, definida já na criação — antes da
   * aprovação do cliente. Popula o Planejamento como "Rascunho"; ao ser
   * aprovado, vira oficialmente "Agendado" (ver `updatePost` nas rotas de
   * decisão).
   */
  scheduledAt?: string | null;
};

/**
 * Grava os posts na ordem recebida, depois dos que já existem, num único
 * INSERT. Posts cuja `clientKey` já existe no projeto são ignorados (reenvio
 * depois de falha parcial) — o retorno diz quais entraram de fato.
 */
export async function createPosts(posts: NewPost[]): Promise<Set<string>> {
  if (!posts.length) return new Set();
  const projectId = posts[0].projectId;
  const values = posts
    .map(
      (_, i) =>
        `(?, ?, (SELECT COALESCE(MAX(ord), -1) + ${i + 1} FROM sm_posts WHERE project_id = ?), ?, ?, ?::jsonb, ?, ?, ?)`,
    )
    .join(", ");
  const params = posts.flatMap((p) => [
    p.id,
    projectId,
    projectId,
    p.format,
    p.caption,
    JSON.stringify(p.assets),
    p.clientKey,
    p.status,
    p.scheduledAt ?? null,
  ]);
  const rows = await all<{ id: string }>(
    `INSERT INTO sm_posts (id, project_id, ord, format, caption, assets, client_key, status, scheduled_at)
     VALUES ${values}
     ON CONFLICT (project_id, client_key) WHERE client_key IS NOT NULL DO NOTHING
     RETURNING id`,
    params,
  );
  return new Set(rows.map((r) => r.id));
}

/** Posts já existentes para estas chaves — resposta idempotente ao reenvio. */
export async function postIdsByClientKey(
  projectId: string,
  keys: string[],
): Promise<Map<string, string>> {
  if (!keys.length) return new Map();
  const rows = await all<{ id: string; client_key: string }>(
    `SELECT id, client_key FROM sm_posts WHERE project_id = ? AND client_key = ANY(?)`,
    [projectId, keys],
  );
  return new Map(rows.map((r) => [r.client_key, r.id]));
}

export async function updatePost(
  id: string,
  patch: Partial<{
    caption: string;
    status: PostStatus;
    decidedAt: string | null;
    feedback: string | null;
    history: DecisionEvent[];
    scheduledAt: string | null;
    publishStatus: PublishStatus;
    publishedAt: string | null;
    igMediaId: string | null;
    publishError: string | null;
  }>,
): Promise<Post | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (frag: string, v: unknown) => {
    sets.push(frag);
    vals.push(v);
  };
  if (patch.caption !== undefined) set("caption = ?", patch.caption);
  if (patch.status !== undefined) set("status = ?", patch.status);
  if (patch.decidedAt !== undefined) set("decided_at = ?", patch.decidedAt);
  if (patch.feedback !== undefined) set("feedback = ?", patch.feedback);
  if (patch.history !== undefined) set("history = ?::jsonb", JSON.stringify(patch.history));
  if (patch.scheduledAt !== undefined) set("scheduled_at = ?", patch.scheduledAt);
  if (patch.publishStatus !== undefined) set("publish_status = ?", patch.publishStatus);
  if (patch.publishedAt !== undefined) set("published_at = ?", patch.publishedAt);
  if (patch.igMediaId !== undefined) set("ig_media_id = ?", patch.igMediaId);
  if (patch.publishError !== undefined) set("publish_error = ?", patch.publishError);
  if (!sets.length) return getPost(id);
  vals.push(id);
  await run(`UPDATE sm_posts SET ${sets.join(", ")} WHERE id = ?`, vals);
  return getPost(id);
}

/**
 * Das URLs dadas, quais nenhum post ainda referencia. Duplicar um criativo
 * reaproveita as mesmas mídias: sem este filtro, excluir a cópia levaria
 * junto a arte do original.
 */
async function orphanUrls(urls: string[]): Promise<string[]> {
  if (!urls.length) return [];
  const rows = await all<{ url: string }>(
    `SELECT DISTINCT a->>'url' AS url
       FROM sm_posts p, jsonb_array_elements(p.assets) a
      WHERE a->>'url' = ANY(?)`,
    [urls],
  );
  const stillUsed = new Set(rows.map((r) => r.url));
  return [...new Set(urls)].filter((u) => !stillUsed.has(u));
}

/** Exclui o post e devolve as URLs das mídias que ficaram sem dono. */
export async function deletePost(id: string): Promise<string[]> {
  const rows = await all<{ assets: Asset[] }>(
    "DELETE FROM sm_posts WHERE id = ? RETURNING assets",
    [id],
  );
  const urls = rows.flatMap((r) => (Array.isArray(r.assets) ? r.assets.map((a) => a.url) : []));
  return orphanUrls(urls);
}

/**
 * Copia o criativo como rascunho no mesmo projeto: mesma mídia, mesma
 * legenda, decisão zerada. Serve para refazer uma variação sem subir tudo de
 * novo. As mídias são compartilhadas de propósito — `deletePost` só limpa o
 * Blob quando a última cópia sai.
 */
export async function duplicatePost(id: string): Promise<Post | null> {
  const src = await getPost(id);
  if (!src) return null;
  const copy: NewPost = {
    id: newId("pst_"),
    projectId: src.projectId,
    format: src.format,
    caption: src.caption,
    assets: src.assets,
    clientKey: null,
    status: "draft",
  };
  const created = await createPosts([copy]);
  return created.has(copy.id) ? getPost(copy.id) : null;
}

/** Contagem de decisões de um projeto — usada para saber quando o cliente terminou. */
export async function countByStatus(projectId: string): Promise<{
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}> {
  const r = await one<{ total: number; pending: number; approved: number; rejected: number }>(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
            COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
            COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
     FROM sm_posts WHERE project_id = ? AND status <> 'draft'`,
    [projectId],
  );
  return r ?? { total: 0, pending: 0, approved: 0, rejected: 0 };
}

/* --------------------------- dashboard de orgânico -------------------------- */

export type ProjectSummary = Project & {
  /** Criativos no link do cliente — rascunho não conta. */
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  draft: number;
  scheduled: number;
  published: number;
};

const SUMMARY_COUNTS = `
  COUNT(po.id) FILTER (WHERE po.status <> 'draft')::int AS total,
  COUNT(po.id) FILTER (WHERE po.status = 'approved')::int AS approved,
  COUNT(po.id) FILTER (WHERE po.status = 'rejected')::int AS rejected,
  COUNT(po.id) FILTER (WHERE po.status = 'pending')::int AS pending,
  COUNT(po.id) FILTER (WHERE po.status = 'draft')::int AS draft,
  COUNT(po.id) FILTER (WHERE po.publish_status = 'scheduled')::int AS scheduled,
  COUNT(po.id) FILTER (WHERE po.publish_status = 'published')::int AS published`;

export async function listProjectSummaries(): Promise<ProjectSummary[]> {
  const rows = await all<ProjectRow & Record<string, number>>(
    `SELECT p.id, p.client_id, p.title, p.client_name, p.ig_handle, p.guest_token,
            p.archived, p.ig_user_id, (p.ig_access_token IS NOT NULL) AS has_ig_token,
            p.created_by, p.created_at::text AS created_at,
            ${SUMMARY_COUNTS}
     FROM sm_projects p
     LEFT JOIN sm_posts po ON po.project_id = p.id
     WHERE p.archived = 0
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
  );
  return rows.map((r) => ({
    ...toProject(r),
    total: r.total,
    approved: r.approved,
    rejected: r.rejected,
    pending: r.pending,
    draft: r.draft,
    scheduled: r.scheduled,
    published: r.published,
  }));
}

/** Agregado por cliente da carteira — alimenta o dashboard de orgânico. */
export type ClientOrganic = {
  clientId: number | null;
  clientName: string;
  projects: number;
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  scheduled: number;
  published: number;
};

export async function listClientOrganic(): Promise<ClientOrganic[]> {
  return all<ClientOrganic>(
    `SELECT p.client_id AS "clientId",
            COALESCE(c.name, p.client_name) AS "clientName",
            COUNT(DISTINCT p.id)::int AS projects,
            COUNT(po.id) FILTER (WHERE po.status <> 'draft')::int AS total,
            COUNT(po.id) FILTER (WHERE po.status = 'approved')::int AS approved,
            COUNT(po.id) FILTER (WHERE po.status = 'rejected')::int AS rejected,
            COUNT(po.id) FILTER (WHERE po.status = 'pending')::int AS pending,
            COUNT(po.id) FILTER (WHERE po.publish_status = 'scheduled')::int AS scheduled,
            COUNT(po.id) FILTER (WHERE po.publish_status = 'published')::int AS published
     FROM sm_projects p
     LEFT JOIN clients c ON c.id = p.client_id
     LEFT JOIN sm_posts po ON po.project_id = p.id
     WHERE p.archived = 0
     GROUP BY p.client_id, COALESCE(c.name, p.client_name)
     ORDER BY total DESC, "clientName"`,
  );
}

/* --------------------------- capa por cliente --------------------------- */

/**
 * Capas da grade da aba Projetos, por chave de cliente (ver
 * `clientKeyOf` em ./clients). Uma linha por cliente que tem arte —
 * quem não tem cai no monograma, então a tabela costuma ser pequena e
 * vale trazer inteira em vez de uma consulta por cartão.
 */
export async function listClientCovers(): Promise<Record<string, string>> {
  const rows = await all<{ client_key: string; image_url: string }>(
    "SELECT client_key, image_url FROM sm_client_covers",
  );
  return Object.fromEntries(rows.map((r) => [r.client_key, r.image_url]));
}

export async function getClientCover(key: string): Promise<string | null> {
  const r = await one<{ image_url: string }>(
    "SELECT image_url FROM sm_client_covers WHERE client_key = ?",
    [key],
  );
  return r?.image_url ?? null;
}

export async function setClientCover(key: string, imageUrl: string, userId: number | null) {
  await run(
    `INSERT INTO sm_client_covers (client_key, image_url, updated_by, updated_at)
     VALUES (?, ?, ?, now())
     ON CONFLICT (client_key) DO UPDATE
       SET image_url = excluded.image_url, updated_by = excluded.updated_by, updated_at = now()`,
    [key, imageUrl, userId],
  );
}

export async function clearClientCover(key: string) {
  await run("DELETE FROM sm_client_covers WHERE client_key = ?", [key]);
}

/* ------------------------------ agendamento ------------------------------ */

export type ScheduledPost = Post & {
  projectTitle: string;
  clientName: string;
  igHandle: string;
};

const SCHEDULED_SELECT = `
  SELECT po.id, po.project_id, po.ord, po.format, po.caption, po.assets, po.status,
         po.decided_at::text AS decided_at, po.feedback, po.history,
         po.created_at::text AS created_at, po.scheduled_at::text AS scheduled_at,
         po.publish_status, po.published_at::text AS published_at,
         po.ig_media_id, po.publish_error,
         p.title AS project_title, p.client_name AS client_name, p.ig_handle AS ig_handle
  FROM sm_posts po
  JOIN sm_projects p ON p.id = po.project_id`;

function toScheduled(
  r: PostRow & { project_title: string; client_name: string; ig_handle: string },
): ScheduledPost {
  return {
    ...toPost(r),
    projectTitle: r.project_title,
    clientName: r.client_name,
    igHandle: r.ig_handle,
  };
}

/**
 * Planejamento: posts com data marcada, do mais próximo ao mais distante.
 * Inclui os já publicados (o calendário mostra o que saiu, em verde), os
 * ainda não aprovados com data prevista (mostrados como "Rascunho") e deixa
 * de fora projeto arquivado — arquivar tira do calendário.
 */
export async function listPlanned(): Promise<ScheduledPost[]> {
  const rows = await all<
    PostRow & { project_title: string; client_name: string; ig_handle: string }
  >(
    `${SCHEDULED_SELECT}
     WHERE po.scheduled_at IS NOT NULL
       AND p.archived = 0
       AND po.publish_status IN ('draft','scheduled','publishing','failed','published')
     ORDER BY po.scheduled_at ASC`,
  );
  return rows.map(toScheduled);
}
