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
import { aspectWarning, formatBadge, rejectReason } from "../src/lib/social/media";
import { matchCaptionsToFiles, parseBatchCaptions } from "../src/lib/social/batch";
import { isOwnBlobUrl } from "../src/lib/social/storage";
import { navReducer, type Nav } from "../src/components/social/story-nav";
import { createSign, generateKeyPairSync } from "node:crypto";
import { bucketDaily, dailySpend, formatCustomerId, normalizeCustomerId, normalizePrivateKey, parseClientAccounts } from "../src/lib/google/metrics";
import { explainError } from "../src/lib/google/ads";
import { dailySyncRange, monthLabel, monthSpend, monthTarget, monthToDate } from "../src/lib/media-daily";
import { goalStatus, periodOf, realizedIn, type Goal } from "../src/lib/crm/goals";
import { topPriorities, type PriorityInput } from "../src/lib/priorities";
import { STEPS, dueOf, ekyteText, howOf, stepTemplate } from "../src/lib/playbook/templates";
import { creativeAttention, crmAttention } from "../src/lib/playbook/attention";
import { DORES } from "../src/lib/playbook/dores";
import { parsePeriod, periodQuery, presetPeriod, rangeLabel } from "../src/lib/ficha-period";
import {
  EMPTY_TOTALS,
  budgetFor,
  convRate,
  cpc,
  cpm,
  cpr,
  ctr,
  delta,
  frequency,
  googleStatus,
  googleType,
  mergeDaily,
  metaObjective,
  metaStatus,
  roas,
  sumTotals,
} from "../src/lib/performance/model";
import { accountTotals, dailyOf, metaTotals } from "../src/lib/performance/meta-live";
import { campaignGoals, describeUnread, optimizedEvent, unreadEvents } from "../src/lib/meta/metrics";
import { mergeUnread } from "../src/lib/meta/graph";
import { googleTotals, sumDays } from "../src/lib/performance/google-live";
import { EMPTY_WEEK, campaignTotals, leadSpendOf, leadsOf, metaFields, parseInsight, weekRange } from "../src/lib/meta/metrics";
import { clientKey, firstPhone, parseBRL, parseClientsSheet, parseCsv } from "../src/lib/import/clients-sheet";
import {
  clientKeyOf,
  groupByClient,
  initials,
  isValidClientKey,
  matchesClientQuery,
  type ProjectCard,
} from "../src/lib/social/clients";
import { stageOf } from "../src/lib/crm/stage";
import { mediaSplit, weekOverWeek } from "../src/lib/crm/media-split";
import { hasMediaService, splitServices } from "../src/lib/model/services";
import { agoLabel, type CrmRow } from "../src/lib/crm/board";
import { EMPTY_FILTERS, countViews, fromLegacyFilter, matchesFilters, sortRows } from "../src/lib/crm/views";
import { NONE, laneOf, lanesFor } from "../src/lib/crm/kanban";
import { clampBlock, freeSpot, newBlock, sanitizeDoc } from "../src/lib/reports/layout";
import {
  autoTarget,
  deltaPct,
  deltaTone,
  fillVariables,
  formatValue,
  metricValue,
  parseNumberBR,
  parsePairs,
  periodLabel,
  presetRange,
  previousPeriod,
  sampleData,
  totalsOf,
} from "../src/lib/reports/metrics";
import { STARTERS } from "../src/lib/reports/starters";
import { chunksOf, googleBuckets, metaNums } from "../src/lib/reports/live";
import { weekLeads } from "../src/lib/reports/metrics";
import { dataContext } from "../src/lib/reports/ai";
import type { ReportData, WeekRow } from "../src/lib/reports/types";

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

test("Check-in: 'não verificado' e 'não sei' ficam em branco, não viram não", () => {
  const data = parseCheckinForm((k) => ({ payment_ok: "nv", risk_flag: "nao_sei", q1_satisfaction: "4" })[k] ?? "");
  assert.equal(data.payment_ok, null);
  assert.equal(data.risk_flag, null);
  assert.equal(data.q1_satisfaction, 4);
  const sim = parseCheckinForm((k) => ({ payment_ok: "sim", risk_flag: "sim" })[k] ?? "");
  assert.equal(sim.payment_ok, true);
  assert.equal(sim.risk_flag, true);
});

/* ------------------------- Social media: mídia ------------------------- */

test("Upload recusa HEIC com instrução clara e aceita JPG/MP4", () => {
  assert.match(rejectReason({ name: "IMG_0001.HEIC", type: "image/heic", size: 1000 }, "feed")!, /HEIC/);
  assert.equal(rejectReason({ name: "arte.jpg", type: "image/jpeg", size: 1000 }, "feed"), null);
  assert.equal(rejectReason({ name: "story.mp4", type: "video/mp4", size: 1000 }, "story"), null);
  // Sistema que não informa o tipo: cai na extensão.
  assert.equal(rejectReason({ name: "story.mov", type: "", size: 1000 }, "story"), null);
});

test("Reels só aceita vídeo; limite de tamanho por tipo", () => {
  assert.match(rejectReason({ name: "capa.png", type: "image/png", size: 1000 }, "reels")!, /vídeo/);
  assert.match(rejectReason({ name: "enorme.jpg", type: "image/jpeg", size: 31 * 1024 * 1024 }, "feed")!, /limite/);
  assert.equal(rejectReason({ name: "longo.mp4", type: "video/mp4", size: 200 * 1024 * 1024 }, "reels"), null);
  assert.match(rejectReason({ name: "vazio.jpg", type: "image/jpeg", size: 0 }, "feed")!, /vazio/);
});

test("Formato exibido: carrossel é derivado da quantidade de mídias", () => {
  const a = { id: "a", url: "u", name: "n" };
  assert.equal(formatBadge({ format: "feed", assets: [a] }), "post");
  assert.equal(formatBadge({ format: "feed", assets: [a, a] }), "carousel");
  assert.equal(formatBadge({ format: "story", assets: [a, a] }), "story");
  assert.equal(formatBadge({ format: "reels", assets: [a] }), "reels");
});

test("Aviso de proporção: Story fora de 9:16 e feed mais alto que 4:5", () => {
  assert.equal(aspectWarning("story", { width: 1080, height: 1920 }), null);
  assert.match(aspectWarning("story", { width: 1080, height: 1350 })!, /9:16/);
  assert.equal(aspectWarning("feed", { width: 1080, height: 1350 }), null);
  assert.match(aspectWarning("feed", { width: 1080, height: 1920 })!, /4:5/);
  assert.equal(aspectWarning("story", {}), null, "sem dimensão, sem aviso");
});

test("Legendas em lote casam por nome e o resto por ordem", () => {
  const blocks = parseBatchCaptions("[b.jpg]\nLegenda B\n---\nPrimeira livre\n---\nSegunda livre");
  const caps = matchCaptionsToFiles(blocks, ["a.jpg", "b.jpg", "c.jpg"]);
  assert.deepEqual(caps, ["Primeira livre", "Legenda B", "Segunda livre"]);
});

test("Só aceita URL do próprio store do Blob, na pasta do projeto", () => {
  const prev = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_AbC123_segredo";
  try {
    const ok = "https://abc123.public.blob.vercel-storage.com/social/prj_1/arte-x1.jpg";
    assert.equal(isOwnBlobUrl(ok, "prj_1"), true);
    assert.equal(isOwnBlobUrl(ok, "prj_2"), false, "pasta de outro projeto");
    assert.equal(isOwnBlobUrl("https://outro.public.blob.vercel-storage.com/social/prj_1/a.jpg", "prj_1"), false, "outro store");
    assert.equal(isOwnBlobUrl("https://evil.com/social/prj_1/a.jpg", "prj_1"), false);
    assert.equal(isOwnBlobUrl("http://abc123.public.blob.vercel-storage.com/social/prj_1/a.jpg", "prj_1"), false, "sem https");
    assert.equal(isOwnBlobUrl("não é url", "prj_1"), false);
  } finally {
    process.env.BLOB_READ_WRITE_TOKEN = prev;
  }
});

/* ---------------------- Social media: viewer de Stories ---------------------- */

const start: Nav = { itemIdx: 0, frameIdx: 0, progress: 0, ended: false };

test("Viewer: toque avança frame a frame e passa para o próximo Story", () => {
  const ctx = { counts: [2, 1], hold: [false, false] };
  let s = navReducer(start, { type: "next", auto: false, ctx });
  assert.deepEqual([s.itemIdx, s.frameIdx], [0, 1]);
  s = navReducer(s, { type: "next", auto: false, ctx });
  assert.deepEqual([s.itemIdx, s.frameIdx], [1, 0]);
  s = navReducer(s, { type: "next", auto: false, ctx });
  assert.equal(s.ended, true, "último frame do último Story encerra");
  s = navReducer(s, { type: "prev", ctx });
  assert.deepEqual([s.itemIdx, s.frameIdx, s.ended], [0, 1, false], "voltar cai no último frame do Story anterior");
});

test("Viewer: na aprovação, Story pendente segura o avanço automático", () => {
  const ctx = { counts: [1, 1], hold: [true, false] };
  let s = navReducer(start, { type: "tick", dt: 1.2, ctx });
  assert.deepEqual([s.itemIdx, s.ended], [0, true], "o tempo acabou mas o pendente não passa sozinho");
  s = navReducer(s, { type: "next", auto: false, ctx });
  assert.equal(s.itemIdx, 1, "o toque do cliente passa");
});

