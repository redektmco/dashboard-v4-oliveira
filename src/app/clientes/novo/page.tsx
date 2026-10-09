import { requireUser } from "@/lib/auth";
import { listUsers } from "@/lib/repo";
import { PageHead } from "@/components/page-head";
import { ClientWizard } from "@/components/crm/client-wizard";

export const dynamic = "force-dynamic";

/**
 * Novo cliente, em seções. Substitui o formulário em modal no caminho de
 * criação; a edição pontual continua no modal da ficha, que é mais rápido
 * para mexer em um campo só.
 */
export default async function NovoClientePage() {
  await requireUser();
  const users = await listUsers();

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        crumbs={[{ href: "/clientes", label: "Clientes" }, { label: "Novo cliente" }]}
        title="Novo cliente"
        description="Cadastre o essencial agora. O resto pode ser completado depois, direto na ficha do cliente."
      />
      <ClientWizard users={users} />
    </div>
  );
}
