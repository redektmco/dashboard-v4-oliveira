# Auditoria de UI/UX/Performance — Health Score (Oliveira & Co)

Data: 2026-09-15 · Branch: `claude/sweet-shannon-feb1uw`

## 0. Baseline e método

- `npm run typecheck` (baseline): limpo, 0 erros.
- `npm run lint` (baseline): 0 erros de tipo, mas **5 erros reais de React
  hooks** (não cosméticos) + 6 warnings de `<img>`. Corrigidos nesta rodada
  (ver seção 4).
- `npm run build`: limpo.
- `npm run test` (scripts/test.ts, 20 casos sobre o motor de scoring): 20/20
  ok, sem alteração nesta rodada.
- Método: leitura de `src/app/**` (todas as rotas), `src/components/**`
  (inclusive `social/`), `src/lib/**` (auth, repo, model, social), e
  `package.json`. Sem acesso a analytics de uso real — priorização é por
  inspeção de código e pela metodologia do briefing (níveis de prioridade de
  informação, critérios de modal/drawer, critérios de gráfico, etc.), não por
  dado de campo.

**Achado geral importante**: este não é um dashboard "cru". O histórico de
commits (`beta-mobile`, `menu recolhível`, `check-in por perguntas`, `análise
visual do cliente`) mostra que já houve pelo menos uma rodada de auditoria de
UX antes desta. Várias das exigências do briefing já estão resolvidas e
**foram preservadas sem alteração**:

- **Gráficos são todos autorais** (`components/charts.tsx`, `score-chart.tsx`,
  `ui.tsx#Sparkline`) — SVG à mão, sem lib de gráfico. Toda informação
  codificada em cor também tem número/rótulo ao lado (comentário explícito no
  código sobre daltonismo verde↔amarelo). Isso é exatamente o padrão pedido
  pelo briefing para "gráficos próprios" — não mexi aqui.
- **Ícones são SVG inline** (`components/icon.tsx`), sem biblioteca de ícones.
- **Camada de dados já é em lote**: `repo.ts#portfolio`, `#allSnapshots`,
  `#getAllTargets` etc. carregam tudo em poucas queries com `Promise.all` e
  `Map`, evitando N+1 mesmo na carteira inteira. Comentários no código já
  documentam essa decisão. Não há query-por-linha para corrigir.
- **Responsivo mobile já foi feito a sério**: tabelas viram `CardList` de
  cartões abaixo de `lg`, filtros da carteira viram gaveta, barra de abas +
  gaveta "Mais" no rodapé, safe-area, `env(safe-area-inset-*)`. Não mexi.
- **`package.json` já é enxuto**: só `next`, `react`, `react-dom`,
  `@neondatabase/serverless`, `@vercel/blob` em produção. Nenhuma lib de
  gráfico, ícone, data-grid, animação, date, ou CSS-in-JS pesada para remover.
  **Não há dependência morta a tirar** — verificado com grep de cada
  dependência antes de concluir isso.

Ou seja: a "sensação de cockpit" citada no pedido não vem de bundle pesado
nem de bibliotecas erradas — vem de **densidade de informação em duas telas
específicas** e de **uma pequena ambiguidade de navegação**. É isso que este
passo ataca.

## 1. Perfis de usuário (confirmado em `src/lib/auth.ts` e `nav.tsx`)

| Papel (`users.role`) | Jornada principal | Rotas |
|---|---|---|
| `gt` | Preencher performance semanal por conta | `/gt`, `/gt/[id]` |
| `account` | Registrar check-in por contato | `/account`, `/account/[id]` |
| `social` (+ admin) | Aprovar/planejar/publicar social media | `/social/**`, `/a/[token]` (cliente, sem login) |
| `coord` (+ `is_admin`) | Visão da carteira, planos, configuração, modelo | `/`, `/clientes/[id]`, `/config`, `/modelo` |
| `is_admin` (Felipe/Michelle por padrão) | Gestão de acesso | `/usuarios` |

Acesso é fechado (sem cadastro público), sessão em banco (`sessions` table),
trava real em `requireUser`/`requireAdmin`/`requireSocial` chamada em toda
página e em toda mutação — não só na navegação. Isso é sólido.

