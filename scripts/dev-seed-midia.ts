/**
 * Semeia mídia de Meta e Google para um cliente, só para conferir a seção
 * "Mídia por canal" da ficha com dados de verdade no desenvolvimento local.
 *
 *   DATABASE_URL=pglite://./.data/pglite npx tsx scripts/dev-seed-midia.ts [clientId]
 */
import { all, migrate, run } from "../src/lib/db";
import { ritualWeekEnd } from "../src/lib/week";

const shift = (day: string, n: number) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function main() {
  if (!(process.env.DATABASE_URL ?? "").startsWith("pglite:")) {
    console.error("Recusado: só roda contra o PGlite local.");
    process.exit(1);
  }
  await migrate();

  const clientId = Number(process.argv[2]) || (await all<{ id: number }>("SELECT id FROM clients ORDER BY id LIMIT 1"))[0]?.id;
  if (!clientId) {
    console.error("Nenhum cliente no banco.");
    process.exit(1);
  }

  const act = `act_dev_${clientId}`;
  const cus = `dev-${clientId}`;
  await run(
    `INSERT INTO meta_ad_accounts (client_id, ad_account_id, name, active, last_sync_at)
     VALUES (?, ?, 'Conta Meta (dev)', 1, now()) ON CONFLICT (ad_account_id) DO NOTHING`,
    [clientId, act],
  );
  await run(
    `INSERT INTO google_ad_accounts (client_id, customer_id, name, active, last_sync_at)
     VALUES (?, ?, 'Conta Google (dev)', 1, now()) ON CONFLICT (customer_id) DO NOTHING`,
    [clientId, cus],
  );

  const last = ritualWeekEnd(new Date().toISOString().slice(0, 10));
  for (let i = 7; i >= 0; i--) {
    const ref = shift(last, -7 * i);
    const spend = 1800 - i * 120;
    await run(
      `INSERT INTO meta_insights (ad_account_id, ref_date, spend, leads, revenue, impressions, clicks)
       VALUES (?, ?::date, ?, ?, ?, ?, ?)
       ON CONFLICT (ad_account_id, ref_date) DO UPDATE SET spend = excluded.spend, leads = excluded.leads`,
      [act, ref, spend, 60 - i * 3, spend * 2.4, spend * 22, spend * 1.4],
    );
    const gspend = 900 + i * 40;
    await run(
      `INSERT INTO google_insights (customer_id, ref_date, spend, conversions, revenue, impressions, clicks)
       VALUES (?, ?::date, ?, ?, ?, ?, ?)
       ON CONFLICT (customer_id, ref_date) DO UPDATE SET spend = excluded.spend, conversions = excluded.conversions`,
      [cus, ref, gspend, 20 + i, gspend * 3.1, gspend * 15, gspend * 0.9],
    );
  }
  console.log(`Mídia semeada para o cliente ${clientId}: 8 semanas de Meta e Google.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
