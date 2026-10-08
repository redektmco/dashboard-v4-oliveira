/**
 * Playbook do Account por flag — "Framework de Saúde da Carteira"
 * (Oliveira & CO). Puro, sem banco: o texto de cada passo vive aqui e o
 * banco guarda só o estado (prazo, owner, feito). Mudou o playbook? Edite
 * este arquivo — os episódios abertos passam a mostrar o texto novo.
 *
 * Prazo é o tempo máximo contado a partir da ENTRADA do cliente na flag.
 * Passo recorrente (micro-reporte, reavaliação, ROPRE, upsell) tem
 * `everyDays`: o primeiro vence em `firstDueDays` e cada registro empurra o
 * próximo para `everyDays` depois.
 */
import type { Band } from "../model/types";

export type Proximity = "perto" | "longe";

export type StepTemplate = {
  key: string;
  n: number;
  /** O que fazer. */
  title: string;
  /** Como fazer. Passos de relacionamento mudam com a proximidade do cliente. */
  how: string | ((p: Proximity | null) => string);
  /** Quando — momento ou gatilho. */
  when: string;
  /** Prazo como o playbook escreve ("Até 24h", "Diário"…). */
  deadline: string;
  /** Owner (papel). Texto livre: dá para trocar pelo nome da pessoa. */
  owner: string;
  goal: string;
  /** Prazo em horas a partir da entrada na flag (passo único). */
  dueHours?: number;
  /** Passo recorrente: cadência em dias e primeiro vencimento. */
  everyDays?: number;
  firstDueDays?: number;
};

export type FlagMeta = {
  name: string;
  focus: string;
  goal: string;
  situation: string;
  /** Regras desta flag, exibidas acima dos passos. */
  rules: string[];
};

export const FLAG: Record<Band, FlagMeta> = {
  verde: {
    name: "Green Flag",
    focus: "Monetização",
    goal: "Aumentar o LTV com upsell e cross-sell ancorados nos resultados gerados.",
    situation:
      "O cliente bate meta, o relacionamento é fluido e os pagamentos estão em dia. Risco: esquecer o cliente porque ele não reclama.",
    rules: [
      "Cliente Green também precisa de atenção: o risco do cliente satisfeito é ser esquecido por não reclamar.",
      "Leve a oportunidade de monetização ao comercial e acompanhe o upsell até o fechamento.",
    ],
  },
  amarelo: {
    name: "Yellow Flag",
    focus: "Recuperação",
    goal: "Realinhar a rota antes que a oscilação vire crise.",
    situation:
      "Os resultados oscilaram, o cliente demora a responder ou demonstrou frustração sutil. Risco moderado de churn.",
    rules: [
      "Primeiro a revisão para mapear dores e reclamações, depois o plano de ação e só então a ação de relacionamento.",
      "Ação de relacionamento é uma ação a mais, não o tratamento do problema.",
      "Ninguém promete bonificação sem aprovação da Coordenação de Operações junto com a Liderança.",
    ],
  },
  vermelho: {
    name: "Red Flag",
    focus: "Retenção",
    goal: "Conter o churn, recuperar a confiança e estabilizar a operação.",
    situation:
      "Resultados despencaram, cliente irritado ou ameaçando cancelar. Análise completa: Gestor de Tráfego, CRM, Account e liderança.",
    rules: [
      "Crise não se trata por escrito: nada de e-mail, mensagem de texto ou áudio longo. Só presencial ou vídeo com câmera aberta. Exceção: o micro-reporte diário no WhatsApp.",
      "Bonificação só com aprovação da Coordenação de Operações e da Liderança. Visita, coffee, almoço, mimo e gift card só com análises e plano prontos.",
      "Quem fala com o cliente é sempre o Account. Coordenação e/ou Michelle (C-Level) entram quando há gatilho de escalonamento.",
    ],
  },
};

const relationship = (p: Proximity | null, perto: string, longe: string) =>
  p === "perto" ? perto : p === "longe" ? longe : `Cliente mais próximo: ${perto} Cliente mais distante: ${longe} (Defina a proximidade no cadastro do cliente.)`;

/** "Erro nosso" (seção 6): vale para Yellow e Red. */
const ERRO_NOSSO: StepTemplate = {
  key: "erro_nosso",
  n: 90,
  title: "Registrar se a causa foi erro nosso",
  how: "Se a mudança de flag veio de um erro da equipe, abra o registro de aprendizado: o que foi o erro, por que erramos, quem, o que aprendemos e o que faremos para não repetir. O foco é corrigir a causa, não punir.",
  when: "Assim que o cliente muda de flag",
  deadline: "Até 2 dias",
  owner: "Account",
  goal: "Corrigir a causa e garantir que o erro não se repita.",
  dueHours: 48,
};

