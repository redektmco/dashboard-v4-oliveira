import Link from "next/link";
import { notFound } from "next/navigation";
import { adminGetCategory, adminOutline } from "@/lib/onboarding/db";
import { Icon } from "@/components/icon";
import { ContentTree } from "@/components/onboarding/admin/content-tree";

export default async function CategoryContent({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const id = Number(categoryId);
  if (!Number.isInteger(id)) notFound();

  const category = await adminGetCategory(id);
  if (!category) notFound();
  const blocks = await adminOutline(id);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link href="/onboarding/admin/conteudo" className="inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-100">
            <Icon name="arrowLeft" size={12} />
            Todas as categorias
          </Link>
          <h2 className="mt-1 font-display text-[20px] font-bold tracking-tight text-ink-100">{category.title}</h2>
        </div>
        <Link href={`/onboarding/${category.slug}`} className="btn btn-sm shrink-0">
          <Icon name="external" size={14} />
          Ver categoria
        </Link>
      </div>

      <ContentTree categoryId={id} blocks={blocks} />
    </div>
  );
}