test("Viewer: relógio acumula até completar o frame", () => {
  const ctx = { counts: [2], hold: [false] };
  let s = navReducer(start, { type: "tick", dt: 0.4, ctx });
  assert.equal(s.frameIdx, 0);
  s = navReducer(s, { type: "tick", dt: 0.7, ctx });
  assert.deepEqual([s.frameIdx, s.progress], [1, 0]);
});

/* ------------------- Social media: aba Projetos por cliente ------------------- */

const prj = (over: Partial<ProjectCard> = {}): ProjectCard => ({
  id: "prj_1",
  clientId: null,
  title: "Campanha Outubro",
  clientName: "Padaria Estrela",
  igHandle: "padariaestrela",
  guestToken: "tok_1",
  createdAt: "2026-09-01T12:00:00.000Z",
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
  scheduled: 0,
  ...over,
});

test("Clientes: a chave segue a carteira, e o nome digitado normaliza", () => {
  assert.equal(clientKeyOf({ clientId: 7, clientName: "Padaria Estrela" }), "c:7");
  assert.equal(
    clientKeyOf({ clientId: null, clientName: "  Padaria   ESTRELA " }),
    clientKeyOf({ clientId: null, clientName: "padaria estrela" }),
    "acento, caixa e espaço dobrado caem no mesmo cartão",
  );
  assert.equal(clientKeyOf({ clientId: null, clientName: "Açaí & Cia" }), "n:acai & cia");
  // Renomear o cliente da carteira não troca a chave (nem perde a capa).
  assert.equal(clientKeyOf({ clientId: 7, clientName: "Outro nome" }), "c:7");
});

test("Clientes: a chave que vem do navegador é validada", () => {
  assert.equal(isValidClientKey("c:12"), true);
  assert.equal(isValidClientKey("n:padaria estrela"), true);
  assert.equal(isValidClientKey("c:0"), false, "id de cliente começa em 1");
  assert.equal(isValidClientKey("x:1"), false);
  assert.equal(isValidClientKey("n:"), false, "nome vazio");
  assert.equal(isValidClientKey(`n:${"a".repeat(200)}`), false, "nome absurdo");
  assert.equal(isValidClientKey(42), false);
});

test("Clientes: agrupa por cliente, soma o placar e ordena por nome", () => {
  const groups = groupByClient(
    [
      prj({ id: "p1", clientId: 7, clientName: "Padaria Estrela", pending: 2, total: 3, approved: 1, createdAt: "2026-09-10T12:00:00.000Z" }),
      prj({ id: "p2", clientId: 7, clientName: "Padaria Estrela", rejected: 1, total: 1, igHandle: "estrela.doces", createdAt: "2026-09-02T12:00:00.000Z" }),
      prj({ id: "p3", clientId: null, clientName: "Auto Center Oliveira", scheduled: 2, total: 2 }),
    ],
    { "c:7": "https://x.public.blob.vercel-storage.com/social/clientes/a.jpg" },
  );

  assert.deepEqual(groups.map((g) => g.clientName), ["Auto Center Oliveira", "Padaria Estrela"]);

  const padaria = groups[1];
  assert.equal(padaria.key, "c:7");
  assert.deepEqual(padaria.projects.map((p) => p.id), ["p1", "p2"], "mantém a ordem que veio do banco");
  assert.deepEqual(
    [padaria.total, padaria.pending, padaria.approved, padaria.rejected, padaria.scheduled],
    [4, 2, 1, 1, 0],
  );
  assert.deepEqual(padaria.handles, ["padariaestrela", "estrela.doces"], "@ distintos, sem repetir");
  assert.equal(padaria.lastAt, "2026-09-10T12:00:00.000Z", "o projeto mais recente do cliente");
  assert.ok(padaria.imageUrl, "a capa entra pela chave");
  assert.equal(groups[0].imageUrl, null, "sem capa cadastrada, monograma");
});

test("Clientes: a busca acha por nome, @ ou título do planejamento", () => {
  const [g] = groupByClient([prj({ clientId: 7, title: "Campanha Outubro" })]);
  assert.equal(matchesClientQuery(g, ""), true, "busca vazia não filtra");
  assert.equal(matchesClientQuery(g, "ESTRELA"), true);
  assert.equal(matchesClientQuery(g, "padária"), true, "acento digitado não atrapalha");
  assert.equal(matchesClientQuery(g, "padariaestrela"), true, "pelo @");
  assert.equal(matchesClientQuery(g, "outubro"), true, "pelo planejamento");
  assert.equal(matchesClientQuery(g, "mecânica"), false);
});

test("Clientes: monograma usa a primeira e a última palavra de peso", () => {
  assert.equal(initials("Padaria Estrela"), "PE");
  assert.equal(initials("Auto Center de Oliveira"), "AO", "partícula não conta");
  assert.equal(initials("V4"), "V4");
  assert.equal(initials("  "), "?");
});

/* ---------------------------- Meta Ads ----------------------------- */

test("meta: agregado 'lead' não soma com as quebras por origem", () => {
  const w = parseInsight({
    spend: "1000.50",
    reach: "5000",
    impressions: "9000",
    actions: [
      { action_type: "offsite_conversion.fb_pixel_lead", value: "30" },
      { action_type: "lead", value: "40" },
      { action_type: "onsite_conversion.lead_grouped", value: "10" },
      { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "12" },
      { action_type: "onsite_conversion.total_messaging_connection", value: "20" },
      { action_type: "link_click", value: "300" },
    ],
    date_start: "2026-09-12",
    date_stop: "2026-09-18",
  });
  assert.equal(w.spend, 1000.5);
  assert.equal(w.leads, 40);
  assert.equal(w.conversations, 12);
  assert.equal(w.clicks, 300);
  assert.equal(leadsOf(w, "lead"), 40);
  assert.equal(leadsOf(w, "messaging"), 12);
  assert.equal(leadsOf(w, "both"), 52);
});

test("meta: compra e receita pelo agregado, com fallback para omni", () => {
  const w = parseInsight({
    spend: "200",
    actions: [{ action_type: "omni_purchase", value: "4" }],
    action_values: [{ action_type: "omni_purchase", value: "1600" }],
    date_start: "2026-09-12",
    date_stop: "2026-09-18",
  });
  assert.equal(w.purchases, 4);
  assert.equal(w.revenue, 1600);
  assert.deepEqual(metaFields("ecommerce", w, 0), {
    budget_real: 200,
    revenue_real: 1600,
    roas_real: 8,
    ticket_real: 400,
  });
});

test("meta: campos por tipo de conta, sem razão com denominador zero", () => {
  const w = { ...EMPTY_WEEK, spend: 900, reach: 12000 };
  assert.deepEqual(metaFields("lead_gen", w, 30), { budget_real: 900, leads_real: 30, cpl_real: 30 });
  assert.deepEqual(metaFields("lead_gen", w, 0), { budget_real: 900, leads_real: 0 });
  assert.deepEqual(metaFields("branding", w, 0), { budget_real: 900, reach_real: 12000 });
  assert.deepEqual(metaFields("ecommerce", { ...EMPTY_WEEK }, 0), { budget_real: 0, revenue_real: 0 });
});

test("meta: contato no site conta como lead, sem somar com o Lead do mesmo envio", () => {
  const w = parseInsight({
    spend: "182.35",
    actions: [{ action_type: "contact_total", value: "31" }, { action_type: "contact_website", value: "31" }],
    date_start: "2026-10-03",
    date_stop: "2026-10-09",
  });
  assert.equal(w.leads, 31);
  const both = parseInsight({
    actions: [{ action_type: "lead", value: "10" }, { action_type: "offsite_conversion.fb_pixel_contact", value: "12" }],
    date_start: "2026-10-03",
    date_stop: "2026-10-09",
  });
  assert.equal(both.leads, 12);
});

test("meta: CPL usa só a verba das campanhas que geraram lead (caso New Cabos)", () => {
  const range = { date_start: "2026-10-01", date_stop: "2026-10-13" };
  const t = campaignTotals([
    { ...range, campaign_id: "1", spend: "182.35", actions: [{ action_type: "contact_total", value: "31" }] },
    { ...range, campaign_id: "2", spend: "126.33", actions: [{ action_type: "link_click", value: "1016" }] },
    { ...range, campaign_id: "3", spend: "50", actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "5" }] },
  ]);
  assert.deepEqual(t, { leads: 31, conversations: 5, leadSpend: 182.35, convSpend: 50, resultSpend: 232.35 });
  const w = { ...EMPTY_WEEK, spend: 358.68, ...t };
  assert.equal(leadSpendOf(w, "lead"), 182.35);
  assert.equal(leadSpendOf(w, "messaging"), 50);
  assert.equal(leadSpendOf(w, "both"), 232.35);
  // Antes: 308,68 ÷ 31 = 9,96. Agora: 182,35 ÷ 31 = 5,88, como no Gerenciador.
  assert.equal(metaFields("lead_gen", { ...EMPTY_WEEK, spend: 308.68 }, 31, 182.35).cpl_real, 5.88);
  // Sem verba de campanha de lead (lead só do CRM), cai na verba total.
  assert.equal(metaFields("lead_gen", { ...EMPTY_WEEK, spend: 300 }, 10, 0).cpl_real, 30);
});

test("meta: semana-ritual vai de sábado a sexta", () => {
  assert.deepEqual(weekRange("2026-09-18"), { since: "2026-09-12", until: "2026-09-18" });
  assert.deepEqual(weekRange("2026-10-02"), { since: "2026-09-26", until: "2026-10-02" });
});

/* ------------------------ importação de planilha -------------------- */

