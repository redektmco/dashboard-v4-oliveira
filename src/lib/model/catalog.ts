import type { AccountType, DimensionDef, DimensionKey, FieldDef } from "./types";

/**
 * Pesos das dimensoes — briefing 5.1.
 * Derivados de duas perguntas: (1) quao cedo a dimensao avisa o churn?
 * (2) quao confiavel e o dado? Dado duro e antecipatorio pesa mais.
 * Sao hipotese inicial defensavel — recalibrar trimestralmente (secao 9).
 */
export const DIMENSIONS: DimensionDef[] = [
  {
    key: "performance",
    label: "Performance / Resultado",
    source: "GT",
    defaultWeight: 35,
    rationale:
      "Motivo raiz da maioria dos churns; dado duro. Alto, mas resultado sozinho não segura cliente — por isso não domina.",
  },
  {
    key: "relationship",
    label: "Relacionamento / Engajamento",
    source: "Account",
    defaultWeight: 25,
    rationale:
      "Antecipa o churn antes do resultado cair; cliente insatisfeito sai mesmo entregando meta. Peso alto apesar de subjetivo.",
  },
  {
    key: "lead_quality",
    label: "Qualidade de lead / MQL",
    source: "GT + Account",
    defaultWeight: 20,
    rationale:
      "Indicador antecedente: lead ruim detona a relação antes de aparecer no resultado. Cruza MQL rate (GT) com a queixa do comercial (Account).",
  },
  {
    key: "financial",
    label: "Financeiro / Comercial",
    source: "Account",
    defaultWeight: 12,
    rationale:
      "Adimplência e proximidade de renovação; sinal forte mas pontual, não contínuo.",
  },
  {
    key: "operational",
    label: "Operacional / Dados",
    source: "GT",
    defaultWeight: 8,
    rationale:
      "Higiene (tracking, SLA). Não prevê churn sozinho, mas quando quebra invalida todo o resto — por isso entra, com peso baixo.",
  },
];

export const DIMENSION_LABEL = Object.fromEntries(
  DIMENSIONS.map((d) => [d.key, d.label]),
) as Record<DimensionKey, string>;

/* ------------------------------------------------------------------ */
/* Campos do GT — aba de Performance (briefing 3)                      */
/* ------------------------------------------------------------------ */

const GT_LEAD_GEN: FieldDef[] = [
  {
    key: "leads",
    label: "Leads gerados",
    definition:
      "Total de leads da semana no gerenciador/CRM, mesma fonte toda semana. Meta é a contratada para a semana.",
    dimension: "performance",
    source: "gt",
    weight: 40,
    weightRationale: "Entregável contratado. É o que o cliente compra — maior peso da dimensão.",
    rule: "A",
    accountTypes: ["lead_gen"],
    targetKey: "leads_meta",
    input: {
      kind: "pair",
      realKey: "leads_real",
      metaKey: "leads_meta",
      realLabel: "Leads gerados na semana",
      metaLabel: "Meta de leads (semana)",
    },
  },
  {
    key: "cpl",
    label: "CPL",
    definition:
      "Custo por lead da semana = verba investida / leads gerados. Meta é o CPL contratado.",
    dimension: "performance",
    source: "gt",
    weight: 30,
    weightRationale:
      "Eficiência. Volume com CPL estourado não é entrega saudável, mas é subordinado ao volume.",
    rule: "B",
    accountTypes: ["lead_gen"],
    targetKey: "cpl_meta",
    input: {
      kind: "pair",
      realKey: "cpl_real",
      metaKey: "cpl_meta",
      realLabel: "CPL real (R$)",
      metaLabel: "CPL meta (R$)",
      decimals: 2,
    },
  },
  {
    key: "budget",
    label: "Verba investida",
    definition:
      "Verba efetivamente gasta na semana vs verba contratada para a semana. Verba parada é risco silencioso.",
    dimension: "performance",
    source: "gt",
    weight: 30,
    weightRationale:
      "Verba parada antecede queda de volume em 1–2 semanas. Pesa igual ao CPL porque é causa, não sintoma.",
    rule: "A",
    accountTypes: ["lead_gen"],
    targetKey: "budget_meta",
    input: {
      kind: "pair",
      realKey: "budget_real",
      metaKey: "budget_meta",
      realLabel: "Verba investida (R$)",
      metaLabel: "Verba contratada (semana) (R$)",
      decimals: 2,
    },
  },
  {
    key: "mql",
    label: "Taxa de MQL",
    definition:
      "MQL da semana (leads qualificados pelo comercial do cliente) dividido por leads gerados, comparado à taxa de MQL contratada.",
    dimension: "lead_quality",
    source: "gt",
    weight: 60,
    weightRationale:
      "Único dado duro da dimensão; pesa mais que a percepção do Account justamente por ser numérico.",
    rule: "RATE",
    accountTypes: ["lead_gen"],
    targetKey: "mql_rate_meta",
    input: {
      kind: "pair",
      realKey: "mql_real",
      metaKey: "mql_rate_meta",
      realLabel: "MQL na semana (qtd)",
      metaLabel: "Meta de taxa de MQL (%)",
    },
  },
];

