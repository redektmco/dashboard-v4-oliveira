import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Montserrat } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { AppFrame } from "@/components/app-frame";
import { FlashFromUrl, Toaster } from "@/components/toast";
import { getSessionUser } from "@/lib/auth";
import { avisos } from "@/lib/repo";

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
  // Mono só aparece em IDs e números de tabela — nunca é o texto crítico do
  // primeiro paint. Sem preload ele entra sob demanda e libera banda p/ o LCP.
  preload: false,
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
  const perfil = user ? { name: user.name, isAdmin: Boolean(user.is_admin), role: user.role } : null;
  // Os avisos do rail nunca podem derrubar a página: banco fora do ar vira
  // sino vazio, não erro de layout.
  const pendencias = user ? await avisos().catch(() => []) : [];

  return (
    <html
      lang="pt-BR"
      className={`${montserrat.variable} ${inter.variable} ${jetbrains.variable}`}
    >
      <body className="flex min-h-screen">
        {user && perfil ? (
          <AppFrame user={perfil} avisos={pendencias}>
            {children}
          </AppFrame>
        ) : (
          children
        )}
        <Toaster />
        <Suspense fallback={null}>
          <FlashFromUrl />
        </Suspense>
      </body>
    </html>
  );
}