export const STEPS: Record<Band, StepTemplate[]> = {
  verde: [
    {
      key: "mapear_expansao",
      n: 1,
      title: "Mapear a oportunidade de expansão",
      how: "Com o Farmer, cruzar os resultados já gerados com o portfólio (lógica If This Then That) e identificar o produto que resolve a próxima necessidade do cliente. Registre a oportunidade no bloco de upsell.",
      when: "Ao confirmar o cliente como Green",
      deadline: "Até 5 dias",
      owner: "Account + Farmer",
      goal: "Ter uma proposta de upsell ou cross-sell fundamentada em resultado.",
      dueHours: 5 * 24,
    },
    {
      key: "repasse_comercial",
      n: 2,
      title: "Levantar a bola para o comercial",
      how: "Repassar a oportunidade ao time comercial com contexto, resultados e produto sugerido. Mude a oportunidade para \"Repassada ao comercial\".",
      when: "Logo após o mapeamento",
      deadline: "Até 7 dias",
      owner: "Account → Comercial",
      goal: "Oportunidade registrada e assumida pelo comercial.",
      dueHours: 7 * 24,
    },
    {
      key: "acompanhar_upsell",
      n: 3,
      title: "Apresentar e acompanhar o upsell até o fechamento",
      how: "O Account apresenta a proposta ao cliente junto com o Comercial. O Líder de Monetização acompanha negociação e resposta do cliente, registrando o status a cada semana.",
      when: "Depois do repasse",
      deadline: "Semanal, até fechar ou perder",
      owner: "Account + Comercial · Líder de Monetização",
      goal: "Fechar a expansão e aumentar o LTV.",
      everyDays: 7,
      firstDueDays: 14,
    },
    {
      key: "ropre",
      n: 4,
      title: "Manter o cliente no radar",
      how: "Fazer o check-in ROPRE com semáforo de riscos e monitorar os KPIs de churn. Registrar o check-in no painel conta como feito.",
      when: "Todo mês, enquanto o cliente estiver Green",
      deadline: "Mensal",
      owner: "Account + Líder de Monetização",
      goal: "Manter o cliente Green e antecipar qualquer queda.",
      everyDays: 30,
      firstDueDays: 30,
    },
  ],
  amarelo: [
    {
      key: "revisao_tatica",
      n: 1,
      title: "Revisão tática",
      how: "Auditoria rápida de 30 minutos da campanha e dos resultados para mapear as dores, as reclamações e a causa da oscilação.",
      when: "Assim que o cliente entra em Yellow",
      deadline: "Até 5 dias",
      owner: "Account + Gestor de Tráfego",
      goal: "Saber exatamente o que está incomodando o cliente antes de qualquer contato de relacionamento.",
      dueHours: 5 * 24,
    },
    {
      key: "plano_acao",
      n: 2,
      title: "Desenhar o plano de ação",
      how: "Montar o plano com os seis campos (DOR, MOTIVO, AÇÃO, PRAZO, OWNER e OBJETIVO) a partir do que a revisão mapeou. Use o banco de dores no Novo plano.",
      when: "Depois da revisão tática",
      deadline: "Até 5 dias",
      owner: "Account + Gestor de Tráfego",
      goal: "Chegar ao cliente com a queda já detectada e um plano em mãos.",
      dueHours: 5 * 24,
    },
    {
      key: "quick_win",
      n: 3,
      title: "Pequena vitória (quick win)",
      how: "Entregar uma melhoria rápida, com esforço extra do Gestor de Tráfego e do Design (overdelivering).",
      when: "Na mesma semana da revisão tática",
      deadline: "Mesma semana",
      owner: "Gestor de Tráfego + Design",
      goal: "Provar agilidade e gerar um ganho rápido.",
      dueHours: 7 * 24,
    },
    {
      key: "relacionamento",
      n: 4,
      title: "Apresentar o plano e fazer a ação de relacionamento",
      how: (p) =>
        relationship(
          p,
          "marcar visita para apresentar o plano, com coffee, almoço ou mimo.",
          "apresentar por vídeo com câmera aberta e enviar gift card da Maxx.",
        ),
      when: "Só com o plano pronto",
      deadline: "Até 5 dias",
      owner: "Account",
      goal: "Reabrir o diálogo, mostrar o plano e recuperar a confiança.",
      dueHours: 5 * 24,
    },
    {
      key: "reavaliar",
      n: 5,
      title: "Reavaliar a flag",
      how: "Registrar riscos e mitigações no ROPRE e reclassificar o cliente. Se piorar, escalar para Red. Se recuperar, voltar para Green.",
      when: "Durante todo o período em Yellow",
      deadline: "A cada 15 dias",
      owner: "Coordenação de Operações",
      goal: "Evitar o churn e devolver o cliente ao Green.",
      everyDays: 15,
      firstDueDays: 15,
    },
    ERRO_NOSSO,
  ],
  vermelho: [
    {
      key: "ligacao",
      n: 1,
      title: "Ligação emergencial",
      how: "Ligar para o cliente apenas para escuta ativa e contenção, registrando as dores e reclamações. Sem propor soluções e sem marcar visita ainda.",
      when: "Assim que o cliente entra em Red",
      deadline: "Até 24h",
      owner: "Account",
      goal: "Conter o pânico e mapear as dores que vão alimentar as análises.",
      dueHours: 24,
    },
    {
      key: "analise_campanha",
      n: 2,
      title: "Análise total da campanha",
      how: "Diagnóstico completo de mídia, campanha e resultados, com os pontos de melhoria sinalizados ao Account.",
      when: "Em paralelo à ligação",
      deadline: "Até 48h",
      owner: "Gestor de Tráfego",
      goal: "Identificar o que está quebrando o resultado.",
      dueHours: 48,
    },
    {
      key: "analise_crm",
      n: 3,
      title: "Análise do CRM e do funil",
      how: "Revisar CRM e processo comercial do cliente: melhorias, oportunidades e pontos de quebra do funil. Atualize o diagnóstico de CRM da ficha.",
      when: "Em paralelo à análise da campanha",
      deadline: "Até 48h",
      owner: "Analista de CRM",
      goal: "Mapear onde o funil quebra e quais oportunidades existem.",
      dueHours: 48,
    },
    {
      key: "sabatina",
      n: 4,
      title: "Account Planning (Sabatina)",
      how: "Reunião interna com postura investigativa para achar a causa raiz e aplicar a lógica If This Then That para definir a solução ou o produto ideal. Se faltar repertório no nicho do cliente, a Coordenação consulta uma unidade da rede com case do mesmo nicho (sem identificar o cliente).",
      when: "Com as análises de campanha e CRM prontas",
      deadline: "Até 3 dias",
      owner: "Farmer ou KAM + squad",
      goal: "Chegar à raiz do problema e definir a solução.",
      dueHours: 3 * 24,
    },
    {
      key: "plano_intervencao",
      n: 5,
      title: "Montar o plano de intervenção",
      how: "Documento transparente com o que deu errado, o que será feito e as datas exatas de cada entrega. Registre como plano de ação com os seis campos.",
      when: "Depois da Sabatina",
      deadline: "3 a 4 dias",
      owner: "Account (com Gestor de Tráfego e CRM)",
      goal: "Mostrar controle da situação e compromisso com datas.",
      dueHours: 4 * 24,
    },
    {
      key: "bonificacao",
      n: 6,
      title: "Avaliar bonificação",
      how: "Definir caso a caso se cabe bonificação (entrega extra, período de cortesia ou serviço adicional) e obter aprovação antes de oferecer. Registre a decisão na nota do passo.",
      when: "Antes da apresentação do plano",
      deadline: "Junto com o plano",
      owner: "Coordenação de Operações + Liderança",
      goal: "Reforçar o compromisso e reduzir o risco de churn.",
      dueHours: 4 * 24,
    },
    {
      key: "relacionamento",
      n: 7,
      title: "Apresentar o plano e fazer a ação de relacionamento",
      how: (p) =>
        relationship(
          p,
          "visita ao decisor para apresentar o plano, com almoço, coffee ou mimo.",
          "apresentação por vídeo com câmera aberta e envio de gift card da Maxx.",
        ),
      when: "Só com o plano pronto e aprovado",
      deadline: "Até 5 dias",
      owner: "Account (+ Coordenação e/ou Michelle, se escalonado)",
      goal: "Fortalecer a relação e validar o plano com o decisor.",
      dueHours: 5 * 24,
    },
    {
      key: "micro_reporte",
      n: 8,
      title: "Micro-reporte diário",
      how: "Mensagem curta no WhatsApp com o andamento das ações. É atualização, não o canal de tratamento da crise.",
      when: "Todos os dias, até o cliente estabilizar",
      deadline: "Diário",
      owner: "Account",
      goal: "Reduzir a ansiedade do cliente e mostrar que ele é prioridade.",
      everyDays: 1,
      firstDueDays: 1,
    },
    {
      key: "reavaliar",
      n: 9,
      title: "Reavaliar a flag",
      how: "Registrar riscos e mitigações no ROPRE e reclassificar o cliente.",
      when: "Durante todo o período em Red",
      deadline: "A cada 15 dias",
      owner: "Coordenação de Operações",
      goal: "Estabilizar e migrar o cliente para Yellow ou Green.",
      everyDays: 15,
      firstDueDays: 15,
    },
    ERRO_NOSSO,
  ],
};

