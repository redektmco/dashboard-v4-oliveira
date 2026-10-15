"use client";

import { usePathname } from "next/navigation";
import { MobileNav, Sidebar } from "./nav";
import type { Aviso } from "@/lib/repo";
import type { JobRole } from "@/lib/roles";
import { WorkspaceProvider } from "./workspace/workspace-provider";

type Perfil = { id: number; name: string; isAdmin: boolean; role: string; roles?: string[]; roleCatalog?: JobRole[] };

/**
 * Moldura do console (rail lateral e, no celular, cabeçalho + abas). O link
 * de aprovação do cliente (`/a/...`) e o do relatório (`/r/...`) vivem sem ela mesmo quando quem abre está
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
  jobRoles,
  children,
}: {
  user: Perfil;
  avisos: Aviso[];
  jobRoles: JobRole[];
  children: React.ReactNode;
}) {
  const path = usePathname();
  if (path.startsWith("/a/") || path.startsWith("/r/")) return <>{children}</>;
  // O construtor de relatórios ocupa a tela inteira, como o Elementor.
  if (/^\/relatorios\/[^/]+$/.test(path)) return <>{children}</>;
  return (
    <WorkspaceProvider user={user} jobRoles={jobRoles}>
      <Sidebar user={{ ...user, roleCatalog: jobRoles }} avisos={avisos} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav user={{ ...user, roleCatalog: jobRoles }} />
        {/* A largura e o respiro de toda tela moram aqui, e só aqui: nenhuma
            página define o próprio container. */}
        <main className="app-main mx-auto w-full min-w-0 max-w-[1320px] px-4 pt-5 sm:px-6 lg:px-10 lg:pt-8">
          {children}
        </main>
      </div>
    </WorkspaceProvider>
  );
}
