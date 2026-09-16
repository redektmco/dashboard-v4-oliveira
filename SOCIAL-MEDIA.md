# Social media — como funciona e o que falta

Módulo de **aprovação de criativos (post, carrossel, Reels e Stories) + planejamento de
conteúdo**, integrado ao dashboard sob a aba **Social media** (`/social`).

> Status: código integrado, build OK. O schema novo (colunas `format` e `client_key` em
> `sm_posts`) é aplicado sozinho no primeiro boot depois do deploy (`SCHEMA_VERSION`).

---

## 1. Formatos

| Formato | Mídia | Como o cliente vê |
| --- | --- | --- |
| Post | 1 imagem (ou vídeo) | mock do feed do Instagram |
| Carrossel | 2+ mídias no mesmo criativo (derivado da quantidade) | feed com paginação |
| Reels | 1 vídeo vertical 9:16 | card vertical com legenda; tela cheia |
| Story | 1+ frames verticais 9:16 (imagem ou vídeo), aprovados como um conjunto | bandeja de Stories no topo do link + viewer em tela cheia no idioma do Instagram |

### O link do cliente (`/a/<token>`)

Quatro telas, uma tarefa cada — sem menu escondido e sem cabeçalho ocupando a
dobra:

| Tela | O que faz |
| --- | --- |
| **Início** | Quem pediu, quantas artes, o placar (aprovadas · reprovadas · pendentes) e um único botão: *Começar / Continuar / Revisar*. |
| **Avaliar** | Uma arte por vez. Arrasta para o lado ou usa os botões grandes (Reprovar · Comentar · Aprovar) — todos com rótulo escrito. Desfazer fica ao lado. |
| **Galeria** | Todas as artes em grade, filtráveis por situação. O coração aprova direto da grade. |
| **Lista** | A mesma informação em texto, com a legenda e o comentário já enviado. |

A troca é por uma barra flutuante (Início · Avaliar · Galeria · Lista) que
some na tela de início. **Carrossel e Stories têm setas de verdade** nas
laterais da arte (com contador e barras de progresso) — no card, na folha de
detalhe e na prévia do painel; antes só existia o toque na metade certa da
imagem, que ninguém descobria.

No card de avaliação a arte entra **inteira** (`contain` sobre um fundo
desfocado dela mesma) e o card assume a proporção do arquivo, entre 9:16 e
1.91:1 — o cliente decide sobre o que vai ser publicado, não sobre um corte.
A prévia fiel do feed do Instagram (com o mock de header, ações e legenda)
fica na folha de detalhe, junto do campo de comentário e da decisão.

**Stories no link do cliente:** a bandeja mostra um círculo por Story (gradiente = pendente,
verde = aprovado, vermelho = reprovado). O viewer tem barra de progresso por frame, toque à
direita avança, à esquerda volta, segurar pausa, arrastar para baixo fecha; setas/Esc no
desktop. Aprovar/Reprovar (com comentário apontando o frame) ficam no rodapé. Um Story
pendente **não passa sozinho** para o próximo — o viewer para no último frame esperando a
decisão. O relógio do frame só anda depois de a mídia carregar.

**No painel:** o composer tem Formato (Post/Carrossel · Reels · Stories) × Quantidade
(Um criativo · Em lote). "Um criativo" junta os arquivos num carrossel ou numa sequência de
Stories; "Em lote" cria um criativo por arquivo. Tudo tem pré-visualização (inclusive tela
cheia) **antes** de "Enviar para aprovação" — só nesse clique o criativo vai para o link.

## 2. Upload (por que o lote quebrava e como funciona agora)

**Causa do erro no lote:** o upload mandava todos os arquivos numa única requisição
multipart para `/api/social/projects/[id]/posts`. Com o `proxy.ts` ativo, o Next bufferiza o
corpo e **trunca em 10 MB** (`proxyClientMaxBodySize`); o multipart truncado não parseia e a
rota respondia `invalid form`. Três fotos de ~4 MB já passavam do limite. Além disso o
processamento era sequencial e tudo-ou-nada, arquivos já enviados ao Blob ficavam órfãos
quando um falhava, e a mensagem de erro era genérica.