test("planilha: cabeçalho com quebra de linha, linha de total e squads", () => {
  const csv = [
    ",,,CONTRATO,,,,,",
    ",ORIGEM,CLIENTE,CONTATO,E-MAIL,\"MRR\",MÍDIA GERIDA,\"GT\",ACC,\"E-COMMERCE\",INÍCIO",
    '1,Lead Broker,Padaria Estrela ,"Maria 15 99677-9992 / Pedro 15 1111-2222","a@x.com / b@y.com","R$ 4.700,00","R$ 5.200,00",IGOR,LARA,,28/04/25',
    '2,Outbound,"Loja ""Boa""",11 93802-4170,loja@z.com,"R$ 9.952,40",Não definido,SEM GT,JENIFFER,https://loja.com,',
    ',,,,,"R$ 14.652,40","R$ 5.200,00",,,,',
    '1,Indicação,Padaria  Estrela,,,,,,,,',
  ].join("\n");
  const rows = parseClientsSheet(csv);
  assert.equal(rows.length, 2, "linha de total e repetido ficam de fora");
  assert.deepEqual(rows[0], {
    name: "Padaria Estrela",
    accountType: "lead_gen",
    mrr: 4700,
    gt: "Igor",
    account: "Lara",
    email: "a@x.com",
    phone: "5515996779992",
    mediaMonthly: 5200,
    start: "2025-04-28",
  });
  assert.equal(rows[1].name, 'Loja "Boa"');
  assert.equal(rows[1].accountType, "ecommerce");
  assert.equal(rows[1].gt, null, "SEM GT não vira pessoa");
  assert.equal(rows[1].mediaMonthly, null);
});

test("planilha: CSV com célula multilinha entre aspas", () => {
  assert.deepEqual(parseCsv('a,"PESQUISA \nNPS",c\r\n1,2,3'), [
    ["a", "PESQUISA \nNPS", "c"],
    ["1", "2", "3"],
  ]);
  assert.equal(parseBRL("R$ 1.303,20"), 1303.2);
  assert.equal(parseBRL("Sem Informação"), null);
  assert.equal(firstPhone("5513996090102"), "5513996090102");
  assert.equal(firstPhone("sem telefone"), null);
  assert.equal(clientKey("Wisqueria "), clientKey("wisquería"));
});

/* ----------------------- prioridades de hoje ----------------------- */

const acct = (over: Partial<PriorityInput> = {}): PriorityInput => ({
  id: 1,
  name: "Conta",
  band: "verde",
  score: 80,
  delta7: 0,
  mrr: 1000,
  owner: "Igor",
  overrides: [],
  openPlans: 0,
  planLateDays: 0,
  renewalIn: null,
  spendStopped: false,
  ...over,
});

test("prioridades: crítica com queda e verba parada vem primeiro e pede plano", () => {
  const [p] = topPriorities([
    acct({ id: 2, band: "amarelo", score: 64 }),
    acct({ id: 1, band: "vermelho", score: 0, delta7: -56.6, spendStopped: true }),
  ]);
  assert.equal(p.id, 1);
  assert.equal(p.action, "criar_plano");
  assert.equal(p.why, "O score caiu 56,6 pts em 7 dias e a verba de mídia está parada.");
  assert.match(p.meta, /Score 0 · R\$\s?1\.000 MRR · Sem plano de ação · Responsável: Igor/);
});

test("prioridades: plano atrasado e contrato vencido pedem cobrança", () => {
  const [p] = topPriorities([acct({ band: "amarelo", score: 64, planLateDays: 37, renewalIn: -1, openPlans: 1 })]);
  assert.equal(p.action, "cobrar_plano");
  assert.equal(p.why, "O plano de ação está 37 dias atrasado e o contrato venceu ontem.");
});

test("prioridades: override pede revisão; saudável estável fica fora; saudável em queda entra", () => {
  const list = topPriorities([
    acct({ id: 1, band: "amarelo", overrides: ["Tracking quebrado"] }),
    acct({ id: 2, band: "verde" }),
    acct({ id: 3, band: "verde", delta7: -14.6 }),
    acct({ id: 4, band: null, score: null }),
  ]);
  assert.deepEqual(list.map((p) => p.id), [1, 3]);
  assert.equal(list[0].action, "revisar");
  assert.equal(list[1].action, "ver_conta");
});

test("prioridades: limita a lista", () => {
  const many = Array.from({ length: 9 }, (_, i) => acct({ id: i + 1, band: "vermelho", score: 10 }));
  assert.equal(topPriorities(many).length, 5);
});

/* ---------------------------- Google Ads --------------------------- */

test("google: normaliza e formata o ID da conta", () => {
  assert.equal(normalizeCustomerId("124-444-3600"), "1244443600");
  assert.equal(normalizeCustomerId(" 1244443600 "), "1244443600");
  assert.equal(normalizeCustomerId("124-444-360"), null);
  assert.equal(formatCustomerId("1244443600"), "124-444-3600");
});

test("google: agrupa os dias nas semanas-ritual e zera a semana sem entrega", () => {
  // Sextas 2026-06-12 (semana 06-06..06-12) e 2026-06-19 (06-13..06-19).
  const weeks = bucketDaily(
    [
      { segments: { date: "2026-06-06" }, metrics: { costMicros: "10500000", conversions: 1.4, conversionsValue: 100, clicks: "10", impressions: "1000" } },
      { segments: { date: "2026-06-12" }, metrics: { costMicros: "4500000", conversions: 1.4, conversionsValue: 50.5, clicks: "5", impressions: "500" } },
      { segments: { date: "2026-05-30" }, metrics: { costMicros: "99000000", conversions: 9 } }, // fora das semanas pedidas
    ],
    ["2026-06-12", "2026-06-19"],
  );
  const w = weeks.get("2026-06-12")!;
  assert.equal(w.spend, 15);
  assert.equal(w.leads, 3); // 2,8 arredondado só no fim da semana
  assert.equal(w.purchases, 3);
  assert.equal(w.revenue, 150.5);
  assert.equal(w.clicks, 15);
  assert.equal(w.impressions, 1500);
  assert.deepEqual({ spend: weeks.get("2026-06-19")!.spend, leads: weeks.get("2026-06-19")!.leads }, { spend: 0, leads: 0 });
});

test("verba: mês até hoje, como no relatório mensal", () => {
  assert.deepEqual(monthToDate("2026-10-13"), { since: "2026-10-01", until: "2026-10-13", closedDays: 12, previous: false });
  assert.equal(monthLabel("2026-10-13"), "Mês até hoje · 01/10 – 13/10");
  // Dia 1 ainda não tem dia fechado: vale o mês anterior inteiro.
  assert.deepEqual(monthToDate("2026-11-01"), { since: "2026-10-01", until: "2026-10-31", closedDays: 31, previous: true });
  assert.equal(monthLabel("2026-11-01"), "Mês anterior · 01/10 – 31/10");
  // O sync cobre o mês de ontem inteiro (ou 14 dias) até hoje.
  assert.deepEqual(dailySyncRange("2026-10-09"), { since: "2026-09-25", until: "2026-10-09" });
  assert.deepEqual(dailySyncRange("2026-10-28"), { since: "2026-10-01", until: "2026-10-28" });
  assert.deepEqual(dailySyncRange("2026-11-01"), { since: "2026-10-01", until: "2026-11-01" });

  const days = dailySpend(
    [
      { segments: { date: "2026-10-02" }, metrics: { costMicros: "50000000" } },
      { segments: { date: "2026-10-02" }, metrics: { costMicros: "2500000" } },
      { segments: { date: "2026-10-08" }, metrics: { costMicros: "60000000" } },
      { segments: { date: "2026-10-09" }, metrics: { costMicros: "10000000" } }, // hoje, parcial
    ],
    "2026-10-01",
    "2026-10-09",
  );
  assert.equal(days.size, 9);
  assert.equal(days.get("2026-10-02"), 52.5);
  assert.equal(days.get("2026-10-05"), 0); // dia sem entrega vira zero

  const byDay = new Map([...days].map(([d, spend]) => [d, { spend, accounts: 1 }]));
  assert.equal(monthSpend({ accounts: 1, byDay }, "2026-10-09"), 122.5);
  // Hoje ainda sem sync conta como zero; dia fechado faltando volta para a semana do ritual.
  byDay.delete("2026-10-09");
  assert.equal(monthSpend({ accounts: 1, byDay }, "2026-10-09"), 112.5);
  assert.equal(monthSpend({ accounts: 1, byDay }, "2026-10-11"), null);
  assert.equal(monthSpend({ accounts: 2, byDay }, "2026-10-09"), null);
  assert.equal(monthSpend(undefined, "2026-10-09"), null);

  // Verba contratada de R$ 700/semana = R$ 100/dia; 12 dias fechados em 13/10.
  assert.equal(monthTarget(700, "2026-10-13"), 1200);
});

test("google: traduz os erros do Google Ads que a equipe precisa entender", () => {
  const body = { error: { message: "x", details: [{ errors: [{ errorCode: { authorizationError: "USER_PERMISSION_DENIED" }, message: "bruto" }] }] } };
  assert.match(explainError(403, body), /não tem acesso a essa conta/);
  assert.equal(explainError(500, { error: { message: "falha" } }), "falha");
  assert.equal(explainError(502, {}), "Google Ads respondeu 502");
});

