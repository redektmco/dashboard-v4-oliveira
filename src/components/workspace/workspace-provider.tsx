"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { JobRole } from "@/lib/roles";

export type WorkspaceUser = { id: number; role: string; roles?: string[] };
type WorkspaceContextValue = { user: WorkspaceUser; jobRoles: JobRole[] };
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
export function WorkspaceProvider({ user, jobRoles, children }: WorkspaceContextValue & { children: ReactNode }) {
  return <WorkspaceContext.Provider value={{ user, jobRoles }}>{children}</WorkspaceContext.Provider>;
}
export const useWorkspace = () => useContext(WorkspaceContext);
