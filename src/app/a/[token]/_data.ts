import { cache } from "react";
import { getProjectByToken } from "@/lib/social/db";

/**
 * Busca do projeto por token, memoizada por requisição: a página e o
 * `generateMetadata` pedem o mesmo dado no mesmo request — `cache` garante
 * uma única ida ao banco. (A OG image roda em outra requisição.)
 */
export const getGuestProject = cache((token: string) => getProjectByToken(token));