test("google: lista só contas de cliente ativas da MCC, sem repetir e em ordem", () => {
  const list = parseClientAccounts([
    { customerClient: { id: "2", descriptiveName: "Zeta Móveis", manager: false, status: "ENABLED", currencyCode: "BRL" } },
    { customerClient: { id: "1244443600", descriptiveName: "MCC Oliveira", manager: true, status: "ENABLED" } },
    { customerClient: { id: "3", descriptiveName: "Alfa Odonto", manager: false, status: "ENABLED" } },
    { customerClient: { id: "3", descriptiveName: "Alfa Odonto (duplicada)", manager: false, status: "ENABLED" } },
    { customerClient: { id: "4", descriptiveName: "Cancelada", manager: false, status: "CANCELED" } },
    { customerClient: { id: "1234567890", manager: false, status: "ENABLED" } },
  ]);
  assert.deepEqual(list.map((a) => a.name), ["Alfa Odonto", "Conta 123-456-7890", "Zeta Móveis"]);
});

test("google: a chave privada colada na Vercel é reconstruída de qualquer formato", () => {
  const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }) as string;
  const variants: Record<string, string> = {
    original: pem,
    "\\n literal": pem.trim().replace(/\n/g, "\\n"),
    "entre aspas": `"${pem.trim().replace(/\n/g, "\\n")}"`,
    "quebras viraram espaços": pem.trim().replace(/\n/g, " "),
    "com o nome da variável": `GOOGLE_SA_PRIVATE_KEY=${pem.trim().replace(/\n/g, "\\n")}`,
    "espaços nas pontas": `\n  ${pem}  \n`,
  };
  for (const [nome, raw] of Object.entries(variants)) {
    const fixed = normalizePrivateKey(raw);
    assert.ok(fixed, nome);
    assert.doesNotThrow(() => createSign("RSA-SHA256").update("x").sign(fixed!, "base64url"), nome);
  }
  assert.equal(normalizePrivateKey("isto não é uma chave"), null);
  assert.equal(normalizePrivateKey("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"), null);
});

/* ------------------------------ playbook ------------------------------ */

test("playbook: pedido de cancelamento aberto deixa o cliente Red, mesmo com nota alta", () => {
  const r = computeScore(input({ churnRequests: [{ from: "2026-06-10", to: null }] }));
  assert.equal(r.rawBand, "verde");
  assert.equal(r.band, "vermelho");
  assert.ok(r.overrides.some((o) => o.trigger === "Pedido de cancelamento"));
});

test("playbook: pedido concluído ou futuro não pesa no dia", () => {
  assert.equal(computeScore(input({ churnRequests: [{ from: "2026-06-01", to: "2026-06-10" }] })).band, "verde");
  assert.equal(computeScore(input({ churnRequests: [{ from: "2026-06-20", to: null }] })).band, "verde");
  // Na série histórica, o dia dentro da janela é Red.
  assert.equal(computeScore(input({ today: "2026-06-05", churnRequests: [{ from: "2026-06-01", to: "2026-06-10" }] })).band, "vermelho");
});

test("playbook: prazos contados da entrada na flag", () => {
  const start = new Date("2026-06-15T12:00:00Z");
  assert.equal(dueOf(stepTemplate("vermelho", "ligacao")!, start), "2026-06-16T12:00:00.000Z");
  assert.equal(dueOf(stepTemplate("vermelho", "analise_campanha")!, start), "2026-06-17T12:00:00.000Z");
  assert.equal(dueOf(stepTemplate("amarelo", "reavaliar")!, start), "2026-06-30T12:00:00.000Z");
  assert.equal(dueOf(stepTemplate("verde", "ropre")!, start), "2026-07-15T12:00:00.000Z");
});

test("playbook: toda flag tem passos com chave única; Yellow e Red pedem o registro de erro", () => {
  for (const [band, steps] of Object.entries(STEPS)) {
    assert.equal(new Set(steps.map((s) => s.key)).size, steps.length, band);
    assert.ok(steps.every((s) => s.dueHours !== undefined || s.everyDays !== undefined), band);
  }
  assert.equal(STEPS.vermelho.length, 10);
  assert.ok(stepTemplate("amarelo", "erro_nosso") && stepTemplate("vermelho", "erro_nosso"));
  assert.equal(stepTemplate("verde", "erro_nosso"), null);
});

test("playbook: relacionamento muda com a proximidade do cliente", () => {
  const t = stepTemplate("vermelho", "relacionamento")!;
  assert.match(howOf(t, "perto"), /visita/);
  assert.match(howOf(t, "longe"), /gift card da Maxx/);
  assert.match(howOf(t, null), /Defina a proximidade/);
});

test("playbook: descrição do Ekyte tem os seis campos na ordem", () => {
  const txt = ekyteText({ dor: "Falta de vendas", motivo: "Sem follow-up", acao: "Cadência no CRM", prazo: "2026-06-20", owner: "Analista de CRM", objetivo: "Converter mais" });
  assert.deepEqual(
    txt.split("\n").map((l) => l.split(":")[0]),
    ["DOR", "MOTIVO", "AÇÃO", "PRAZO", "OWNER", "OBJETIVO"],
  );
  assert.match(txt, /PRAZO: 20\/06\/2026/);
});

test("playbook: criativos abaixo de 70% de aprovação viram ponto aberto", () => {
  assert.equal(creativeAttention({ projects: 0, approved: 0, changes: 0, rejected: 0, pending: 0 }).status, "sem_dado");
  assert.equal(creativeAttention({ projects: 1, approved: 0, changes: 0, rejected: 0, pending: 2 }).status, "sem_dado");
  assert.equal(creativeAttention({ projects: 1, approved: 6, changes: 3, rejected: 1, pending: 0 }).status, "aberto");
  assert.equal(creativeAttention({ projects: 1, approved: 7, changes: 3, rejected: 0, pending: 0 }).status, "ok");
});

test("playbook: CRM com qualquer 'não' é ponto aberto", () => {
  assert.equal(crmAttention(null, null).status, "sem_dado");
  const ok = { filled_at: "2026-06-01", data: { organized: "sim", automations: "sim", standard_flow: "sim", sales_satisfied: "sim" } };
  assert.equal(crmAttention(ok, 3).status, "ok");
  const r = crmAttention({ ...ok, data: { ...ok.data, automations: "nao" } }, 3);
  assert.equal(r.status, "aberto");
  assert.match(r.detail, /Tem automações/);
});

test("playbook: banco de dores tem motivo, ação, owner e objetivo em toda dor", () => {
  assert.equal(new Set(DORES.map((d) => d.key)).size, DORES.length);
  for (const d of DORES) assert.ok(d.motivos.length && d.acoes.length && d.owner && d.objetivo, d.key);
});

test("prioridades: passo do playbook atrasado entra na lista com a ação certa", () => {
  const [p] = topPriorities([acct({ band: "verde", playbookLate: 2 })]);
  assert.equal(p.action, "cobrar_playbook");
  assert.match(p.why, /2 passos do playbook estão atrasados/);
});

/* ------------------------------ CRM ------------------------------ */

const stageBase = {
  override: null,
  churnOpen: false,
  upsellOpen: false,
  since: "2024-01-10",
  renewalDate: null,
  at: "2026-10-09",
};

test("CRM: etapa derivada respeita a precedência churn > renovação > expansão > onboarding", () => {
  assert.equal(stageOf(stageBase), "estavel");
  assert.equal(stageOf({ ...stageBase, since: "2026-09-20" }), "onboarding");
  assert.equal(stageOf({ ...stageBase, upsellOpen: true }), "expansao");
  // Renovação vence expansão: a conversa pendente da conta é o contrato.
  assert.equal(stageOf({ ...stageBase, upsellOpen: true, renewalDate: "2026-11-01" }), "renovacao");
  // Churn vence tudo.
  assert.equal(stageOf({ ...stageBase, churnOpen: true, upsellOpen: true, renewalDate: "2026-11-01" }), "retencao");
  // Override vence até o churn — é a correção manual.
  assert.equal(stageOf({ ...stageBase, override: "estavel", churnOpen: true }), "estavel");
});

test("CRM: renovação vencida continua sendo etapa de renovação", () => {
  assert.equal(stageOf({ ...stageBase, renewalDate: "2026-09-01" }), "renovacao");
  assert.equal(stageOf({ ...stageBase, renewalDate: "2027-06-01" }), "estavel");
});

const crmRow = (over: Partial<CrmRow> = {}): CrmRow => ({
  id: 1,
  name: "Imobiliária Horizonte",
  active: true,
  accountType: "lead_gen",
  typeLabel: "Geração de Lead",
  segment: "Imóveis",
  accountName: "Rafael Moreira",
  gtName: "Lucas Andrade",
  score: 72,
  band: "amarelo",
  delta7: -4,
  history: [],
  stage: "retencao",
  stageManual: false,
  mrr: 13600,
  since: "2025-03-01",
  renewalDate: null,
  renewalIn: null,
  services: [],
  lastInteraction: null,
  nextAction: null,
  pendencias: [],
  openTasks: 0,
  targets: { set: 2, total: 3 },
  leadSources: ["Meta Ads"],
  leadSource: "webhook",
  charge: null,
  churn: null,
  hook: null,
  meta: [],
  google: [],
  ...over,
});

test("CRM: busca ignora acento e caixa, e varre responsáveis e segmento", () => {
  const r = crmRow();
  const f = (q: string) => matchesFilters(r, { ...EMPTY_FILTERS, q });
  assert.ok(f("imobiliaria"));
  assert.ok(f("HORIZONTE"));
  assert.ok(f("rafael"));
  assert.ok(f("Imóveis"));
  assert.ok(!f("construtora"));
});

