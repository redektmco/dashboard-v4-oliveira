import { clientFootprints, getAllTargets, listClients, listUsers } from "@/lib/repo";
import { requireUser } from "@/lib/auth";
import { ClientsManager } from "@/components/clients-manager";

export const dynamic = "force-dynamic";

const EMPTY_FOOTPRINT = { perf: 0, checkins: 0, plans: 0, projects: 0, leads: 0, integration: false };

export default async function ConfigClientesPage() {
  const me = await requireUser();
  const [clients, users, targetsBy, footprints] = await Promise.all([
    listClients(false),
    listUsers(),
    getAllTargets(),
    clientFootprints(),
  ]);

  return (
    <ClientsManager
      isAdmin={Boolean(me.is_admin)}
      users={users}
      rows={clients.map((c) => ({
        ...c,
        targets: targetsBy.get(c.id) ?? {},
        footprint: footprints.get(c.id) ?? EMPTY_FOOTPRINT,
      }))}
    />
  );
}
