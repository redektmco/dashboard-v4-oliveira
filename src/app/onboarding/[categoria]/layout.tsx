import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getOutline, getPublishedCategoryBySlug } from "@/lib/onboarding/db";
import { Icon } from "@/components/icon";
import { LessonNav, type NavModule } from "@/components/onboarding/lesson-nav";

/**
 * Moldura da categoria: breadcrumb + índice de aulas (sidebar) fixo, com o
 * conteúdo à direita. A troca de aula é client-side (`<Link>` da sidebar), sem
 * recarregar a moldura. `getPublishedCategoryBySlug`/`getOutline` são `cache()`,
 * então layout e página dividem o mesmo round-trip.
 */
export default async function CategoryLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ categoria: string }>;
}) {
  const { categoria } = await params;
  const me = await requireUser();
  const category = await getPublishedCategoryBySlug(categoria);
  if (!category) notFound();

  const outline = await getOutline(category.id, me.id);
  const navModules: NavModule[] = outline.map((m) => ({
    id: m.id,
    title: m.title,
    lessons: m.lessons.map((l) => ({ id: l.id, title: l.title, progressStatus: l.progressStatus })),
  }));

  const sidebar = <LessonNav categorySlug={category.slug} modules={navModules} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 text-xs text-ink-400">
        <Link href="/onboarding" className="hover:text-ink-100">
          Onboarding
        </Link>
        <Icon name="chevronRight" size={12} className="text-ink-600" />
        <span className="font-semibold text-ink-200">{category.title}</span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-7">
        {/* Índice — no celular vira um acordeão; no desktop, coluna fixa. */}
        <details className="panel px-3 py-2.5 lg:hidden">
          <summary className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-ink-200">
            <Icon name="listCheck" size={16} />
            Índice de aulas
          </summary>
          <div className="mt-3">{sidebar}</div>
        </details>
        <aside className="hidden lg:block">
          <div className="sticky top-6">{sidebar}</div>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
