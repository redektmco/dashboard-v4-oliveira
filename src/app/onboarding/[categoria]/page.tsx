import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getOutline, getPublishedCategoryBySlug } from "@/lib/onboarding/db";
import { LESSON_TYPE_LABEL, pct } from "@/lib/onboarding/types";
import { Icon, type IconName } from "@/components/icon";
import { CategoryBanner } from "@/components/onboarding/category-banner";
import { ProgressBar, StatusDot } from "@/components/onboarding/progress";

const TYPE_ICON: Record<string, IconName> = {
  text: "file",
  video: "play",
  link: "link",
  document: "file",
  checklist: "listCheck",
  tool: "wrench",
};

export async function generateMetadata({ params }: { params: Promise<{ categoria: string }> }) {
  const { categoria } = await params;
  const c = await getPublishedCategoryBySlug(categoria);
  return { title: c ? `${c.title} — Onboarding` : "Onboarding" };
}

export default async function CategoryOverview({ params }: { params: Promise<{ categoria: string }> }) {
  const { categoria } = await params;
  const me = await requireUser();
  const category = await getPublishedCategoryBySlug(categoria);
  if (!category) notFound();

  const outline = await getOutline(category.id, me.id);
  const flat = outline.flatMap((m) => m.lessons);
  const total = flat.length;
  const done = flat.filter((l) => l.progressStatus === "done").length;
  const p = pct({ done, total });
  const resume = flat.find((l) => l.progressStatus !== "done") ?? flat[0];

  return (
    <div className="space-y-6">
      <CategoryBanner bannerUrl={category.bannerUrl} icon={category.icon}>
        <span className="eyebrow text-white/70">Categoria</span>
        <h1 className="font-display text-[24px] font-bold leading-tight text-white sm:text-[30px]">
          {category.title}
        </h1>
      </CategoryBanner>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <p className="max-w-2xl text-[13px] text-ink-300 sm:text-sm">{category.description}</p>
        {resume && (
          <Link href={`/onboarding/${category.slug}/${resume.id}`} className="btn btn-primary shrink-0">
            <Icon name="play" size={15} />
            {done === 0 ? "Começar" : done >= total ? "Revisar" : "Continuar"}
          </Link>
        )}
      </div>

      <div className="space-y-1.5">
        <ProgressBar value={p} />
        <div className="flex items-center justify-between text-[12px] text-ink-500">
          <span className="tnum">
            {done}/{total} aulas concluídas
          </span>
          <span className="tnum">{p}%</span>
        </div>
      </div>

      {/* Módulos e suas aulas. */}
      <div className="space-y-5">
        {outline.map((m, mi) => (
          <section key={m.id} className="panel">
            <header className="border-b border-[var(--border-hair)] px-4 py-3.5 sm:px-5">
              <div className="eyebrow">Módulo {String(mi + 1).padStart(2, "0")}</div>
              <h2 className="mt-0.5 font-display text-[16px] font-semibold text-ink-100">{m.title}</h2>
              {m.description && <p className="mt-1 text-[12.5px] text-ink-400">{m.description}</p>}
            </header>
            <ul>
              {m.lessons.map((l) => (
                <li key={l.id} className="border-b border-[var(--border-hair)] last:border-0">
                  <Link
                    href={`/onboarding/${category.slug}/${l.id}`}
                    prefetch
                    className="flex items-center gap-3 px-4 py-3 transition-colors duration-[120ms] hover:bg-ink-850 sm:px-5"
                  >
                    <StatusDot status={l.progressStatus} />
                    <Icon name={TYPE_ICON[l.type] ?? "file"} size={15} className="text-ink-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-ink-100">{l.title}</span>
                      {l.description && (
                        <span className="block truncate text-[12px] text-ink-500">{l.description}</span>
                      )}
                    </span>
                    <span className="hidden shrink-0 text-[11px] text-ink-600 sm:block">
                      {LESSON_TYPE_LABEL[l.type]}
                    </span>
                    <Icon name="chevronRight" size={15} className="text-ink-600" />
                  </Link>
                </li>
              ))}
              {m.lessons.length === 0 && (
                <li className="px-5 py-4 text-[13px] text-ink-500">Sem aulas publicadas neste módulo.</li>
              )}
            </ul>
          </section>
        ))}
        {outline.length === 0 && (
          <div className="panel px-5 py-10 text-center text-sm text-ink-400">
            Esta categoria ainda não tem módulos publicados.
          </div>
        )}
      </div>
    </div>
  );
}