test("CRM: filtros combinam — todos precisam passar", () => {
  const r = crmRow({ accountName: "Rafael Moreira", stage: "retencao", leadSources: [] });
  const base = { ...EMPTY_FILTERS, account: "Rafael Moreira", stage: "retencao" as const };
  assert.ok(matchesFilters(r, base));
  assert.ok(matchesFilters(r, { ...base, source: "sem" }));
  assert.ok(!matchesFilters(r, { ...base, source: "com" }));
  assert.ok(!matchesFilters(r, { ...base, account: "Juliana" }));
});

test("CRM: filtro de metas separa definidas de pendentes", () => {
  const com = crmRow({ targets: { set: 2, total: 3 } });
  const sem = crmRow({ targets: { set: 0, total: 3 } });
  assert.ok(matchesFilters(com, { ...EMPTY_FILTERS, targets: "definidas" }));
  assert.ok(!matchesFilters(com, { ...EMPTY_FILTERS, targets: "pendentes" }));
  assert.ok(matchesFilters(sem, { ...EMPTY_FILTERS, targets: "pendentes" }));
});

test("CRM: filtro de última interação trata 'nunca' e a janela de dias", () => {
  const nunca = crmRow({ lastInteraction: null });
  const recente = crmRow({ lastInteraction: { at: "2026-10-07", kind: "reuniao", title: "Call", days: 2 } });
  assert.ok(matchesFilters(nunca, { ...EMPTY_FILTERS, interaction: "nunca" }));
  assert.ok(!matchesFilters(recente, { ...EMPTY_FILTERS, interaction: "nunca" }));
  assert.ok(matchesFilters(recente, { ...EMPTY_FILTERS, interaction: "7" }));
  assert.ok(!matchesFilters(nunca, { ...EMPTY_FILTERS, interaction: "7" }));
});

test("CRM: abas separam a carteira sem sobreposição indevida", () => {
  const rows = [
    crmRow({ id: 1, band: "verde" }),
    crmRow({ id: 2, band: "amarelo" }),
    crmRow({ id: 3, band: "vermelho", pendencias: [{ id: "sem_meta", label: "sem meta", severity: "bloqueia" }] }),
    crmRow({ id: 4, band: "verde", churn: { id: 9, status: "em_negociacao" } }),
    crmRow({ id: 5, active: false, band: null }),
  ];
  const c = countViews(rows);
  assert.equal(c.todos, 4);
  assert.equal(c.saudaveis, 2);
  assert.equal(c.atencao, 1);
  assert.equal(c.risco, 1);
  assert.equal(c.churn, 1);
  assert.equal(c.pendencias, 1);
  assert.equal(c.arquivados, 1);
});

test("CRM: ordenação joga quem não tem o dado para o fim nas duas direções", () => {
  const rows = [crmRow({ id: 1, score: null }), crmRow({ id: 2, score: 80 }), crmRow({ id: 3, score: 40 })];
  assert.deepEqual(sortRows(rows, "score", "desc").map((r) => r.id), [2, 3, 1]);
  assert.deepEqual(sortRows(rows, "score", "asc").map((r) => r.id), [3, 2, 1]);
});

test("CRM: os links antigos de ?filtro= continuam apontando para a mesma fila", () => {
  assert.deepEqual(fromLegacyFilter("sem_meta"), { view: "todos", filters: { ...EMPTY_FILTERS, targets: "pendentes" } });
  assert.deepEqual(fromLegacyFilter("sem_fonte"), { view: "todos", filters: { ...EMPTY_FILTERS, source: "sem" } });
  assert.equal(fromLegacyFilter("arquivados").view, "arquivados");
  assert.equal(fromLegacyFilter(null).view, "todos");
  assert.equal(fromLegacyFilter("lixo").view, "todos");
});

test("CRM: rótulo de tempo da última interação", () => {
  assert.equal(agoLabel(0), "hoje");
  assert.equal(agoLabel(1), "ontem");
  assert.equal(agoLabel(4), "há 4 dias");
  assert.equal(agoLabel(35), "há 1 mês");
  assert.equal(agoLabel(70), "há 2 meses");
});

test("serviços: separa catálogo de texto livre e aceita acento/caixa", () => {
  const r = splitServices(["meta ads", "Social Media", "Tráfego pago", "META ADS", "  "]);
  assert.deepEqual(r.known, ["Meta Ads", "Social Media"]);
  assert.deepEqual(r.custom, ["Tráfego pago"]);
});

test("serviços: canal contratado só é negado quando há serviço cadastrado", () => {
  assert.equal(hasMediaService([], "meta"), null);
  assert.equal(hasMediaService(["Social Media"], "meta"), false);
  assert.equal(hasMediaService(["Meta Ads", "SEO"], "meta"), true);
  assert.equal(hasMediaService(["Meta Ads"], "google"), false);
  assert.equal(hasMediaService(["Google Ads"], "google"), true);
});

/* ------------------------ mídia por canal ------------------------ */

const agg = (spend: number, leads: number, revenue = 0) => ({
  week: { ...EMPTY_WEEK, spend, leads, revenue, impressions: spend * 10, clicks: spend },
  leads,
  leadSpend: spend,
});

test("mídia: separa Meta de Google e calcula fatia, custo por resultado e ROAS", () => {
  const r = mediaSplit({
    weeks: ["2026-10-02", "2026-10-09"],
    meta: new Map([["2026-10-02", agg(600, 30)], ["2026-10-09", agg(400, 10, 2000)]]),
    google: new Map([["2026-10-09", agg(1000, 20, 5000)]]),
    metaLinked: true,
    googleLinked: true,
  });
  assert.equal(r.total.spend, 2000);
  assert.equal(r.byChannel.meta.totals.spend, 1000);
  assert.equal(r.byChannel.meta.totals.results, 40);
  assert.equal(r.byChannel.meta.totals.cpr, 25);
  assert.equal(r.byChannel.google.totals.share, 0.5);
  assert.equal(r.byChannel.google.totals.roas, 5);
  assert.ok(r.hasData);
});

test("mídia: sem resultado não inventa custo por resultado, sem verba não inventa ROAS", () => {
  const r = mediaSplit({
    weeks: ["2026-10-09"],
    meta: new Map([["2026-10-09", agg(500, 0)]]),
    google: undefined,
    metaLinked: true,
    googleLinked: false,
  });
  assert.equal(r.byChannel.meta.totals.cpr, null);
  assert.equal(r.byChannel.google.totals.roas, null);
  // Conta não vinculada é diferente de conta sem verba.
  assert.equal(r.byChannel.google.totals.linked, false);
  assert.equal(r.byChannel.meta.totals.linked, true);
});

test("mídia: semana sem dado entra como zero, mantendo a série alinhada", () => {
  const r = mediaSplit({
    weeks: ["2026-09-25", "2026-10-02", "2026-10-09"],
    meta: new Map([["2026-10-09", agg(300, 5)]]),
    google: undefined,
    metaLinked: true,
    googleLinked: false,
  });
  assert.deepEqual(r.byChannel.meta.weeks.map((w) => w.spend), [0, 0, 300]);
});

test("mídia: variação semana a semana ignora base zero", () => {
  const weeks = mediaSplit({
    weeks: ["2026-10-02", "2026-10-09"],
    meta: new Map([["2026-10-02", agg(100, 10)], ["2026-10-09", agg(150, 5)]]),
    google: undefined,
    metaLinked: true,
    googleLinked: false,
  }).byChannel.meta.weeks;
  const w = weekOverWeek(weeks);
  assert.equal(w.spend, 50);
  assert.equal(w.results, -50);
  assert.deepEqual(weekOverWeek([]), { spend: null, results: null });
});

/* ===================== metas por período (CRM) ===================== */

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 1,
  client_id: 1,
  metric: "leads",
  label: "Leads qualificados",
  direction: "piso",
  target: 200,
  period: "mensal",
  scope: "todas",
  active: 1,
  ...over,
});

const snap = (ref: string, data: Record<string, unknown>) => ({
  id: 1,
  client_id: 1,
  ref_date: ref,
  filled_by: null,
  filled_at: `${ref}T12:00:00Z`,
  filler: null,
  data,
});

test("meta: período mensal fecha no último dia do mês e mede o decorrido", () => {
  const p = periodOf("mensal", "2026-10-09");
  assert.equal(p.from, "2026-10-01");
  assert.equal(p.to, "2026-10-31");
  assert.equal(p.label, "outubro");
  assert.equal(Math.round(p.elapsed * 100), 29);
  // Fevereiro bissexto: 2028 tem 29 dias.
  assert.equal(periodOf("mensal", "2028-02-10").to, "2028-02-29");
});

test("meta: período trimestral vai de Q1 a Q4 com o rótulo do trimestre", () => {
  const q4 = periodOf("trimestral", "2026-10-09");
  assert.equal(q4.from, "2026-10-01");
  assert.equal(q4.to, "2026-12-31");
  assert.equal(q4.label, "Q4 2026");
  assert.equal(periodOf("trimestral", "2026-01-01").label, "Q1 2026");
  assert.equal(periodOf("trimestral", "2026-06-30").to, "2026-06-30");
});

test("meta de piso: 31% no dia 9 de outubro está no ritmo, não atrasada", () => {
  // O caso que o design mostra: 61 de 200 leads. 31% de meta, 29% de mês.
  const p = periodOf("mensal", "2026-10-09");
  const r = goalStatus(goal(), 61, p);
  assert.equal(r.status, "saudavel");
  // O mesmo número no fim do mês é crítico — o ritmo é que muda.
  assert.equal(goalStatus(goal(), 61, periodOf("mensal", "2026-10-31")).status, "critico");
});

