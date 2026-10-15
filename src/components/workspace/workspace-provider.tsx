"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { JobRole } from "@/lib/roles";
import type { WorkspaceLayout, WorkspaceScreen } from "@/lib/workspace/layout";
import type { SavedWorkspaces } from "@/lib/workspace/saved";

export type WorkspaceUser = { id: number; role: string; roles?: string[] };
type WorkspaceContextValue = {
  user: WorkspaceUser;
  jobRoles: JobRole[];
  /** Layouts preloaded by the root layout; null when that read failed (screens then load on mount). */
  saved: SavedWorkspaces | null;
  /** Keep the client copy current after save/reset: the root layout does not rerender on navigation. */
  remember: (screen: WorkspaceScreen, layout: WorkspaceLayout | undefined) => void;
};
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
export function WorkspaceProvider({ user, jobRoles, savedLayouts, children }: { user: WorkspaceUser; jobRoles: JobRole[]; savedLayouts: SavedWorkspaces | null; children: ReactNode }) {
  const [saved, setSaved] = useState(savedLayouts);
  const remember = useCallback((screen: WorkspaceScreen, layout: WorkspaceLayout | undefined) => setSaved((current) => {
    if (!current) return current;
    const next = { ...current };
    if (layout) next[screen] = layout; else delete next[screen];
    return next;
  }), []);
  const value = useMemo(() => ({ user, jobRoles, saved, remember }), [user, jobRoles, saved, remember]);
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
export const useWorkspace = () => useContext(WorkspaceContext);