export const stepTemplate = (band: Band, key: string) => STEPS[band].find((s) => s.key === key) ?? null;

export const howOf = (t: StepTemplate, p: Proximity | null) => (typeof t.how === "function" ? t.how(p) : t.how);

/** Vencimento do passo (ISO) a partir da entrada na flag. */
export function dueOf(t: StepTemplate, startedAt: Date): string | null {
  const hours = t.everyDays ? (t.firstDueDays ?? t.everyDays) * 24 : t.dueHours;
  if (hours === undefined) return null;
  return new Date(startedAt.getTime() + hours * 3_600_000).toISOString();
}

/** Gatilhos de escalonamento (seção 5): Coordenação e/ou Michelle junto ao cliente. */
export const ESCALATION_TRIGGERS = [
  "o cliente ameaça cancelar",
  "o cliente pede para falar com a liderança",
  "o Account não consegue conter a situação",
  "o Account decide escalonar junto com a Coordenação",
];

/* ------------------------- "Erro nosso" (seção 6) ------------------------- */

export const ERROR_CAUSES = {
  processo: "Processo",
  comunicacao: "Comunicação",
  execucao: "Execução",
  prazo: "Prazo",
  analise: "Análise",
} as const;
export type ErrorCause = keyof typeof ERROR_CAUSES;

