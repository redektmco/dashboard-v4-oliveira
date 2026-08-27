/**
 * Job diário (briefing 7 e 8). Agendar no cron da Vercel ou do host.
 * Aceita `--days=N` para refazer a série (backfill após recalibrar pesos).
 */
import { migrate } from "../src/lib/db";
import { recomputeAll, recomputeRange, today } from "../src/lib/repo";

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--days="));
  const days = arg ? Number(arg.split("=")[1]) : 0;

  await migrate();
  const r = days > 0 ? await recomputeRange(days) : await recomputeAll();
  console.log(
    days > 0
      ? `Backfill de ${days} dias: ${r.snapshots} snapshots de ${r.clients} clientes.`
      : `Recompute ${r.day}: ${r.clients} clientes.`,
  );
  console.log(`Referência: ${today()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
