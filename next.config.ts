import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (Postgres local em WASM, só em desenvolvimento) carrega os próprios
  // .wasm do node_modules — precisa ficar fora do bundle do servidor.
  serverExternalPackages: ["@electric-sql/pglite"],
  images: {
    // AVIF/WebP servidos conforme o Accept do navegador; o cliente recebe a
    // versão do tamanho que a tela usa em vez da arte em resolução cheia.
    formats: ["image/avif", "image/webp"],
    qualities: [70, 75],
    remotePatterns: [
      // Artes das aprovações vivem no Vercel Blob público.
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
    ],
  },
  // Áreas administrativas saíram do menu principal e foram para dentro de
  // Configurações. Os endereços antigos continuam valendo para quem salvou.
  async redirects() {
    return [
      { source: "/usuarios", destination: "/config/usuarios", permanent: true },
      { source: "/integracoes", destination: "/gt/integracoes", permanent: true },
      { source: "/modelo", destination: "/config/modelo", permanent: true },
      // Redesign de Configurações: calibração e modelo viraram uma página só.
      { source: "/config/calibracao", destination: "/config/modelo", permanent: true },
      // Integrações e canais de envio saíram de Configurações e foram para
      // Performance, junto das metas — o preenchimento manual acabou.
      { source: "/config/integracoes", destination: "/gt/integracoes", permanent: true },
      { source: "/config/canais", destination: "/gt/canais", permanent: true },
      // Clientes saiu de Configurações e virou item do menu lateral.
      { source: "/config/clientes", destination: "/clientes", permanent: true },
    ];
  },
};

export default nextConfig;