/** Campos do registro com owner e prazo (dias após a mudança de flag). */
export const LEARNING_FIELDS = [
  { key: "what", label: "O que foi o erro", hint: "Descrição objetiva do que aconteceu e do impacto no cliente.", owner: "Account", days: 2 },
  { key: "why", label: "Por que erramos", hint: "Causa raiz: falha de processo, de comunicação, de execução, de prazo ou de análise.", owner: "Coordenação + squad", days: 5 },
  { key: "who", label: "Quem errou", hint: "Pessoa ou área responsável, para alinhar, treinar e corrigir. Sem foco em punição.", owner: "Coordenação de Operações", days: 5 },
  { key: "learned", label: "O que aprendemos", hint: "Lição concreta tirada do caso.", owner: "Squad envolvida", days: 5 },
  { key: "prevention", label: "O que faremos para não repetir", hint: "Plano preventivo no formato padrão (DOR, MOTIVO, AÇÃO, PRAZO, OWNER e OBJETIVO).", owner: "Coordenação de Operações", days: 7 },
] as const;

/* ------------------------------ Upsell (Green) ------------------------------ */

export const UPSELL_STAGES = {
  mapeada: "Mapeada",
  repassada: "Repassada ao comercial",
  apresentada: "Apresentada ao cliente",
  negociacao: "Em negociação",
  ganha: "Fechada",
  perdida: "Perdida",
} as const;
export type UpsellStage = keyof typeof UPSELL_STAGES;
export const UPSELL_OPEN: UpsellStage[] = ["mapeada", "repassada", "apresentada", "negociacao"];

/* --------------------- CRM e processo comercial (bloco) --------------------- */

export const CRM_QUESTIONS = [
  { key: "organized", label: "O CRM está organizado?" },
  { key: "automations", label: "Tem automações?" },
  { key: "standard_flow", label: "Segue o fluxo padrão de tags e etapas?" },
  { key: "sales_satisfied", label: "O cliente está satisfeito com o processo de vendas dele?" },
] as const;
export type CrmAnswer = "sim" | "nao";

/* ------------------------------ Ekyte ------------------------------ */

/** Descrição da task no Ekyte: os seis campos do plano, um por linha. */
export function ekyteText(p: { dor: string; motivo: string; acao: string; prazo: string | null; owner: string; objetivo: string }) {
  const prazo = p.prazo ? p.prazo.slice(0, 10).split("-").reverse().join("/") : "—";
  return [
    `DOR: ${p.dor || "—"}`,
    `MOTIVO: ${p.motivo || "—"}`,
    `AÇÃO: ${p.acao || "—"}`,
    `PRAZO: ${prazo}`,
    `OWNER: ${p.owner || "—"}`,
    `OBJETIVO: ${p.objetivo || "—"}`,
  ].join("\n");
}
