import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { overviewMetrics, type CrmPeriodTotals } from "../src/lib/performance/overview";
import { EMPTY_TOTALS, type PerformanceData, type Totals } from "../src/lib/performance/model";
import { accountTotals, metaTotals } from "../src/lib/performance/meta-live";
import { googleTotals } from "../src/lib/performance/google-live";

const crm: CrmPeriodTotals = { leads: 30, sales: 4, revenue: 2000 };
const fixture = (meta: Partial<Totals> = {}, google: Partial<Totals> = {}): PerformanceData => ({
  since: "2026-10-01", until: "2026-10-31", previous: { since: "2026-09-01", until: "2026-09-30" },
  accountType: "lead_gen", budgetTarget: null, fetchedAt: "2026-10-29T12:00:00Z",
  channels: {
    meta: { channel: "meta", linked: true, accounts: [{ id: "meta", name: "Meta", lastSync: null, error: null }],
      totals: { ...EMPTY_TOTALS, spend: 300, leadResults: 20, leadSpend: 100, impressions: 1000, ...meta }, previous: null, daily: [], campaigns: [] },
    google: { channel: "google", linked: true, accounts: [{ id: "google", name: "Google", lastSync: null, error: null }],
      totals: { ...EMPTY_TOTALS, spend: 200, leadResults: 5, leadSpend: 200, impressions: 500, ...google }, previous: null, daily: [], campaigns: [] },
  },
});

test("Visão geral concilia totais e custos, sem somar receita do pixel ao CRM", () => {
  const result = overviewMetrics(fixture({ revenue: 9000, purchases: 9 }), crm, "campaign");
  assert.deepEqual([result.spend, result.revenue, result.sales, result.leads, result.impressions], [500, 2000, 4, 25, 1500]);
  assert.deepEqual([result.roas, result.cpv, result.cpl, result.ticket], [4, 125, 12, 500]);
  assert.equal(overviewMetrics(fixture(), crm, "webhook").cpl, 500 / 30);
  const both = overviewMetrics(fixture(), crm, "both");
  assert.equal(both.leads, 55);
  assert.equal(both.cpl, 500 / 55);
});

test("Visão geral distingue fonte ausente, zero e denominador zero", () => {
  const missing = overviewMetrics(fixture(), { leads: null, sales: null, revenue: null }, "webhook");
  assert.deepEqual([missing.leads, missing.sales, missing.revenue, missing.ticket, missing.cpv, missing.roas], [null, null, null, null, null, null]);
  assert.equal(overviewMetrics(fixture(), { ...crm, leads: null }, "both").leads, null);
  const zero = overviewMetrics(fixture({ spend: 0, leadResults: 0, leadSpend: 0 }, { spend: 0, leadResults: 0, leadSpend: 0 }), { leads: 0, sales: 0, revenue: 0 }, "campaign");
  assert.deepEqual([zero.spend, zero.revenue, zero.leads, zero.sales], [0, 0, 0, 0]);
  assert.deepEqual([zero.cpv, zero.roas, zero.cpl, zero.ticket], [null, null, null, null]);
  assert.equal(overviewMetrics(fixture(), { ...crm, sales: 1, revenue: 0 }, "campaign").ticket, 0);
});

test("Mídia incompleta não vira total ou custo subestimado; CRM permanece visível", () => {
  const data = fixture();
  data.channels.google.accounts[0].error = "Sem acesso";
  const result = overviewMetrics(data, crm, "webhook");
  assert.deepEqual([result.spend, result.impressions, result.cpl, result.cpv, result.roas], [null, null, null, null, null]);
  assert.deepEqual([result.leads, result.sales, result.revenue, result.ticket], [30, 4, 2000, 500]);
  assert.deepEqual(result.failed, ["Google"]);
  data.channels.google.linked = false;
  data.channels.meta.linked = false;
  assert.equal(overviewMetrics(data, crm, "campaign").spend, null);
  assert.equal(overviewMetrics(null, crm, "campaign").leads, null);
});

test("Leads não viram compras ou alcance em e-commerce/branding; métrica Meta é respeitada", () => {
  const range = { date_start: "2026-10-01", date_stop: "2026-10-31" };
  const row = { ...range, spend: "100", actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "10" }, { action_type: "purchase", value: "3" }] };
  const campaign = metaTotals(row, "messaging", "ecommerce");
  assert.equal(campaign.results, 3);
  assert.equal(campaign.leadResults, 10);
  const total = accountTotals({ ...range, spend: "150", reach: "5000" }, [campaign], "ecommerce");
  assert.deepEqual([total.leadResults, total.leadSpend, total.spend], [10, 100, 150]);
  const data = fixture(total, googleTotals({ costMicros: "200000000", conversions: "2.5" }, "branding"));
  assert.equal(overviewMetrics(data, crm, "campaign").leads, 12.5);
  assert.equal(overviewMetrics(data, crm, "campaign").cpl, 300 / 12.5);
});

test("CRM usa recebimento em São Paulo, isola clientes e preserva vendas deduplicadas", async () => {
  const dir = await mkdtemp(join(tmpdir(), "v4-overview-"));
  process.env.DATABASE_URL = `pglite://${dir}`;
  const { migrate, run } = await import("../src/lib/db");
  const { crmPeriodTotals } = await import("../src/lib/crm/period-totals");
  try {
    await migrate();
    await run("INSERT INTO clients (name, account_type) VALUES ('Teste overview', 'lead_gen'), ('Outra conta', 'lead_gen')");
    assert.deepEqual(await crmPeriodTotals(1, "2026-10-01", "2026-10-01"), { leads: null, sales: null, revenue: null });
    for (const [id, at, key, value] of [
      [1, "2026-10-01T02:59:59Z", "antes", 999],
      [1, "2026-10-01T03:00:00Z", "inicio", 100],
      [1, "2026-10-02T02:59:59Z", "fim", 250],
      [1, "2026-10-02T02:59:59Z", "gratis", 0],
      [1, "2026-10-02T03:00:00Z", "depois", 999],
      [2, "2026-10-01T12:00:00Z", "outro-cliente", 999],
    ]) {
      await run(`INSERT INTO crm_sales (client_id, ref_date, received_at, dedup_key, value)
        VALUES (?, '2026-10-02', ?::timestamptz, ?, ?) ON CONFLICT DO NOTHING`, [id, at, key, value]);
      await run(`INSERT INTO crm_leads (client_id, ref_date, received_at, dedup_key)
        VALUES (?, '2026-10-02', ?::timestamptz, ?) ON CONFLICT DO NOTHING`, [id, at, key]);
    }
    await run(`INSERT INTO crm_sales (client_id, ref_date, received_at, dedup_key, value)
      VALUES (1, '2026-10-02', '2026-10-01T12:00:00Z', 'inicio', 100) ON CONFLICT DO NOTHING`);
    assert.deepEqual(await crmPeriodTotals(1, "2026-10-01", "2026-10-01"), { leads: 3, sales: 3, revenue: 350 });
    assert.deepEqual(await crmPeriodTotals(1, "2026-09-01", "2026-09-01"), { leads: 0, sales: 0, revenue: 0 });
  } finally {
    await (globalThis as typeof globalThis & { __pglite?: Promise<{ close: () => Promise<void> }> }).__pglite?.then((db) => db.close());
    await rm(dir, { recursive: true, force: true });
  }
});
