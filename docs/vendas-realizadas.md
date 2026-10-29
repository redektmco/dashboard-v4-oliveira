# Vendas realizadas

Na ficha do cliente, **Vendas realizadas** é uma aba imediatamente à esquerda
de Performance, no desktop e no celular. O link direto é `/clientes/[id]#vendas`.
Links anteriores em `/clientes/[id]/vendas` redirecionam para a aba, preservando
período e página. A paginação usa `vendas_pagina`, e mudar período volta à página 1.

O período padrão inclui hoje (parcial). `periodo=hoje` permite conferir apenas
os recebimentos do dia. Os presets explícitos `7d`, `14d`, `30d` e `90d` continuam
representando dias fechados até ontem, preservando o significado dessas URLs.

## Data de recebimento e semana de referência

`received_at` é o instante real do recebimento; `received_date` é esse dia em São
Paulo. `ref_date` / `reference_week_end` é a sexta-feira que fecha a semana-ritual.
Uma venda recebida em 29/10/2026 pertence ao dia 29 na lista e ao ritual de 30/10.
Não é uma venda futura. Enviar `date`/`ref_date` no payload não muda o recebimento.
O webhook devolve essas datas separadas; um reenvio com ID estável preserva as
datas, o valor e o payload do primeiro recebimento.

Vendas da semana aberta atualizam os campos de faturamento do score de hoje
sem apagar a verba, os leads ou o CPL da leitura vigente. ROAS e ROI não reutilizam
custos/razões da semana anterior: ficam sem leitura quando não há base de mídia
da mesma semana. Snapshots anteriores e suas datas não são regravados.

A aba autenticada consulta apenas vendas aceitas do cliente, inclusive contas e integrações inativas. IDs inválidos ou clientes inexistentes retornam 404. A leitura é atualizada ao abrir a aba, ao voltar à janela e a cada 30 segundos enquanto visível; também há atualização manual.

O filtro compartilha `periodo`, `de` e `ate` com a ficha. Dias seguem `received_at` em `America/Sao_Paulo`; `ref_date` aparece separadamente como semana de referência do ritual. Cards somam todo o recorte, independentemente das páginas de 25 vendas. A ordenação é recebimento descendente, depois ID descendente. `vendas_pagina` inválida cai em 1; valores acima do máximo usam a última página.

A tabela mostra ID interno, recebimento, ID externo de deduplicação quando informado, valor e referência. Não consulta nem expõe payload bruto ou token da integração. Ausência e desativação da integração têm mensagens próprias, separadas de um período sem vendas. Tentativas rejeitadas ou duplicadas não são persistidas pelo webhook, portanto não aparecem como vendas nem como registros inventados.

Esta entrega é somente leitura: não altera schema, vendas existentes, integrações ou clientes. Não remove dados nem precisa de migração. Sem integração configurada, o histórico existente continua disponível.

Verificação local: `npx tsx --test scripts/test-sales.ts` usa PGlite exclusivo criado com `mkdtemp`, sem banco remoto. Cobre limites de dia de São Paulo, deduplicação, isolamento entre clientes, histórico inativo, totais globais, ordenação estável, limites da paginação, privacidade do payload e período vazio. `npx tsc --noEmit` verifica os tipos da rota.
