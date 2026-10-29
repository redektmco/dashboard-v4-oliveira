import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { clientStatus, currentMrr, validateClassification } from "../src/lib/client-lifecycle";
import { applicableField, hasMediaService } from "../src/lib/model/services";
import { computeScore } from "../src/lib/model/scoring";

test("Status e MRR: legados não viram encerrados; pontual/pausa/espera ficam fora dos totais", () => {
  const base = { active: 1, mrr: 1200 };
  assert.equal(currentMrr(base), 1200);
  assert.equal(clientStatus({ active: 0 }), "legacy_inactive");
  assert.equal(currentMrr({ ...base, revenue_model: "one_off" }), 0);
  assert.equal(currentMrr({ ...base, revenue_model: "mixed" }), 1200);
  for (const status of ["paused", "closed", "pending"] as const) assert.equal(currentMrr({ ...base, lifecycle_status: status }), 0);
  assert.equal(currentMrr({ ...base, active: 0 }), 0);
  assert.match(validateClassification({ status: "closed", revenueModel: "one_off", mrr: 0, source: "", confirmed: true })!, /fonte/);
  assert.match(validateClassification({ status: "closed", revenueModel: "one_off", mrr: 0, source: "Contrato ABC", confirmed: false })!, /Confirme/);
  assert.match(validateClassification({ status: "invalid", revenueModel: "", mrr: 0, source: "Contrato ABC", confirmed: true })!, /válida/);
});

test("Serviços: não exigir mídia de consultoria; desconhecidos não são reclassificados", () => {
  assert.equal(hasMediaService(["Consultoria"], "meta"), false);
  assert.equal(hasMediaService(["Consultoria", "Serviço legado"], "meta"), null);
  assert.equal(applicableField("budget", ["Consultoria"]), false);
  assert.equal(applicableField("campaign_status", ["Social Media"]), false);
  assert.equal(applicableField("deliveries_on_time", ["Social Media"]), true);
  assert.equal(applicableField("leads", ["Gestão de CRM"]), true);
  const score = computeScore({ clientId: 1, accountType: "lead_gen", today: "2026-10-29", renewalDate: null, services: ["Consultoria"],
    performance: { ref_date: "2026-10-29", filled_at: "2026-10-29", by: null, data: { leads_real: 0, leads_meta: 100, tracking_ok: false, campaign_status: false } },
    checkin: { ref_date: "2026-10-29", filled_at: "2026-10-29", by: null, data: { q1_satisfaction: 5 } },
    perfHistory: [{ ref_date: "2026-10-22", data: { leads_real: 0, leads_meta: 100 } }],
  });
  assert.equal(score.overrides.length, 0, "Tracking/campanhas fora do contrato não derrubam o score");
  assert.equal(score.dimensions.find((d) => d.key === "performance")?.fields.length, 0);
  assert.equal(score.dimensions.find((d) => d.key === "relationship")?.score, 100);
});

test("Migração aditiva e classificação preservam histórico, fonte e valor declarado", async () => {
  const dir = await mkdtemp(join(tmpdir(), "v4-classification-"));
  process.env.DATABASE_URL = `pglite://${dir}`;
  const { migrate, run, all } = await import("../src/lib/db");
  const { classifyClient } = await import("../src/lib/client-classification");
  const { listClients, suggestTargets } = await import("../src/lib/repo");
  try {
    await migrate();
    await run("INSERT INTO users (name, role) VALUES ('Admin teste', 'coord')");
    await run("INSERT INTO clients (name, account_type, mrr, active) VALUES ('Preservar', 'lead_gen', 1200, 1), ('Legado inativo', 'lead_gen', 700, 0)");
    await run(`INSERT INTO performance_snapshots (client_id, ref_date, data) VALUES (1, '2026-10-22', '{"leads_real":0}'), (1, '2026-10-29', '{"leads_real":100}')`);
    const before = await all("SELECT * FROM performance_snapshots ORDER BY id");
    await migrate({ force: true });
    assert.deepEqual(await all("SELECT lifecycle_status, revenue_model FROM clients"), [{ lifecycle_status: null, revenue_model: null }, { lifecycle_status: null, revenue_model: null }]);
    await assert.rejects(classifyClient(1, 1, { status: "closed", revenueModel: "one_off", mrr: 1200, source: "", confirmed: true }));
    await classifyClient(1, 1, { status: "paused", revenueModel: "one_off", mrr: 1200, source: "Contrato TESTE-01 conferido", confirmed: true });
    assert.equal((await listClients()).length, 0);
    const [paused] = await all<{ active: number; mrr: number }>("SELECT active, mrr FROM clients WHERE id=1");
    assert.deepEqual(paused, { active: 0, mrr: 1200 });
    await classifyClient(1, 1, { status: "active", revenueModel: "one_off", mrr: 1200, source: "Retomada confirmada no contrato TESTE-01", confirmed: true });
    const client = (await listClients())[0];
    assert.equal(currentMrr(client), 0);
    assert.deepEqual(await all("SELECT * FROM performance_snapshots ORDER BY id"), before);
    const changes = await all<{ previous: { mrr: number }; source: string }>("SELECT previous, source FROM client_classification_events ORDER BY id");
    assert.equal(changes.length, 2);
    assert.equal(changes[0].previous.mrr, 1200);
    assert.match(changes[1].source, /Retomada/);
    const suggestion = (await suggestTargets(1, "2026-10-29")).find((s) => s.key === "leads_meta");
    assert.equal(suggestion?.avg, 50, "zero real participa da média de volume");
    await run("DELETE FROM clients WHERE id=1");
    const retained = await all<{client_id:number|null;client_name:string}>("SELECT client_id,client_name FROM client_classification_events ORDER BY id");
    assert.equal(retained.length, 2);
    assert.equal(retained[0].client_id, null);
    assert.equal(retained[0].client_name, "Preservar");
  } finally {
    await (globalThis as typeof globalThis & { __pglite?: Promise<{ close: () => Promise<void> }> }).__pglite?.then((db) => db.close());
    await rm(dir, { recursive: true, force: true });
  }
});
