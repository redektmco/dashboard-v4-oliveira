# Health Score — V4 Oliveira & Co

Dashboard de saúde da carteira da unidade. **Input 100% manual** (GT e Account), sem API paga, sem bot,
sem ingestão automática. Roda na Vercel com Postgres do Neon (plano free).

Implementa o briefing "Health Score Dashboard — Unidade V4" e o design system
`V4 Oliveira & Co Design System/` (vermelho `#e50914`, Montserrat + Inter, superfícies escuras).

---

## Como rodar

O banco é **Postgres (Neon)**, provisionado pelo Marketplace da Vercel. **Atenção:** o
`DATABASE_URL` que o `vercel env pull` traz é o de **produção** — rodar `npm run dev` ou
`npm run seed` com ele escreve (ou apaga) dados reais.

Para desenvolver sem tocar produção, use o Postgres embutido (PGlite, gravado em `.data/`):

```bash
npm install
DATABASE_URL="pglite://./.data/pglite" npm run seed   # carteira de demonstração local
DATABASE_URL="pglite://./.data/pglite" npm run dev    # http://localhost:3000
```

O PGlite é single-process: pare o `dev` antes de rodar um script contra o mesmo diretório.
Uploads de Social media ainda vão para o Blob do `BLOB_READ_WRITE_TOKEN` do `.env.local`.

Contra o Neon (produção ou um branch):

```bash
vercel link                       # se ainda não linkado
vercel env pull .env.local --yes  # traz o DATABASE_URL
npm run dev
```

