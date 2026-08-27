import * as React from "react";
export interface TopbarProps { crumbs?: string[]; period?: string; onSearch?: (q: string) => void; query?: string; }
export declare function Topbar(props: TopbarProps): React.ReactElement;