const GT_ECOMMERCE: FieldDef[] = [
  {
    key: "revenue",
    label: "Faturamento atribuído",
    definition:
      "Receita atribuída à mídia na semana (mesmo modelo de atribuição sempre) vs meta da semana.",
    dimension: "performance",
    source: "gt",
    weight: 40,
    weightRationale: "É o resultado contratado. Maior peso da dimensão.",
    rule: "A",
    accountTypes: ["ecommerce"],
    targetKey: "revenue_meta",
    input: {
      kind: "pair",
      realKey: "revenue_real",
      metaKey: "revenue_meta",
      realLabel: "Faturamento atribuído (R$)",
      metaLabel: "Meta de faturamento (R$)",
      decimals: 2,
    },
  },
  {
    key: "roas",
    label: "ROAS",
    definition: "Faturamento atribuído / verba investida na semana, vs ROAS meta contratado.",
    dimension: "performance",
    source: "gt",
    weight: 35,
    weightRationale:
      "Eficiência da operação. Faturar batendo meta com ROAS abaixo do contratado é insustentável — quase pareia com faturamento.",
    rule: "A",
    accountTypes: ["ecommerce"],
    targetKey: "roas_meta",
    input: {
      kind: "pair",
      realKey: "roas_real",
      metaKey: "roas_meta",
      realLabel: "ROAS real",
      metaLabel: "ROAS meta",
      decimals: 2,
    },
  },
  {
    key: "budget",
    label: "Verba investida",
    definition: "Verba gasta na semana vs verba planejada para a semana.",
    dimension: "performance",
    source: "gt",
    weight: 15,
    weightRationale:
      "Causa antecedente de queda de faturamento; peso menor porque o efeito já aparece no ROAS.",
    rule: "A",
    accountTypes: ["ecommerce"],
    targetKey: "budget_meta",
    input: {
      kind: "pair",
      realKey: "budget_real",
      metaKey: "budget_meta",
      realLabel: "Verba investida (R$)",
      metaLabel: "Verba planejada (semana) (R$)",
      decimals: 2,
    },
  },
  {
    key: "ticket",
    label: "Ticket médio",
    definition:
      "Ticket médio da semana. Não tem meta: é comparado à média das 4 semanas anteriores (tendência).",
    dimension: "performance",
    source: "gt",
    weight: 10,
    weightRationale:
      "Sinal de composição do mix, não de entrega. Peso baixo e sai do cálculo enquanto não houver histórico.",
    rule: "TREND",
    accountTypes: ["ecommerce"],
    input: {
      kind: "number",
      key: "ticket_real",
      label: "Ticket médio (R$)",
      decimals: 2,
    },
  },
];

const GT_BRANDING: FieldDef[] = [
  {
    key: "reach",
    label: "Alcance / impressões",
    definition: "Alcance ou impressões da semana vs meta contratada.",
    dimension: "performance",
    source: "gt",
    weight: 30,
    weightRationale: "Entregável primário de awareness — volume contratado.",
    rule: "A",
    accountTypes: ["branding"],
    targetKey: "reach_meta",
    input: {
      kind: "pair",
      realKey: "reach_real",
      metaKey: "reach_meta",
      realLabel: "Alcance/impressões na semana",
      metaLabel: "Meta de alcance/impressões",
    },
  },
  {
    key: "base_growth",
    label: "Crescimento de base",
    definition: "Novos seguidores/inscritos líquidos na semana vs meta.",
    dimension: "performance",
    source: "gt",
    weight: 25,
    weightRationale:
      "Resultado acumulativo que o cliente enxerga com facilidade; alto, mas abaixo do alcance.",
    rule: "A",
    accountTypes: ["branding"],
    targetKey: "base_growth_meta",
    input: {
      kind: "pair",
      realKey: "base_growth_real",
      metaKey: "base_growth_meta",
      realLabel: "Crescimento de base na semana",
      metaLabel: "Meta de crescimento",
    },
  },
  {
    key: "engagement",
    label: "Engajamento vs benchmark",
    definition:
      "Taxa de engajamento da semana (%) comparada ao benchmark acordado para o segmento.",
    dimension: "performance",
    source: "gt",
    weight: 25,
    weightRationale:
      "Qualidade da entrega — alcance sem engajamento é vaidade. Pareia com crescimento.",
    rule: "A",
    accountTypes: ["branding"],
    targetKey: "engagement_meta",
    input: {
      kind: "pair",
      realKey: "engagement_real",
      metaKey: "engagement_meta",
      realLabel: "Engajamento real (%)",
      metaLabel: "Benchmark (%)",
      decimals: 2,
    },
  },
  {
    key: "deliveries",
    label: "Entregas do plano",
    definition: "Peças/entregas realizadas na semana sobre as previstas no plano.",
    dimension: "performance",
    source: "gt",
    weight: 20,
    weightRationale:
      "Em branding o cliente compra volume de produção; furo de plano vira queixa direta. Menor peso porque é meio, não fim.",
    rule: "A",
    accountTypes: ["branding"],
    targetKey: "deliveries_meta",
    input: {
      kind: "pair",
      realKey: "deliveries_real",
      metaKey: "deliveries_meta",
      realLabel: "Entregas realizadas",
      metaLabel: "Entregas previstas",
    },
  },
];

