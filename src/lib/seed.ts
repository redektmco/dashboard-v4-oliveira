import { insert, run } from "./db";

/**
 * Carteira de demonstração: 10 clientes, 8 semanas de série, com todos os
 * overrides representados. Só faz INSERT — o recompute fica com o `repo`,
 * para este módulo depender apenas de `db` (sem ciclo de import).
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const WEEKS = 8;

type Seed = {
  name: string;
  type: "lead_gen" | "ecommerce" | "branding";
  mrr: number;
  gt: "ana" | "bruno";
  acc: "carla" | "diego";
  renewalInDays: number;
  targets: Record<string, number>;
  /** atingimento por semana, da mais antiga para a mais recente */
  curve: number[];
  checkins: { weeksAgo: number; notes: number[]; payment?: boolean; risk?: string }[];
  tracking?: number[];
  weeksFilled?: number;
};

const CLIENTS: Seed[] = [
  {
    name: "Construtora Horizonte",
    type: "lead_gen",
    mrr: 9800,
    gt: "ana",
    acc: "carla",
    renewalInDays: 41,
    targets: { leads_meta: 120, cpl_meta: 85, budget_meta: 10200, mql_rate_meta: 35 },
    curve: [1.05, 1.02, 0.94, 0.88, 0.79, 0.71, 0.63, 0.58],
    checkins: [
      { weeksAgo: 7, notes: [4, 4, 4, 4, 4, 4] },
      { weeksAgo: 4, notes: [3, 3, 3, 4, 3, 3] },
      { weeksAgo: 1, notes: [2, 2, 2, 2, 3, 2] },
    ],
  },
  {
    name: "Clínica Vitalis",
    type: "lead_gen",
    mrr: 6200,
    gt: "ana",
    acc: "carla",
    renewalInDays: 120,
    targets: { leads_meta: 90, cpl_meta: 62, budget_meta: 5600, mql_rate_meta: 40 },
    curve: [0.96, 1.01, 1.06, 1.03, 1.08, 1.05, 1.11, 1.07],
    checkins: [
      { weeksAgo: 6, notes: [5, 5, 5, 4, 5, 4] },
      { weeksAgo: 2, notes: [5, 4, 5, 5, 4, 4] },
    ],
  },
  {
    name: "AutoCenter Prime",
    type: "lead_gen",
    mrr: 4500,
    gt: "bruno",
    acc: "diego",
    renewalInDays: 18,
    targets: { leads_meta: 70, cpl_meta: 95, budget_meta: 6650, mql_rate_meta: 30 },
    curve: [0.82, 0.77, 0.7, 0.66, 0.48, 0.44, 0.41, 0.39],
    checkins: [
      { weeksAgo: 5, notes: [2, 3, 3, 2, 3, 2] },
      {
        weeksAgo: 1,
        notes: [1, 2, 1, 1, 2, 2],
        risk: "Mencionou proposta de outra agência e corte de verba no próximo ciclo.",
      },
    ],
  },
  {
    name: "Imobiliária Costa Verde",
    type: "lead_gen",
    mrr: 7300,
    gt: "bruno",
    acc: "diego",
    renewalInDays: 76,
    targets: { leads_meta: 140, cpl_meta: 55, budget_meta: 7700, mql_rate_meta: 32 },
    curve: [1.0, 0.98, 0.95, 0.99, 0.92, 0.9, 0.87, 0.85],
    checkins: [
      { weeksAgo: 6, notes: [4, 4, 4, 3, 4, 4] },
      { weeksAgo: 3, notes: [3, 4, 4, 2, 4, 3] },
    ],
    tracking: [6],
  },
  {
    name: "Moda Lunare",
    type: "ecommerce",
    mrr: 12500,
    gt: "ana",
    acc: "carla",
    renewalInDays: 210,
    targets: { revenue_meta: 180000, roas_meta: 4.2, budget_meta: 43000 },
    curve: [1.03, 1.07, 1.01, 1.12, 1.05, 1.09, 1.14, 1.06],
    checkins: [
      { weeksAgo: 5, notes: [5, 5, 5, 4, 5, 5] },
      { weeksAgo: 2, notes: [5, 5, 4, 4, 5, 4] },
    ],
  },
  {
    name: "Nutri&Co Suplementos",
    type: "ecommerce",
    mrr: 8900,
    gt: "bruno",
    acc: "diego",
    renewalInDays: 54,
    targets: { revenue_meta: 96000, roas_meta: 3.5, budget_meta: 27500 },
    curve: [0.99, 0.93, 0.88, 0.84, 0.8, 0.74, 0.7, 0.68],
    checkins: [
      { weeksAgo: 6, notes: [4, 4, 4, 3, 4, 3] },
      { weeksAgo: 2, notes: [3, 3, 3, 3, 3, 2], payment: false },
    ],
  },
  {
    name: "Casa & Jardim Outlet",
    type: "ecommerce",
    mrr: 5400,
    gt: "ana",
    acc: "diego",
    renewalInDays: 95,
    targets: { revenue_meta: 62000, roas_meta: 3.0, budget_meta: 20700 },
    curve: [0.9, 0.94, 0.97, 0.93, 0.96, 0.99, 1.02, 0.98],
    checkins: [{ weeksAgo: 9, notes: [4, 4, 4, 3, 3, 4] }],
  },
  {
    name: "Instituto Aurora",
    type: "branding",
    mrr: 6800,
    gt: "bruno",
    acc: "carla",
    renewalInDays: 33,
    targets: { reach_meta: 420000, base_growth_meta: 1800, engagement_meta: 4.5, deliveries_meta: 12 },
    curve: [1.02, 0.98, 1.05, 0.96, 0.91, 0.87, 0.84, 0.82],
    checkins: [
      { weeksAgo: 7, notes: [4, 4, 4, 3, 4, 4] },
      { weeksAgo: 3, notes: [3, 3, 3, 3, 2, 3] },
    ],
  },
  {
    name: "Cervejaria Bandeira",
    type: "branding",
    mrr: 4100,
    gt: "ana",
    acc: "carla",
    renewalInDays: 150,
    targets: { reach_meta: 260000, base_growth_meta: 900, engagement_meta: 5.2, deliveries_meta: 8 },
    curve: [1.08, 1.11, 1.04, 1.09, 1.13, 1.06, 1.1, 1.12],
    checkins: [{ weeksAgo: 4, notes: [5, 5, 5, 4, 5, 5] }],
  },
  {
    name: "Rede Farma Bem",
    type: "branding",
    mrr: 10200,
    gt: "bruno",
    acc: "diego",
    renewalInDays: 62,
    targets: { reach_meta: 700000, base_growth_meta: 2400, engagement_meta: 3.8, deliveries_meta: 16 },
    curve: [0.95, 0.97, 0.93, 0.9, 0.94, 0.92, 0.89, 0.9],
    // GT parou de preencher há 3 semanas -> confiança cai
    weeksFilled: 5,
    checkins: [{ weeksAgo: 8, notes: [4, 4, 3, 3, 4, 3] }],
  },
];