**Pergunta em aberto (não decidi sozinho — é decisão de produto/segurança,
não de UI):** `/config` e `/modelo` só chamam `requireUser()`, não
`requireAdmin()`/checagem de papel. Qualquer usuário autenticado — inclusive
`gt`, `account` ou `social` — consegue hoje abrir `/config` e **alterar os
pesos do modelo, mexer no cadastro de clientes e disparar o recompute
manual**, porque o link também aparece pra todo mundo no menu (`nav.tsx`,
`LINKS`, sem `admin: true` em `/config`). Pode ser intencional (equipe pequena,
confiança alta) ou pode ser uma lacuna. Não restringi o acesso nesta rodada
porque é uma mudança de comportamento de negócio, não de UI — decidam e eu
aplico o `requireAdmin()`/filtro de menu equivalente ao que já existe em
`/usuarios`.

## 2. Mapa de jornadas (visão por tela)

- **GT** (`/gt` → `/gt/[id]`): lista por GT, pendências em destaque, um
  formulário por vez. **Já resolve bem o problema** — não mexi.
- **Account** (`/account` → `/account/[id]`): idem, cartões com CTA único de
  largura cheia no mobile. **Já resolve bem** — não mexi.
- **Coordenação — carteira** (`/`): 5 KPIs → triagem por exceção (4 caixas) →
  tabela completa → planos/renovações. Ordem de prioridade já correta
  (exceção antes do universo completo). **Já resolve bem** — não mexi.
- **Coordenação — cliente** (`/clientes/[id]`): **era a tela mais densa do
  sistema** (585 linhas): cabeçalho de score + curva, overrides, panorama +
  perda, **um painel cheio por dimensão (até 5, sempre abertos)**, heatmap de
  check-ins, planos + form, 2 tabelas de histórico, metas. Onze blocos de
  informação simultânea antes de rolar. Este é o "cockpit" citado no pedido.
  **Corrigido nesta rodada** (seção 4).
- **Configuração** (`/config`): mistura CRUD de clientes + form de
  cliente + calibração de pesos + time + operação/recompute numa página só.
  Denso, mas de uso raro (configuração, não operação diária) — documentado
  como P2 (seção 6), não mexido agora por ser uma reestruturação maior e
  porque toca em uma tela que já usa o padrão cartão/tabela responsivo
  corretamente.
- **Modelo** (`/modelo`): página de referência (documentação viva do
  modelo). Só leitura, sem ação — densa mas correta para o que é: um manual.
  Não é "cockpit", é glossário. Não mexi.
- **Social** (`/social`, `/social/projetos/[id]`, `/social/planejamento`,
  `/a/[token]`): bem segmentado por tela (lista → projeto → aprovação do
  cliente). Não mexi na estrutura.
- **Usuários** (`/usuarios`, admin-only): correto, já usa
  `requireAdmin`. Não mexi.

## 3. Problemas encontrados, por categoria

### UX / hierarquia / ambiguidade de ação (P0/P1)
1. **Topbar duplicava a navegação da sidebar com ambiguidade de contexto**
   (`components/nav.tsx#Topbar`): botões fixos "Performance" (→ `/gt`) e
   "Check-in" (→ `/account`) apareciam em **toda** página, para **todo**
   usuário, independentemente do papel ou da rota atual. Na própria página
   `/gt`, o botão "Performance" apontava para a página em que o usuário já
   estava; o mesmo para "Check-in" em `/account`. Ação duplicada (já existe
   na sidebar, com ícone, hint e estado ativo) e por vezes um no-op. — **P1,
   corrigido**.
2. **`/clientes/[id]` mostrava tudo sempre aberto**, inclusive as 3-5
   dimensões que já estão saudáveis (verde) — o usuário tinha que rolar por
   texto e barras de dimensões sem problema para chegar às que realmente
   precisam de decisão. Contraria diretamente o princípio "mostre o que
   precisa de ação, esconda o que já está bem". — **P1, corrigido**.
3. **`/config` sem controle de acesso por papel** enquanto expõe ações
   sensíveis (pesos do modelo, recompute manual). Ver seção 1 — **pergunta em
   aberto**, não decidi sozinho.

