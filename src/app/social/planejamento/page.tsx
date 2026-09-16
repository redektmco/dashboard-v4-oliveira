import { requireSocial } from "@/lib/auth";
import { listPlanned } from "@/lib/social/db";
import { Panel, PageHeader, Stat } from "@/components/ui";
import PlanningCalendar, { type PlannedItem } from "@/components/social/planning-calendar";
import { RouteTabs } from "@/components/tabs";
import { formatBadge } from "@/lib/social/media";

export const dynamic = "force-dynamic";

export default async function PlanejamentoPage() {
  await requireSocial();
  const planned = await listPlanned();

  const items: PlannedItem[] = planned
    .filter((p) => p.scheduledAt)
    .map((p) => ({
      id: p.id,
      projectId: p.projectId,
      scheduledAt: p.scheduledAt!,
      caption: p.caption,
      thumb: p.assets[0] ? { url: p.assets[0].url, name: p.assets[0].name, kind: p.assets[0].kind, contentType: p.assets[0].contentType } : null,
      format: formatBadge(p),
      clientName: p.clientName,
      igHandle: p.igHandle,
      projectTitle: p.projectTitle,
      publishStatus: p.publishStatus,
    }));

  const clients = new Set(items.map((p) => p.clientName)).size;
  const projects = new Set(items.map((p) => p.projectId)).size;

  return (
    <div className="space-y-6">
      <PageHeader
        icon="calendar"
        back={{ href: "/social", label: "Social media" }}
        title="Planejamento"
        description="Calendário de conteúdo aprovado. Visualize as datas marcadas por mês e organize a esteira de publicação de cada cliente."
      />

      <RouteTabs
        items={[
          { href: "/social", label: "Projetos", icon: "image", exact: true },
          { href: "/social/planejamento", label: "Planejamento", icon: "calendar" },
        ]}
        label="Seções de Social media"
      />

      {items.length === 0 ? (
        <Panel title="Nada agendado">
          <p className="px-5 py-8 text-center text-sm text-ink-400">
            Aprove criativos e defina a data de publicação na página do projeto para eles
            aparecerem no calendário.
          </p>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Datas marcadas" value={items.length} tone="amarelo" />
            <Stat label="Projetos" value={projects} />
            <Stat label="Clientes" value={clients} />
          </div>
          <PlanningCalendar items={items} />
        </>
      )}
    </div>
  );
}