**Agora:**
- O navegador envia cada arquivo **direto ao Vercel Blob** (`@vercel/blob/client`), 3 por vez,
  com progresso por arquivo e multipart acima de 8 MB. `/api/social/upload` só emite um token
  curto (só para quem opera Social, só para `social/<projectId>/`, só imagem/vídeo no limite).
- Depois, `POST /api/social/projects/[id]/posts` recebe **JSON** com as URLs e devolve o
  resultado **por item** — um arquivo ruim não derruba os outros.
- **Idempotência:** cada criativo leva uma `client_key` (hash de nome+tamanho+data do arquivo);
  índice único por projeto. O composer pergunta antes de subir quais já existem, e reenviar
  depois de falha parcial não duplica nem sobe de novo.
- Limites: imagem 30 MB, vídeo 500 MB. HEIC é recusado com instrução ("exporte como JPG").
  Proporção fora do formato gera aviso (feed fora de 4:5–1.91:1; Story/Reels fora de 9:16).
- **Sem órfãos:** excluir post/projeto apaga as mídias do Blob (`deleteAssets`, depois da
  resposta); upload que não virou post é apagado quando o usuário descarta ou sai da página.

## 3. Postagem automática no Instagram — DESCARTADA

Removidos o worker `/api/social/publish`, o seam da Graph API e o cron. A data no calendário
(`/social/planejamento`) é um plano; a postagem é **manual** e o time marca "publicado" pelo
menu do criativo. As colunas `ig_user_id`/`ig_access_token` seguem no schema (reversível).

## 4. Gestão

- Projeto: editar (título, cliente, @), arquivar (sai das listas, do calendário e o link do
  cliente para de abrir), **restaurar** em Social media › Arquivados, excluir (digitando o nome).
- Criativo: visualizar, editar legenda/observação, data no calendário, marcar publicado,
  voltar para pendente, excluir.

## 5. Verificações em produção

- [ ] `BLOB_READ_WRITE_TOKEN` nos escopos Preview e Production (`vercel env ls`).
- [ ] Testar o link do cliente num celular real — swipe, grade, lista, Stories, desfazer.
- [ ] (Opcional) `SOCIAL_NOTIFY_WEBHOOK` com uma Incoming Webhook (Slack/Discord/Zapier):
      avisa a equipe quando o cliente termina de avaliar. Sem a env, é no-op.
- [ ] (Opcional) `RECOMPUTE_TOKEN` para proteger `/api/recompute` (o cron da Vercel é aceito
      pelo `CRON_SECRET`).

---

## Mapa rápido do código

| Peça | Caminho |
| --- | --- |
| Tabelas (DDL) | `src/lib/db/index.ts` (`sm_projects`, `sm_posts`) |
| Repositório | `src/lib/social/db.ts` |
| Tipos | `src/lib/social/types.ts` |
| Regras de mídia (cliente+servidor) | `src/lib/social/media.ts` |
| Storage (Blob) | `src/lib/social/storage.ts` |
| Token de upload / limpeza | `src/app/api/social/upload/route.ts` |
| Criação de criativos (JSON) | `src/app/api/social/projects/[id]/posts/route.ts` |
| Composer | `src/components/social/composer.tsx` |
| Viewer de Stories | `src/components/social/story-viewer.tsx` (+ `story-nav.ts`, `story.css`) |
| Card vertical / bandeja / etiqueta | `src/components/social/vertical-preview.tsx` |
| Notificação da equipe | `src/lib/social/notify.ts` (env `SOCIAL_NOTIFY_WEBHOOK`) |
| Lista de projetos | `src/app/social/page.tsx` + `src/components/social/project-list.tsx` |
| Planejamento | `src/app/social/planejamento/page.tsx` |
| Workspace do projeto | `src/components/social/project-workspace.tsx` |
| Cliente (swipe, guest) | `src/app/a/[token]/` + `src/components/social/client-approval.tsx` |
| CSS do link do cliente | `src/components/social/client-approval.css` (escopo `.ap`) |
| Decisão do cliente (API) | `src/app/api/g/[token]/decision/route.ts` |
| Tokens + mock do Instagram | `src/app/social/approval.css` (`.sm-scope`) |
| Acesso/roles | `src/lib/auth.ts` (`canManageSocial`, `requireSocial`), role `social` |

Migração forçada do schema: `npm run migrate:social`.
