/**
 * Testes do motor de score. Rodam sem banco — o cálculo é puro de propósito.
 *   npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeScore,
  DEFAULT_CONFIG,
  ruleA,
  ruleB,
  ruleC5,
  ruleRenewal,
  type ScoreInput,
} from "../src/lib/model/scoring";
import { parseCheckinForm, parsePerformanceForm } from "../src/lib/model/form";
import { DIMENSIONS } from "../src/lib/model/catalog";

const TODAY = "2026-06-15";

const perfData = (over: Record<string, unknown> = {}) => ({
  leads_real: 100,
  leads_meta: 100,
  cpl_real: 80,
  cpl_meta: 80,
  budget_real: 10000,
  budget_meta: 10000,
  mql_real: 35,
  mql_rate_meta: 35,
  tracking_ok: true,
  deliveries_on_time: "full",
  campaign_status: "full",
  ...over,
});

const chkData = (over: Record<string, unknown> = {}) => ({
  q1_satisfaction: 5,
  q2_climate: 5,
  q3_trust: 5,
  q4_lead_quality: 5,
  q5_engagement: 5,
  q6_expectation: 5,
  attendance: "full",
  payment_ok: true,
  risk_flag: false,
  ...over,
});

function input(over: Partial<ScoreInput> = {}): ScoreInput {
  return {
    clientId: 1,
    accountType: "lead_gen",
    today: TODAY,
    renewalDate: "2027-01-01",
    performance: { ref_date: "2026-06-12", filled_at: "2026-06-12", by: "GT", data: perfData() },
    checkin: { ref_date: "2026-06-10", filled_at: "2026-06-10", by: "AM", data: chkData() },
    perfHistory: [],
    config: DEFAULT_CONFIG,
    ...over,
  };
}

/* ----------------------------- réguas ------------------------------ */

test("Régua A tem teto em 100 — super-mês não mascara problema", () => {
  assert.equal(ruleA(50, 100), 50);
  assert.equal(ruleA(100, 100), 100);
  assert.equal(ruleA(300, 100), 100);
  assert.equal(ruleA(10, 0), null, "meta zero não normaliza");
});

test("Régua B inverte — menor é melhor", () => {
  assert.equal(ruleB(80, 80), 100);
  assert.equal(ruleB(160, 80), 50, "CPL dobrado vale metade");
  assert.equal(ruleB(40, 80), 100, "CPL na metade também tem teto");
});

test("Régua C mapeia 1→0, 3→50, 5→100", () => {
  assert.equal(ruleC5(1), 0);
  assert.equal(ruleC5(3), 50);
  assert.equal(ruleC5(5), 100);
  assert.equal(ruleC5(0), null);
});

test("Janela de renovação vira exposição decrescente", () => {
  assert.equal(ruleRenewal(200), 100);
  assert.equal(ruleRenewal(45), 70);
  assert.equal(ruleRenewal(3), 40);
  assert.equal(ruleRenewal(-10), 25);
  assert.equal(ruleRenewal(null), null);
});

/* ---------------------------- agregação ---------------------------- */

test("Conta perfeita chega a 100 e banda verde", () => {
  const r = computeScore(input());
  assert.equal(r.score, 100);
  assert.equal(r.band, "verde");
  assert.equal(r.confidence, "alta");
  assert.equal(r.overrides.length, 0);
});

test("Pesos das dimensões somam 100 no padrão", () => {
  assert.equal(
    DIMENSIONS.reduce((a, d) => a + d.defaultWeight, 0),
    100,
  );
});

test("Campo sem dado sai do cálculo e renormaliza o bloco", () => {
  const r = computeScore(
    input({
      performance: {
        ref_date: "2026-06-12",
        filled_at: "2026-06-12",
        by: "GT",
        data: perfData({ cpl_real: null, cpl_meta: null }),
      },
    }),
  );
  const perf = r.dimensions.find((d) => d.key === "performance")!;
  const cpl = perf.fields.find((f) => f.key === "cpl")!;
  assert.equal(cpl.score, null, "CPL sem valor não pontua");
  assert.equal(cpl.effectiveWeight, 0);
  const somaPesos = perf.fields
    .filter((f) => f.score !== null)
    .reduce((a, f) => a + f.effectiveWeight, 0);
  assert.ok(Math.abs(somaPesos - 100) < 0.2, `pesos presentes renormalizam para 100 (${somaPesos})`);
  assert.equal(perf.score, 100);
});

