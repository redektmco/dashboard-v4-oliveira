# Health Score — V4 Oliveira & Co

Dashboard de saúde da carteira da unidade. **Input 100% manual** (GT e Account), sem API paga, sem bot,
sem ingestão automática. Roda na Vercel com Postgres do Neon (plano free).

Implementa o briefing "Health Score Dashboard — Unidade V4" e o design system
`V4 Oliveira & Co Design System/` (vermelho `#e50914`, Montserrat + Inter, superfícies escuras).

---

## Como rodar

O banco é **Postgres (Neon)**, provisionado pelo Marketplace da Vercel. Não há banco local: o
mesmo `DATABASE_URL` serve dev e produção (use um branch do Neon se quiser isolar).

```bash
npm install
vercel link                       # se ainda não linkado
vercel env pull .env.local --yes  # traz o DATABASE_URL
npm run seed                      # carteira de demonstração (APAGA o que existir)
npm run dev                       # http://localhost:3000
```

O schema é criado sozinho no primeiro boot (`src/instrumentation.ts` → `migrate()`, idempotente).

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm test` | 20 testes do motor de score — puros, não precisam de banco |
| `npm run recompute` | Job diário — recalcula e grava o snapshot do dia |
| `npm run recompute -- --days=90` | Backfill: refaz a série dos últimos 90 dias |
| `npm run check` | Diagnóstico: carteira por risco; passe um nome para abrir um cliente |
| `npm run migrate:sqlite` | Importa um banco SQLite da fase self-host, preservando ids e datas |
| `npm run typecheck` / `npm run lint` | Verificações |
| `npm run build` / `npm start` | Produção |

Os scripts usam `dotenv -e .env.local` porque só o Next carrega `.env.local` sozinho.

### Recompute diário

Roda pelo cron da Vercel, declarado em `vercel.json`:

```json
{ "crons": [{ "path": "/api/recompute", "schedule": "0 9 * * *" }] }
```

Fora da Vercel, agende `npm run recompute` no cron do host. Para proteger a rota, defina
`RECOMPUTE_TOKEN` e mande o header `x-recompute-token`.

---

## As três jornadas

| Rota | Papel | Cadência | Responde |
|---|---|---|---|
| `/` | **Coordenador** | diária + semanal | "Quem eu ataco primeiro?" |
| `/gt` → `/gt/[id]` | **GT** | semanal, sexta | "A conta entrega o contratado?" |
| `/account` → `/account/[id]` | **Account** | a cada check-in | "O cliente está satisfeito e engajado?" |
| `/clientes/[id]` | todos | — | decomposição, histórico, planos |
| `/modelo` | todos | — | pesos, réguas e justificativas, abertos |
| `/config` | coordenação | — | clientes, metas, calibração, time |

Cada um preenche só o que controla. O GT não avalia relacionamento; o Account não estima métrica de
mídia.

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
(`weightRationale`) e exibida em `/modelo`. Nenhum número é chute.

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
  instrumentation.ts   cria o schema no boot (idempotente)
  lib/
    db/index.ts        conexão Neon + DDL + helpers (única fronteira com o banco)
    repo.ts            todo acesso a dados + recompute, sempre em lote
    seed.ts            carteira de demonstração
    model/
      types.ts         tipos de domínio
      catalog.ts       campos, definições objetivas, pesos e justificativas
      scoring.ts       réguas, agregação, overrides, confiança  (puro, sem I/O)
      form.ts          formulário → snapshot  (puro, testado)
    week.ts            dia fixo do ritual do GT
  actions/index.ts     server actions
  app/                 páginas
  components/          UI sobre o design system
scripts/               seed · recompute (cron) · test · check · migrate-sqlite
```

**Princípio de arquitetura: snapshot datado, nunca sobrescrever.** Salvar performance ou check-in
sempre insere um registro novo com data, autor e horário. A série histórica é o ativo — sem ela não
há curva, sem curva não há antecipação.

O cálculo (`scoring.ts`) é puro e não conhece banco: por isso os 20 testes rodam sem `DATABASE_URL`
e a recalibração pode reescrever 90 dias de série sem efeito colateral.

### Banco

**Neon Postgres**, driver HTTP serverless (`@neondatabase/serverless`), provisionado pelo
Marketplace da Vercel — as env vars são injetadas no projeto automaticamente.

Tabelas: `users`, `clients`, `client_targets`, `performance_snapshots`, `checkin_snapshots`,
`score_snapshots`, `action_plans`, `settings`. Os snapshots guardam o preenchimento em `JSONB`, o
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
   `/modelo` derivam todos dele.
3. **Âncoras 1–5.** Implementadas literalmente como no briefing e exibidas no próprio formulário: o
   Account clica na descrição, não no número. Validar o texto com os Accounts é edição de uma
   constante (`SCALE_ANCHORS`).
4. **Dia fixo do GT.** Sexta-feira (`HEALTHSCORE_RITUAL_DAY=5`). A tela do GT mostra a semana de
   referência e quem já preencheu.
5. **Limiares dos overrides.** Performance < 50% por 2 ciclos; frescor de 10 dias (performance) e 35
   dias (check-in). Todos editáveis em `/config` sem tocar em código.

### Refinamento além do briefing, que vale registrar

O briefing normaliza MQL como `MQL / leads gerados`. Aplicado ao pé da letra, uma taxa saudável de 30%
viraria score 30 e destruiria a dimensão. Aqui a taxa é comparada a uma **meta de taxa de MQL** por
cliente (régua A sobre a taxa): 18% contra meta de 35% dá ~51. Sem essa meta cadastrada, o campo sai
do cálculo e a UI diz o porquê, em vez de inventar um número.

---

## Calibração (seção 9 do briefing)

Os pesos são hipótese inicial defensável, não verdade. Em `/config` você edita pesos e limiares, e
**salvar reescreve a série dos últimos 90 dias** com os novos pesos — sem isso a comparação entre
score passado e desfecho real não faz sentido.

O ciclo: rodar 60–90 dias → marcar quem deu churn/downgrade/renovou → olhar o score e cada dimensão
30/60/90 dias antes do desfecho → a dimensão que melhor separou "quem saiu" de "quem ficou" ganha
peso → repetir trimestralmente.
