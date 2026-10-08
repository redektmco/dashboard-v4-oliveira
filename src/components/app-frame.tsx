"use client";

import { usePathname } from "next/navigation";
import { MobileNav, Sidebar } from "./nav";
import type { Aviso } from "@/lib/repo";

type Perfil = { name: string; isAdmin: boolean; role: string };

/**
 * Moldura do console (rail lateral e, no celular, cabeçalho + abas). O link
 * de aprovação do cliente (`/a/...`) vive sem ela mesmo quando quem abre está
 * logado — a equipe confere o link exatamente como o cliente vai ver.
 *
 * Não há topbar no desktop: a conta mora no rodapé do rail e o título da
 * página é o primeiro elemento da área de conteúdo, como num console de BI.
 *
 * Configurações usa a mesma moldura; as páginas dela trazem o próprio respiro
 * (`ConfigPage`), então a área de conteúdo não soma margem por cima.
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
  // Configurações e Performance desenham a própria faixa de abas de ponta a ponta.
  const config = path.startsWith("/config") || path.startsWith("/gt");
  return (
    <>
      <Sidebar user={user} avisos={avisos} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav user={user} />
        <main
          className={
            config
              ? "app-main min-w-0 flex-1"
              : "app-main mx-auto w-full max-w-[1480px] px-4 pt-4 sm:px-6 lg:px-7 lg:pt-5"
          }
        >
          {children}
        </main>
      </div>
    </>
  );
}
