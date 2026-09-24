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
import { EMPTY_WEEK, leadsOf, metaFields, parseInsight, weekRange } from "../src/lib/meta/metrics";
import { clientKey, firstPhone, parseBRL, parseClientsSheet, parseCsv } from "../src/lib/import/clients-sheet";
import {
  clientKeyOf,
  groupByClient,
  initials,
  isValidClientKey,
  matchesClientQuery,
  type ProjectCard,
} from "../src/lib/social/clients";

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
