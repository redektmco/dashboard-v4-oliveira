/**
 * Serviços contratados.
 *
 * Até aqui isto era texto livre separado por vírgula, o que servia para ler
 * mas não para decidir nada. Com uma lista fechada o painel sabe o que a
 * conta contratou — e pode deixar de mostrar campanha de um canal que o
 * cliente não tem.
 *
 * Contratos antigos têm textos fora da lista; eles continuam válidos e
 * aparecem como estão (ver `splitServices`). Nada é reescrito na migração.
 */

export const SERVICES = [
  "Meta Ads",
  "Google Ads",
  "Gestão de CRM",
  "Social Media",
  "Landing pages",
  "SEO",
  "E-mail marketing",
  "Consultoria",
] as const;

export type Service = (typeof SERVICES)[number];

/** Canais de mídia: a presença deles diz se faz sentido mostrar campanha. */
export const MEDIA_SERVICE: Record<string, "meta" | "google"> = {
  "Meta Ads": "meta",
  "Google Ads": "google",
};

const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/** O serviço do catálogo equivalente a um texto livre, se houver. */
export function matchService(raw: string): Service | null {
  const n = norm(raw);
  return SERVICES.find((s) => norm(s) === n) ?? null;
}

/**
 * Separa os serviços de um cliente entre os do catálogo e os livres, que
 * vieram de cadastros antigos. Os livres são preservados como escritos.
 */
export function splitServices(list: string[]): { known: Service[]; custom: string[] } {
  const known: Service[] = [];
  const custom: string[] = [];
  for (const raw of list) {
    const hit = matchService(raw);
    if (hit) {
      if (!known.includes(hit)) known.push(hit);
    } else if (raw.trim()) {
      custom.push(raw.trim());
    }
  }
  return { known, custom };
}

/** O cliente contrata esse canal de mídia? Sem serviço cadastrado, não dá para afirmar que não. */
export function hasMediaService(services: string[], channel: "meta" | "google"): boolean | null {
  const { known } = splitServices(services);
  if (!known.length) return null;
  return known.some((s) => MEDIA_SERVICE[s] === channel);
}
