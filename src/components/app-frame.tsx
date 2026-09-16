"use client";

import { usePathname } from "next/navigation";
import { MobileNav, Sidebar } from "./nav";

type Perfil = { name: string; isAdmin: boolean; role: string };

/**
 * Moldura do console (rail lateral e, no celular, cabeçalho + abas). O link
 * de aprovação do cliente (`/a/...`) vive sem ela mesmo quando quem abre está
 * logado — a equipe confere o link exatamente como o cliente vai ver.
 *
 * Não há topbar no desktop: a conta mora no rodapé do rail e o título da
 * página é o primeiro elemento da área de conteúdo, como num console de BI.
 */
export function AppFrame({ user, children }: { user: Perfil; children: React.ReactNode }) {
  const path = usePathname();
  if (path.startsWith("/a/")) return <>{children}</>;
  return (
    <>
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav user={user} />
        <main className="app-main mx-auto w-full max-w-[1480px] px-4 pt-4 sm:px-6 lg:px-7 lg:pt-5">
          {children}
        </main>
      </div>
    </>
  );
}
