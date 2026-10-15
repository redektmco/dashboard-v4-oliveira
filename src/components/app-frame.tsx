"use client";

import { usePathname } from "next/navigation";
import { MobileNav, Sidebar } from "./nav";
import type { Aviso } from "@/lib/repo";
import type { JobRole } from "@/lib/roles";
import type { SavedWorkspaces } from "@/lib/workspace/saved";
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
  savedLayouts,
  children,
}: {
  user: Perfil;
  avisos: Aviso[];
  jobRoles: JobRole[];
  /** Telas organizadas pela pessoa, lidas no servidor; null quando a leitura falhou. */
  savedLayouts: SavedWorkspaces | null;
  children: React.ReactNode;
}) {
  const path = usePathname();
  // O provedor fica montado em toda rota (mesma chave nos dois ramos): o layout
  // raiz não renderiza de novo na navegação, então as telas salvas nesta
  // visita só vivem no estado dele. Outra pessoa logada = provedor novo.
  const bare = path.startsWith("/a/") || path.startsWith("/r/")
    // O construtor de relatórios ocupa a tela inteira, como o Elementor.
    || /^\/relatorios\/[^/]+$/.test(path);
  if (bare) return <WorkspaceProvider key={user.id} user={user} jobRoles={jobRoles} savedLayouts={savedLayouts}>{children}</WorkspaceProvider>;
  return (
    <WorkspaceProvider key={user.id} user={user} jobRoles={jobRoles} savedLayouts={savedLayouts}>
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