O schema é criado/atualizado no boot (`src/instrumentation.ts` → `migrate()`). O DDL só roda
quando `SCHEMA_VERSION` (em `src/lib/db/index.ts`) muda — num único round-trip transacional;
no boot comum é uma leitura só. Mudou o schema? Troque a string da versão.

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm test` | testes do motor de score e das regras de Social media — puros, não precisam de banco |
| `npm run recompute` | Job diário — recalcula e grava o snapshot do dia |
| `npm run recompute -- --days=90` | Backfill: refaz a série dos últimos 90 dias |
| `npm run check` | Diagnóstico: carteira por risco; passe um nome para abrir um cliente |
| `npm run migrate:sqlite` | Importa um banco SQLite da fase self-host, preservando ids e datas |
| `npm run importar:clientes -- planilha.csv` | Sobe a carteira da planilha de Gestão de Projetos (CSV); reimportar só atualiza |
| `npm run typecheck` / `npm run lint` | Verificações |
| `npm run build` / `npm start` | Produção |

Os scripts usam `dotenv -e .env.local` porque só o Next carrega `.env.local` sozinho.

### Recompute diário

Roda pelo cron da Vercel, declarado em `vercel.json`:

```json
{ "crons": [{ "path": "/api/recompute", "schedule": "0 9 * * *" }] }
```

Fora da Vercel, agende `npm run recompute` no cron do host. Para proteger a rota, defina
`RECOMPUTE_TOKEN` e mande o header `x-recompute-token` (o cron da Vercel é reconhecido pelo
`Authorization: Bearer $CRON_SECRET`).

### Meta Ads

Puxa verba, leads, conversas iniciadas, faturamento e alcance da API de Insights da Meta com o
token do **usuário de sistema da unidade** (acesso a todas as BMs). O token vive só na env
`META_ACCESS_TOKEN` da Vercel — nunca no banco nem no repositório. Precisa do escopo `ads_read`.

- **Vínculo:** Configurações → Integrações → *Vincular conta*. Lista todas as contas que o token
  enxerga; um cliente pode ter várias (os números somam). Por conta, escolha o que conta como
  lead: formulário/pixel, conversas iniciadas (WhatsApp/Direct) ou os dois.
- **Sync:** cron `/api/meta/sync` às 05h30 (antes do recompute), regrava as 3 últimas
  semanas-ritual (a Meta ainda ajusta conversão atrasada) e recalcula a série. O vínculo já
  importa 12 semanas; `?weeks=12` na rota refaz um histórico maior. Mesma proteção do recompute.
- **No score:** preenche o que o GT deixou em branco no snapshot da semana; semana fechada sem
  snapshot vira um registro "Meta Ads" com as metas vigentes. Número digitado pelo GT sempre
  vence; leads do CRM vencem os da Meta. O formulário do GT já abre com os números da Meta.

### Região das funções

`vercel.json` fixa as funções em `gru1` (São Paulo), ao lado do Neon (`sa-east-1`). Cada query é
um round-trip HTTP; com a função no padrão `iad1` (EUA), cada uma cruzava o continente.

---

## As três jornadas

| Rota | Papel | Cadência | Responde |
|---|---|---|---|
| `/` | **Coordenador** | diária + semanal | "Quem eu ataco primeiro?" |
| `/gt` | **GT** | quando a meta muda | Metas de cada conta. O número da semana vem só das integrações — não há preenchimento manual |
| `/account` → `/account/[id]` | **Account** | a cada check-in | "O cliente está satisfeito e engajado?" |
| `/clientes/[id]` | todos | — | decomposição, histórico, planos |
| `/gt/integracoes` | admin | — | Meta Ads, Google Ads, webhooks de CRM e saúde de cada integração |
| `/gt/canais` | admin | — | e-mail e WhatsApp das cobranças (credenciais nas variáveis de ambiente) |
| `/churn` → `/churn/[id]` | todos | por pedido | solicitações de cancelamento já feitas pelo cliente: abertura, tentativas de retenção (`/retencao`), conclusão (`/concluir`) |
| `/churn/analise` | coordenação | mensal | por que os clientes saem, receita perdida/preservada e sucesso da retenção por estratégia |
| `/social` | social + admin | por entrega | aprovação de criativos e calendário |
| `/config` | coordenação | — | Pendências: o que falta para o score refletir a carteira, o que está funcionando e as últimas alterações |
| `/config/clientes` | coordenação | — | cadastro, metas (com sugestão pela média de 90 dias) e fonte de leads, cliente a cliente ou em sequência |
| `/config/cobranca` | admin | mensal | cobranças por cliente (única, mensal, trimestral, anual) e histórico de disparos |
| `/config/modelo` | coordenação | trimestral | pesos e regras com prévia do impacto; cada salvamento vira uma versão (dá para voltar) |
| `/config/modelo/detalhes` | todos | — | pesos, réguas e justificativas, abertos |
| `/config/usuarios` | admin | — | quem entra no painel, senha, permissão, exclusão |

O menu principal tem só as jornadas (Carteira, Performance, Check-in, Churn, Social media, Onboarding);
administração mora em Configurações, que tem moldura própria (menu de seções com contadores e
"Voltar para a carteira"). Integrações e canais de envio moram em Performance, junto das metas.
Os endereços antigos (`/usuarios`, `/integracoes`, `/modelo`, `/config/calibracao`,
`/config/integracoes`, `/config/canais`, `/gt/[id]`) redirecionam.

A ficha do cliente (`/clientes/[id]`) mostra o Health Score, o status da conta, as próximas
ações (metas pendentes, check-in agendado, planos), o diagnóstico por dimensão com o
drawer de indicadores, o principal risco, a evolução com eventos (check-in, meta alterada, queda
de performance, plano criado), os últimos check-ins, os planos de ação com tarefas e prioridade
e o histórico da conta. Alterações de configuração ficam em `audit_log`; cada calibração salva
vira uma linha em `calibration_versions`.

Cada um preenche só o que controla. O GT não avalia relacionamento; o Account não estima métrica de
mídia.

---

## Acesso

Uso fechado da unidade: **não existe cadastro aberto**. Quem entra é criado por um administrador em
Configurações › Usuários (`/config/usuarios`). Felipe e Michelle nascem administradores — `ensureAdmins()` roda no boot
(`src/instrumentation.ts`), então um banco novo já sobe com acesso, sem passo manual.

Todo usuário criado nasce com a senha padrão da unidade, `Oliveira@2026`, que o admin pode
redefinir a qualquer momento pelo painel.

| Peça | Onde | O que faz |
|---|---|---|
| `src/proxy.ts` | proxy do Next 16 (ex-middleware) | checagem otimista: sem cookie, manda para `/login` |
| `src/lib/auth.ts` | servidor | senha em `scrypt`, sessão no banco, `requireUser` / `requireAdmin` |
| `src/actions/auth.ts` | server actions | entrar, sair e administrar usuários |
| `/config/usuarios` | página | criar acesso, editar, resetar senha, promover a admin, desativar, excluir |

**Excluir x desativar:** quem já assinou algum input (snapshot de performance ou check-in) não
pode ser excluído — o histórico guarda quem preencheu. Para quem saiu, desative o acesso.
Os administradores fixos (Felipe, Michelle) não podem ser excluídos nem desativados, e ninguém
exclui/desativa a si mesmo.

**O proxy nunca é a única trava.** Server Actions chegam como POST na própria rota e podem escapar
do matcher, então toda página e toda mutação chamam `requireUser()` no servidor — `getSessionUser`
é embrulhado em `cache()`, então isso custa um round-trip por requisição, não um por chamada.

A sessão vive na tabela `sessions` em vez de num cookie assinado: desativar alguém ou trocar a
senha derruba o acesso na hora, e não há segredo novo para gerenciar em variável de ambiente.

Recuperação, se ninguém conseguir entrar:

```bash
npm run usuarios                  # lista quem tem acesso
npm run usuarios -- reset felipe  # volta a senha padrão
```

---

## O modelo

### Dimensões e pesos (`src/lib/model/catalog.ts`)

| Dimensão | Origem | Peso |
|---|---|---|
| Performance / Resultado | GT | 35% |
| Relacionamento / Engajamento | Account | 25% |
| Qualidade de lead / MQL | GT + Account | 20% |
| Financeiro / Comercial | Account | 12% |
| Operacional / Dados | GT | 8% |

Cada peso — de dimensão **e** de campo — carrega uma justificativa escrita no código
(`weightRationale`) e exibida em `/config/modelo/detalhes`. Nenhum número é chute.

### Réguas de normalização (`src/lib/model/scoring.ts`)

```
Régua A (maior é melhor)   score = min(100, real / meta × 100)
Régua B (menor é melhor)   score = min(100, meta / real × 100)
Régua C (escala fixa)      score = ((nota − 1) / 4) × 100
                           sim/não → 100/0 · sim/parcial/não → 100/50/0
