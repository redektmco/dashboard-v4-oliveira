// =========================================================
// V4 Oliveira & Co — Data loader for the Unit BI Dashboard
//
// Loads all the JSON files in /data/* and exposes them on
// `window.V4Data`. The data files in /data/ are the SOURCE
// OF TRUTH — to change a number, edit the JSON, reload.
//
// On load completion, fires:
//   window.dispatchEvent(new Event("v4-data-ready"))
//
// Inline fallback below is used if fetch fails (file:// or
// offline preview). Keep the fallback synced with /data/
// shape — it's the schema reference, nothing more.
// =========================================================
(function () {

  // ---- formatting helpers (shared) ----
  const fmtBRL = (n) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);
  const fmtBRLk = (n) => {
    if (n == null || isNaN(n)) return "—";
    if (n >= 1_000_000) return "R$ " + (n / 1_000_000).toFixed(1).replace(".", ",") + "M";
    if (n >= 1_000)     return "R$ " + Math.round(n / 1_000) + "k";
    return fmtBRL(n);
  };
  const fmtNum = (n) => new Intl.NumberFormat("pt-BR").format(n);

  // ---- Inline fallback (used only if fetch fails) ----
  const FALLBACK = {
    unit: {
      name: "Oliveira & Co",
      label: "Unidade · V4 Company",
      period: "Maio 2026",
      kpis: {
        fee:            { v: 482300, prev: 429000, fmt: "BRLk",  label: "Fee recorrente" },
        invest:         { v: 1240000, prev: 1120000, fmt: "BRLk", label: "Investimento gerido" },
        roasMedio:      { v: 4.8,  prev: 4.5,  fmt: "x",     label: "ROAS médio" },
        faturamento:    { v: 8420000, prev: 7810000, fmt: "BRLk", label: "Faturamento clientes" },
        healthMedia:    { v: 78, prev: 74, fmt: "score", label: "Health médio" },
        clientesAtivos: { v: 42, prev: 39, fmt: "int",   label: "Clientes ativos" },
        ltv:            { v: 184000, prev: 168000, fmt: "BRLk", label: "LTV médio" },
        churn:          { v: 2.1, prev: 3.4, fmt: "pct", label: "Churn 90d", invert: true },
      },
    },
    squads: [
      { id: "aurora", name: "Aurora", lead: "Marina Lopes", count: 5, clients: 8, load: 92 },
      { id: "volta",  name: "Volta",  lead: "Diego Prado",  count: 4, clients: 7, load: 78 },
      { id: "norte",  name: "Norte",  lead: "Beatriz Lima", count: 6, clients: 11, load: 88 },
      { id: "delta",  name: "Delta",  lead: "Lucas Hortz",  count: 5, clients: 9, load: 71 },
      { id: "matriz", name: "Matriz", lead: "Renata Ávila", count: 4, clients: 7, load: 64 },
    ],
    clients: [
      { id: "solar",     name: "Solar Bras",        segment: "Energia solar",  squad: "aurora", months: 6,  fee: 18500, invest: 42000, roas: 5.2, health: 82, status: "healthy",  ltv: 222000 },
      { id: "fazenda",   name: "Fazenda Zumbi",     segment: "Agro",           squad: "volta",  months: 11, fee:  9800, invest: 12500, roas: 1.8, health: 34, status: "critical", ltv: 107800 },
      { id: "moveis",    name: "Móveis Vargas",     segment: "Varejo",         squad: "norte",  months: 3,  fee:  7200, invest: 18000, roas: 3.4, health: 61, status: "warning",  ltv:  21600 },
      { id: "estetica",  name: "Clínica Estética",  segment: "Saúde",          squad: "delta",  months: 14, fee: 12500, invest: 28000, roas: 6.1, health: 89, status: "healthy",  ltv: 175000 },
      { id: "edu",       name: "EduPlus",           segment: "Educação",       squad: "aurora", months: 8,  fee:  9500, invest: 22000, roas: 4.2, health: 74, status: "healthy",  ltv:  76000 },
      { id: "fitness",   name: "RedFit Academias",  segment: "Fitness",        squad: "norte",  months: 5,  fee:  8800, invest: 19500, roas: 2.6, health: 52, status: "warning",  ltv:  44000 },
      { id: "constru",   name: "Constru Bem",       segment: "Construção",     squad: "delta",  months: 2,  fee:  6200, invest: 14000, roas: 3.0, health: 58, status: "warning",  ltv:  12400 },
      { id: "petshop",   name: "Petshop Companhia", segment: "Pet",            squad: "matriz", months: 18, fee: 11000, invest: 24000, roas: 5.8, health: 91, status: "healthy",  ltv: 198000 },
      { id: "imob",      name: "Imobiliária Rocha", segment: "Imobiliário",    squad: "volta",  months: 4,  fee: 14000, invest: 32000, roas: 4.6, health: 76, status: "healthy",  ltv:  56000 },
      { id: "ecomm",     name: "Doce Atelier",      segment: "E-commerce",     squad: "norte",  months: 9,  fee:  6500, invest:  9800, roas: 1.4, health: 28, status: "critical", ltv:  58500 },
      { id: "advogados", name: "Marques Advocacia", segment: "Serviços",       squad: "matriz", months: 7,  fee:  8200, invest: 11000, roas: 5.0, health: 81, status: "healthy",  ltv:  57400 },
      { id: "spa",       name: "Caravelas Spa",     segment: "Hospitalidade",  squad: "aurora", months: 12, fee: 10500, invest: 17000, roas: 4.0, health: 69, status: "warning",  ltv: 126000 },
    ],
    trend: [
      { m: "jun/25", v: 308000 }, { m: "jul/25", v: 322000 }, { m: "ago/25", v: 341000 },
      { m: "set/25", v: 358000 }, { m: "out/25", v: 372000 }, { m: "nov/25", v: 401000 },
      { m: "dez/25", v: 388000 }, { m: "jan/26", v: 396000 }, { m: "fev/26", v: 412000 },
      { m: "mar/26", v: 438000 }, { m: "abr/26", v: 429000 }, { m: "mai/26", v: 482300 },
    ],
    pipeline: [
      { stage: "Lead",        count: 84, value: 680000 },
      { stage: "Diagnóstico", count: 31, value: 410000 },
      { stage: "Proposta",    count: 18, value: 290000 },
      { stage: "Negociação",  count:  9, value: 165000 },
      { stage: "Fechado",     count:  4, value:  72000 },
    ],
    meetings: [
      { day: "seg", time: "09:00", client: "Solar Bras",        type: "Weekly",     squad: "aurora" },
      { day: "seg", time: "14:30", client: "Fazenda Zumbi",     type: "Crise",      squad: "volta",  alert: true },
      { day: "ter", time: "10:00", client: "Móveis Vargas",     type: "Onboarding", squad: "norte" },
      { day: "ter", time: "16:00", client: "EduPlus",           type: "Review",     squad: "aurora" },
      { day: "qua", time: "11:00", client: "Petshop Companhia", type: "Weekly",     squad: "matriz" },
      { day: "qui", time: "09:30", client: "Doce Atelier",      type: "Crise",      squad: "norte",  alert: true },
      { day: "sex", time: "15:00", client: "Imobiliária Rocha", type: "Review",     squad: "volta" },
    ],
    metodo: [
      { pillar: "Aquisição",   share: 36, color: "var(--viz-1)", clients: 15 },
      { pillar: "Engajamento", share: 22, color: "var(--viz-2)", clients:  9 },
      { pillar: "Monetização", share: 28, color: "var(--viz-3)", clients: 12 },
      { pillar: "Retenção",    share: 14, color: "var(--viz-4)", clients:  6 },
    ],
  };

  // ---- Loader -----------------------------------------
  // BI lives at /ui_kits/bi-desktop/, /data/ is two levels up.
  const BASE = "../../data/";
  const FILES = [
    ["unit",     "unit.json"],
    ["squads",   "squads.json"],
    ["clients",  "clients.json"],
    ["trend",    "trend.json"],
    ["pipeline", "pipeline.json"],
    ["meetings", "meetings.json"],
    ["metodo",   "metodo.json"],
  ];

  async function loadOne(key, file) {
    try {
      const r = await fetch(BASE + file, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const json = await r.json();
      // unit.json is a top-level object; the others wrap an `items` array
      if (key === "unit") return json;
      return Array.isArray(json) ? json : (json.items || []);
    } catch (e) {
      console.warn(`[V4Data] fallback for ${key}:`, e.message);
      return FALLBACK[key];
    }
  }

  async function load() {
    const entries = await Promise.all(
      FILES.map(async ([key, file]) => [key, await loadOne(key, file)])
    );
    const data = Object.fromEntries(entries);

    // Expose
    window.V4Data = {
      ...data,
      fmtBRL, fmtBRLk, fmtNum,
      // Helpful aggregates derived once at load time:
      clientsBySquad: (() => {
        const m = {};
        for (const c of data.clients) (m[c.squad] = m[c.squad] || []).push(c);
        return m;
      })(),
      clientsById: Object.fromEntries((data.clients || []).map(c => [c.id, c])),
      squadsById:  Object.fromEntries((data.squads  || []).map(s => [s.id, s])),
    };

    window.dispatchEvent(new Event("v4-data-ready"));
  }

  // Kick off (returns a promise so the React boot can await it)
  window.V4DataReady = load();
})();
