"use server";

import { getSessionUser } from "@/lib/auth";
import { one, run } from "@/lib/db";
import { isWorkspaceKey, parseWorkspaceLayout, workspaceStorageKey, type WorkspaceLayout } from "@/lib/workspace/layout";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export async function loadWorkspace(screen: string): Promise<Result<WorkspaceLayout | null>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente para carregar sua tela." };
  if (!isWorkspaceKey(screen)) return { ok: false, error: "Tela inválida." };
  try {
    const row = await one<{ value: unknown }>("SELECT value FROM settings WHERE key = ?", [workspaceStorageKey(user.id, screen)]);
    const layout = row ? parseWorkspaceLayout(row.value) : null;
    if (row && !layout) return { ok: false, error: "A configuração salva é inválida. Restaure o padrão para recuperá-la." };
    return { ok: true, value: layout };
  } catch { return { ok: false, error: "Não foi possível carregar sua tela. Tente novamente." }; }
}

export async function saveWorkspace(screen: string, input: unknown): Promise<Result<WorkspaceLayout>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente para salvar sua tela." };
  const layout = parseWorkspaceLayout(input);
  if (!isWorkspaceKey(screen) || !layout) return { ok: false, error: "Configuração de tela inválida." };
  try {
    await run(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?::jsonb, now())
      ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()`,
    [workspaceStorageKey(user.id, screen), JSON.stringify(layout)]);
    return { ok: true, value: layout };
  } catch { return { ok: false, error: "Não foi possível salvar. Suas alterações continuam aqui; tente novamente." }; }
}

export async function resetWorkspace(screen: string): Promise<Result<null>> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sua sessão expirou. Entre novamente para restaurar sua tela." };
  if (!isWorkspaceKey(screen)) return { ok: false, error: "Tela inválida." };
  try {
    await run("DELETE FROM settings WHERE key = ?", [workspaceStorageKey(user.id, screen)]);
    return { ok: true, value: null };
  } catch { return { ok: false, error: "Não foi possível restaurar o padrão. Tente novamente." }; }
}
