// ============================================================
// Social media — a aba Projetos vista por CLIENTE.
//
// A tela é de dois degraus: primeiro o cliente, depois os
// planejamentos (projetos) dele. Este módulo é o degrau de cima e é
// puro de propósito — a página busca as linhas, aqui se decide o que
// conta como "um cliente", quais números vão no cartão e a ordem.
// ============================================================
import type { Project } from "./types";

/** Pasta das capas no Blob (`social/clientes/...`). */
export const COVER_FOLDER = "clientes";

/** Capa é thumb, não mídia de criativo: 8 MB já é folgado. */
export const MAX_COVER_BYTES = 8 * 1024 * 1024;

/** Um projeto na lista, com o placar já somado (ver `listProjectSummaries`). */
export type ProjectCard = Pick<
  Project,
  "id" | "clientId" | "title" | "clientName" | "igHandle" | "guestToken" | "createdAt"
> & {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  scheduled: number;
};

/** Um projeto arquivado, como aparece na gaveta. */
export type ArchivedCard = Pick<Project, "id" | "clientId" | "title" | "clientName" | "createdAt">;

/** Um cliente da tela: os projetos dele e a soma do placar. */
export type ClientGroup = {
  key: string;
  clientId: number | null;
  clientName: string;
  /** @ do Instagram distintos entre os projetos (quase sempre um só). */
  handles: string[];
  imageUrl: string | null;
  projects: ProjectCard[];
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  scheduled: number;
  /** Data do projeto mais recente — "mexido por último". */
  lastAt: string;
};

/** Minúsculas, sem acento e sem espaço dobrado: comparação de nome digitado. */
export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

/**
 * Chave do cliente na tela. Cliente da carteira é `c:<id>` (o nome pode ser
 * corrigido sem quebrar o vínculo); projeto avulso, que só tem nome digitado,
 * é `n:<nome normalizado>` — assim "Padaria Estrela" e "padaria estrela"
 * caem no mesmo cartão. É a chave da capa em `sm_client_covers`.
 */
export function clientKeyOf(p: { clientId: number | null; clientName: string }): string {
  return p.clientId != null ? `c:${p.clientId}` : `n:${normalizeName(p.clientName)}`;
}

/** Guarda do que vem do navegador: a chave tem uma das duas formas, e é curta. */
export function isValidClientKey(key: unknown): key is string {
  return typeof key === "string" && /^(c:[1-9][0-9]{0,9}|n:[^\s].{0,119})$/.test(key);
}

/** Duas letras para o monograma de quem ainda não tem capa. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => p.length > 2);
  if (parts.length === 0) return name.trim().slice(0, 2).toUpperCase() || "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/**
 * Agrupa os projetos ativos por cliente e soma o placar de cada um.
 * Mantém a ordem que veio do banco (mais novo primeiro) dentro do cliente e
 * devolve os clientes em ordem alfabética — a grade é para procurar alguém,
 * e o que pede ação já está nos números do cartão.
 */
export function groupByClient(
  projects: ProjectCard[],
  covers: Record<string, string> = {},
): ClientGroup[] {
  const groups = new Map<string, ClientGroup>();

  for (const p of projects) {
    const key = clientKeyOf(p);
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        clientId: p.clientId,
        clientName: p.clientName,
        handles: [],
        imageUrl: covers[key] ?? null,
        projects: [],
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        scheduled: 0,
        lastAt: p.createdAt,
      };
      groups.set(key, g);
    }
    g.projects.push(p);
    g.total += p.total;
    g.pending += p.pending;
    g.approved += p.approved;
    g.rejected += p.rejected;
    g.scheduled += p.scheduled;
    if (p.igHandle && !g.handles.includes(p.igHandle)) g.handles.push(p.igHandle);
    if (p.createdAt > g.lastAt) g.lastAt = p.createdAt;
  }

  return [...groups.values()].sort((a, b) => a.clientName.localeCompare(b.clientName, "pt-BR"));
}

/** Busca da grade: nome do cliente, @ ou título de um dos planejamentos. */
export function matchesClientQuery(g: ClientGroup, query: string): boolean {
  const q = normalizeName(query);
  if (!q) return true;
  if (normalizeName(g.clientName).includes(q)) return true;
  if (g.handles.some((h) => normalizeName(h).includes(q))) return true;
  return g.projects.some((p) => normalizeName(p.title).includes(q));
}