test("meta de teto: estourar o limite é crítico, 10% acima é atenção", () => {
  const p = periodOf("mensal", "2026-10-09");
  const cpl = goal({ metric: "cpl", direction: "teto", target: 35 });
  assert.equal(goalStatus(cpl, 30, p).status, "saudavel");
  assert.equal(goalStatus(cpl, 35, p).status, "saudavel");
  assert.equal(goalStatus(cpl, 38, p).status, "atencao");
  // O caso do design: R$ 41,20 sobre teto de R$ 35 = 18% acima.
  assert.equal(goalStatus(cpl, 41.2, p).status, "critico");
});

test("meta sem leitura não vira zero", () => {
  const p = periodOf("mensal", "2026-10-09");
  assert.equal(goalStatus(goal(), null, p).status, "sem_leitura");
  assert.equal(goalStatus(goal(), null, p).ratio, null);
  // Meta zerada não divide por zero.
  assert.equal(goalStatus(goal({ target: 0 }), 10, p).status, "sem_leitura");
});

test("realizado: piso soma as semanas do período, teto faz média", () => {
  const p = periodOf("mensal", "2026-10-09");
  const snaps = [
    snap("2026-10-02", { leads: 30, cpl: 40 }),
    snap("2026-10-09", { leads: 31, cpl: 42 }),
    // Fora do período: não entra em nenhuma das duas contas.
    snap("2026-09-25", { leads: 99, cpl: 99 }),
  ];
  assert.equal(realizedIn(snaps, "leads", p, "piso"), 61);
  assert.equal(realizedIn(snaps, "cpl", p, "teto"), 41);
  assert.equal(realizedIn(snaps, "visitas", p, "piso"), null);
  assert.equal(realizedIn([], "leads", p, "piso"), null);
});

test("realizado: campo vazio ou não numérico é ignorado, zero é lido", () => {
  const p = periodOf("mensal", "2026-10-09");
  assert.equal(realizedIn([snap("2026-10-02", { leads: "" })], "leads", p, "piso"), null);
  assert.equal(realizedIn([snap("2026-10-02", { leads: null })], "leads", p, "piso"), null);
  assert.equal(realizedIn([snap("2026-10-02", { leads: "x" })], "leads", p, "piso"), null);
  assert.equal(realizedIn([snap("2026-10-02", { leads: 0 })], "leads", p, "piso"), 0);
  // Número em texto (o formulário grava string) conta.
  assert.equal(realizedIn([snap("2026-10-02", { leads: "12" })], "leads", p, "piso"), 12);
});

/* ---------------------- kanban de clientes ---------------------- */

test("kanban: renovação cai na faixa certa, sem data vai para Sem data", () => {
  assert.equal(laneOf("renovacao", crmRow({ renewalIn: -3 })), "vencida");
  assert.equal(laneOf("renovacao", crmRow({ renewalIn: 0 })), "30");
  assert.equal(laneOf("renovacao", crmRow({ renewalIn: 30 })), "30");
  assert.equal(laneOf("renovacao", crmRow({ renewalIn: 31 })), "90");
  assert.equal(laneOf("renovacao", crmRow({ renewalIn: 91 })), "mais");
  assert.equal(laneOf("renovacao", crmRow({ renewalIn: null })), NONE);
  assert.equal(laneOf("saude", crmRow({ band: null })), NONE);
});

test("kanban: Account vira coluna mesmo sem cliente, e nome só do cliente também entra", () => {
  const rows = [crmRow({ accountName: "Zé Antigo" }), crmRow({ accountName: null })];
  const lanes = lanesFor("account", rows, ["Ana", "Bruno"]).map((l) => l.key);
  assert.deepEqual(lanes, ["Ana", "Bruno", "Zé Antigo", NONE]);
  assert.equal(laneOf("account", rows[1]), NONE);
});

/* ------------------------- construtor de relatórios ------------------------- */

const nums = (o: Partial<WeekRow["meta"]> = {}) => ({
  spend: 0, impressions: 0, reach: 0, clicks: 0, leads: 0, conversations: 0, purchases: 0, revenue: 0, leadSpend: 0, ...o,
});

test("Relatório: período anterior tem o mesmo tamanho, colado antes", () => {
  assert.deepEqual(previousPeriod("2026-09-01", "2026-09-30"), { start: "2026-08-02", end: "2026-08-31" });
  assert.deepEqual(previousPeriod("2026-10-05", "2026-10-11"), { start: "2026-09-28", end: "2026-10-04" });
});

test("Relatório: atalhos de período", () => {
  assert.deepEqual(presetRange("last_month", "2026-10-13"), { start: "2026-09-01", end: "2026-09-30" });
  assert.deepEqual(presetRange("last_month", "2026-01-10"), { start: "2025-12-01", end: "2025-12-31" });
  assert.deepEqual(presetRange("last_quarter", "2026-10-13"), { start: "2026-07-01", end: "2026-09-30" });
  assert.deepEqual(presetRange("this_month", "2026-10-01"), { start: "2026-10-01", end: "2026-10-01" });
  assert.equal(periodLabel("2026-09-01", "2026-09-30"), "setembro de 2026");
  assert.equal(periodLabel("2026-07-01", "2026-09-30"), "julho a setembro de 2026");
  assert.equal(periodLabel("2026-09-03", "2026-09-30"), "03/09/2026 a 30/09/2026");
});

test("Relatório: soma por canal e métricas derivadas", () => {
  const data: ReportData = {
    client: { id: 1, name: "Padaria Estrela" },
    period: { start: "2026-09-01", end: "2026-09-30" },
    previous: previousPeriod("2026-09-01", "2026-09-30"),
    weeks: [
      { ref: "2026-09-05", start: "2026-08-30", meta: nums({ spend: 1000, leads: 40, clicks: 500, impressions: 50_000 }), google: nums({ spend: 500, leads: 10, clicks: 300, impressions: 10_000 }), crmLeads: 55 },
      { ref: "2026-09-12", start: "2026-09-06", meta: nums({ spend: 1000, leads: 60, clicks: 500, impressions: 50_000 }), google: nums(), crmLeads: 70 },
    ],
    prevWeeks: [{ ref: "2026-08-29", start: "2026-08-23", meta: nums({ spend: 2000, leads: 50 }), google: nums(), crmLeads: 0 }],
    score: { value: 80, band: "verde", day: "2026-09-30" },
    targets: { leads_meta: 30, cpl_meta: 25 },
    leadSource: "campaign",
    sample: false,
    source: { kind: "db" },
  };
  assert.equal(totalsOf(data.weeks, "all").spend, 2500);
  assert.equal(metricValue(data, "leads", "meta"), 100);
  assert.equal(metricValue(data, "cpl", "all"), 2500 / 110);
  assert.equal(metricValue(data, "ctr", "google"), 3);
  assert.equal(metricValue(data, "crm_leads", "google"), 125, "CRM ignora o canal");
  // Conversas só existem na Meta: pedir Google não zera.
  data.weeks[0].meta.conversations = 7;
  assert.equal(metricValue(data, "conversations", "google"), 7);
  // Meta semanal × semanas do período para o que soma; razão vale igual.
  assert.equal(autoTarget(data, "leads"), 60);
  assert.equal(autoTarget(data, "cpl"), 25);
  assert.equal(autoTarget(data, "clicks"), null);
  // Sem semanas no período anterior: sem comparação, não zero.
  assert.equal(metricValue({ ...data, prevWeeks: [] }, "leads", "all", "previous"), null);
});

test("Relatório: variação e cor (menor é melhor inverte)", () => {
  assert.equal(deltaPct(120, 100), 20);
  assert.equal(deltaPct(5, 0), null);
  assert.equal(deltaTone(20), "up");
  assert.equal(deltaTone(20, true), "down");
  assert.equal(deltaTone(-12, true), "up");
  assert.equal(deltaTone(0.2), "flat");
});

test("Relatório: formatação e números digitados no padrão brasileiro", () => {
  assert.equal(formatValue(12480.5, "currency"), "R$ 12.481");
  assert.equal(formatValue(32.4, "currency"), "R$ 32,40");
  assert.equal(formatValue(3.25, "x"), "3,25x");
  assert.equal(formatValue(1.84, "percent"), "1,8%");
  assert.equal(formatValue(125_000, "int", { compact: true }), "125 mil");
  assert.equal(formatValue(null, "int"), "—");
  assert.equal(parseNumberBR("12.480,50"), 12480.5);
  assert.equal(parseNumberBR("R$ 1.200"), 1200);
  assert.equal(parseNumberBR("3,2"), 3.2);
  assert.equal(parseNumberBR("18%"), 18);
  assert.equal(parseNumberBR(""), null);
  assert.deepEqual(parsePairs("Instagram; 12.400\nTikTok\t3100\n\n"), [
    { label: "Instagram", value: 12400 },
    { label: "TikTok", value: 3100 },
  ]);
});

test("Relatório: variáveis dos textos trocam pelo cliente e período", () => {
  const d = sampleData("2026-09-01", "2026-09-30");
  d.client = { id: 3, name: "JK Alianças" };
  assert.equal(fillVariables("Resultados de {cliente} em {periodo}", d, "2026-10-13"), "Resultados de JK Alianças em setembro de 2026");
  assert.equal(fillVariables("{data}", d, "2026-10-13"), "13/10/2026");
});