/** Comuns a todas as contas — saúde operacional (briefing 3). */
const GT_COMMON: FieldDef[] = [
  {
    key: "tracking_ok",
    label: "Tracking OK?",
    definition:
      "Pixel/GA/conversões registrando na semana sem furo conhecido. Qualquer furo confirmado = não.",
    dimension: "operational",
    source: "gt",
    weight: 40,
    weightRationale:
      "Maior peso da dimensão: tracking quebrado invalida todo o resto do score (por isso também é override).",
    rule: "BOOL",
    accountTypes: "all",
    input: {
      kind: "bool",
      key: "tracking_ok",
      label: "Tracking OK?",
      trueLabel: "Sim",
      falseLabel: "Não",
    },
  },
  {
    key: "deliveries_on_time",
    label: "Entregas da semana no prazo",
    definition:
      "Todas as entregas combinadas para a semana saíram no prazo? Parcial = alguma atrasou.",
    dimension: "operational",
    source: "gt",
    weight: 35,
    weightRationale:
      "SLA percebido pelo cliente — é o operacional que mais vira ruído na relação.",
    rule: "TRI",
    accountTypes: "all",
    input: {
      kind: "tri",
      key: "deliveries_on_time",
      label: "Entregas da semana no prazo",
      options: ["Sim", "Parcial", "Não"],
    },
  },
  {
    key: "campaign_status",
    label: "Campanha ativa e saudável",
    definition:
      "Estado das campanhas ao fechar a semana. Parcial = alguma pausada/rejeitada. Pausada = conta sem veiculação.",
    dimension: "operational",
    source: "gt",
    weight: 25,
    weightRationale:
      "Sinal binário de operação parada; menor peso porque o efeito já aparece em verba e volume.",
    rule: "TRI",
    accountTypes: "all",
    input: {
      kind: "tri",
      key: "campaign_status",
      label: "Campanha ativa e saudável",
      options: ["Ativa", "Parcial", "Pausada"],
    },
  },
];

/* ------------------------------------------------------------------ */
/* Campos do Account — aba de Check-in (briefing 4)                    */
/* ------------------------------------------------------------------ */

/**
 * Âncoras genéricas da régua C5 — valem para qualquer pergunta de 1 a 5.
 * Cada pergunta do check-in traz as suas próprias em `input.anchors`; estas
 * são o fallback e o que a aba Modelo documenta.
 */
export const SCALE_ANCHORS: Record<number, string> = {
  5: "Muito positivo — cliente elogia espontaneamente",
  4: "Positivo — sem ressalvas",
  3: "Neutro — nem elogio nem queixa",
  2: "Ressalva explícita — desconforto ou cobrança",
  1: "Negativo — insatisfação clara ou tensão",
};

/**
 * Check-in do Account (briefing 4).
 *
 * As seis notas de 1 a 5 são PERGUNTAS FEITAS AO CLIENTE, ao vivo, na call —
 * não a impressão que o Account escreve depois. O texto em `question` é para
 * ser lido em voz alta; a nota registrada é a resposta do cliente. Isso muda
 * a natureza do dado: sai de percepção de terceiro e vira declaração da
 * fonte, que é o que sustenta comparar dois Accounts na mesma régua.
 */
