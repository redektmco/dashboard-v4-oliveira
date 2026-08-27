// =========================================================
// V4 BI — Health Score (Oliveira & Co)
// 12-dimension monthly survey → composite 0–100 score
// =========================================================
(function () {

  // ---- Dimension definitions ----
  // Each: id, label (short, for UI), pillar (Método V4), weight (% sum=100),
  //       kind ("yesno" | "rating" | "ratio" | "nps" | "invertedRating"),
  //       help (tooltip).
  const DIMENSIONS = [
    { id: "roi",        label: "ROI > 1",                pillar: "Monetização", weight: 15, kind: "ratio",          help: "ROAS/ROI consolidado do mês, cap em 5×."},
    { id: "meta",       label: "Meta de vendas",         pillar: "Monetização", weight: 15, kind: "ratio",          help: "% da meta de vendas do cliente atingida."},
    { id: "churn",      label: "Probabilidade de churn", pillar: "Retenção",    weight: 12, kind: "invertedRating", help: "Avaliação do CS · 0 = certo de sair, 10 = nada provável."},
    { id: "promotor",   label: "Promotor?",              pillar: "Retenção",    weight: 10, kind: "nps",            help: "Detrator (0–6), Neutro (7–8), Promotor (9–10)."},
    { id: "relacion",   label: "Relacionamento",         pillar: "Engajamento", weight: 10, kind: "rating",         help: "Nota 0–10 do squad sobre a relação."},
    { id: "fee",        label: "Fee em dia?",            pillar: "Monetização", weight: 10, kind: "yesno",          help: "Pagamento mensal em dia."},
    { id: "conta",      label: "Conta + saldo OK?",      pillar: "Aquisição",   weight:  8, kind: "yesno",          help: "Contas de anúncio ativas e com saldo."},
    { id: "checkin",    label: "Check-in realizado",     pillar: "Engajamento", weight:  5, kind: "yesno",          help: "Check-in mensal feito com o cliente."},
    { id: "stake",      label: "Stakeholders cientes",   pillar: "Engajamento", weight:  5, kind: "yesno",          help: "Decisores enxergam os avanços."},
    { id: "playbook",   label: "Playbook em dia",        pillar: "Retenção",    weight:  4, kind: "yesno",          help: "Playbook V4 atualizado no mês."},
    { id: "crm",        label: "CRM em uso",             pillar: "Aquisição",   weight:  3, kind: "yesno",          help: "Cliente usando CRM ativo."},
    { id: "comercial",  label: "Comercial ativo",        pillar: "Aquisição",   weight:  3, kind: "yesno",          help: "Time comercial do cliente operando."},
  ];

  // ---- Score a single dimension's raw value → 0..10 ----
  function scoreOne(kind, value) {
    if (value == null) return null;
    switch (kind) {
      case "yesno":          return value ? 10 : 0;
      case "rating":         return Math.max(0, Math.min(10, Number(value)));
      case "invertedRating": return Math.max(0, Math.min(10, 10 - Number(value)));
      case "nps":            // 0–10 input
        if (value >= 9) return 10;
        if (value >= 7) return 5;
        return 0;
      case "ratio":          // value is the raw ratio (e.g. ROAS, % meta)
        if (kind === "ratio" && value <= 1) return Math.max(0, value * 5); // ROI <1 = 0..5
        return Math.max(0, Math.min(10, value * 2));                       // 5× = 10
      default:               return null;
    }
  }

  // ---- Composite score from a full survey object {dimId: value} ----
  function composite(survey) {
    let total = 0, w = 0;
    for (const dim of DIMENSIONS) {
      const v = survey[dim.id];
      if (v == null) continue;
      const s = scoreOne(dim.kind, v);
      if (s == null) continue;
      total += s * dim.weight;
      w += dim.weight;
    }
    if (w === 0) return null;
    return Math.round(total / w * 10); // 0..100
  }

  // ---- Status flag from score ----
  function flag(score) {
    if (score == null) return "neutral";
    if (score >= 70) return "healthy";
    if (score >= 50) return "warning";
    return "critical";
  }

  // ---- Pretty value for display ----
  function displayValue(kind, value) {
    if (value == null) return "—";
    if (kind === "yesno") return value ? "Sim" : "Não";
    if (kind === "nps") {
      if (value >= 9) return "Promotor (" + value + ")";
      if (value >= 7) return "Neutro (" + value + ")";
      return "Detrator (" + value + ")";
    }
    if (kind === "ratio") return value.toFixed(1).replace(".", ",");
    return value;
  }

  // ---- Surveys for the mock clients ----
  // Each survey: 12 fields keyed by dimension id, with raw input values.
  const SURVEYS = {
    solar:    { roi: 5.2, meta: 1.12, churn: 2, promotor: 9, relacion: 9, fee: true,  conta: true,  checkin: true,  stake: true,  playbook: true,  crm: true,  comercial: true  },
    fazenda:  { roi: 1.8, meta: 0.48, churn: 8, promotor: 5, relacion: 5, fee: true,  conta: true,  checkin: false, stake: false, playbook: false, crm: false, comercial: true  },
    moveis:   { roi: 3.4, meta: 0.80, churn: 5, promotor: 8, relacion: 7, fee: true,  conta: true,  checkin: true,  stake: false, playbook: true,  crm: false, comercial: true  },
    estetica: { roi: 6.1, meta: 1.30, churn: 1, promotor: 10,relacion: 10,fee: true,  conta: true,  checkin: true,  stake: true,  playbook: true,  crm: true,  comercial: true  },
    edu:      { roi: 4.2, meta: 1.00, churn: 3, promotor: 8, relacion: 8, fee: true,  conta: true,  checkin: true,  stake: true,  playbook: true,  crm: false, comercial: true  },
    fitness:  { roi: 2.6, meta: 0.55, churn: 6, promotor: 7, relacion: 6, fee: true,  conta: false, checkin: false, stake: true,  playbook: false, crm: true,  comercial: false },
    constru:  { roi: 3.0, meta: 0.70, churn: 5, promotor: 7, relacion: 7, fee: false, conta: true,  checkin: true,  stake: false, playbook: false, crm: false, comercial: true  },
    petshop:  { roi: 5.8, meta: 1.18, churn: 1, promotor: 10,relacion: 10,fee: true,  conta: true,  checkin: true,  stake: true,  playbook: true,  crm: true,  comercial: true  },
    imob:     { roi: 4.6, meta: 0.95, churn: 3, promotor: 9, relacion: 8, fee: true,  conta: true,  checkin: true,  stake: true,  playbook: true,  crm: false, comercial: true  },
    ecomm:    { roi: 1.4, meta: 0.30, churn: 9, promotor: 4, relacion: 4, fee: false, conta: false, checkin: false, stake: false, playbook: false, crm: false, comercial: false },
    advogados:{ roi: 5.0, meta: 1.05, churn: 2, promotor: 9, relacion: 9, fee: true,  conta: true,  checkin: true,  stake: true,  playbook: true,  crm: false, comercial: true  },
    spa:      { roi: 4.0, meta: 0.85, churn: 4, promotor: 7, relacion: 7, fee: true,  conta: true,  checkin: true,  stake: false, playbook: true,  crm: true,  comercial: true  },
  };

  window.V4Health = {
    DIMENSIONS, SURVEYS, scoreOne, composite, flag, displayValue,
  };
})();
