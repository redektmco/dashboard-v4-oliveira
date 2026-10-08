import { listGoogleLinks, saveGoogleError, saveGoogleWeeks } from "../repo";
import { recentWeeks } from "../meta/sync";
import { fetchWeeklyInsights } from "./ads";

export type GoogleSyncResult = { accounts: number; ok: number; failed: { account: string; error: string }[] };

/**
 * Puxa as últimas `weeks` semanas de cada conta ativa (ou só de `customerId`).
 * As semanas anteriores são regravadas porque o Google ainda ajusta conversão
 * atrasada. Uma conta com erro não para as demais.
 */
export async function syncGoogle({ weeks = 3, customerId }: { weeks?: number; customerId?: string } = {}) {
  const refs = recentWeeks(Math.min(Math.max(weeks, 1), 26));
  const links = (await listGoogleLinks()).filter((l) => (customerId ? l.customer_id === customerId : l.active === 1));
  const result: GoogleSyncResult = { accounts: links.length, ok: 0, failed: [] };
  // Poucas por vez: o developer token tem cota diária.
  for (let i = 0; i < links.length; i += 3) {
    await Promise.all(
      links.slice(i, i + 3).map(async (l) => {
        try {
          await saveGoogleWeeks(l.customer_id, await fetchWeeklyInsights(l.customer_id, refs));
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
