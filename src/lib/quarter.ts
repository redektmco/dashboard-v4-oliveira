/** Início do próximo trimestre civil — a data da "Recalibração trimestral". */
export function nextQuarterStart(from = new Date()): string {
  const y = from.getFullYear();
  const q = Math.floor(from.getMonth() / 3) + 1;
  const d = q === 4 ? new Date(Date.UTC(y + 1, 0, 1)) : new Date(Date.UTC(y, q * 3, 1));
  return d.toISOString().slice(0, 10);
}

export const dateBRFull = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
