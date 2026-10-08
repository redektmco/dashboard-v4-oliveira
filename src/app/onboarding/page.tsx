import Link from "next/link";
import { requireUser, type AuthUser } from "@/lib/auth";
import { listDashboard } from "@/lib/onboarding/db";
import { pct, type CategoryWithProgress } from "@/lib/onboarding/types";
import { Icon } from "@/components/icon";
import { Empty, PageHeader } from "@/components/ui";
import { CategoryBanner } from "@/components/onboarding/category-banner";
import { ProgressBar, ProgressRing } from "@/components/onboarding/progress";

export const metadata = { title: "Onboarding — V4 Oliveira & Co" };

/** Primeiro nome, para a saudação. */
const firstName = (name: string) => name.trim().split(/\s+/)[0];

function statusOf(c: CategoryWithProgress): { label: string; cls: string } {
  if (c.progress.total === 0) return { label: "Em breve", cls: "bg-ink-800 text-ink-400" };
  const p = pct(c.progress);
  if (p >= 100) return { label: "Concluído", cls: "bg-verde-dim text-verde-fg" };
  if (p > 0) return { label: "Em andamento", cls: "bg-amarelo-dim text-amarelo-fg" };
  return { label: "Não iniciado", cls: "bg-ink-800 text-ink-300" };
}

export default async function OnboardingHome() {
  const me: AuthUser = await requireUser();
  const categories = await listDashboard(me.id);

  const totals = categories.reduce(
    (a, c) => ({ done: a.done + c.progress.done, total: a.total + c.progress.total }),
    { done: 0, total: 0 },
  );
  const overall = pct(totals);
  const resume = categories.find((c) => c.progress.total > 0 && pct(c.progress) < 100);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Onboarding"
        title="Portal de Onboarding"
        description="Tudo o que você precisa para começar bem — cultura, sua função, processos e acessos."
        actions={
          me.is_admin ? (
            <Link href="/onboarding/admin" className="btn btn-sm">
              <Icon name="settings" size={15} />
              Administrar
            </Link>
          ) : undefined
        }
      />

      {/* Hero de boas-vindas + progresso geral + continuar de onde parou. */}
      <section className="panel overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="min-w-0">
            <h2 className="font-display text-[22px] font-bold leading-tight sm:text-[26px]">
              Bem-vindo(a), {firstName(me.name)}.
            </h2>
            <p className="mt-1.5 max-w-xl text-[13px] text-ink-300 sm:text-sm">
              {totals.total === 0
                ? "Seu onboarding está sendo preparado. Em breve o conteúdo aparece aqui."
                : overall >= 100
                  ? "Você concluiu todo o onboarding. Pode voltar aqui sempre que precisar consultar algo."
                  : resume
                    ? `Seu onboarding está ${overall}% concluído. Continue de onde parou.`
                    : `Seu onboarding está ${overall}% concluído.`}
            </p>
            {resume && (
              <Link href={`/onboarding/${resume.slug}`} className="btn btn-primary mt-4">
                <Icon name="play" size={15} />
                Continuar onboarding
                <span className="text-white/70">· {resume.title}</span>
              </Link>
            )}
          </div>
          <div className="flex items-center gap-4 sm:flex-col sm:items-end">
            <ProgressRing value={overall} size={92} stroke={7} />
            <div className="text-[12px] text-ink-400 sm:text-right">
              <div className="tnum font-display text-ink-100">
                {totals.done}/{totals.total} aulas
              </div>
              concluídas
            </div>
          </div>
        </div>
      </section>

      {/* Banners das categorias. */}
      {categories.length === 0 ? (
        <div className="panel">
          <Empty>Nenhuma categoria publicada ainda.</Empty>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {categories.map((c) => {
            const st = statusOf(c);
            const p = pct(c.progress);
            return (
              <Link
                key={c.id}
                href={`/onboarding/${c.slug}`}
                prefetch
                className="panel group flex flex-col overflow-hidden transition-colors duration-[120ms] hover:border-[var(--border-strong)]"
              >
                <CategoryBanner bannerUrl={c.bannerUrl} icon={c.icon} />
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-[16px] font-semibold text-ink-100">{c.title}</h3>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>
                      {st.label}
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 flex-1 text-[13px] text-ink-400">{c.description}</p>
                  <div className="mt-3 space-y-1.5">
                    <ProgressBar value={p} />
                    <div className="flex items-center justify-between text-[11px] text-ink-500">
                      <span className="tnum">
                        {c.progress.done}/{c.progress.total} aulas
                      </span>
                      <span className="tnum">{p}%</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
