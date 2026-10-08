import { persistScore, scoreFor, today } from "./repo";
import { syncFlag } from "./playbook/db";

/**
 * Recalcula e grava o snapshot do dia de um cliente — chamado após cada
 * input. Se a flag mudou com o input, o playbook da nova começa agora.
 */
export async function refreshClient(clientId: number) {
  const r = await scoreFor(clientId);
  if (!r) return;
  await persistScore(clientId, today(), r);
  await syncFlag(clientId, r.band);
}
