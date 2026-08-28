import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * Checagem otimista: só olha se existe cookie de sessão, sem tocar o banco.
 * A validação de verdade acontece no layout e em cada Server Action
 * (`requireUser` / `requireAdmin`) — Server Actions não passam por aqui de
 * forma confiável, então o proxy nunca é a única trava.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const { pathname, search } = request.nextUrl;
  const isLogin = pathname === "/login";

  if (!hasSession && !isLogin) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("de", pathname + search);
    return NextResponse.redirect(url);
  }

  if (hasSession && isLogin) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Fora da trava: estáticos, favicon, a marca em /public e o job de recompute
  // (autenticado pelo header x-recompute-token).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|api/recompute).*)"],
};
