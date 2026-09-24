import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Checagem otimista: só olha se existe cookie de sessão, sem tocar o banco.
 * A validação de verdade acontece no layout e em cada Server Action
 * (`requireUser` / `requireAdmin`) — Server Actions não passam por aqui de
 * forma confiável, então o proxy nunca é a única trava.
 *
 * Por ser otimista, ele só *protege* rota — nunca manda ninguém para fora do
 * `/login`. O cookie pode existir sem a sessão valer: expirou, o usuário foi
 * desativado, ou a senha foi resetada (`resetPassword` apaga as sessões, e o
 * navegador segue com o cookie). Mandar essa pessoa para `/` faria o
 * `requireUser` devolvê-la para `/login`, e o par entraria em loop infinito
 * — "a página não está sendo redirecionada corretamente". Quem de fato já
 * está logado é redirecionado dentro do próprio `/login`, que consulta o
 * banco antes de decidir.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const { pathname, search } = request.nextUrl;
  const isLogin = pathname === "/login";

  if (!hasSession && !isLogin) {
    // API responde 401 em JSON: um redirect para a página de login faria o
    // fetch receber HTML e mostrar um erro sem sentido no meio de um upload.
    if (pathname.startsWith("/api/"))
      return NextResponse.json({ error: "Sessão expirada. Entre de novo para continuar." }, { status: 401 });
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("de", pathname + search);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Fora da trava: estáticos, favicon/ícones (icon.png, apple-icon.png), a
  // marca em /public, o recompute e o sync do Meta Ads (cron, por
  // token), o webhook de leads do CRM (`/api/integrations/webhook/<token>`),
  // além das rotas públicas do cliente de Social media — o link de aprovação
  // `/a/<token>` e sua API de decisão `/api/g/...`, todos protegidos por token
  // na URL. `/api/billing/` também fica fora: o cron de cobrança tem sua
  // própria checagem de token, e o pixel de rastreio (`/api/billing/track/
  // <token>`) precisa carregar dentro do e-mail do cliente, sem sessão nenhuma.
  //
  // O arquivo das artes não passa por aqui de propósito: o navegador pede um
  // token pequeno em `/api/social/upload` e envia o arquivo direto ao Vercel
  // Blob. Com o arquivo no caminho, o Next bufferiza o corpo e o trunca em
  // 10 MB (`proxyClientMaxBodySize`) — era isso que quebrava o upload em lote.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/|api/recompute|api/meta/sync|api/integrations/webhook/|api/billing/|a/|api/g/).*)",
  ],
};
