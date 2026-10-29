# Auditoria inicial — 29/10/2026

Inspeção concluída antes das alterações de aplicação. Base: `6f328b8`.
Ambiente local PGlite; nenhuma leitura ou alteração na carteira de produção.
Não há fonte acessível que confirme a situação de Morais Plásticos ou de outro
cliente real. Nenhum cadastro será reclassificado por nome ou suposição.

## Arquitetura e funcionalidades

Next.js 16.3.3 App Router, React 19, Node 24, TypeScript, Tailwind 4. Páginas
server leem `lib/repo`, agregadores CRM e serviços específicos; componentes
client usam Server Actions, rotas API e estado local. Autenticação por sessão,
proxy otimista e validação efetiva no servidor; administração exige `requireAdmin`.
Neon/Postgres por HTTP em produção, PGlite isolado em desenvolvimento; migração
aditiva versionada em `lib/db/index.ts`, executada no boot.

| Área | Rotas / implementação atual |
| --- | --- |
| Carteira | `/`: score, receita recorrente declarada, risco, prioridades e busca |
| Clientes | `/clientes`, `/clientes/novo`, `/clientes/[id]`: cadastro, tabela/kanban, fontes, forecast, score, ações e histórico |
| Performance | `/gt`, `/gt/[id]`, `/gt/integracoes`, `/gt/canais`: metas e Meta/Google, sincronização, campanhas e demografia |
| Relacionamento | `/account`, `/account/[id]`: check-ins e prévia do score |
| Churn | `/churn`, solicitações, retenção, conclusão e análise histórica |
| Social | `/social`, planejamento, projetos; aprovação externa `/a/[token]` |
| Relatórios | `/relatorios`, editor, sincronização e IA; compartilhamento `/r/[token]` |
| Onboarding | Trilhas/categorias/aulas, progresso e administração de conteúdo |
| Configuração | Usuários/cargos, modelo/pesos e cobrança |
| Webhooks | Leads e vendas CRM, deduplicação opcional e atualização de score |

Integrações implementadas: Meta Graph, Google Ads, Vercel Blob, email/WhatsApp
para cobrança, Anthropic/Google para relatórios. O funcionamento remoto depende
de credenciais não disponibilizadas nesta máquina. Cron Vercel sincroniza mídia,
recalcula score e dispara cobrança. Não afirmar validação de APIs externas a
partir dos testes locais. Manter os contratos e dados dessas integrações.

## Fontes e cálculos

- Leads/vendas de CRM são eventos persistidos. Deduplicados e rejeitados não
  ficam como tentativas no banco; a futura lista não pode inventá-los.
- O período exato usa recebimento em São Paulo; `ref_date` fecha a semana do
  ritual. Relatórios/score semanais não são a mesma granularidade do resumo.
- CPL usa verba de campanhas de lead na Meta e verba total no Google; com
  CRM, o resumo usa verba total. Google devolve conversões agregadas, que não
  comprovam leads separados de compras em e-commerce/branding.
- ROAS = receita ÷ mídia; CPV = mídia ÷ vendas; ticket = receita ÷ vendas.
  Não somar receita do pixel à do CRM; denominador zero significa sem leitura.
- Forecast vigente é versionado por data e compartilhado por ficha/Performance.
  Sugestão histórica descartava zeros de volume, elevando a média. Metas
  comerciais mensais/trimestrais são separadas das réguas semanais do score.
- Score normaliza campos, renormaliza pesos presentes e aplica overrides
  (inadimplência, risco, churn, tracking e queda). Não há cobertura completa
  de aplicabilidade por serviço; não exigir campanha de quem não a contratou.
- MRR é um valor declarado no cliente, sem classificação recorrente/pontual.
  Agregações filtram `active`, mas não distinguem pausa, espera ou encerramento.
  O MRR atual também é usado no ROI histórico: sem vigência histórica não se
  pode garantir a conciliação de períodos antigos após mudanças contratuais.
- Data de renovação do check-in pode prevalecer sobre a do cadastro: exige
  decisão de vigência para análises históricas; não reescrever snapshots antigos.
- `today()` usava UTC apesar do calendário operacional de São Paulo.

## UX e execução observadas