test("Dimensão inteira ausente redistribui peso entre as demais", () => {
  const r = computeScore(input({ checkin: null }));
  const rel = r.dimensions.find((d) => d.key === "relationship")!;
  assert.equal(rel.score, null);
  assert.equal(rel.effectiveWeight, 0);
  const soma = r.dimensions.filter((d) => d.score !== null).reduce((a, d) => a + d.effectiveWeight, 0);
  assert.ok(Math.abs(soma - 100) < 0.2, `dimensões presentes somam 100 (${soma})`);
});

test("Metade da meta em tudo derruba para vermelho", () => {
  const r = computeScore(
    input({
      performance: {
        ref_date: "2026-06-12",
        filled_at: "2026-06-12",
        by: "GT",
        data: perfData({ leads_real: 40, cpl_real: 200, budget_real: 4000, mql_real: 6 }),
      },
      checkin: {
        ref_date: "2026-06-10",
        filled_at: "2026-06-10",
        by: "AM",
        data: chkData({
          q1_satisfaction: 2,
          q2_climate: 2,
          q3_trust: 2,
          q4_lead_quality: 1,
          q5_engagement: 2,
          q6_expectation: 2,
          attendance: "partial",
        }),
      },
    }),
  );
  assert.ok(r.score !== null && r.score < 55, `score ${r.score} deveria ser vermelho`);
  assert.equal(r.band, "vermelho");
});

/* ---------------------------- overrides ---------------------------- */

test("Inadimplência força vermelho mesmo com tudo perfeito", () => {
  const r = computeScore(
    input({
      checkin: {
        ref_date: "2026-06-10",
        filled_at: "2026-06-10",
        by: "AM",
        data: chkData({ payment_ok: false }),
      },
    }),
  );
  assert.equal(r.band, "vermelho");
  assert.equal(r.rawBand, "verde", "a média continua verde — o override é que rebaixa");
  assert.ok(r.overrides.some((o) => o.trigger === "Inadimplência"));
});

test("Flag de risco explícito força vermelho", () => {
  const r = computeScore(
    input({
      checkin: {
        ref_date: "2026-06-10",
        filled_at: "2026-06-10",
        by: "AM",
        data: chkData({ risk_flag: true, risk_note: "Falou em cortar verba." }),
      },
    }),
  );
  assert.equal(r.band, "vermelho");
  assert.equal(r.overrides[0].detail, "Falou em cortar verba.");
});

test("Tracking quebrado põe teto de amarelo — dado cego não é verde", () => {
  const r = computeScore(
    input({
      performance: {
        ref_date: "2026-06-12",
        filled_at: "2026-06-12",
        by: "GT",
        data: perfData({ tracking_ok: false }),
      },
    }),
  );
  assert.equal(r.rawBand, "verde");
  assert.equal(r.band, "amarelo");
  assert.ok(r.overrides.some((o) => o.effect === "teto_amarelo"));
});

test("Performance abaixo de 50% por 2 ciclos força vermelho", () => {
  const fraca = perfData({ leads_real: 30, cpl_real: 300, budget_real: 3000 });
  const r = computeScore(
    input({
      performance: { ref_date: "2026-06-12", filled_at: "2026-06-12", by: "GT", data: fraca },
      perfHistory: [{ ref_date: "2026-06-05", data: fraca }],
    }),
  );
  assert.ok(r.overrides.some((o) => o.trigger.includes("2 ciclos")));
  assert.equal(r.band, "vermelho");
});

test("Um único ciclo ruim ainda não dispara o override de ciclos", () => {
  const r = computeScore(
    input({
      performance: {
        ref_date: "2026-06-12",
        filled_at: "2026-06-12",
        by: "GT",
        data: perfData({ leads_real: 30, cpl_real: 300, budget_real: 3000 }),
      },
      perfHistory: [{ ref_date: "2026-06-05", data: perfData() }],
    }),
  );
  assert.ok(!r.overrides.some((o) => o.trigger.includes("ciclos")));
});

