# Cobrança — invoice automático mensal

Módulo de cobrança em **Configurações › Cobrança** (`/config/cobranca`, admin-only).
Cadastra parcelas por cliente (valor, vencimento, única ou mensal) e dispara a fatura
sozinho no vencimento, 0h de São Paulo.

## Como funciona

1. Em `/config/cobranca`, **Nova cobrança**: escolhe o cliente, descrição, valor,
   vencimento e recorrência — e o e-mail/WhatsApp para onde a fatura vai. O contato fica
   salvo no cliente (`clients.billing_email`/`billing_phone`), então a próxima cobrança do
   mesmo cliente já vem pré-preenchida.
2. Um cron da Vercel (`vercel.json`, `0 3 * * *` UTC = 0h BRT) chama
   `POST /api/billing/dispatch`, que busca as parcelas ativas vencendo **hoje** e dispara
   um e-mail (Resend) e/ou uma mensagem de WhatsApp (Meta Cloud API) por cliente.
3. **Recorrência mensal:** depois de disparar, a própria parcela avança o vencimento em 1
   mês — não precisa recriar nada. Recorrência única fica ali, só para o histórico.
4. Cada tentativa de envio grava uma linha em `billing_dispatch_log` (cliente, parcela,
   canal, sucesso/falha, motivo do erro) — é o "Histórico de disparo" na tela. O e-mail
   carrega um pixel de rastreio (`/api/billing/track/<token>`) que marca `opened_at` na
   primeira abertura.

## Sem as envs abaixo, nada é enviado de verdade

Por padrão o sistema **não manda nenhuma mensagem real** — cada canal só é tentado se a
env dele estiver configurada; sem ela, o disparo daquele canal é pulado (não conta como
falha) e nada sai do ambiente. Isso é proposital: liga a automação um canal de cada vez,
depois de testar.

| Variável | Para quê |
|---|---|
| `RESEND_API_KEY` | Chave da API do [Resend](https://resend.com) — canal de e-mail. |
| `BILLING_FROM_EMAIL` | Remetente (`Nome <faturas@seudominio.com>`), precisa de domínio verificado no Resend. |
| `WHATSAPP_TOKEN` | Token de acesso da Meta Cloud API (WhatsApp Business Platform). |
| `WHATSAPP_PHONE_ID` | `phone_number_id` do número remetente, cadastrado no Meta Business Manager. |
| `WHATSAPP_TEMPLATE_NAME` | Nome do template **aprovado** para cobrança (mensagem iniciada pela empresa exige template). |
| `WHATSAPP_TEMPLATE_LANG` | Idioma do template (padrão `pt_BR`). |
| `BILLING_DISPATCH_TOKEN` | Opcional — protege `POST /api/billing/dispatch` fora do cron da Vercel (que já se autentica com `CRON_SECRET`). |

O template do WhatsApp precisa de **4 variáveis de corpo, nesta ordem**: nome do cliente,
descrição da cobrança, valor formatado, data de vencimento formatada.

## Testar antes do vencimento chegar

Botão **"Testar disparo agora"** em `/config/cobranca` roda o mesmo job do cron na hora,
para qualquer parcela vencendo hoje — útil para validar a chave do Resend/WhatsApp sem
esperar o próximo vencimento.

## Mapa rápido do código

| Peça | Caminho |
|---|---|
| Tabelas (DDL) | `src/lib/db/index.ts` (`billing_charges`, `billing_dispatch_log`, `clients.billing_email/phone`) |
| Repositório | `src/lib/billing/db.ts` |
| Envio de e-mail (Resend) | `src/lib/billing/email.ts` |
| Envio de WhatsApp (Meta Cloud API) | `src/lib/billing/whatsapp.ts` |
| Orquestração do disparo diário | `src/lib/billing/dispatch.ts` |
| Cron | `src/app/api/billing/dispatch/route.ts` |
| Pixel de rastreio de abertura | `src/app/api/billing/track/[token]/route.ts` |
| Server actions | `src/actions/billing.ts` |
| Painel | `src/app/config/cobranca/page.tsx`, `src/components/billing-manager.tsx` |
