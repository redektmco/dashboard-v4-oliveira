import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Montserrat } from "next/font/google";
import "./globals.css";
import { MobileNav, Sidebar, Topbar } from "@/components/nav";
import { getSessionUser } from "@/lib/auth";

/* Montserrat = tipo oficial da marca (display).
   Inter = substituição livre para Proxima Nova no corpo/UI.
   JetBrains Mono = IDs e numéricos de tabela. */
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-montserrat",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "Health Score — V4 Oliveira & Co",
  description:
    "Saúde da carteira da unidade a partir do input manual de GT e Account. Nosso negócio é vender o seu.",
};

/* `viewportFit: cover` deixa a página ir até a borda do iPhone; quem
   devolve a margem do notch e do gesto são as `env(safe-area-inset-*)`
   usadas na moldura mobile. `maximumScale` fica de fora de propósito —
   travar o zoom é barreira de acessibilidade, e o zoom indesejado do
   iOS já foi resolvido na origem, com campos de 16px. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d0d0d",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Sem sessão a única rota alcançável é /login, que não usa a moldura do app.
  const user = await getSessionUser();
  const perfil = user ? { name: user.name, isAdmin: Boolean(user.is_admin) } : null;

  return (
    <html
      lang="pt-BR"
      className={`${montserrat.variable} ${inter.variable} ${jetbrains.variable}`}
    >
      <body className="flex min-h-screen">
        {user && perfil ? (
          <>
            <Sidebar isAdmin={perfil.isAdmin} />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar user={perfil} />
              <MobileNav user={perfil} />
              <main className="app-main mx-auto w-full max-w-[1480px] px-4 pt-5 sm:px-6 lg:px-7 lg:pt-6">
                {children}
              </main>
            </div>
          </>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
