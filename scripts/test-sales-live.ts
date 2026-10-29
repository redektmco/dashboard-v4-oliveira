import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mergeLiveSales } from "../src/lib/crm/live-sales";

test("Vendas de hoje preservam mídia e não reutilizam ROAS/ROI sem custo atual", () => {
  const base = { budget_real: 500, cpl_real: 25, leads_real: 20, roas_real: 5, roi_real: 200 };
  const merged = mergeLiveSales(base, { sales_real: 3, revenue_real: 30000 }, false, "Hoje");
  assert.deepEqual([merged.budget_real, merged.cpl_real, merged.leads_real], [500, 25, 20]);
  assert.deepEqual([merged.roas_real, merged.roi_real, merged.revenue_real], [null, null, 30000]);
  assert.equal(base.roas_real, 5, "Não modifica o snapshot original");
  assert.equal(mergeLiveSales(base, { roas_real: 60, roi_real: 4500 }, true, "Hoje").roas_real, 60);
});

test("Venda recebida hoje aparece no período padrão sem esperar o fechamento do ritual", async () => {
  const dir = await mkdtemp(join(tmpdir(), "v4-sale-live-"));
  process.env.DATABASE_URL = `pglite://${dir}`;
  const { migrate, run, all } = await import("../src/lib/db");
  const { today, setTargets, createIntegration, scoreFor, perfSnapshots } = await import("../src/lib/repo");
  const { recordSaleReceipt } = await import("../src/lib/crm/sale-receipt");
  const { parsePeriod } = await import("../src/lib/ficha-period");
  const { ritualWeekEnd } = await import("../src/lib/week");
  const { listSales } = await import("../src/lib/crm/sales");
  try {
    await migrate();
    await run("INSERT INTO clients (name, account_type, mrr) VALUES ('Venda live teste', 'ecommerce', 0)");
    await createIntegration(1, null);
    const at = today();
    await setTargets(1, { revenue_meta: 30000, roas_meta: 10, budget_meta: 500 }, at);
    const yesterday = new Date(at + "T12:00:00Z"); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await run(`INSERT INTO performance_snapshots (client_id, ref_date, data) VALUES (1, ?::date,
      '{"budget_real":500,"budget_meta":500,"revenue_real":1000,"revenue_meta":30000,"roas_real":2,"roas_meta":10}')`, [yesterday.toISOString().slice(0, 10)]);
    const before = await perfSnapshots(1);
    const receipt = await recordSaleReceipt(1, ritualWeekEnd(at), "live-sale", 30000, { valor: 30000 });
    assert.equal(receipt.receivedDate, at);
    const period = parsePeriod({}, at);
    assert.equal(period.until, at);
    const sales = await listSales(1, period.since, period.until);
    assert.equal(sales.count, 1); assert.equal(sales.revenue, 30000);
    const score = await scoreFor(1, at);
    const revenue = score!.dimensions.flatMap((d) => d.fields).find((f) => f.key === "revenue");
    assert.equal(revenue?.score, 100, "Faturamento de hoje preenche a régua imediatamente");
    for (const key of ["roas", "roi"])
      assert.equal(score!.dimensions.flatMap((d) => d.fields).find((f) => f.key === key)?.score, null, "Não reutiliza razão antiga sem mídia da mesma semana");
    assert.deepEqual(await perfSnapshots(1), before, "Leitura não regrava snapshots antigos");
    const [stored] = await all<{ ref: string; day: string }>(`SELECT ref_date::text AS ref,
      (received_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS day FROM crm_sales`);
    assert.equal(stored.ref, ritualWeekEnd(at)); assert.equal(stored.day, at);
  } finally {
    await (globalThis as typeof globalThis & { __pglite?: Promise<{ close: () => Promise<void> }> }).__pglite?.then((db) => db.close());
    await rm(dir, { recursive: true, force: true });
  }
});
