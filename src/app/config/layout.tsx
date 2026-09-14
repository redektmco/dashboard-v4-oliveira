import { requireUser } from "@/lib/auth";
import { ConfigNav } from "@/components/config-nav";
import { PageHeader } from "@/components/ui";

/**
 * Configurações: tudo que se ajusta de vez em quando e não é jornada do dia
 * — cadastro da carteira, calibração do modelo, acesso do time e integrações.
 * Antes eram três itens soltos no menu principal disputando atenção com as
 * tarefas diárias.
 */
export default async function ConfigLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  return (
    <div className="space-y-5">
      <PageHeader title="Configurações" />
      <ConfigNav isAdmin={Boolean(me.is_admin)} />
      <div className="space-y-5">{children}</div>
    </div>
  );
}
