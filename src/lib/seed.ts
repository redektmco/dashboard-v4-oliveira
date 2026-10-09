import { all, insert, run } from "./db";

/**
 * Carteira de demonstração: DOIS clientes, 8 semanas de série — um em queda,
 * que dispara override e plano de ação, e um saudável. Dois bastam para
 * mostrar as duas pontas da régua; a unidade cadastra a carteira real por
 * cima disso, no /config.
 *
 * Nenhum usuário fictício é criado. Os clientes de exemplo são atribuídos a
 * quem já tem acesso ao painel — time de mentira no cadastro polui a lista
 * de "preenchido por" e faz o painel parecer que tem gente que não existe.
 *
 * Só faz INSERT — o recompute fica com o `repo`, para este módulo depender
 * apenas de `db` (sem ciclo de import).
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
  renewalInDays: number;
  targets: Record<string, number>;
  /** atingimento por semana, da mais antiga para a mais recente */
  curve: number[];
  checkins: { weeksAgo: number; notes: number[]; payment?: boolean; risk?: string }[];
  tracking?: number[];
  weeksFilled?: number;
};

const CLIENTS: Seed[] = [
  /* Pior score da demonstração: queda sustentada de volume, CPL subindo,
     check-ins azedando e risco explícito no último contato. É o cliente que
     existe para mostrar override, plano de ação e banda vermelha. */
  {
    name: "Construtora Horizonte",
    type: "lead_gen",
    mrr: 9800,
    renewalInDays: 41,
    targets: { leads_meta: 120, cpl_meta: 85, budget_meta: 10200, mql_rate_meta: 35 },
    curve: [1.05, 1.02, 0.94, 0.88, 0.79, 0.71, 0.63, 0.58],
    checkins: [
      { weeksAgo: 7, notes: [4, 4, 4, 4, 4, 4] },
      { weeksAgo: 4, notes: [3, 3, 3, 4, 3, 3] },
      {
        weeksAgo: 1,
        notes: [2, 2, 2, 2, 3, 2],
        risk: "Mencionou proposta de outra agência e falou em reduzir verba no próximo ciclo.",
      },
    ],
  },
  /* Melhor score da demonstração: entrega acima da meta há dois meses e
     relação em 5. É a referência do outro extremo da régua. */
  {
    name: "Cervejaria Bandeira",
    type: "branding",
    mrr: 4100,
    renewalInDays: 150,
    targets: { reach_meta: 260000, base_growth_meta: 900, engagement_meta: 5.2, deliveries_meta: 8 },
    curve: [1.08, 1.11, 1.04, 1.09, 1.13, 1.06, 1.1, 1.12],
    checkins: [
      { weeksAgo: 6, notes: [5, 5, 5, 4, 5, 5] },
      { weeksAgo: 2, notes: [5, 5, 5, 5, 5, 4] },
    ],
  },
];

const jitter = (n: number, pct = 0.06) => n * (1 + (Math.random() * 2 - 1) * pct);
const tri = (v: number) => (v >= 0.95 ? "full" : v >= 0.75 ? "partial" : "none");

/**
 * Zera os dados de demonstração e reinicia os ids.
 *
 * `users` e `sessions` ficam DE FORA de propósito: o acesso da unidade não é
 * dado de demonstração, e rodar o seed não pode derrubar quem já entra no
 * painel.
 */
export async function wipe() {
  await run(`TRUNCATE TABLE
    score_snapshots, action_plans, performance_snapshots, checkin_snapshots,
    client_targets, clients, settings
    RESTART IDENTITY CASCADE`);
}

/**
 * Escolhe quem responde pelos clientes de exemplo, entre quem já existe:
 * primeiro alguém com o papel, depois qualquer um com acesso ao painel.
 * Devolve `null` se a base ainda estiver vazia — o cadastro fica pendente e
 * o /config mostra isso.
 */
async function pickUser(role: "gt" | "account"): Promise<number | null> {
  const byRole = await all<{ id: number }>("SELECT id FROM users WHERE role = ? ORDER BY id LIMIT 1", [
    role,
  ]);
  if (byRole.length) return Number(byRole[0].id);
  const withLogin = await all<{ id: number }>(
    "SELECT id FROM users WHERE login IS NOT NULL AND active = 1 ORDER BY id LIMIT 1",
  );
  return withLogin.length ? Number(withLogin[0].id) : null;
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

  const gtId = await pickUser("gt");
  const accId = await pickUser("account");

  for (const s of CLIENTS) {
    const renewal = iso(addDays(TODAY, s.renewalInDays));

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
         VALUES (?, ?, ?, (SELECT COALESCE(
                             (SELECT name FROM users WHERE id = ?),
                             'GT da conta')), ?::date, 'em_andamento')`,
        [
          clientId,
          "Queda de volume por 4 semanas seguidas com CPL subindo",
          "Reestruturar campanha de captação, trocar 3 criativos e reunião de realinhamento de forecast com o cliente.",
          gtId,
          iso(addDays(TODAY, 5)),
        ],
      );
    }
  }

  return CLIENTS.length;
}
