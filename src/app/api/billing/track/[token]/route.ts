import { NextResponse } from "next/server";
import { markOpened } from "@/lib/billing/db";

type Ctx = { params: Promise<{ token: string }> };

/** GIF transparente 1×1 — mesmo pixel embutido no HTML da fatura. */
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

/**
 * Pixel de rastreio de abertura da fatura por e-mail. Carregado pelo
 * cliente de e-mail do destinatário ao renderizar o HTML — grava
 * `opened_at` uma vez (idempotente) e sempre devolve a imagem, mesmo que o
 * token não exista, para nunca aparecer como imagem quebrada.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  await markOpened(token).catch(() => {});
  return new NextResponse(new Uint8Array(PIXEL), {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Content-Length": String(PIXEL.length),
    },
  });
}
