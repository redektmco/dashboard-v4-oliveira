# Vendas realizadas

A rota autenticada `/clientes/[id]/vendas` consulta apenas vendas aceitas do cliente, inclusive contas e integrações inativas. IDs inválidos ou clientes inexistentes retornam 404.

O filtro compartilha `periodo`, `de` e `ate` com a ficha. Dias seguem `received_at` em `America/Sao_Paulo`; `ref_date` aparece separadamente como semana de referência do ritual. O retorno à ficha mantém o período. Cards somam todo o recorte, independentemente das páginas de 25 vendas. A ordenação é recebimento descendente, depois ID descendente. `page` inválida cai em 1; valores acima do máximo usam a última página.

A tabela mostra ID interno, recebimento, ID externo de deduplicação quando informado, valor e referência. Não consulta nem expõe payload bruto ou token da integração. Ausência e desativação da integração têm mensagens próprias, separadas de um período sem vendas. Tentativas rejeitadas ou duplicadas não são persistidas pelo webhook, portanto não aparecem como vendas nem como registros inventados.

Esta entrega é somente leitura: não altera schema, vendas existentes, integrações ou clientes. Não remove dados nem precisa de migração. Sem integração configurada, o histórico existente continua disponível.

Verificação local: `npx tsx --test scripts/test-sales.ts` usa PGlite exclusivo criado com `mkdtemp`, sem banco remoto. Cobre limites de dia de São Paulo, deduplicação, isolamento entre clientes, histórico inativo, totais globais, ordenação estável, limites da paginação, privacidade do payload e período vazio. `npx tsc --noEmit` verifica os tipos da rota.