test("Relatório: grade mantém o bloco dentro da página e acha lugar livre", () => {
  assert.deepEqual(clampBlock("slide", { x: 11, y: 15, w: 4, h: 3 }), { x: 8, y: 13, w: 4, h: 3 });
  assert.deepEqual(clampBlock("a4", { x: -2, y: 0, w: 0, h: 40 }), { x: 0, y: 0, w: 1, h: 26 });
  const a = newBlock("kpi", "slide", { x: 0, y: 0 });
  const b = newBlock("kpi", "slide", { x: 3, y: 0 });
  assert.deepEqual(freeSpot("slide", [a, b], 3, 3), { x: 6, y: 0 });
  // Página cheia: vai para o fim em vez de sumir.
  const full = newBlock("shape", "slide", { x: 0, y: 0 });
  full.w = 12;
  full.h = 16;
  assert.deepEqual(freeSpot("slide", [full], 4, 3), { x: 0, y: 13 });
});

test("Relatório: documento do banco é saneado e os modelos da V4 são válidos", () => {
  const doc = sanitizeDoc({ theme: { mode: "x", accent: "red" }, pages: [{ blocks: [{ type: "nada" }, { type: "heading", x: 20, y: 0, w: 3, h: 2 }] }] }, "a4");
  assert.equal(doc.theme.mode, "dark");
  assert.equal(doc.theme.accent, "#e50914");
  assert.equal(doc.pages[0].blocks.length, 1);
  assert.equal(doc.pages[0].blocks[0].x, 9);
  assert.equal(sanitizeDoc(null, "slide").pages.length, 1);
  for (const s of STARTERS) {
    const built = s.build();
    const clean = sanitizeDoc(JSON.parse(JSON.stringify(built)), s.format);
    assert.deepEqual(clean.pages.map((p) => p.blocks.map((b) => [b.x, b.y, b.w, b.h])), built.pages.map((p) => p.blocks.map((b) => [b.x, b.y, b.w, b.h])), `${s.id}: todo bloco cabe na página`);
  }
});

/* ------------------------ período da ficha ------------------------ */

test("ficha: período padrão e presets seguem o 'Últimos N dias' da Meta (até ontem)", () => {
  const p = parsePeriod({}, "2026-10-13");
  assert.equal(p.key, "30d");
  assert.deepEqual([p.since, p.until, p.days], ["2026-09-13", "2026-10-12", 30]);
  assert.equal(p.range, "13 set – 12 out");
  assert.deepEqual(p.previous, { since: "2026-08-14", until: "2026-09-12" });
  assert.deepEqual(presetPeriod("mes", "2026-10-13").since, "2026-10-01");
  const prev = presetPeriod("mes-anterior", "2026-10-13");
  assert.deepEqual([prev.since, prev.until, prev.days], ["2026-09-01", "2026-09-30", 30]);
  assert.equal(parsePeriod({ periodo: "7d" }, "2026-10-13").since, "2026-10-06");
  assert.equal(parsePeriod({ periodo: "lixo" }, "2026-10-13").key, "30d");
});

test("ficha: período personalizado é validado e vira preset quando bate", () => {
  const c = parsePeriod({ de: "2026-10-02", ate: "2026-10-12" }, "2026-10-13");
  assert.deepEqual([c.key, c.label, c.days], ["custom", "Personalizado", 11]);
  assert.deepEqual(c.previous, { since: "2026-09-21", until: "2026-10-01" });
  assert.equal(parsePeriod({ de: "2026-10-01", ate: "2026-10-13" }, "2026-10-13").key, "mes");
  assert.equal(parsePeriod({ de: "2026-09-01", ate: "2026-09-30" }, "2026-10-13").key, "mes-anterior");
  // Futuro, invertido, data torta ou longo demais: volta ao padrão.
  assert.equal(parsePeriod({ de: "2026-10-01", ate: "2026-10-20" }, "2026-10-13").key, "30d");
  assert.equal(parsePeriod({ de: "2026-10-10", ate: "2026-10-01" }, "2026-10-13").key, "30d");
  assert.equal(parsePeriod({ de: "2026-02-30", ate: "2026-03-10" }, "2026-10-13").key, "30d");
  assert.equal(parsePeriod({ de: "2024-01-01", ate: "2026-10-01" }, "2026-10-13").key, "30d");
  assert.equal(rangeLabel("2025-12-20", "2026-01-10"), "20 dez 2025 – 10 jan 2026");
  assert.equal(periodQuery(c), "de=2026-10-02&ate=2026-10-12");
  assert.equal(periodQuery(parsePeriod({}, "2026-10-13")), "");
  assert.equal(periodQuery(presetPeriod("7d", "2026-10-13")), "periodo=7d");
});

/* --------------------------- performance --------------------------- */

test("performance: Meta lê campanha a campanha e o CPL só conta campanha de lead (New Cabos)", () => {
  const range = { date_start: "2026-10-01", date_stop: "2026-10-13" };
  const contatos = metaTotals(
    { ...range, spend: "182.35", impressions: "6000", clicks: "114", inline_link_clicks: "90", reach: "4000", actions: [{ action_type: "contact_total", value: "31" }] },
    "both",
    "lead_gen",
  );
  const instagram = metaTotals(
    { ...range, spend: "126.33", impressions: "46000", clicks: "1154", reach: "30000", actions: [{ action_type: "link_click", value: "1016" }] },
    "both",
    "lead_gen",
  );
  assert.equal(contatos.results, 31);
  assert.equal(contatos.resultSpend, 182.35);
  assert.equal(instagram.results, 0);
  assert.equal(instagram.resultSpend, 0);
  const t = accountTotals(
    { ...range, spend: "308.68", impressions: "52000", clicks: "1268", reach: "32000" },
    [contatos, instagram],
    "lead_gen",
  );
  assert.equal(t.spend, 308.68);
  assert.equal(t.clicks, 1268);
  assert.equal(t.reach, 32000); // alcance da conta, sem somar pessoa repetida
  assert.equal(t.results, 31);
  assert.equal(Math.round(cpr(t)! * 100) / 100, 5.88);
  assert.equal(Math.round(ctr(t)! * 100) / 100, 2.44);
  assert.deepEqual(accountTotals(undefined, [], "lead_gen"), EMPTY_TOTALS);
});

test("performance: Google soma o período e o anterior a partir dos dias", () => {
  const days = [
    { segments: { date: "2026-09-30" }, metrics: { costMicros: "50000000", clicks: "10", impressions: "100", conversions: "1" } },
    { segments: { date: "2026-10-01" }, metrics: { costMicros: "100000000", clicks: "20", impressions: "1000", conversions: "2.5" } },
    { segments: { date: "2026-10-02" }, metrics: { costMicros: "60000000", clicks: "10", impressions: "500", conversions: "1.5", conversionsValue: "300" } },
  ];
  const cur = sumDays(days, { since: "2026-10-01", until: "2026-10-02" }, "lead_gen");
  assert.deepEqual([cur.spend, cur.clicks, cur.impressions, cur.results, cur.revenue], [160, 30, 1500, 4, 300]);
  assert.equal(cur.reach, null);
  const prev = sumDays(days, { since: "2026-09-30", until: "2026-09-30" }, "lead_gen");
  assert.equal(prev.spend, 50);
  assert.equal(delta(cpr(cur), cpr(prev)), -20);
  assert.equal(googleTotals({ costMicros: "1000000", conversions: "2" }, "ecommerce").purchases, 2);
});

test("performance: contas derivadas, status e soma de canais", () => {
  const t = { ...EMPTY_TOTALS, spend: 100, impressions: 20000, clicks: 400, reach: 10000, results: 20, resultSpend: 80, revenue: 500 };
  assert.equal(ctr(t), 2);
  assert.equal(cpc(t), 0.25);
  assert.equal(cpm(t), 5);
  assert.equal(frequency(t), 2);
  assert.equal(cpr(t), 4); // 80 ÷ 20: só a verba das campanhas com resultado
  assert.equal(roas(t), 5);
  assert.equal(convRate(t), 5);
  assert.equal(cpr({ ...t, results: 0 }), null);
  assert.equal(cpr({ ...t, resultSpend: 0 }), 5); // sem verba de lead, cai na total
  assert.equal(delta(110, 100), 10);
  assert.equal(delta(5, 0), null);
  assert.equal(metaStatus("ACTIVE"), "ativa");
  assert.equal(metaStatus("CAMPAIGN_PAUSED"), "pausada");
  assert.equal(metaStatus(undefined), "encerrada");
  assert.equal(googleStatus("ENABLED"), "ativa");
  assert.equal(metaObjective("OUTCOME_LEADS"), "Cadastro");
  assert.equal(googleType("PERFORMANCE_MAX"), "Performance Max");
  const s = sumTotals([t, { ...EMPTY_TOTALS, spend: 50, clicks: 100 }]);
  assert.deepEqual([s.spend, s.clicks, s.reach], [150, 500, 10000]);
  assert.equal(budgetFor(700, 30), 3000);
  assert.equal(budgetFor(undefined, 30), null);
  const d = mergeDaily("2026-10-01", "2026-10-03", { meta: [{ day: "2026-10-02", spend: 10, results: 1 }], google: [{ day: "2026-10-02", spend: 5, results: 2 }] });
  assert.equal(d.length, 3);
  assert.deepEqual(d[1], { day: "2026-10-02", meta: 10, google: 5, results: 3 });
  assert.deepEqual(d[0], { day: "2026-10-01", meta: 0, google: 0, results: 0 });
});

