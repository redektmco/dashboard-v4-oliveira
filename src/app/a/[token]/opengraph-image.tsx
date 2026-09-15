import { ImageResponse } from "next/og";
import { getGuestProject } from "./_data";
import { V4_SYMBOL_PNG } from "./_og-symbol";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Aprovação de conteúdo — V4 Oliveira & Co";

const RED = "#e50914";
const INK = "#0d0d0d";
const FG = "#ffffff";
const FG_DIM = "#8a8a8a";

/** "@fulano" a partir de "fulano", "@fulano" ou vazio. */
function igLabel(handle?: string | null): string | null {
  const h = (handle || "").trim().replace(/^@+/, "");
  return h ? `@${h}` : null;
}

export default async function OgImage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const project = await getGuestProject(token);
  const cliente = (project?.clientName || project?.title || "sua marca").trim();
  const handle = igLabel(project?.igHandle);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: INK,
          padding: "72px 80px",
          position: "relative",
        }}
      >
        {/* Faixa vermelha da marca no topo */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 12,
            background: RED,
            display: "flex",
          }}
        />

        {/* Cabeçalho: símbolo + assinatura */}
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={V4_SYMBOL_PNG} width={72} height={72} alt="V4" />
          <div
            style={{
              display: "flex",
              fontSize: 30,
              fontWeight: 700,
              color: FG,
              letterSpacing: 1,
            }}
          >
            V4 Oliveira &amp; Co
          </div>
        </div>

        {/* Corpo: rótulo + cliente + handle */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: 6,
              color: RED,
            }}
          >
            APROVAÇÃO DE CONTEÚDO
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 88,
              fontWeight: 800,
              color: FG,
              lineHeight: 1.05,
            }}
          >
            {cliente}
          </div>
          {handle ? (
            <div style={{ display: "flex", fontSize: 40, color: FG_DIM }}>{handle}</div>
          ) : null}
        </div>

        {/* Rodapé: chamada para ação */}
        <div style={{ display: "flex", fontSize: 28, color: FG_DIM }}>
          Toque para revisar e aprovar os conteúdos planejados.
        </div>
      </div>
    ),
    { ...size },
  );
}
