/**
 * Banco de dores — anexo do "Framework de Saúde da Carteira". É consulta,
 * não passo do playbook: no Novo plano, escolher uma dor sugere motivos,
 * ações, owner e objetivo. Uma mesma dor pode ter mais de um motivo —
 * investigue antes de agir.
 */
export type Dor = {
  key: string;
  group: string;
  dor: string;
  motivos: string[];
  acoes: string[];
  owner: string;
  objetivo: string;
};

export const DORES: Dor[] = [
  {
    key: "falta_vendas",
    group: "Vendas e resultado",
    dor: "Falta de vendas",
    motivos: [
      "Leads chegam, mas não são qualificados",
      "Comercial do cliente não converte: demora no atendimento, sem follow-up, abordagem fraca",
      "Oferta ou preço pouco competitivos",
      "Ciclo de venda longo, ainda em maturação",
      "Vendas acontecem, mas não são registradas no CRM",
    ],
    acoes: [
      "Cruzar leads x vendas no CRM para achar onde o funil quebra",
      "Auditar o atendimento do comercial do cliente (por exemplo, cliente oculto)",
      "Ajustar segmentação e mensagem para públicos com mais intenção de compra",
      "Propor script ou treinamento comercial",
      "Garantir que toda venda seja registrada no CRM",
    ],
    owner: "Analista de CRM + Gestor de Tráfego",
    objetivo: "Descobrir se o gargalo está na geração ou na conversão e atacar o ponto certo.",
  },
  {
    key: "kpis_abaixo",
    group: "Vendas e resultado",
    dor: "Resultados das campanhas pagas abaixo da meta (KPIs reportados)",
    motivos: [
      "Criativos saturados: frequência alta e CTR caindo",
      "Público saturado ou mal segmentado",
      "Verba pulverizada em muitas campanhas",
      "Campanha voltou para fase de aprendizado após mudanças",
      "Sazonalidade do mercado",
      "Landing page com conversão baixa",
    ],
    acoes: [
      "Análise total da campanha (CTR, CPM, CPC, CPL, frequência) comparada ao histórico",
      "Renovar criativos e testar novos ângulos",
      "Reestruturar campanhas e concentrar verba no que performa",
      "Testar landing page e oferta",
      "Comparar com o benchmark de unidades que atendem o mesmo nicho",
      "Apresentar diagnóstico e plano com o forecast revisado",
    ],
    owner: "Gestor de Tráfego",
    objetivo: "Recolocar os KPIs no forecast.",
  },
  {
    key: "custo_alto",
    group: "Vendas e resultado",
    dor: "Custo por lead ou por venda alto",
    motivos: [
      "Leilão mais caro (CPM subindo) ou concorrência maior",
      "Público pequeno demais",
      "Criativo com baixa atratividade",
      "Landing page lenta ou confusa",
    ],
    acoes: [
      "Testes A/B de criativo e de público",
      "Otimizar velocidade e clareza da landing page",
      "Rever o objetivo de otimização da campanha",
      "Avaliar o mix de canais (Meta, Google, LinkedIn etc.)",
      "Comparar o CPL com unidades que atendem o mesmo nicho",
    ],
    owner: "Gestor de Tráfego",
    objetivo: "Reduzir CPL e CAC sem perder qualidade.",
  },
  {
    key: "falta_leads",
    group: "Geração e qualidade de leads",
    dor: "Falta de leads",
    motivos: [
      "Verba baixa ou limitada para o forecast",
      "Anúncios reprovados ou campanha pausada",
      "Formulário ou landing page com problema (fora do ar, lenta, campos demais)",
      "Público muito restrito",
      "Pixel ou integração falhando: leads chegam, mas não são contados",
    ],
    acoes: [
      "Checar a parte técnica: pixel, formulário, integração com o CRM, página no ar",
      "Revisar volume esperado x verba x forecast",
      "Ampliar públicos e testar novos canais",
      "Subir novos criativos com chamada clara",
    ],
    owner: "Gestor de Tráfego",
    objetivo: "Restabelecer o volume de leads.",
  },
  {
    key: "leads_ruins",
    group: "Geração e qualidade de leads",
    dor: "Leads de baixa qualidade",
    motivos: [
      "Segmentação ampla demais",
      "Copy ou criativo atraindo curiosos (promessa genérica, foco só em preço)",
      "Formulário sem pergunta de qualificação",
      "Campanha otimizada para volume, não para qualidade",
      "Não existe critério de MQL acordado com o cliente",
    ],
    acoes: [
      "Definir com o cliente o que é um lead qualificado (MQL)",
      "Incluir perguntas qualificadoras no formulário",
      "Ajustar a copy para filtrar quem não tem perfil",
      "Otimizar campanhas com dados de qualidade vindos do CRM (conversões offline)",
      "Excluir públicos que geram leads ruins",
    ],
    owner: "Gestor de Tráfego + Analista de CRM",
    objetivo: "Aumentar o percentual de MQLs.",
  },
  {
    key: "leads_nao_respondem",
    group: "Geração e qualidade de leads",
    dor: "Leads não respondem ou não interagem",
    motivos: [
      "Demora no primeiro contato e o lead esfria",
      "Abordagem genérica",
      "Canal errado (ligação quando o lead prefere WhatsApp, por exemplo)",
      "Telefone ou e-mail inválidos no cadastro",
      "Falta de cadência de follow-up",
    ],
    acoes: [
      "Medir o tempo de primeira resposta do comercial",
      "Implantar mensagem automática de boas-vindas imediata",
      "Criar cadência de follow-up no CRM",
      "Revisar o script de abordagem",
      "Validar os dados no formulário",
    ],
    owner: "Analista de CRM",
    objetivo: "Aumentar a taxa de contato e de resposta.",
  },
  {
    key: "pace_acima",
    group: "Investimento e mídia",
    dor: "Pace: gastamos mais do que o combinado",
    motivos: [
      "Orçamento diário ou vitalício configurado errado",
      "Campanhas sem limite de gasto",
      "Campanha nova subiu sem revisão de verba",
      "Falta de checagem periódica do pace",
    ],
    acoes: [
      "Corrigir configurações e limites de gasto",
      "Criar rotina semanal de checagem do pace",
      "Informar o cliente com transparência quanto passou e por quê",
      "Combinar a compensação no período seguinte",
    ],
    owner: "Gestor de Tráfego + Account",
    objetivo: "Investimento dentro do combinado e confiança preservada.",
  },
  {
    key: "pace_abaixo",
    group: "Investimento e mídia",
    dor: "Pace: gastamos menos do que o combinado",
    motivos: [
      "Entrega limitada por público pequeno ou lances baixos",
      "Anúncios reprovados ou pausados",
      "Problema de pagamento ou bloqueio na conta de anúncios",
      "Campanha pausada e esquecida",
    ],
    acoes: [
      "Revisar entrega, lances e públicos",
      "Resolver reprovações, pagamento ou bloqueio",
      "Redistribuir a verba para fechar o mês dentro da meta",
      "Explicar ao cliente o impacto no resultado",
    ],
    owner: "Gestor de Tráfego",
    objetivo: "Investir o combinado e não perder resultado por subinvestimento.",
  },
  {
    key: "criativos",
    group: "Criativos e conteúdo",
    dor: "Insatisfeito com os criativos",
    motivos: [
      "Briefing incompleto",
      "Criativo fora da identidade da marca",
      "Tom de voz que não representa o cliente",
      "Criativo bonito, mas sem performance, ou o contrário",
      "Expectativa não alinhada sobre o que será entregue",
    ],
    acoes: [
      "Reunião de briefing com referências do que o cliente gosta e não gosta",
      "Revisar o manual de marca",
      "Mostrar os dados de performance de cada criativo",
      "Definir fluxo de aprovação com rodadas e prazos",
    ],
    owner: "Account + Design",
    objetivo: "Ter criativos aprovados que também performem.",
  },
  {
    key: "frequencia_posts",
    group: "Criativos e conteúdo",
    dor: "Insatisfeito com a frequência das postagens",
    motivos: [
      "Cronograma não combinado ou não documentado",
      "Atraso na produção",
      "Aprovações do cliente demoram",
      "Expectativa maior do que o escopo contratado",
    ],
    acoes: [
      "Revisar com o cliente o escopo e a quantidade contratada",
      "Montar calendário editorial mensal com datas de aprovação",
      "Manter um banco de conteúdos de reserva",
      "Se a expectativa for maior que o escopo, mapear como oportunidade de upsell (só em Green)",
    ],
    owner: "Account + Social Media",
    objetivo: "Frequência combinada e previsível.",
  },
  {
    key: "organico_baixo",
    group: "Criativos e conteúdo",
    dor: "Engajamento ou alcance orgânico baixo",
    motivos: [
      "Conteúdo pouco relevante para o público",
      "Formatos ou horários pouco eficientes",
      "Falta de pilares de conteúdo definidos",
    ],
    acoes: [
      "Analisar métricas por formato e por tema",
      "Testar novos formatos (reels, carrossel)",
      "Definir pilares de conteúdo com o cliente",
    ],
    owner: "Social Media",
    objetivo: "Aumentar alcance e engajamento.",
  },
  {
    key: "crm_desorganizado",
    group: "CRM e processo comercial",
    dor: "CRM desorganizado ou não usado pelo time do cliente",
    motivos: [
      "Time do cliente sem treinamento",
      "Etapas e tags complexas demais",
      "Sem rotina de gestão do funil",
      "Resistência dos vendedores",
    ],
    acoes: [
      "Simplificar etapas e aplicar o padrão de tags",
      "Treinar o time comercial do cliente",
      "Criar rotina de acompanhamento com o gestor do cliente",
      "Montar relatório simples de funil",
    ],
    owner: "Analista de CRM",
    objetivo: "CRM ativo e dados confiáveis para medir vendas.",
  },
  {
    key: "nao_entende_relatorio",
    group: "Relacionamento e operação",
    dor: "Não entende os relatórios ou não enxerga o resultado",
    motivos: [
      "Relatório técnico demais",
      "Métricas demais e pouca ligação com vendas",
      "Falta de explicação nos check-ins",
    ],
    acoes: [
      "Simplificar o relatório para os KPIs ligados ao forecast do cliente",
      "Explicar os números no ROPRE, com semáforo",
      "Conectar as métricas de mídia às vendas",
    ],
    owner: "Account + Gestor de Tráfego",
    objetivo: "Cliente entende os números e enxerga valor.",
  },
  {
    key: "falta_proatividade",
    group: "Relacionamento e operação",
    dor: "Sente falta de proatividade ou atenção",
    motivos: ["Contato só reativo", "Check-ins desmarcados ou adiados", "Ninguém traz ideias novas"],
    acoes: [
      "Garantir o ROPRE mensal",
      "Levar pelo menos uma ideia ou oportunidade a cada check-in",
      "Mandar atualizações curtas entre os check-ins",
    ],
    owner: "Account",
    objetivo: "Cliente percebe a agência presente e proativa.",
  },
  {
    key: "atrasos",
    group: "Relacionamento e operação",
    dor: "Entregas atrasadas ou demora nas respostas",
    motivos: [
      "Squad sobrecarregada",
      "Tasks sem prazo ou sem owner no Ekyte",
      "Aprovação lenta do lado do cliente",
      "Prazos não combinados",
    ],
    acoes: [
      "Revisar as tasks no Ekyte com prazo e owner",
      "Combinar prazo de resposta com o cliente",
      "Mostrar ao cliente o status das entregas",
      "Se o erro foi nosso, abrir o registro de aprendizado",
    ],
    owner: "Account + Coordenação",
    objetivo: "Entregas no prazo e comunicação previsível.",
  },
  {
    key: "expectativa",
    group: "Relacionamento e operação",
    dor: "Expectativa desalinhada (forecast irreal ou pressa por resultado)",
    motivos: [
      "Promessa feita na venda",
      "Forecast nunca acordado formalmente",
      "Desconhecimento do tempo de aprendizado das campanhas",
    ],
    acoes: [
      "Revisar o forecast com base no histórico e no benchmark de unidades do mesmo nicho",
      "Documentar o plano de sucesso com forecast e marcos intermediários",
      "Explicar a curva de maturação das campanhas",
    ],
    owner: "Account + Gestor de Tráfego",
    objetivo: "Forecast realista e acordado com o cliente.",
  },
  {
    key: "paga_caro",
    group: "Relacionamento e operação",
    dor: "Sente que paga caro pelo que recebe",
    motivos: [
      "Valor entregue pouco visível",
      "Resultados abaixo da meta",
      "Comparação com concorrentes ou outras agências",
    ],
    acoes: [
      "Mostrar entregas e resultados acumulados",
      "Conectar o trabalho da agência à receita do cliente",
      "Se o resultado está abaixo, seguir o playbook Yellow ou Red",
      "Bonificação só com aprovação da Coordenação de Operações e da Liderança",
    ],
    owner: "Account",
    objetivo: "Aumentar o valor percebido e reduzir o risco de churn.",
  },
];

export const doresByGroup = () => {
  const m = new Map<string, Dor[]>();
  for (const d of DORES) m.set(d.group, [...(m.get(d.group) ?? []), d]);
  return [...m];
};