```

Teto em 100 de propósito: bater 150% da meta não vale mais que bater 100% para fins de saúde — evita
um super-mês mascarar um problema.

### Agregação

Campo normalizado → média ponderada dentro da dimensão → média ponderada das dimensões → **0–100**.
Bandas: **verde ≥ 75 · amarelo 55–74 · vermelho < 55**.

**Campo ausente sai do cálculo e os pesos do bloco são renormalizados** — a conta não é punida por um
campo que ainda não existe, e a UI mostra o peso efetivo de cada campo.

### Overrides

| Gatilho | Efeito |
|---|---|
| Inadimplência | vermelho |
| Flag de risco explícito | vermelho |
| Tracking quebrado | teto de amarelo |
| Performance < 50% por 2 ciclos | vermelho |

A banda crua (média) fica visível ao lado da banda final, então dá para ver que foi o override que
rebaixou.

### Confiança

Separada da nota, sempre ao lado dela. Alta (as duas origens frescas) · Média (uma velha) · Baixa
(ambas velhas ou faltando). Confiança baixa **não zera** o score — avisa o coordenador para não agir
cego. Um 82 com confiança baixa é um "não sei", não um "está tudo bem".

---

## Arquitetura

```
src/
  instrumentation.ts   cria o schema e garante os admins no boot (idempotente)
  proxy.ts             trava de acesso otimista (Next 16: ex-middleware)
  lib/
    db/index.ts        conexão Neon + DDL + helpers (única fronteira com o banco)
    repo.ts            todo acesso a dados + recompute, sempre em lote
    auth.ts            senha, sessão e guardas de rota
    seed.ts            carteira de demonstração
    model/
      types.ts         tipos de domínio
      catalog.ts       campos, definições objetivas, pesos e justificativas
      scoring.ts       réguas, agregação, overrides, confiança  (puro, sem I/O)
      form.ts          formulário → snapshot  (puro, testado)
    week.ts            dia fixo do ritual do GT
  actions/index.ts     server actions
  actions/auth.ts      login, logout e administração de usuários
  app/                 páginas
  components/          UI sobre o design system