const ACCOUNT_FIELDS: FieldDef[] = [
  {
    key: "q1_satisfaction",
    label: "Satisfação com o resultado",
    question:
      "De 1 a 5, quanto você está satisfeito com o resultado que entregamos neste período?",
    definition:
      "Pergunte e registre a nota que o cliente der. Se ele responder por cima, peça o número: “me dá uma nota de 1 a 5”.",
    dimension: "relationship",
    source: "account",
    weight: 28,
    weightRationale: "É a leitura mais próxima da decisão de renovar. Maior peso da dimensão.",
    rule: "C5",
    accountTypes: "all",
    input: {
      kind: "scale5",
      key: "q1_satisfaction",
      label: "Satisfação com o resultado",
      anchors: {
        5: "Muito satisfeito — superou o que esperava",
        4: "Satisfeito — está entregando o combinado",
        3: "Neutro — nem bom nem ruim",
        2: "Pouco satisfeito — esperava mais",
        1: "Insatisfeito — o resultado não está aceitável",
      },
    },
  },
  {
    key: "q3_trust",
    label: "Intenção de continuidade",
    question:
      "De 1 a 5, qual a chance de você seguir com a gente no próximo ciclo do contrato?",
    definition:
      "Pergunta direta de continuidade. Fazer sempre, mesmo com o cliente satisfeito — é o único jeito de ouvir a saída antes dela acontecer.",
    dimension: "relationship",
    source: "account",
    weight: 24,
    weightRationale:
      "Proxy mais direto de churn declarado; só não é o maior porque o cliente costuma esconder.",
    rule: "C5",
    accountTypes: "all",
    input: {
      kind: "scale5",
      key: "q3_trust",
      label: "Intenção de continuidade",
      anchors: {
        5: "Já conta com a gente — fala de próximos passos",
        4: "Pretende seguir, sem ressalva relevante",
        3: "Vai avaliar quando chegar a hora",
        2: "Em dúvida — condicionou a continuidade a algo",
        1: "Avaliando sair — já olhou alternativa",
      },
    },
  },
  {
    key: "q2_climate",
    label: "Relacionamento e comunicação",
    question:
      "De 1 a 5, como você avalia o nosso relacionamento e a comunicação do time no dia a dia?",
    definition:
      "Separa resultado de relação: dá para entregar meta e ter a relação corroendo — e o cliente sai assim mesmo.",
    dimension: "relationship",
    source: "account",
    weight: 18,
    weightRationale: "Clima deteriora antes do discurso; peso médio-alto por ser antecipatório.",
    rule: "C5",
    accountTypes: "all",
    input: {
      kind: "scale5",
      key: "q2_climate",
      label: "Relacionamento e comunicação",
      anchors: {
        5: "Parceria — trata o time como extensão da casa",
        4: "Boa relação, comunicação flui",
        3: "Correto — sem proximidade nem atrito",
        2: "Desgaste ou cobrança recorrente",
        1: "Relação tensa — clima de conflito",
      },
    },
  },
  {
    key: "q5_engagement",
    label: "Ritmo do time do cliente",
    question:
      "De 1 a 5, quanto a sua equipe tem conseguido acompanhar o ritmo do projeto — aprovações, materiais e presença nas calls?",
    definition:
      "Pergunta que devolve a responsabilidade ao cliente sem acusar. Resposta baixa é um combinado a fazer, não uma queixa.",
    dimension: "relationship",
    source: "account",
    weight: 14,
    weightRationale:
      "Comportamento observável, mas responde devagar; sinal confiável e tardio.",
    rule: "C5",
    accountTypes: "all",
    input: {
      kind: "scale5",
      key: "q5_engagement",
      label: "Ritmo do time do cliente",
      anchors: {
        5: "Responde rápido, aprova e traz insumo sem cobrança",
        4: "Acompanha bem — atrasos pontuais",
        3: "Acompanha quando cobrado",
        2: "Trava aprovações e materiais com frequência",
        1: "Quase não responde — o projeto anda sozinho",
      },
    },
  },
  {
    key: "q6_expectation",
    label: "Expectativa vs entrega",
    question:
      "De 1 a 5, o que estamos entregando corresponde ao que você esperava quando fechou o contrato?",
    definition:
      "Diagnóstico de causa: nota baixa aqui com resultado bom significa problema de escopo/venda, não de operação.",
    dimension: "relationship",
    source: "account",
    weight: 8,
    weightRationale:
      "Diagnóstico de causa (é problema de expectativa ou de entrega?), pouco preditivo isolado.",
    rule: "C5",
    accountTypes: "all",
    input: {
      kind: "scale5",
      key: "q6_expectation",
      label: "Expectativa vs entrega",
      anchors: {
        5: "Entrega acima do que foi combinado",
        4: "Corresponde ao combinado",
        3: "Corresponde em parte — algumas frentes ficaram no meio",
        2: "Esperava algo bem diferente do que recebe",
        1: "Sente que comprou outra coisa",
      },
    },
  },
  {
    key: "attendance",
    label: "Presença no check-in",
    definition:
      "Registro do Account, não pergunta ao cliente: ele compareceu, remarcou ou faltou ao contato agendado.",
    dimension: "relationship",
    source: "account",
    weight: 8,
    weightRationale:
      "Faltas repetidas são desengajamento puro, mas um evento isolado significa pouco.",
    rule: "TRI",
    accountTypes: "all",
    input: {
      kind: "tri",
      key: "attendance",
      label: "Cliente compareceu / remarcou / faltou",
      options: ["Compareceu", "Remarcou", "Faltou"],
    },
  },
  {
    key: "q4_lead_quality",
    label: "Qualidade de lead na visão do cliente",
    question:
      "De 1 a 5, como o seu time comercial avalia a qualidade dos leads que estão chegando?",
    definition:
      "É a nota do comercial do cliente, não a sua. Se ele não souber, o combinado é levar a pergunta e trazer a nota no próximo check-in.",
    dimension: "lead_quality",
    source: "account",
    weight: 40,
    weightRationale:
      "Percepção do comercial do cliente. Pesa menos que o MQL rate por ser subjetiva, mas chega antes do número.",
    rule: "C5",
    accountTypes: "all",
    input: {
      kind: "scale5",
      key: "q4_lead_quality",
      label: "Qualidade de lead na visão do cliente",
      anchors: {
        5: "Elogiou — lead qualificado, dentro do perfil",
        4: "Boa qualidade, com ressalva pequena",
        3: "Mediana — converte o esperado",
        2: "Reclamou — muito lead fora do perfil",
        1: "Inaproveitáveis na visão do comercial",
      },
    },
  },
  {
    key: "payment_ok",
    label: "Adimplência",
    definition:
      "Registro do Account: não há fatura vencida além do limite acordado na data do check-in.",
    dimension: "financial",
    source: "account",
    weight: 70,
    weightRationale:
      "Inadimplência é o sinal comercial mais duro que existe — domina a dimensão (e é override).",
    rule: "BOOL",
    accountTypes: "all",
    input: {
      kind: "bool",
      key: "payment_ok",
      label: "Adimplência OK?",
      trueLabel: "Sim",
      falseLabel: "Não",
    },
  },
  {
    key: "renewal_window",
    label: "Janela de renovação",
    definition:
      "Distância até a data de renovação do contrato. Quanto mais perto, maior a exposição.",
    dimension: "financial",
    source: "account",
    weight: 30,
    weightRationale:
      "Não é saúde, é exposição: o mesmo problema perto da renovação custa o contrato. Peso menor porque é contexto.",
    rule: "RENEWAL",
    accountTypes: "all",
    input: { kind: "date", key: "renewal_date", label: "Data de renovação" },
  },
];

