"use client";

import { usePathname } from "next/navigation";
import { CrumbProvider, MobileNav, Sidebar, TopBar } from "./nav";
import type { Aviso } from "@/lib/repo";

type Perfil = { name: string; isAdmin: boolean; role: string };

/**
 * Moldura do console: rail lateral, barra superior (onde estou, busca e
 * avisos) e, no celular, cabeçalho com gaveta. O link de aprovação do
 * cliente (`/a/...`) vive sem ela mesmo quando quem abre está logado — a
 * equipe confere o link exatamente como o cliente vai ver.
 *
 * Configurações tem moldura própria (menu de seções e "Voltar para a
 * carteira"), montada no layout de `/config`.
 */
export function AppFrame({
  user,
  avisos,
  children,
}: {
  user: Perfil;
  avisos: Aviso[];
  children: React.ReactNode;
}) {
  const path = usePathname();
  if (path.startsWith("/a/")) return <>{children}</>;
  if (path.startsWith("/config")) return <div className="flex min-w-0 flex-1">{children}</div>;
  return (
    <CrumbProvider>
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav user={user} avisos={avisos} />
        <TopBar avisos={avisos} />
        <main className="app-main mx-auto w-full max-w-[1480px] px-4 pt-4 sm:px-6 lg:px-10 lg:pt-7">{children}</main>
      </div>
    </CrumbProvider>
  );
}
