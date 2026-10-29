import { transaction } from "./db";
import { validateClassification, type ClientStatus, type RevenueModel } from "./client-lifecycle";

/** Grava classificação e sua fonte atomicamente; não apaga o valor/histórico anterior. */
export async function classifyClient(id: number, userId: number, input: { status: string; revenueModel: string; mrr: number; source: string; confirmed: boolean }) {
  const error = validateClassification(input);
  if (error) throw new Error(error);
  const status = input.status as ClientStatus | "";
  const revenue = input.revenueModel as RevenueModel | "";
  await transaction([
    ["SELECT id FROM clients WHERE id = ? FOR UPDATE", [id]],
    [`INSERT INTO client_classification_events (client_id, client_reference, client_name, user_id, actor_name, source, previous, current)
      SELECT id, id, name, ?, COALESCE((SELECT name FROM users WHERE id = ?), 'Usuário removido'), ?, jsonb_build_object('status', lifecycle_status, 'active', active, 'revenue_model', revenue_model, 'mrr', mrr),
        jsonb_build_object('status', COALESCE(NULLIF(?::text, ''), lifecycle_status),
          'revenue_model', COALESCE(NULLIF(?::text, ''), revenue_model), 'mrr', ?::numeric)
      FROM clients WHERE id = ?`, [userId, userId, input.source.trim(), status, revenue, input.mrr, id]],
    [`UPDATE clients SET lifecycle_status = COALESCE(NULLIF(?::text, ''), lifecycle_status),
       active = CASE WHEN ?::text = '' THEN active WHEN ?::text = 'active' THEN 1 ELSE 0 END,
       revenue_model = COALESCE(NULLIF(?::text, ''), revenue_model), mrr = ? WHERE id = ?`,
    [status, status, status, revenue, input.mrr, id]],
  ]);
}
