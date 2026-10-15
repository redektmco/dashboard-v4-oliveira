import { all } from "../db";
import { isWorkspaceScreen, parseWorkspaceLayout, workspaceStoragePrefix, type WorkspaceLayout, type WorkspaceScreen } from "./layout";

/**
 * Server only (reads the database). Saved layouts of one user, keyed by screen, so the first paint already
 * uses them. `null` = a stored value that no longer parses; a missing screen = nothing saved.
 */
export type SavedWorkspaces = Partial<Record<WorkspaceScreen, WorkspaceLayout | null>>;

export async function loadSavedWorkspaces(userId: number): Promise<SavedWorkspaces> {
  const prefix = workspaceStoragePrefix(userId);
  const rows = await all<{ key: string; value: unknown }>("SELECT key, value FROM settings WHERE key LIKE ?", [`${prefix}%`]);
  const saved: SavedWorkspaces = {};
  for (const row of rows) {
    const screen = row.key.slice(prefix.length);
    if (row.key.startsWith(prefix) && isWorkspaceScreen(screen)) saved[screen] = parseWorkspaceLayout(row.value);
  }
  return saved;
}
