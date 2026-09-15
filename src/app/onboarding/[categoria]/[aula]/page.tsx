import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getLesson, getOutline, getPublishedCategoryBySlug } from "@/lib/onboarding/db";
import { LESSON_TYPE_LABEL } from "@/lib/onboarding/types";
import { renderMarkdown } from "@/lib/onboarding/markdown";
import { toVideoEmbed } from "@/lib/onboarding/video";
import { Icon } from "@/components/icon";
import { VideoEmbed } from "@/components/onboarding/video-embed";
import { LessonChecklist, MarkComplete, OpenOnMount } from "@/components/onboarding/lesson-controls";

export const metadata = { title: "Aula — Onboarding" };

/** Bloco de corpo Markdown, renderizado no servidor (seguro, pré-escapado). */
function Prose({ content }: { content: string }) {
  if (!content.trim()) return null;
  return <div className="ob-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />;
}

/** Cartão de acesso externo (link, documento, ferramenta). */
function LinkCard({ url, label, hint }: { url: string; label: string; hint?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="panel flex items-center gap-3 p-4 transition-colors duration-[120ms] hover:border-[var(--border-strong)]"
    >
      <Icon name="external" size={18} className="text-v4-red" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink-100">{label}</span>
        {hint && <span className="block truncate text-[12px] text-ink-500">{hint}</span>}
      </span>
      <Icon name="arrowRight" size={16} className="text-ink-500" />
    </a>
  );
}

export default async function LessonPage({ params }: { params: Promise<{ categoria: string; aula: string }> }) {
  const { categoria, aula } = await params;
  const lessonId = Number(aula);
  if (!Number.isInteger(lessonId)) notFound();

  const me = await requireUser();
  const category = await getPublishedCategoryBySlug(categoria);
  if (!category) notFound();

  const [lesson, outline] = await Promise.all([getLesson(lessonId, me.id), getOutline(category.id, me.id)]);
  if (!lesson) notFound();

  // A aula tem de pertencer a esta categoria (via esqueleto publicado).
  const flat = outline.flatMap((m) => m.lessons);
  const idx = flat.findIndex((l) => l.id === lessonId);
  if (idx === -1) notFound();
  const prev = idx > 0 ? flat[idx - 1] : null;
  const next = idx < flat.length - 1 ? flat[idx + 1] : null;
  const moduleTitle = outline.find((m) => m.id === lesson.moduleId)?.title;
  const embed = lesson.type === "video" ? toVideoEmbed(lesson.videoUrl) : null;

  return (
    <article className="space-y-6">
      <OpenOnMount lessonId={lesson.id} />

      <header>
        <div className="eyebrow">
          {moduleTitle ? `${moduleTitle} · ` : ""}
          {LESSON_TYPE_LABEL[lesson.type]}
        </div>
        <h1 className="mt-1 font-display text-[24px] font-bold leading-tight tracking-tight sm:text-[28px]">
          {lesson.title}
        </h1>
        {lesson.description && <p className="mt-2 max-w-2xl text-[14px] text-ink-300">{lesson.description}</p>}
      </header>

      {/* Corpo conforme o tipo. */}
      <div className="space-y-5">
        {lesson.type === "video" &&
          (embed ? (
            <VideoEmbed embed={embed} title={lesson.title} />
          ) : lesson.videoUrl ? (
            <LinkCard url={lesson.videoUrl} label="Abrir vídeo" hint={lesson.videoUrl} />
          ) : null)}

        {(lesson.type === "link" || lesson.type === "tool" || lesson.type === "document") &&
          lesson.externalUrl && (
            <LinkCard
              url={lesson.externalUrl}
              label={
                lesson.type === "tool"
                  ? `Acessar ${lesson.title}`
                  : lesson.type === "document"
                    ? "Abrir documento"
                    : "Abrir link"
              }
              hint={lesson.externalUrl}
            />
          )}

        <Prose content={lesson.content} />

        {lesson.type === "checklist" && lesson.checklist.length > 0 && (
          <LessonChecklist lessonId={lesson.id} items={lesson.checklist} initialChecked={lesson.checklistState} />
        )}
      </div>

      {/* Rodapé: concluir + navegação entre aulas. */}
      <footer className="flex flex-col gap-4 border-t border-[var(--border-hair)] pt-5">
        <MarkComplete lessonId={lesson.id} categorySlug={category.slug} initialDone={lesson.progressStatus === "done"} />
        <div className="flex items-center justify-between gap-3">
          {prev ? (
            <Link href={`/onboarding/${category.slug}/${prev.id}`} prefetch className="btn btn-ghost min-w-0">
              <Icon name="chevronLeft" size={16} />
              <span className="min-w-0 truncate">{prev.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={`/onboarding/${category.slug}/${next.id}`} prefetch className="btn min-w-0">
              <span className="min-w-0 truncate">{next.title}</span>
              <Icon name="chevronRight" size={16} />
            </Link>
          ) : (
            <Link href={`/onboarding/${category.slug}`} className="btn min-w-0">
              Voltar à categoria
              <Icon name="arrowRight" size={16} />
            </Link>
          )}
        </div>
      </footer>
    </article>
  );
}
