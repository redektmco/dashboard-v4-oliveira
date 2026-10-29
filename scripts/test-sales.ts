import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { listSales, salesPage } from "../src/lib/crm/sales";

test("paginação valida parâmetros inteiros positivos", () => {
  for (const raw of [undefined, "0", "-1", "1.2", "NaN", "999999999999999999999", "1e3"]) assert.equal(salesPage(raw), 1);
  assert.equal(salesPage(["2", "3"]), 2);
});

test("vendas: dias SP, deduplicação, isolamento, totais globais e paginação estável", async () => {
  const dir = await mkdtemp(join(tmpdir(), "v4-sales-"));
  process.env.DATABASE_URL = `pglite://${dir}`;
  const { migrate, run } = await import("../src/lib/db");
  try {
    await migrate();
    await run("INSERT INTO clients (name, account_type, active) VALUES ('Histórico inativo', 'lead_gen', 0), ('Outra conta', 'lead_gen', 1)");
    const add = (client: number, at: string, key: string | null, value: number) => run(`INSERT INTO crm_sales (client_id, ref_date, received_at, dedup_key, value, payload)
      VALUES (?, '2026-10-09', ?::timestamptz, ?, ?, '{"token":"private","email":"private"}'::jsonb) ON CONFLICT DO NOTHING`, [client, at, key, value]);
    await add(1, "2026-10-01T02:59:59Z", "before", 999);
    await add(1, "2026-10-01T03:00:00Z", "start", 100);
    await add(1, "2026-10-02T02:59:59Z", "end", 250);
    await add(1, "2026-10-02T03:00:00Z", "after", 999);
    await add(2, "2026-10-01T12:00:00Z", "start", 999);
    await add(1, "2026-10-01T03:00:00Z", "start", 100);
    const result = await listSales(1, "2026-10-01", "2026-10-01");
    assert.deepEqual([result.count, result.revenue, result.ticket], [2, 350, 175]);
    assert.deepEqual(result.rows.map(r => r.externalId), ["end", "start"]);
    assert.equal(result.rows[0].referenceWeek, "2026-10-09");
    assert.ok(!JSON.stringify(result).includes("private"));
    for (let n = 0; n < 30; n++) await add(1, "2026-10-01T12:00:00Z", `row-${n}`, 10);
    const first = await listSales(1, "2026-10-01", "2026-10-01");
    const last = await listSales(1, "2026-10-01", "2026-10-01", 999999);
    assert.deepEqual([first.count, first.revenue, first.rows.length, last.page, last.rows.length], [32, 650, 25, 2, 7]);
    assert.equal(first.revenue, last.revenue);
    assert.equal(new Set([...first.rows, ...last.rows].map(r => r.id)).size, 32);
    const ties = [...first.rows, ...last.rows].filter(r => r.externalId?.startsWith("row-"));
    assert.deepEqual(ties.map(r => r.id), ties.map(r => r.id).sort((a, b) => b - a));
    const empty = await listSales(1, "2026-09-01", "2026-09-01", 100);
    assert.deepEqual([empty.count, empty.revenue, empty.ticket, empty.rows.length, empty.page], [0, 0, null, 0, 1]);
  } finally {
    await (globalThis as typeof globalThis & { __pglite?: Promise<{ close: () => Promise<void> }> }).__pglite?.then(db => db.close());
    await rm(dir, { recursive: true, force: true });
  }
});