/** Campos que não pontuam, mas entram no snapshot. */
export const CONTEXT_FIELDS = {
  gtNote: { key: "note", label: "Observação da semana", placeholder: "Contexto — não pontua" },
  riskFlag: { key: "risk_flag", label: "Flag de risco explícito" },
  riskNote: { key: "risk_note", label: "Qual o risco?" },
};

const ALL_FIELDS: FieldDef[] = [
  ...GT_LEAD_GEN,
  ...GT_ECOMMERCE,
  ...GT_BRANDING,
  ...GT_COMMON,
  ...ACCOUNT_FIELDS,
];

export function fieldsFor(accountType: AccountType, source?: "gt" | "account"): FieldDef[] {
  return ALL_FIELDS.filter(
    (f) =>
      (f.accountTypes === "all" || f.accountTypes.includes(accountType)) &&
      (!source || f.source === source),
  );
}

export function fieldByKey(key: string): FieldDef | undefined {
  return ALL_FIELDS.find((f) => f.key === key);
}

/** Metas que o cadastro do cliente guarda para pré-preencher o formulário do GT. */
export function targetKeysFor(
  accountType: AccountType,
): { key: string; label: string; decimals?: number }[] {
  return fieldsFor(accountType, "gt")
    .filter((f) => f.targetKey)
    .map((f) => {
      const i = f.input;
      return {
        key: f.targetKey!,
        label: i.kind === "pair" ? i.metaLabel : f.label,
        decimals: i.kind === "pair" ? i.decimals : undefined,
      };
    });
}
