import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/ui";
import { AdminNav } from "@/components/onboarding/admin/admin-nav";

/**
 * Área administrativa do onboarding (/onboarding/admin). Protegida por
 * `requireAdmin` — o funcionário comum nunca chega aqui. Reaproveita o padrão
 * de sub-abas usado no resto do painel.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="space-y-5">
      <PageHeader
        icon="wrench"
        eyebrow="Onboarding · CMS"
        title="Administração do onboarding"
        description="Gerencie categorias, módulos e aulas. Rascunhos não aparecem para o time."
        actions={
          <Link href="/onboarding" className="btn btn-sm">
            <Icon name="external" size={15} />
            Ver como funcionário
          </Link>
        }
      />
      <AdminNav />
      <div>{children}</div>
    </div>
  );
}