test("Relatório: CPL usa só a verba das campanhas de lead (sem ela, a verba toda)", () => {
  const d = sampleData("2026-09-01", "2026-09-30");
  const w = (meta: Partial<WeekRow["meta"]>) => ({ ref: "2026-09-07", start: "2026-09-01", meta: nums(meta), google: nums(), crmLeads: 0 });
  // R$ 182,35 em campanhas de lead + R$ 300 em visita ao perfil, 31 leads → 5,88 (caso New Cabos).
  d.weeks = [w({ spend: 482.35, leadSpend: 182.35, leads: 31 })];
  assert.equal(Math.round(metricValue(d, "cpl", "meta")! * 100) / 100, 5.88);
  d.weeks = [w({ spend: 300, leads: 10 })];
  assert.equal(metricValue(d, "cpl", "meta"), 30);
});

test("Sincronizar: trechos de 7 dias a partir do início, o último menor", () => {
  assert.deepEqual(chunksOf({ since: "2026-09-01", until: "2026-09-16" }), [
    { since: "2026-09-01", until: "2026-09-07" },
    { since: "2026-09-08", until: "2026-09-14" },
    { since: "2026-09-15", until: "2026-09-16" },
  ]);
  assert.deepEqual(chunksOf({ since: "2026-09-05", until: "2026-09-05" }), [{ since: "2026-09-05", until: "2026-09-05" }]);
});

test("Sincronizar: Meta soma lead de site campanha a campanha, cliques no link da conta", () => {
  const account = {
    date_start: "2026-09-01",
    date_stop: "2026-09-07",
    spend: "482.35",
    impressions: "50000",
    reach: "20000",
    inline_link_clicks: "900",
    actions: [{ action_type: "lead", value: "99" }],
  };
  const campaigns = [
    // Site que dispara Lead e Contato no mesmo envio: vale o maior, não a soma.
    { date_start: "2026-09-01", date_stop: "2026-09-07", spend: "182.35", actions: [{ action_type: "lead", value: "20" }, { action_type: "contact_total", value: "31" }] },
    { date_start: "2026-09-01", date_stop: "2026-09-07", spend: "300", actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "4" }] },
  ];
  const lead = metaNums(account, campaigns, "lead");
  assert.equal(lead.leads, 31);
  assert.equal(lead.leadSpend, 182.35);
  assert.equal(lead.clicks, 900);
  assert.equal(lead.spend, 482.35);
  const both = metaNums(account, campaigns, "both");
  assert.equal(both.leads, 35);
  assert.equal(both.leadSpend, 482.35);
  assert.deepEqual(metaNums(undefined, [], "both"), nums());
});

test("Sincronizar: Google por trecho, verba de campanha com conversão vira base do CPL", () => {
  const row = (id: string, date: string, cost: number, conv: number) => ({
    campaign: { id },
    segments: { date },
    metrics: { costMicros: cost * 1_000_000, impressions: 100, clicks: 10, conversions: conv, conversionsValue: 0 },
  });
  const buckets = [
    { since: "2026-09-01", until: "2026-09-07" },
    { since: "2026-09-08", until: "2026-09-14" },
  ];
  const out = googleBuckets(
    [row("a", "2026-09-02", 100, 2.5), row("b", "2026-09-03", 50, 0), row("a", "2026-09-09", 80, 0), row("x", "2026-08-30", 999, 9)],
    buckets,
  );
  assert.equal(out[0].spend, 150);
  assert.equal(out[0].leads, 2.5);
  assert.equal(out[0].leadSpend, 100, "campanha sem conversão fica fora do CPL");
  assert.equal(out[1].spend, 80);
  assert.equal(out[1].leadSpend, 0);
  assert.equal(out[0].clicks + out[1].clicks, 30, "dia fora dos trechos não entra");
});

test("IA: contexto leva os números do período, a comparação e as metas — e avisa quando é exemplo", () => {
  const d = sampleData("2026-09-01", "2026-09-30");
  const ctx = dataContext(d);
  assert.match(ctx, /Período: setembro de 2026/);
  assert.match(ctx, /Investimento: R\$ /);
  assert.match(ctx, /Custo por lead/);
  assert.match(ctx, /Metas do período/);
  assert.match(ctx, /números de exemplo/);
  d.client = { id: 1, name: "New Cabos" };
  d.sample = false;
  assert.doesNotMatch(dataContext(d), /números de exemplo/);
});

test("Relatório: Leads no total seguem o \"Leads contam de\" do cliente (padrão campanha)", () => {
  const w = (crm: number) => ({ ref: "2026-09-07", start: "2026-09-01", meta: nums({ leads: 40, spend: 400 }), google: nums({ leads: 10, spend: 100 }), crmLeads: crm });
  assert.equal(weekLeads(w(70), "campaign"), 50);
  assert.equal(weekLeads(w(70), "webhook"), 70);
  assert.equal(weekLeads(w(0), "webhook"), 50, "semana sem lead no CRM usa a campanha");
  assert.equal(weekLeads(w(70), "both"), 120);
  const d = sampleData("2026-09-01", "2026-09-07");
  d.weeks = [w(70)];
  assert.equal(metricValue(d, "leads", "all"), 50, "padrão: conversão das campanhas");
  d.leadSource = "webhook";
  assert.equal(metricValue(d, "leads", "all"), 70);
  assert.equal(metricValue(d, "cpl", "all"), 500 / 70);
  assert.equal(metricValue(d, "leads", "meta"), 40, "num canal só, sempre a conversão do canal");
});

test("Meta: \"Contatos no site\" vem em conversions, não em actions — e conta como lead", () => {
  // Formato da New Cabos (01/10 a 13/10): 31 contatos, R$ 182,35 na campanha de contato.
  const row = {
    date_start: "2026-10-01",
    date_stop: "2026-10-13",
    spend: "182.35",
    actions: [{ action_type: "link_click", value: "640" }],
    conversions: [{ action_type: "contact_website", value: "31" }],
  };
  assert.equal(parseInsight(row).leads, 31);
  const t = campaignTotals([row, { date_start: "2026-10-01", date_stop: "2026-10-13", spend: "126.33", actions: [{ action_type: "link_click", value: "600" }] }]);
  assert.equal(t.leads, 31);
  assert.equal(t.leadSpend, 182.35, "campanha de visita ao perfil fica fora do CPL");
  assert.equal(Math.round((t.leadSpend / t.leads) * 100) / 100, 5.88);
});

/* ---------------- Meta: resultado = o que a campanha otimiza ---------------- */


const camp = (id: string, spend: number, actions: { action_type: string; value: string }[] = [], conversions: { action_type: string; value: string }[] = []) => ({
  date_start: "2026-10-01",
  date_stop: "2026-10-07",
  campaign_id: id,
  campaign_name: `Campanha ${id}`,
  spend: String(spend),
  actions,
  conversions,
});

test("Meta: evento otimizado vira resultado — agendamento, conversão personalizada, formulário", () => {
  const goals = campaignGoals([
    { campaign_id: "a", optimization_goal: "OFFSITE_CONVERSIONS", promoted_object: { custom_event_type: "SCHEDULE" } },
    { campaign_id: "b", optimization_goal: "OFFSITE_CONVERSIONS", promoted_object: { custom_event_type: "OTHER", custom_conversion_id: "987" } },
    { campaign_id: "c", optimization_goal: "LEAD_GENERATION" },
    { campaign_id: "d", optimization_goal: "LINK_CLICKS" },
  ]);
  assert.equal(optimizedEvent({ optimization_goal: "REACH" }), null);
  const rows = [
    camp("a", 100, [], [{ action_type: "schedule_total", value: "12" }]),
    camp("b", 80, [{ action_type: "offsite_conversion.custom.987", value: "9" }]),
    camp("c", 50, [{ action_type: "onsite_conversion.lead_grouped", value: "5" }]),
    camp("d", 70, [{ action_type: "link_click", value: "400" }]),
  ];
  const t = campaignTotals(rows, goals);
  assert.equal(t.leads, 26);
  assert.equal(t.leadSpend, 230, "campanha de tráfego fica fora do CPL");
  // Sem saber o que a campanha otimiza, agendamento e conversão personalizada não contam…
  assert.equal(campaignTotals(rows).leads, 5);
  // …e o vigia acende para eles.
  const unread = unreadEvents(rows);
  assert.deepEqual(unread.map((u) => u.campaign).sort(), ["Campanha a", "Campanha b"]);
  assert.match(describeUnread(mergeUnread(unread)) ?? "", /Evento não contado/);
  assert.deepEqual(unreadEvents(rows, goals), [], "com o objetivo lido, nada fica de fora");
});

test("Meta: vigia ignora engajamento e campanha sem verba", () => {
  const rows = [
    camp("x", 90, [{ action_type: "link_click", value: "300" }, { action_type: "post_engagement", value: "50" }, { action_type: "landing_page_view", value: "120" }]),
    camp("y", 0, [], [{ action_type: "schedule_total", value: "3" }]),
  ];
  assert.deepEqual(unreadEvents(rows), []);
});

test("Meta: sync semanal, aba Performance e relatório contam os mesmos leads", () => {
  const goals = campaignGoals([{ campaign_id: "a", optimization_goal: "OFFSITE_CONVERSIONS", promoted_object: { custom_event_type: "CONTACT" } }]);
  const rows = [camp("a", 182.35, [], [{ action_type: "contact_website", value: "31" }]), camp("z", 126.33, [{ action_type: "link_click", value: "600" }])];
  const sync = campaignTotals(rows, goals);
  const performance = rows.reduce((a, r) => a + metaTotals(r, "both", "lead_gen", goals).leads, 0);
  const report = metaNums(undefined, rows, "both", goals);
  assert.equal(sync.leads, 31);
  assert.equal(performance, 31);
  assert.equal(report.leads, 31);
  assert.equal(report.leadSpend, 182.35);
  assert.equal(dailyOf(rows, "both", "lead_gen", goals)[0].results, 31);
});
