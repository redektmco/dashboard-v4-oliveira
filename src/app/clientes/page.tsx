import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { crmBoard } from "@/lib/crm/board";
import { listUsers } from "@/lib/repo";
import { metaConfigured } from "@/lib/meta/graph";
import { ClientsCrm } from "@/components/crm/clients-crm";

export const dynamic = "force-dynamic";

/**
 * Clientes — o CRM da carteira.
 *
 * A carteira inteira sai de `crmBoard()` numa rodada de leitura só (ver o
 * comentário lá: nada de query dentro de laço). Daqui para frente é tudo
 * client-side — filtrar dezenas de contas em memória é mais rápido do que
 * voltar ao servidor a cada tecla.
 */
export default async function ClientesPage() {
  const me = await requireUser();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "app.v4oliveira.com.br";
  const baseUrl = `${h.get("x-forwarded-proto") ?? "https"}://${host}`;

  const [{ rows, summary }, users] = await Promise.all([crmBoard({ baseUrl }), listUsers()]);

  return (
    <ClientsCrm
      rows={rows}
      summary={summary}
      users={users}
      isAdmin={Boolean(me.is_admin)}
      metaReady={metaConfigured()}
      linkedAccounts={rows.flatMap((r) => r.meta.map((m) => m.adAccountId))}
    />
  );
}
