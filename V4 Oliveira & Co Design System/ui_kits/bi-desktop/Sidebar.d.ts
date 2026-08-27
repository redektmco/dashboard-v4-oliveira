import * as React from "react";
export interface SidebarProps { current?: string; onNavigate?: (id: string) => void; counts?: Record<string, number>; }
export declare function Sidebar(props: SidebarProps): React.ReactElement;
