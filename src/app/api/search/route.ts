import { NextResponse } from "next/server";
import { all } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ACCOUNT_TYPE_LABEL, type AccountType } from "@/lib/model/types";

export const dynamic = "force-dynamic";

/**
 * Busca da barra superior ("Buscar cliente, tarefa…"): clientes pelo nome e
 * planos de ação pelo título. Poucas linhas, já no formato da lista.
 */
export async function GET(req: Request) {
  if (!(await getSessionUser())) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ clients: [], plans: [] });
  const like = `%${q.replace(/[%_\\]/g, (m) => "\\" + m)}%`;

  const [clients, plans] = await Promise.all([
    all<{ id: number; name: string; account_type: AccountType; active: number; gt: string | null; acc: string | null }>(
      `SELECT c.id, c.name, c.account_type, c.active, g.name AS gt, a.name AS acc
       FROM clients c
       LEFT JOIN users g ON g.id = c.gt_user_id
       LEFT JOIN users a ON a.id = c.account_user_id
       WHERE c.name ILIKE ? ORDER BY c.active DESC, c.name LIMIT 8`,
      [like],
    ),
    all<{ id: number; client_id: number; risk: string; client: string; status: string }>(
      `SELECT p.id, p.client_id, p.risk, c.name AS client, p.status
       FROM action_plans p JOIN clients c ON c.id = p.client_id
       WHERE p.risk ILIKE ? OR p.plan ILIKE ?
       ORDER BY (p.status IN ('aberto','em_andamento')) DESC, p.created_at DESC LIMIT 6`,
      [like, like],
    ),
  ]);

  return NextResponse.json({
    clients: clients.map((c) => ({
      id: c.id,
      name: c.name,
      sub: [ACCOUNT_TYPE_LABEL[c.account_type], c.gt && `GT ${c.gt}`, c.acc && `Account ${c.acc}`, !c.active && "arquivado"]
        .filter(Boolean)
        .join(" · "),
    })),
    plans: plans.map((p) => ({ id: p.id, clientId: p.client_id, title: p.risk, sub: p.client })),
  });
}
