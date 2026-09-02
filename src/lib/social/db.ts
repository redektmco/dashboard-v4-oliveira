// ============================================================
// Repositório de Social media sobre Postgres (Neon).
//
// Único módulo que toca a persistência das tabelas sm_*. Mapeia
// as linhas (snake_case) para o domínio camelCase de ./types.
// ============================================================
import { all, one, run } from "../db";
import type {
  Asset,
  DecisionEvent,
  Post,
  Project,
  PostStatus,
  PublishStatus,
} from "./types";

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
    createdAt: r.created_at,
  };
}

export async function listProjects(): Promise<Project[]> {
  const rows = await all<ProjectRow>(
    `${PROJECT_SELECT} WHERE p.archived = 0 ORDER BY p.created_at DESC`,
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

export async function deleteProject(id: string): Promise<void> {
  await run("DELETE FROM sm_projects WHERE id = ?", [id]);
}

/** Só para o worker de publicação: token real da conta IG. */
export async function getProjectCredentials(
  id: string,
): Promise<{ igUserId: string | null; igAccessToken: string | null } | null> {
  const r = await one<{ ig_user_id: string | null; ig_access_token: string | null }>(
    "SELECT ig_user_id, ig_access_token FROM sm_projects WHERE id = ?",
    [id],
  );
  return r ? { igUserId: r.ig_user_id, igAccessToken: r.ig_access_token } : null;
}

/* ------------------------------- posts -------------------------------- */

type PostRow = {
  id: string;
  project_id: string;
  ord: number;
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
  SELECT id, project_id, ord, caption, assets, status,
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
    caption: r.caption,
    assets: Array.isArray(r.assets) ? r.assets : [],
    status: r.status,
    decidedAt: r.decided_at,
    feedback: r.feedback ?? undefined,
    history: Array.isArray(r.history) ? r.history : [],
    createdAt: r.created_at,
    scheduledAt: r.scheduled_at,
    publishStatus: r.publish_status,
    publishedAt: r.published_at,
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

export async function nextOrder(projectId: string): Promise<number> {
  const r = await one<{ n: number | null }>(
    "SELECT MAX(ord) AS n FROM sm_posts WHERE project_id = ?",
    [projectId],
  );
  return r?.n == null ? 0 : Number(r.n) + 1;
}

export async function createPosts(
  posts: {
    id: string;
    projectId: string;
    order: number;
    caption: string;
    assets: Asset[];
  }[],
): Promise<void> {
  for (const p of posts) {
    await run(
      `INSERT INTO sm_posts (id, project_id, ord, caption, assets)
       VALUES (?, ?, ?, ?, ?::jsonb)`,
      [p.id, p.projectId, p.order, p.caption, JSON.stringify(p.assets)],
    );
  }
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

export async function deletePost(id: string): Promise<void> {
  await run("DELETE FROM sm_posts WHERE id = ?", [id]);
}

/* --------------------------- dashboard de orgânico -------------------------- */

export type ProjectSummary = Project & {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  scheduled: number;
  published: number;
};

const SUMMARY_COUNTS = `
  COUNT(po.id)::int AS total,
  COUNT(po.id) FILTER (WHERE po.status = 'approved')::int AS approved,
  COUNT(po.id) FILTER (WHERE po.status = 'rejected')::int AS rejected,
  COUNT(po.id) FILTER (WHERE po.status = 'pending')::int AS pending,
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
            COUNT(po.id)::int AS total,
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

/* ------------------------------ agendamento ------------------------------ */

export type ScheduledPost = Post & {
  projectTitle: string;
  clientName: string;
  igHandle: string;
};

const SCHEDULED_SELECT = `
  SELECT po.id, po.project_id, po.ord, po.caption, po.assets, po.status,
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

/** Planejamento: posts com data marcada, do mais próximo ao mais distante. */
export async function listPlanned(): Promise<ScheduledPost[]> {
  const rows = await all<
    PostRow & { project_title: string; client_name: string; ig_handle: string }
  >(
    `${SCHEDULED_SELECT}
     WHERE po.scheduled_at IS NOT NULL
       AND po.publish_status IN ('scheduled','publishing','failed')
     ORDER BY po.scheduled_at ASC`,
  );
  return rows.map(toScheduled);
}

/** Fila do worker: agendados cujo horário já chegou. */
export async function listDuePosts(limit = 10): Promise<ScheduledPost[]> {
  const rows = await all<
    PostRow & { project_title: string; client_name: string; ig_handle: string }
  >(
    `${SCHEDULED_SELECT}
     WHERE po.publish_status = 'scheduled'
       AND po.scheduled_at IS NOT NULL
       AND po.scheduled_at <= now()
     ORDER BY po.scheduled_at ASC
     LIMIT ?`,
    [limit],
  );
  return rows.map(toScheduled);
}
