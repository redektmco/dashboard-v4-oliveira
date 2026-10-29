import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { recordSaleReceipt } from "../src/lib/crm/sale-receipt";

test("recibo separa recebimento SP e semana; replay preserva dados e chave é por cliente", async () => {
  const dir = await mkdtemp(join(tmpdir(), "v4-sale-receipt-"));
  process.env.DATABASE_URL = `pglite://${dir}`;
  const { migrate, run, one } = await import("../src/lib/db");
  try {
    await migrate();
    await run("INSERT INTO clients (name, account_type) VALUES ('Recibos', 'lead_gen'), ('Outra conta', 'lead_gen')");
    await run("INSERT INTO crm_integrations (client_id, token, provider) VALUES (1, 'local-test-one', 'generic'), (2, 'local-test-two', 'generic')");
    const first = await recordSaleReceipt(1, "2026-10-30", "deal-1", 123, { original: true });
    assert.equal(first.counted, true);
    assert.equal(first.refDate, "2026-10-30");
    assert.equal(first.value, 123);
    assert.equal(first.receivedDate, new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(first.receivedAt)));
    assert.ok((await one<{ at: string | null }>("SELECT last_sale_at::text AS at FROM crm_integrations WHERE client_id = 1"))?.at);
    // UTC 29 at 01:00 is still the 28th in São Paulo, irrespective of ritual date.
    await run("UPDATE crm_sales SET received_at = '2026-10-29T01:00:00Z'::timestamptz WHERE id = ?", [first.id]);
    const replay = await recordSaleReceipt(1, "2026-11-06", "deal-1", 999, { overwritten: true });
    assert.deepEqual(replay, { id: first.id, counted: false, value: 123, refDate: "2026-10-30", receivedAt: "2026-10-29T01:00:00.000Z", receivedDate: "2026-10-28" });
    const original = await one<{ payload: unknown }>("SELECT payload FROM crm_sales WHERE id = ?", [first.id]);
    assert.deepEqual(original?.payload, { original: true });
    await run("UPDATE crm_sales SET received_at = '2026-10-29T03:00:00Z'::timestamptz WHERE id = ?", [first.id]);
    assert.equal((await recordSaleReceipt(1, "2026-11-06", "deal-1", 999, {})).receivedDate, "2026-10-29");
    const otherClient = await recordSaleReceipt(2, "2026-10-30", "deal-1", 456, {});
    assert.equal(otherClient.counted, true);
    assert.notEqual(otherClient.id, first.id);
    const noKey1 = await recordSaleReceipt(1, "2026-10-30", null, 0, {});
    const noKey2 = await recordSaleReceipt(1, "2026-10-30", null, 0, {});
    assert.equal(noKey1.counted, true);
    assert.equal(noKey2.counted, true);
    assert.notEqual(noKey1.id, noKey2.id);
    assert.equal((await one<{ n: number }>("SELECT count(*)::int AS n FROM crm_sales"))?.n, 4);
  } finally {
    await (globalThis as typeof globalThis & { __pglite?: Promise<{ close: () => Promise<void> }> }).__pglite?.then(db => db.close());
    await rm(dir, { recursive: true, force: true });
  }
});
