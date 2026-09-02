import Link from "next/link";
import { canManageSocial, requireUser } from "@/lib/auth";
import { listClients } from "@/lib/repo";
import { listClientOrganic, listProjectSummaries } from "@/lib/social/db";
import { Panel, Stat, ClientLink, dateBR } from "@/components/ui";
import { Icon } from "@/components/icon";
import { NewProjectForm } from "@/components/social/new-project-form";

export const dynamic = "force-dynamic";

export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const me = await requireUser();
  const canManage = canManageSocial(me);
  const { ok, erro } = await searchParams;

  const [projects, organic, clients] = await Promise.all([
    listProjectSummaries(),
    listClientOrganic(),
    canManage ? listClients() : Promise.resolve([]),
  ]);

  const totals = projects.reduce(
    (a, p) => ({
      criativos: a.criativos + p.total,
      aprovados: a.aprovados + p.approved,
      agendados: a.agendados + p.scheduled,
      publicados: a.publicados + p.published,
    }),
    { criativos: 0, aprovados: 0, agendados: 0, publicados: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">
            Social media
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-400">
            Aprovação de criativos por swipe, planejamento e publicação automática no
            Instagram. Orgânico por cliente da carteira.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/social/planejamento" className="btn btn-sm">
            <Icon name="calendar" size={14} />
            Planejamento
          </Link>
        </div>
      </div>

      {ok && (
        <div className="flex items-center gap-2 rounded-lg bg-verde-dim px-4 py-2.5 text-sm font-semibold text-verde-fg">
          <Icon name="check" size={15} />
          {ok}
        </div>
      )}
      {erro && (
        <div className="flex items-center gap-2 rounded-lg bg-vermelho-dim px-4 py-2.5 text-sm font-semibold text-vermelho-fg">
          <Icon name="alert" size={15} />
          {erro}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Projetos" value={projects.length} />
        <Stat label="Criativos" value={totals.criativos} />
        <Stat label="Aprovados" value={totals.aprovados} tone="verde" />
        <Stat label="Agendados" value={totals.agendados} tone="amarelo" />
      </div>

      {canManage && <NewProjectForm clients={clients} />}

      <Panel
        title="Orgânico por cliente"
        subtitle="Volume de criativos e estágio de aprovação, agregado por cliente."
      >
        {organic.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-400">
            Nenhum projeto ainda. {canManage ? "Crie o primeiro acima." : ""}
          </p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th className="text-right">Projetos</th>
                <th className="text-right">Criativos</th>
                <th className="text-right">Aprovados</th>
                <th className="text-right">Reprovados</th>
                <th className="text-right">Pendentes</th>
                <th className="text-right">Agendados</th>
                <th className="text-right">Publicados</th>
              </tr>
            </thead>
            <tbody>
              {organic.map((c) => (
                <tr key={`${c.clientId ?? "x"}-${c.clientName}`}>
                  <td className="font-medium">
                    {c.clientId ? (
                      <ClientLink id={c.clientId} name={c.clientName} />
                    ) : (
                      c.clientName
                    )}
                  </td>
                  <td className="tnum text-right text-ink-300">{c.projects}</td>
                  <td className="tnum text-right text-ink-300">{c.total}</td>
                  <td className="tnum text-right text-verde-fg">{c.approved}</td>
                  <td className="tnum text-right text-vermelho-fg">{c.rejected}</td>
                  <td className="tnum text-right text-ink-400">{c.pending}</td>
                  <td className="tnum text-right text-amarelo-fg">{c.scheduled}</td>
                  <td className="tnum text-right text-verde-fg">{c.published}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Projetos" subtitle={`${projects.length} ativos`}>
        {projects.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-400">Nenhum projeto ainda.</p>
        ) : (
          <div className="divide-y divide-[var(--border-hair)]">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/social/projetos/${p.id}`}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-ink-850"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink-100">{p.title}</div>
                  <div className="truncate text-[13px] text-ink-400">
                    {p.clientName} · @{p.igHandle} · {dateBR(p.createdAt)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold">
                  {p.pending > 0 && (
                    <span className="rounded-full bg-ink-800 px-2 py-0.5 text-ink-300">
                      {p.pending} pend.
                    </span>
                  )}
                  {p.approved > 0 && (
                    <span className="rounded-full bg-verde-dim px-2 py-0.5 text-verde-fg">
                      {p.approved} aprov.
                    </span>
                  )}
                  {p.rejected > 0 && (
                    <span className="rounded-full bg-vermelho-dim px-2 py-0.5 text-vermelho-fg">
                      {p.rejected} reprov.
                    </span>
                  )}
                  {p.scheduled > 0 && (
                    <span className="rounded-full bg-amarelo-dim px-2 py-0.5 text-amarelo-fg">
                      {p.scheduled} agend.
                    </span>
                  )}
                  {p.published > 0 && (
                    <span className="rounded-full bg-verde-dim px-2 py-0.5 text-verde-fg">
                      {p.published} public.
                    </span>
                  )}
                  <Icon name="arrowLeft" size={16} className="rotate-180 text-ink-500" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
