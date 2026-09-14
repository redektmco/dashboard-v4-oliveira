import Link from "next/link";
import { canManageSocial, requireUser } from "@/lib/auth";
import { listClients } from "@/lib/repo";
import { listArchivedProjects, listClientOrganic, listProjectSummaries } from "@/lib/social/db";
import { ClientLink, PageHeader, Stat, TableScroll } from "@/components/ui";
import { Icon } from "@/components/icon";
import { NewProjectButton } from "@/components/social/new-project-form";
import { ProjectList } from "@/components/social/project-list";

export const dynamic = "force-dynamic";

export default async function SocialPage() {
  const me = await requireUser();
  const canManage = canManageSocial(me);

  const [projects, archived, organic, clients] = await Promise.all([
    listProjectSummaries(),
    listArchivedProjects(),
    listClientOrganic(),
    canManage ? listClients() : Promise.resolve([]),
  ]);

  const totals = projects.reduce(
    (a, p) => ({
      pendentes: a.pendentes + p.pending,
      aprovados: a.aprovados + p.approved,
      reprovados: a.reprovados + p.rejected,
      agendados: a.agendados + p.scheduled,
    }),
    { pendentes: 0, aprovados: 0, reprovados: 0, agendados: 0 },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Social media"
        description="Aprovação de posts, carrosséis, Reels e Stories pelo link do cliente, e o calendário do que foi aprovado."
        actions={
          <>
            <Link href="/social/planejamento" className="btn shrink-0">
              <Icon name="calendar" size={14} />
              Calendário
            </Link>
            {canManage && <NewProjectButton clients={clients.map((c) => ({ id: c.id, name: c.name }))} />}
          </>
        }
      />

      {/* Os quatro números que pedem ação, não inventário. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Aguardando cliente" value={totals.pendentes} hint="cobrar retorno" />
        <Stat label="A refazer" value={totals.reprovados} tone={totals.reprovados ? "vermelho" : "default"} hint="reprovados pelo cliente" />
        <Stat label="Aprovados" value={totals.aprovados} tone="verde" />
        <Stat label="No calendário" value={totals.agendados} tone="amarelo" hint="aprovados com data" />
      </div>

      <ProjectList
        canManage={canManage}
        projects={projects.map((p) => ({
          id: p.id,
          title: p.title,
          clientName: p.clientName,
          igHandle: p.igHandle,
          guestToken: p.guestToken,
          createdAt: p.createdAt,
          total: p.total,
          pending: p.pending,
          approved: p.approved,
          rejected: p.rejected,
          scheduled: p.scheduled,
        }))}
        archived={archived.map((p) => ({ id: p.id, title: p.title, clientName: p.clientName, createdAt: p.createdAt }))}
      />

      {/* Relatório, não tarefa: fechado por padrão para não disputar a atenção. */}
      {organic.length > 0 && (
        <details className="panel group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
            <div>
              <h2 className="font-display text-[16px] font-semibold text-ink-100">Orgânico por cliente</h2>
              <p className="mt-0.5 text-[12.5px] text-ink-400">Volume de criativos e estágio de aprovação, agregado por cliente.</p>
            </div>
            <Icon name="chevronDown" size={16} className="shrink-0 text-ink-400 transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-[var(--border-hair)]">
            <TableScroll>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th className="text-right">Projetos</th>
                    <th className="text-right">Criativos</th>
                    <th className="text-right">Aprovados</th>
                    <th className="text-right">Reprovados</th>
                    <th className="text-right">Pendentes</th>
                    <th className="text-right">No calendário</th>
                  </tr>
                </thead>
                <tbody>
                  {organic.map((c) => (
                    <tr key={`${c.clientId ?? "x"}-${c.clientName}`}>
                      <td className="font-medium">
                        {c.clientId ? <ClientLink id={c.clientId} name={c.clientName} /> : c.clientName}
                      </td>
                      <td className="tnum text-right text-ink-300">{c.projects}</td>
                      <td className="tnum text-right text-ink-300">{c.total}</td>
                      <td className="tnum text-right text-verde-fg">{c.approved}</td>
                      <td className="tnum text-right text-vermelho-fg">{c.rejected}</td>
                      <td className="tnum text-right text-ink-400">{c.pending}</td>
                      <td className="tnum text-right text-amarelo-fg">{c.scheduled}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </div>
        </details>
      )}
    </div>
  );
}
