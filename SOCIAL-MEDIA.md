# Social media — o que falta fazer

Módulo de **aprovação de criativos + planejamento + publicação automática no Instagram**,
integrado ao dashboard sob a aba **Social media** (`/social`). Este arquivo lista o que
ainda depende de você (credenciais/decisões externas) e o que vale verificar antes de
considerar 100% pronto em produção.

> Status: código integrado, build OK, schema aplicado no Neon, Blob provisionado.
> **Bloqueio principal para o auto-post:** credenciais do Instagram por projeto (abaixo).

---

## 1. Ligar a publicação automática no Instagram (obrigatório p/ auto-post)

Hoje o fluxo aprova → agenda → **fica esperando credencial**. O worker
(`/api/social/publish`) só publica de verdade quando o projeto tiver conta IG configurada.

> **Atenção ao plano da Vercel:** a conta é **Hobby**, que limita cron a **1×/dia**. Por isso
> o cron em `vercel.json` está em `5 9 * * *` (uma varredura diária). Para publicar **perto do
> horário agendado** (ex.: de 5 em 5 min), escolha uma das opções:
>
> - **Upgrade para Pro** e voltar o cron para `*/5 * * * *` em `vercel.json` (troca de 1 linha).
> - **Cron externo** (cron-job.org, GitHub Actions, EasyCron…) batendo em
>   `https://<seu-dominio>/api/social/publish` a cada poucos minutos — o endpoint é público
>   (fora do proxy). Nesse caso, **defina `RECOMPUTE_TOKEN`** e mande o header
>   `x-recompute-token` no cron externo para ninguém mais disparar.

Pré-requisitos externos (fora do nosso controle):

- [ ] **App no Meta for Developers** com o produto *Instagram Graph API* adicionado.
- [ ] Conta **Instagram Business/Creator** de cada cliente ligada a uma **Página do Facebook**.
- [ ] Gerar um **token de longa duração** (long-lived) com as permissões
      `instagram_basic`, `instagram_content_publish`, `pages_read_engagement`
      (e `business_management` se a conta estiver em um Business Manager).
- [ ] Obter o **IG Business Account ID** de cada cliente (via
      `GET /{page-id}?fields=instagram_business_account`).

Depois, dentro do dashboard:

- [ ] Abrir cada projeto em `/social/projetos/<id>` → seção **"Conta Instagram"** →
      colar o **IG Business Account ID** e o **token**. Pronto: o próximo ciclo do cron publica.

Limitações conhecidas do seam atual (`src/lib/social/instagram.ts`):

- [ ] Cobre **imagem única e carrossel**. **Reels/vídeo** exigem polling assíncrono do
      status do container — ainda não implementado.
- [ ] Token de longa duração **expira em ~60 dias**. Definir um plano de renovação
      (refresh periódico) ou reautenticação — hoje não há refresh automático.
- [ ] O token é guardado em texto na coluna `sm_projects.ig_access_token`. Aceitável para
      uso interno; se quiser, migrar para cofre/criptografia depois.

## 2. Verificações em produção

- [ ] Confirmar que `BLOB_READ_WRITE_TOKEN` existe também nos escopos **Preview** e
      **Production** na Vercel (o `create-store` costuma propagar; conferir em
      `vercel env ls`).
- [ ] Confirmar que os **crons** aparecem no projeto após o deploy de produção
      (`/api/recompute` e `/api/social/publish`).
- [ ] Testar o **link do cliente** (`/a/<token>`) num dispositivo móvel real — swipe,
      grade, lista, desfazer e comentário.
- [ ] Testar upload (post único e em lote) validando que as imagens sobem para o Blob e
      aparecem no preview do cliente.
- [ ] (Opcional) Definir `RECOMPUTE_TOKEN` na Vercel para proteger os endpoints de cron
      — hoje `/api/social/publish` e `/api/recompute` ficam abertos (fora do proxy).
      Se definir, garantir que o cron da Vercel envie o header/segredo esperado.

## 3. Acessos e conteúdo

- [ ] Criar os usuários do time de social em `/usuarios` com o papel **Social Media**.
- [ ] Popular os primeiros projetos por cliente e enviar o link de aprovação.

## 4. Ideias / melhorias futuras (não bloqueiam)

- [ ] Arquivar projeto (a coluna `archived` já existe; falta o botão na UI).
- [ ] Notificar a equipe quando o cliente termina de avaliar um projeto.
- [ ] Editar legenda de um post já subido pela UI (o `PATCH` já aceita `caption`).
- [ ] Suporte a vídeo/Reels no publicador.
- [ ] Métricas pós-publicação (alcance/likes) puxando de volta da Graph API.

---

## Mapa rápido do código

| Peça | Caminho |
| --- | --- |
| Tabelas (DDL) | `src/lib/db/index.ts` (`sm_projects`, `sm_posts`) |
| Repositório | `src/lib/social/db.ts` |
| Tipos | `src/lib/social/types.ts` |
| Storage (Blob) | `src/lib/social/storage.ts` |
| Publicação IG (seam) | `src/lib/social/instagram.ts` |
| Worker/cron | `src/app/api/social/publish/route.ts` + `vercel.json` |
| Dashboard/orgânico | `src/app/social/page.tsx` |
| Planejamento | `src/app/social/planejamento/page.tsx` |
| Workspace do projeto | `src/app/social/projetos/[id]/page.tsx` + `src/components/social/project-workspace.tsx` |
| Cliente (swipe, guest) | `src/app/a/[token]/` + `src/components/social/client-approval.tsx` |
| Decisão do cliente (API) | `src/app/api/g/[token]/decision/route.ts` |
| CSS isolado | `src/app/social/approval.css` (`.sm-scope`) |
| Acesso/roles | `src/lib/auth.ts` (`canManageSocial`, `requireSocial`), role `social` |

Migração idempotente do schema: `npm run migrate:social`.