### UI (P1 já corrigido / P2 documentado)
4. **Cinco erros reais de React hooks** (não warnings de estilo — a regra
   `react-hooks/refs` e `react-hooks/set-state-in-effect` do
   `eslint-config-next` mais novo trata isso como erro de correção):
   - `client-approval.tsx`: `undoStack` e `dragging` eram `useRef` lidos
     durante o render (para decidir se o botão "Desfazer" aparece e se o
     card em arraste tem transição). Ref não garante re-render — funcionava
     "por acidente" porque outro `setState` no mesmo evento acabava
     re-renderizando junto. Virou bug latente: em qualquer refactor futuro
     que remova esse "acidente", o botão Desfazer passaria a ficar com
     estado visual desatualizado. Corrigido: viraram `useState`.
   - `project-workspace.tsx`: `guestUrl` era `useState("") + useEffect` só
     para ler `window.location.origin` — clássico "sincronizar estado
     externo via efeito" que o React recomenda evitar. Corrigido com
     `useSyncExternalStore` (mesmo padrão que `nav.tsx` já usa para a
     preferência de menu recolhido), sem efeito e sem risco de cascata de
     render.
   - `project-workspace.tsx`: dependência de `useMemo` computada
     (`fileNames.join("|")`) — o linter novo exige expressões simples na
     lista de dependências. Corrigido usando `files` (identificador simples)
     como dependência, com o mesmo comportamento.
5. **6 warnings de `<img>` nativo** (`no-img-element`) em
   `client-approval.tsx`, `instagram-preview.tsx`, `project-workspace.tsx`,
   `planejamento/page.tsx`. Não são erros e **não bloqueiam** `npm run
   lint`. Não troquei por `next/image` nesta rodada porque as imagens vêm de
   Vercel Blob/URLs dinâmicas de cliente e `next.config.ts` hoje não declara
   nenhum `images.remotePatterns` — trocar sem configurar os domínios corretos
   quebraria a exibição em produção. **Documentado como P2** (seção 6),
   precisa de decisão sobre quais domínios de imagem confiar antes de mexer.

### Performance
6. **Nenhuma dependência morta.** Conferido via grep de cada entrada de
   `package.json` (`next`, `react`, `react-dom`, `@neondatabase/serverless`,
   `@vercel/blob` — todas em uso ativo e correto). Nada removido, nada a
   remover.
7. **Todas as rotas são `export const dynamic = "force-dynamic"`.** Faz
   sentido para um dashboard de saúde de carteira que muda com recompute
   diário e ações manuais — não é um bug, é a escolha certa dado que quase
   toda tela reflete estado mutável e o usuário não pode ver dado velho.
   **Não mexi.** Se algum dia quiserem ganhar TTFB em telas mais estáveis
   (ex.: `/modelo`, que é praticamente estático — só muda com calibração
   trimestral), dá para trocar por `revalidate` longo + `revalidatePath` nas
   actions que gravam peso/config. Fica como **P3** (baixo risco, baixo
   ganho, não crítico).
8. **Camada de dados já em lote** (ver seção 0) — nada a corrigir aqui.

### Duplicação / consolidação de componentes
9. Não encontrei componentes verdadeiramente duplicados (ex.: duas
   implementações de tabela, dois modais). `Panel`, `CardList`/`CardRow`,
   `TableScroll` já são reutilizados de forma consistente em todas as telas
   administrativas. O padrão "cartão no mobile + tabela no desktop" é
   repetido propositalmente linha a linha (é o padrão do design system, não
   uma duplicação acidental).

## 4. O que foi implementado nesta rodada (P0/P1 seguros e reversíveis)

Todas as mudanças abaixo são cirúrgicas, não tocam em lógica de negócio,
schema ou cálculo de score, e foram validadas com `typecheck` + `lint` +
`build` + `test` limpos.

1. **`src/components/nav.tsx`** — removidos os botões fixos "Performance" /
   "Check-in" do `Topbar` (desktop). A navegação para essas rotas continua
   disponível, com mais contexto (ícone, hint, estado ativo), na sidebar e na
   barra de abas mobile — nada ficou inacessível. Elimina ação duplicada e
   ambígua (às vezes apontava para a própria página atual).
2. **`src/components/ui.tsx`** — `Panel` ganhou um modo opcional
   `collapsible`/`defaultOpen` que renderiza um `<details>/<summary>` nativo
   (sem JS extra, sem novo componente client, acessível por teclado por
   padrão) em vez do `<section>` de sempre. Comportamento de todo `Panel`
   existente que **não** passa essas props é idêntico a antes — mudança
   aditiva, não houve breaking change nos ~20 outros usos do componente.
