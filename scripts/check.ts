/**
 * Diagnóstico: imprime a carteira ordenada por risco e, opcionalmente,
 * abre um cliente por nome com seus snapshots e dimensões.
 *
 *   npx dotenv -e .env.local -- npx tsx scripts/check.ts
 *   npx dotenv -e .env.local -- npx tsx scripts/check.ts "AutoCenter"
 */
import { all, migrate } from "../src/lib/db";
import { checkinSnapshots, perfSnapshots, portfolio, portfolioSummary, scoreFor, today } from "../src/lib/repo";

await migrate();
const p = await portfolio();
for (const r of p) {
  console.log(
    String(r.score.score).padStart(5),
    (r.score.band ?? "-").padEnd(9),
    r.score.confidence.padEnd(6),
    "d7=" + String(r.delta7).padStart(6),
    r.client.name.padEnd(26),
    r.score.overrides.map((o) => o.trigger).join(" | "),
  );
}
console.log(portfolioSummary(p).byBand);

const target = process.argv[2];
if (target) {
  const c = (
    await all<{ id: number; name: string }>("SELECT id, name FROM clients WHERE name ILIKE ?", [
      `%${target}%`,
    ])
  )[0];
  console.log("\n===", c.name, "| hoje:", today());
  for (const s of await checkinSnapshots(c.id, 5)) console.log("  chk", s.ref_date, JSON.stringify(s.data));
  for (const s of await perfSnapshots(c.id, 3)) console.log("  perf", s.ref_date, JSON.stringify(s.data));
  const r = (await scoreFor(c.id))!;
  for (const d of r.dimensions) console.log("  ", d.key.padEnd(14), d.score, "peso", d.weight);
}