/* ---------------------------- confiança ---------------------------- */

test("Confiança cai conforme o dado envelhece", () => {
  assert.equal(computeScore(input()).confidence, "alta");

  const perfVelha = computeScore(
    input({
      performance: { ref_date: "2026-05-01", filled_at: "2026-05-01", by: "GT", data: perfData() },
    }),
  );
  assert.equal(perfVelha.confidence, "media");

  const ambasVelhas = computeScore(
    input({
      performance: { ref_date: "2026-04-01", filled_at: "2026-04-01", by: "GT", data: perfData() },
      checkin: { ref_date: "2026-03-01", filled_at: "2026-03-01", by: "AM", data: chkData() },
    }),
  );
  assert.equal(ambasVelhas.confidence, "baixa");
  assert.ok(ambasVelhas.score !== null, "confiança baixa não zera o score");
});

test("Sem nenhum input não há score, e a confiança é baixa", () => {
  const r = computeScore(input({ performance: null, checkin: null }));
  assert.equal(r.score, null);
  assert.equal(r.band, null);
  assert.equal(r.confidence, "baixa");
});

/* ------------------------ tendência e taxa ------------------------- */

test("Ticket médio sem histórico fica fora do cálculo", () => {
  const r = computeScore(
    input({
      accountType: "ecommerce",
      performance: {
        ref_date: "2026-06-12",
        filled_at: "2026-06-12",
        by: "GT",
        data: {
          revenue_real: 100,
          revenue_meta: 100,
          roas_real: 4,
          roas_meta: 4,
          budget_real: 25,
          budget_meta: 25,
          ticket_real: 200,
          tracking_ok: true,
          deliveries_on_time: "full",
          campaign_status: "full",
        },
      },
    }),
  );
  const ticket = r.dimensions
    .find((d) => d.key === "performance")!
    .fields.find((f) => f.key === "ticket")!;
  assert.equal(ticket.score, null);
  assert.match(ticket.note ?? "", /sem histórico/);
});

test("Taxa de MQL é comparada à meta de taxa, não ao volume", () => {
  const r = computeScore(
    input({
      performance: {
        ref_date: "2026-06-12",
        filled_at: "2026-06-12",
        by: "GT",
        // 100 leads, 18 MQL = 18% contra meta de 35% -> ~51
        data: perfData({ mql_real: 18 }),
      },
    }),
  );
  const mql = r.dimensions
    .find((d) => d.key === "lead_quality")!
    .fields.find((f) => f.key === "mql")!;
  assert.ok(mql.score !== null && Math.abs(mql.score - 51.4) < 0.5, `esperado ~51, veio ${mql.score}`);
});

/* --------------------------- formulários --------------------------- */

test("Formulário do GT vira snapshot com números e categorias corretos", () => {
  const form: Record<string, string> = {
    leads_real: "1.250",
    leads_meta: "1200",
    cpl_real: "82,50",
    cpl_meta: "80",
    budget_real: "10000",
    budget_meta: "10000",
    mql_real: "400",
    mql_rate_meta: "35",
    tracking_ok: "sim",
    deliveries_on_time: "partial",
    campaign_status: "full",
    note: "semana curta por feriado",
  };
  const data = parsePerformanceForm("lead_gen", (k) => form[k] ?? "");
  assert.equal(data.leads_real, 1250, "aceita separador de milhar brasileiro");
  assert.equal(data.cpl_real, 82.5, "aceita vírgula decimal");
  assert.equal(data.tracking_ok, true);
  assert.equal(data.deliveries_on_time, "partial");
  assert.equal(data.note, "semana curta por feriado");
});

test("Check-in em branco não vira nota zero — vira ausência", () => {
  const data = parseCheckinForm(() => "");
  assert.equal(data.q1_satisfaction, null);
  assert.equal(data.risk_flag, false);
  assert.equal(data.payment_ok, false);
});