const jitter = (n: number, pct = 0.06) => n * (1 + (Math.random() * 2 - 1) * pct);
const tri = (v: number) => (v >= 0.95 ? "full" : v >= 0.75 ? "partial" : "none");

/** Apaga tudo e reinicia os ids. Usado pelo `npm run seed`. */
export async function wipe() {
  await run(`TRUNCATE TABLE
    score_snapshots, action_plans, performance_snapshots, checkin_snapshots,
    client_targets, clients, users, settings
    RESTART IDENTITY CASCADE`);
}

/** Insere a carteira de demonstração. Não recalcula scores. */
export async function insertDemoData() {
  const TODAY = new Date();
  /** Última sexta-feira — dia fixo do ritual do GT. */
  const lastFriday = (() => {
    const d = new Date(TODAY);
    d.setDate(d.getDate() - ((d.getDay() + 2) % 7));
    return d;
  })();

  const uid = (name: string, role: "gt" | "account" | "coord") =>
    insert("INSERT INTO users (name, role) VALUES (?, ?) RETURNING id", [name, role]);

  const users = {
    ana: await uid("Ana Ribeiro", "gt"),
    bruno: await uid("Bruno Salles", "gt"),
    carla: await uid("Carla Menezes", "account"),
    diego: await uid("Diego Prado", "account"),
  };
  await uid("Marina Oliveira", "coord");

  for (const s of CLIENTS) {
    const renewal = iso(addDays(TODAY, s.renewalInDays));
    const gtId = users[s.gt];
    const accId = users[s.acc];

    const clientId = await insert(
      `INSERT INTO clients (name, account_type, mrr, gt_user_id, account_user_id, renewal_date)
       VALUES (?, ?, ?, ?, ?, ?::date) RETURNING id`,
      [s.name, s.type, s.mrr, gtId, accId, renewal],
    );

    // Metas, snapshots e check-ins entram em lote: um INSERT por tabela,
    // não um por linha — cada query é um round-trip HTTP.
    const from = iso(addDays(TODAY, -120));
    const tEntries = Object.entries(s.targets);
    await run(
      `INSERT INTO client_targets (client_id, key, value, effective_from)
       VALUES ${tEntries.map(() => "(?, ?, ?, ?::date)").join(", ")}`,
      tEntries.flatMap(([key, value]) => [clientId, key, value, from]),
    );

    const perfRows: [string, string][] = [];
    const weeksToFill = s.weeksFilled ?? WEEKS;
    for (let w = 0; w < WEEKS; w++) {
      const weeksAgo = WEEKS - 1 - w;
      if (weeksAgo < WEEKS - weeksToFill) continue; // deixou de preencher recentemente
      const refDate = iso(addDays(lastFriday, -7 * weeksAgo));
      const k = s.curve[w];
      const trackingBroken = s.tracking?.includes(w) ?? false;

      const common = {
        tracking_ok: !trackingBroken,
        deliveries_on_time: tri(k + 0.05),
        campaign_status: tri(k + 0.1),
        note:
          k < 0.7
            ? "Volume abaixo do contratado; revisão de criativo e segmentação em andamento."
            : "",
        ...s.targets,
      };

      let data: Record<string, unknown> = common;
      if (s.type === "lead_gen") {
        const leads = Math.round(s.targets.leads_meta * jitter(k));
        data = {
          ...common,
          leads_real: leads,
          cpl_real: Math.round(jitter(s.targets.cpl_meta / Math.max(k, 0.4)) * 100) / 100,
          budget_real: Math.round(s.targets.budget_meta * jitter(Math.min(k + 0.08, 1))),
          mql_real: Math.round(leads * (s.targets.mql_rate_meta / 100) * jitter(k, 0.12)),
        };
      } else if (s.type === "ecommerce") {
        const revenue = Math.round(s.targets.revenue_meta * jitter(k));
        const budget = Math.round(s.targets.budget_meta * jitter(Math.min(k + 0.1, 1)));
        data = {
          ...common,
          revenue_real: revenue,
          roas_real: Math.round((revenue / Math.max(budget, 1)) * 100) / 100,
          budget_real: budget,
          ticket_real: Math.round(jitter(240 * (0.85 + k * 0.2), 0.05) * 100) / 100,
        };
      } else {
        data = {
          ...common,
          reach_real: Math.round(s.targets.reach_meta * jitter(k)),
          base_growth_real: Math.round(s.targets.base_growth_meta * jitter(k, 0.15)),
          engagement_real: Math.round(s.targets.engagement_meta * jitter(k, 0.1) * 100) / 100,
          deliveries_real: Math.round(s.targets.deliveries_meta * jitter(Math.min(k, 1.05), 0.08)),
        };
      }
      perfRows.push([refDate, JSON.stringify(data)]);
    }

    if (perfRows.length) {
      await run(
        `INSERT INTO performance_snapshots (client_id, ref_date, filled_by, data)
         VALUES ${perfRows.map(() => "(?, ?::date, ?, ?::jsonb)").join(", ")}`,
        perfRows.flatMap(([d, j]) => [clientId, d, gtId, j]),
      );
    }

    const chkRows = s.checkins.map((c) => {
      const [q1, q2, q3, q4, q5, q6] = c.notes;
      return [
        iso(addDays(TODAY, -7 * c.weeksAgo)),
        JSON.stringify({
          q1_satisfaction: q1,
          q2_climate: q2,
          q3_trust: q3,
          q4_lead_quality: q4,
          q5_engagement: q5,
          q6_expectation: q6,
          attendance: q1 >= 4 ? "full" : q1 >= 3 ? "partial" : "none",
          payment_ok: c.payment ?? true,
          renewal_date: renewal,
          risk_flag: !!c.risk,
          risk_note: c.risk ?? "",
        }),
      ] as [string, string];
    });

    if (chkRows.length) {
      await run(
        `INSERT INTO checkin_snapshots (client_id, ref_date, filled_by, data)
         VALUES ${chkRows.map(() => "(?, ?::date, ?, ?::jsonb)").join(", ")}`,
        chkRows.flatMap(([d, j]) => [clientId, d, accId, j]),
      );
    }

    if (s.name === "Construtora Horizonte") {
      await run(
        `INSERT INTO action_plans (client_id, risk, plan, owner, due_date, status)
         VALUES (?, ?, ?, ?, ?::date, 'em_andamento')`,
        [
          clientId,
          "Queda de volume por 4 semanas seguidas com CPL subindo",
          "Reestruturar campanha de captação, trocar 3 criativos e reunião de realinhamento de meta com o cliente.",
          "Ana Ribeiro",
          iso(addDays(TODAY, 5)),
        ],
      );
    }
  }

  return CLIENTS.length;
}
