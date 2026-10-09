import { listMetaLinks, saveMetaDaily, saveMetaError, saveMetaWeeks, today } from "../repo";
import { dailySyncRange } from "../media-daily";
import { ritualWeekEnd } from "../week";
import { fetchDailySpend, fetchWeeklyInsights } from "./graph";

/** Semanas-ritual das últimas `n` semanas, da em curso para trás. */
export function recentWeeks(n: number, from = today()): string[] {
  const cur = ritualWeekEnd(from);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(cur + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 7 * i);
    return d.toISOString().slice(0, 10);
  });
}

export type SyncResult = { accounts: number; ok: number; failed: { account: string; error: string }[] };

/**
 * Puxa as últimas `weeks` semanas de cada conta ativa (ou só de `adAccountId`).
 * A semana em curso vem parcial e só entra no score depois de fechar; as
 * anteriores são regravadas porque a Meta ainda ajusta conversão atrasada.
 * Uma conta com erro (token sem acesso, conta desativada) não para as demais.
 */
export async function syncMeta({ weeks = 3, adAccountId }: { weeks?: number; adAccountId?: string } = {}) {
  const refs = recentWeeks(Math.min(Math.max(weeks, 1), 26));
  const days = dailySyncRange(today());
  const links = (await listMetaLinks()).filter((l) =>
    adAccountId ? l.ad_account_id === adAccountId : l.active === 1,
  );
  const result: SyncResult = { accounts: links.length, ok: 0, failed: [] };
  // Poucas por vez: a Marketing API limita por conta e por app.
  for (let i = 0; i < links.length; i += 4) {
    await Promise.all(
      links.slice(i, i + 4).map(async (l) => {
        try {
          const [weekly, daily] = await Promise.all([
            fetchWeeklyInsights(l.ad_account_id, refs),
            fetchDailySpend(l.ad_account_id, days),
          ]);
          await saveMetaDaily(l.ad_account_id, daily);
          await saveMetaWeeks(l.ad_account_id, weekly);
          result.ok++;
        } catch (e) {
          const error = e instanceof Error ? e.message : String(e);
          await saveMetaError(l.ad_account_id, error);
          result.failed.push({ account: l.name || l.ad_account_id, error });
        }
      }),
    );
  }
  return result;
}