Baseline: **139 testes passaram**. Navegador Chromium, com demonstração local:
15 rotas principais retornaram 200, sem erros JavaScript nem overflow global
nas larguras 1440, 768 e 390. Isso não valida todos os botões nem integrações.
Build de produção e typecheck já passaram na entrega anterior; serão repetidos
para o conjunto final. Lint tem um aviso pré-existente de eslint-disable em
`a/[token]/opengraph-image.tsx`.

Ficha inicial possui resumo executivo separado de análises, mas o playbook
permanece extenso e aberto. Falta alternância rápida de cliente. Há skeletons,
erros, toasts, confirmação destrutiva e estados vazios; rejeições inesperadas da
sincronização precisam feedback. Next instalado oferece **retry e reset** no
error boundary; usar `retry` não é bug nesta versão (confirmado no código Next).

Seeds são sintéticos e destrutivos se executados sem cuidado. Relatórios sem
cliente têm `sample: true`; dados do PGlite não devem parecer carteira real.
Não foi executado seed contra produção, nem feitas chamadas a mídias pagas.

## Critérios para correção

Migração aditiva, sem excluir histórico, sem atribuir situação a clientes antigos
por inferência. Situação e natureza de receita devem ser declaradas por pessoa
autorizada com referência da fonte. Valores pontuais não entram em MRR. Serviços
desconhecidos continuam explícitos como não classificados; não desvincular contas
de anúncio nem remover registros para esconder inconsistências. A tela de vendas
deve listar os eventos reais persistidos, com totais conciliáveis e paginação.

## Entrega e evidências

- Vendas realizadas implementada em `/clientes/[id]/vendas`, ligada à ficha e
  ao resumo. Recebimentos persistidos, 25 por página, totais do intervalo inteiro,
  valores com centavos, data/hora SP, estado vazio, loading, erro e autenticação.
- Resultados por período redesenhados conforme o HTML fornecido pelo usuário:
  retorno/ROAS, funil e custos em três colunas, adaptadas a resoluções menores.
  Sem copiar os números de exemplo nem apresentar ROAS como margem de lucro.
- Quatro situações operacionais explícitas e natureza recorrente/pontual/mista.
  Administração exige fonte e confirmação; os registros antigos permanecem sem
  classificação nova. Arquivados legados exigem confirmação antes da restauração.
- Eventos guardam classificação anterior, fonte, referência/nome do cliente e
  nome do autor. A trilha sobrevive até a exclusão explicitamente autorizada de
  um cadastro (vínculos viram NULL, identificadores históricos permanecem).
- MRR atual exclui contratos pontuais e clientes fora da operação; parcelas
  pontuais não viram MRR em novas solicitações de churn ou pré-preenchimentos
  de cobrança. O valor declarado original fica preservado.
- Serviços conhecidos orientam resumo, score, forecast e agregação de mídia;
  textos legados/desconhecidos não são reclassificados. Correção das sugestões
  de forecast para incluir zeros válidos de volume. Calendário operacional SP.
- Playbook recolhido por padrão e aberto pelo atalho direto; troca rápida de
  cliente; feedback para falhas inesperadas de sincronização; banner de teste
  distingue PGlite da carteira real.

Validação final: **144 testes passaram**; build de produção e TypeScript
passaram; lint sem erros (um aviso pré-existente). Navegador verificou layout
do HTML, vendas/totais/paginação/valor zero, período vazio, login obrigatório,
classificação com fonte, MRR pontual, filtro de pausados, alternância de cliente,
playbook e **33 combinações de rota e resolução (1440/768/390)** sem erros JS
nem overflow global. Exemplos sintéticos usados exclusivamente em `/tmp`, com
banner explícito; nenhuma situação de cliente real foi alterada.

### Limitações que exigem fonte ou evolução específica

Ainda não há histórico contratual de MRR com vigência para conciliar ROI de
períodos antigos após mudanças de receita. Não foram regravados snapshots de
produção nem inferidos valores retroativos. Fontes CRM/campanhas têm granularidade
e atribuição distintas; razões entre seus volumes não comprovam conversão de
pessoas. Tentativas HTTP rejeitadas/duplicadas não podem ser reconstruídas como
vendas. Integrações remotas e dados reais não foram validados sem suas credenciais;
o relatório não atesta o estado de produção nem classifica clientes por nome.
