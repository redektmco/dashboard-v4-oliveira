import { listGoogleLinks, saveGoogleDaily, saveGoogleError, saveGoogleUnread, saveGoogleWeeks, today } from "../repo";
import { dailySyncRange } from "../media-daily";
import { recentWeeks } from "../meta/sync";
import { fetchInsights } from "./ads";

/**
 * Versão das regras de leitura do Google. Mudou? Troque a string: o próximo
 * sync (cron ou "Sincronizar agora") relê 12 semanas de todas as contas.
 */
export const GOOGLE_RULES = "2026-10-13.por-campanha";

export type GoogleSyncResult = { accounts: number; ok: number; failed: { account: string; error: string }[] };

/**
 * Puxa as últimas `weeks` semanas de cada conta ativa (ou só de `customerId`).
 * As semanas anteriores são regravadas porque o Google ainda ajusta conversão
 * atrasada. Uma conta com erro não para as demais.
 */
export async function syncGoogle({ weeks = 3, customerId, clientId }: { weeks?: number; customerId?: string; clientId?: number } = {}) {
  const refs = recentWeeks(Math.min(Math.max(weeks, 1), 26));
  const days = dailySyncRange(today());
  const links = (await listGoogleLinks()).filter((l) =>
    customerId ? l.customer_id === customerId : l.active === 1 && (!clientId || l.client_id === clientId),
  );
  const result: GoogleSyncResult = { accounts: links.length, ok: 0, failed: [] };
  // Poucas por vez: o developer token tem cota diária.
  for (let i = 0; i < links.length; i += 3) {
    await Promise.all(
      links.slice(i, i + 3).map(async (l) => {
        try {
          const r = await fetchInsights(l.customer_id, refs, days);
          await saveGoogleDaily(l.customer_id, r.days);
          await saveGoogleWeeks(l.customer_id, r.weeks);
          await saveGoogleUnread(l.customer_id, r.unread);
          result.ok++;
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          await saveGoogleError(l.customer_id, error);
          result.failed.push({ account: l.name || l.customer_id, error });
        }
      }),
    );
  }
  return result;
}
