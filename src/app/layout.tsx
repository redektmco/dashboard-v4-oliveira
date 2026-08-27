import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Montserrat } from "next/font/google";
import "./globals.css";
import { Sidebar, Topbar } from "@/components/nav";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${montserrat.variable} ${inter.variable} ${jetbrains.variable}`}
    >
      <body className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="mx-auto w-full max-w-[1480px] px-7 pb-16 pt-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