3. **`src/app/clientes/[id]/page.tsx`**:
   - Os painéis de "Decomposição do score" (um por dimensão) agora nascem
     **recolhidos quando a dimensão está verde** e **abertos quando está
     amarela/vermelha/sem dado** — a atenção vai direto para o que precisa de
     ação, sem perder a possibilidade de abrir qualquer dimensão saudável
     para conferência. Critério de abertura é objetivo (banda calculada),
     não um comportamento aleatório.
   - "Metas vigentes" (informação de referência, editada em `/config`, raramente
     consultada nesta tela) agora nasce recolhida.
   - Texto de apoio da seção atualizado para explicar o comportamento.
4. **Correção de 5 erros reais de React hooks** (não cosméticos — afetam
   corretude/robustez, ver seção 3.4): `src/components/social/client-approval.tsx`
   e `src/components/social/project-workspace.tsx`.

Nenhuma rota, schema, action de servidor, cálculo de score ou contrato de API
foi alterado. Nenhuma dependência foi adicionada ou removida.

## 5. Itens já bons — preservados de propósito

- Gráficos autorais e acessíveis (`charts.tsx`, `score-chart.tsx`).
- Ícones inline, sem lib.
- Camada de dados em lote, sem N+1.
- Responsivo mobile (cartão/tabela, gaveta de filtros, barra de abas).
- Jornadas de GT e Account (uma tarefa por tela, CTA único e claro).
- Controle de acesso em `/usuarios`, `/social` (via `requireAdmin`/`requireSocial`).
- `package.json` enxuto.

## 6. Plano priorizado

### P0 — crítico
- Nenhum problema de "quebra" ou perda de dado foi encontrado. O único item
  que se aproxima de P0 é a **pergunta em aberto de acesso a `/config`**
  (seção 1/3.3) — decisão de produto/segurança, não implementada sem
  confirmação.

### P1 — fricção significativa (implementado nesta rodada)
- Remover ação duplicada/ambígua no Topbar. ✅
- Reduzir densidade simultânea em `/clientes/[id]` (accordion por banda). ✅
- Corrigir os 5 erros reais de hooks (ref durante render, setState em efeito,
  deps de memo). ✅

### P2 — melhoria de clareza, não urgente (documentado, não implementado)
- Decidir o acesso a `/config`/`/modelo` por papel (ver 3.3) e aplicar
  `requireAdmin()`/filtro de menu equivalente ao de `/usuarios`, se for essa
  a decisão.
- Reestruturar `/config` em seções mais isoladas (ex.: abas ou accordions
  para "Carteira", "Calibração", "Time", "Operação") — hoje funciona, mas
  mistura 4 preocupações administrativas distintas numa rolagem só.
- Trocar `<img>` por `next/image` em `client-approval.tsx`,
  `instagram-preview.tsx`, `project-workspace.tsx` e
  `social/planejamento/page.tsx` — depende de mapear e declarar
  `images.remotePatterns` para o(s) domínio(s) real(is) do Vercel Blob e de
  qualquer CDN do Instagram usada, para não quebrar a exibição.
- Avaliar se as duas tabelas de histórico bruto em `/clientes/[id]`
  ("Snapshots de performance" / "Check-ins") também deveriam nascer
  recolhidas — hoje ficaram abertas de propósito (são a fonte primária de
  auditoria do dado manual), mas podem ser candidatas se o feedback de uso
  mostrar que raramente são consultadas.

### P3 — refinamento estético / ganho marginal
- `revalidate` mais longo + `revalidatePath` direcionado em rotas
  praticamente estáticas (`/modelo`) em vez de `force-dynamic` universal —
  ganho pequeno de TTFB, risco de dado velho se mal calibrado.
- Padronizar cores inline restantes de `client-approval.tsx`/`project-workspace.tsx`
  (`style={{ color: "var(--v4-green)" }}` etc.) para classes utilitárias,
  por consistência de codebase — sem efeito visível ao usuário.

## 7. Validação final

- `npm run typecheck` — limpo.
- `npm run lint` — 0 erros, 6 warnings (`no-img-element`, ver P2).
- `npm run build` — limpo, todas as rotas compiladas.
- `npm run test` — 20/20 testes do motor de scoring, sem alteração.
