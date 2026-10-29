# Plano — Vendas realizadas

Proposta baseada no feedback de Gabriel e Fernando. A Visão geral exibe os totais;
esta tela permitirá conferir as vendas que compõem cada número. Implementação
da tela e mudanças na ingestão ficam para a próxima etapa.

## Entrada e layout

- Nova aba **Vendas realizadas** na ficha do cliente, com link pelo indicador
  de vendas na Visão geral quando a aba estiver implementada.
- Manter o período da ficha na URL, inclusive ao abrir ou compartilhar a aba.
- Cabeçalho com quantidade de vendas, valor vendido e ticket médio. Todos os
  totais usam o conjunto filtrado inteiro, independentemente da página da tabela.
- Tabela por recebimento mais recente, com paginação no servidor: recebido em
  (data/hora de São Paulo), ID interno do evento, ID do negócio quando informado,
  valor em R$ e semana de referência do score. No celular, cartões com os mesmos
  campos. Busca por ID do negócio, com ordenação estável por received_at e id.
- Detalhe de uma venda: identificadores e campos reconhecidos do webhook,
  sem supor produto, comprador, origem ou associação a lead quando ausentes.
  Dados pessoais devem ter acesso restrito e mascaramento; não expor tokens
  de integração, cabeçalhos ou payload bruto em links públicos e logs.
- Estados explícitos: carregando, erro com nova tentativa, nenhuma venda no
  período e webhook que ainda não recebeu vendas (orientar a configuração).

## Fonte e regras

Usar `crm_sales` (`id`, `client_id`, `received_at`, `ref_date`, `dedup_key`,
`value`, `payload`). Consultar por cliente e pelo dia de **recebimento** em
`America/Sao_Paulo`, igual aos novos indicadores da Visão geral. `ref_date`
é o fechamento da semana-ritual; não é a data de venda. Hoje não existe data
normalizada de ocorrência no CRM. Identificar isso no rótulo do filtro.

Cada linha representa uma venda persistida, com `SUM(value)`, `COUNT(*)` e
ticket = valor ÷ quantidade. Valor zero é válido. Vendas de Meta/Google não
se somam a vendas do CRM: a atribuição de anúncios pode repetir negócios.
Não chamar a quantidade de vendas de clientes adquiridos ou leads convertidos.

O resumo usa valor vendido ÷ mídia para ROAS e mídia ÷ vendas para **CPV**.
CAC exige custos de aquisição adicionais e quantidade de clientes novos, que
não estão disponíveis. CPL mantém a regra das campanhas (verba de leads na
Meta, verba total no Google); com leads de CRM usa verba total. A fonte de
leads `both` soma campanhas e CRM sem deduplicação entre essas fontes.

## Entrega 1 — vendas persistidas

1. Query parametrizada de listagem e totais, com limites de paginação,
   validação de cliente/período e sessão obrigatória, conforme a ficha atual.
2. Índice `(client_id, received_at, id)` caso o plano de consulta/volume justifique.
3. Aba e detalhe, preservando Performance para análise de mídia e campanhas.
4. Verificar conciliação com Visão geral, datas nas bordas de São Paulo,
   paginação com timestamps repetidos, eventos fora do período, vendas com
   valor zero, ausência de ID externo e bloqueio de acesso sem sessão.

## Entrega 2 — cada entrega do webhook

O banco atual **não guarda cada tentativa HTTP**. Reenvios com chave estável
retornam `counted: false` sem nova venda; requisições rejeitadas com 422/404
também não geram linha. Sem chave estável, dois POSTs podem virar duas vendas.
Não é possível reconstruir esse histórico retroativamente.

Para atender literalmente a cada evento recebido, criar um registro de
recebimento separado de `crm_sales`, sem mudar as contagens de negócio:

- ID do recebimento, integração/cliente resolvidos, instante, ID externo,
  resultado (contabilizado, duplicado, rejeitado), motivo e vínculo opcional
  com a venda; retenção e campos permitidos definidos antes de guardar payloads.
- Gravar o recebimento e a venda de forma consistente, com idempotência para
  reenvios; um rejeitado ou duplicado nunca aumenta o valor vendido.
- Filtro de resultado e detalhe do recebimento na tela, deixando clara a
  diferença entre **vendas realizadas** e **tentativas do webhook**.
- Testar JSON e formulário Kommo, reenvio, valor ausente/negativo/zero,
  concorrência e indisponibilidade do banco. Não reprocessar nem editar vendas
  a partir da tela nesta primeira versão.

Critério de conclusão: conferir um negócio da Visão geral até seu evento e
conciliar quantidade/valor no mesmo período, com duplicados e rejeitados
visíveis somente como recebimentos, quando a entrega 2 estiver disponível.
