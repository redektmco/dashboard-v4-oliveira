"use client";

import { usePathname } from "next/navigation";
import { MobileNav, Sidebar, Topbar } from "./nav";

type Perfil = { name: string; isAdmin: boolean; role: string };

/**
 * Moldura do painel (rail, topbar, abas do celular). O link de aprovação do
 * cliente (`/a/...`) vive sem ela mesmo quando quem abre está logado — a
 * equipe confere o link exatamente como o cliente vai ver.
 */
export function AppFrame({ user, children }: { user: Perfil; children: React.ReactNode }) {
  const path = usePathname();
  if (path.startsWith("/a/")) return <>{children}</>;
  return (
    <>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} />
        <MobileNav user={user} />
        <main className="app-main mx-auto w-full max-w-[1480px] px-4 pt-5 sm:px-6 lg:px-7 lg:pt-6">{children}</main>
      </div>
    </>
  );
}