scripts/               seed · recompute (cron) · test · check · usuarios · migrate-sqlite
```

**Princípio de arquitetura: snapshot datado, nunca sobrescrever.** Salvar performance ou check-in
sempre insere um registro novo com data, autor e horário. A série histórica é o ativo — sem ela não
há curva, sem curva não há antecipação.

O cálculo (`scoring.ts`) é puro e não conhece banco: por isso os 20 testes rodam sem `DATABASE_URL`
e a recalibração pode reescrever 90 dias de série sem efeito colateral.

### Banco

**Neon Postgres**, driver HTTP serverless (`@neondatabase/serverless`), provisionado pelo
Marketplace da Vercel — as env vars são injetadas no projeto automaticamente.

Tabelas: `users`, `sessions`, `clients`, `client_targets`, `performance_snapshots`,
`checkin_snapshots`, `score_snapshots`, `action_plans`, `settings`. Os snapshots guardam o preenchimento em `JSONB`, o
que permite mudar o catálogo de campos sem migração de schema. Datas são `DATE`/`TIMESTAMPTZ` e
voltam como texto (`::text` nas queries), porque o cálculo compara strings `YYYY-MM-DD`.

**Cada query é um round-trip HTTP**, então o `repo` foi escrito para buscar em lote — nunca uma
query por cliente dentro de um laço. `portfolio()` monta a carteira inteira em 6 queries;
`recomputeRange(90)` carrega tudo uma vez, calcula em memória e grava um INSERT por cliente. Sem
isso, um recompute de 90 dias levaria minutos em vez de segundos.

Variáveis:

| Variável | Padrão | Para quê |
|---|---|---|
| `DATABASE_URL` | — | **obrigatória** — Postgres do Neon |
| `HEALTHSCORE_RITUAL_DAY` | `5` (sexta) | dia fixo do input do GT |
| `RECOMPUTE_TOKEN` | — | protege `POST /api/recompute` |
| `NEXT_PUBLIC_CLICKUP_LIST_URL` | — | URL da lista para "Abrir tarefa no ClickUp" |

Trocar de provedor continua sendo mexer em um arquivo só (`src/lib/db/index.ts`): o resto do app
fala apenas com `repo.ts`.

---

## Design system

Tokens em `src/app/globals.css`, derivados de `V4 Oliveira & Co Design System/colors_and_type.css`:

- Vermelho da marca `#e50914` — reservado a CTA, foco e status crítico. Nunca preenche painel, exceto
  a barra de 3px à esquerda do bloco de override (a urgência é o ponto).
- Superfícies `#0d0d0d` / `#1a1a1a` / `#202020` / `#262626`; bordas de 1px em `rgba(255,255,255,.08)`.
- Status: verde `#52cc5a`, amarelo `#ffc02a`, crítico no vermelho da marca.
- Montserrat (display) + Inter (corpo, substituindo Proxima Nova) + JetBrains Mono, via `next/font`.
- Números sempre tabulares; moeda em `R$` com locale BR.
- Sem gradiente, sem emoji na UI, sem linha vertical em tabela. Ícones inline no estilo Lucide
  (`src/components/icon.tsx`).

---

## Decisões tomadas sobre os pontos em aberto do briefing

O briefing (seção 10) listou cinco decisões a fechar antes de codar. Foram resolvidas assim — todas
reversíveis pela UI:

1. **Onde vive a meta.** No cadastro do cliente (`client_targets`, versionadas por data de vigência),
   e o formulário semanal do GT vem pré-preenchido com a meta vigente. Se o GT ajustar a meta na
   semana, o valor informado passa a ser a meta vigente a partir daquela data. Assim a meta tem um
   dono claro sem travar o preenchimento, e o histórico de metas não é apagado.
2. **Tipos de conta.** Os três do briefing (`lead_gen`, `ecommerce`, `branding`) com os campos
   propostos. Ajustar à carteira real é editar `catalog.ts` — formulários, cálculo e a página
   `/config/modelo/detalhes` derivam todos dele.
3. **Âncoras 1–5.** Implementadas literalmente como no briefing e exibidas no próprio formulário: o
   Account clica na descrição, não no número. Validar o texto com os Accounts é edição de uma
   constante (`SCALE_ANCHORS`).
4. **Dia fixo do GT.** Sexta-feira (`HEALTHSCORE_RITUAL_DAY=5`). A tela do GT mostra a semana de
   referência e quem já preencheu.
5. **Limiares dos overrides.** Performance < 50% por 2 ciclos; frescor de 10 dias (performance) e 35
   dias (check-in). Todos editáveis em `/config/modelo` sem tocar em código.

### Refinamento além do briefing, que vale registrar

O briefing normaliza MQL como `MQL / leads gerados`. Aplicado ao pé da letra, uma taxa saudável de 30%
viraria score 30 e destruiria a dimensão. Aqui a taxa é comparada a uma **meta de taxa de MQL** por
cliente (régua A sobre a taxa): 18% contra meta de 35% dá ~51. Sem essa meta cadastrada, o campo sai
do cálculo e a UI diz o porquê, em vez de inventar um número.

---

## Calibração (seção 9 do briefing)

Os pesos são hipótese inicial defensável, não verdade. Em `/config/modelo` você edita pesos e regras,
vê antes de salvar quais clientes mudariam de faixa (prévia do impacto), e **salvar reescreve a série
dos últimos 90 dias** com os novos pesos — sem isso a comparação entre score passado e desfecho real
não faz sentido. Cada salvamento vira uma versão (v1, v2…); voltar a uma anterior cria uma versão
nova com os valores dela.

O ciclo: rodar 60–90 dias → marcar quem deu churn/downgrade/renovou → olhar o score e cada dimensão
30/60/90 dias antes do desfecho → a dimensão que melhor separou "quem saiu" de "quem ficou" ganha
peso → repetir trimestralmente.
