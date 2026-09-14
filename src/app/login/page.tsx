import Image from "next/image";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Entrar — Health Score V4 Oliveira & Co",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string }>;
}) {
  // Quem já está logado não precisa ver o formulário. A checagem é aqui, e não
  // no proxy, porque só aqui dá para conferir a sessão no banco: cookie
  // obsoleto (senha resetada, acesso revogado, sessão expirada) cai no
  // formulário em vez de quicar de volta para `/`. Ver src/proxy.ts.
  if (await getSessionUser()) redirect("/");

  const { de } = await searchParams;

  return (
    <div className="flex min-h-screen w-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-7 flex items-center gap-3">
          <Image src="/brand/v4-simbolo.webp" alt="V4 Company" width={34} height={34} priority />
          <span className="leading-tight">
            <span className="block font-display text-[17px] font-bold tracking-tight text-ink-100">
              Oliveira &amp; Co
            </span>
            <span className="eyebrow block">Health Score</span>
          </span>
        </div>

        <div className="panel px-6 py-6">
          <h1 className="font-display text-[20px] font-bold leading-tight tracking-tight">
            Acesso da unidade
          </h1>
          <p className="mb-5 mt-1 text-[13px] text-ink-400">
            Painel fechado. Não há cadastro aberto — quem libera acesso é a coordenação.
          </p>
          <LoginForm de={de} />
        </div>

        <p className="mt-5 text-center text-[11px] text-ink-500">
          Nosso negócio é vender o seu.
        </p>
      </div>
    </div>
  );
}
