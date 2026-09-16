import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ClientApproval from "@/components/social/client-approval";
import { listPosts } from "@/lib/social/db";
import { getGuestProject } from "./_data";

export const dynamic = "force-dynamic";

/** "@fulano" a partir de "fulano", "@fulano" ou vazio. */
function igLabel(handle?: string | null): string | null {
  const h = (handle || "").trim().replace(/^@+/, "");
  return h ? `@${h}` : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const project = await getGuestProject(token);

  // Link inválido/expirado: metadados neutros, sem vazar nada.
  if (!project) {
    return {
      title: "Aprovação de conteúdo — V4 Oliveira & Co",
      robots: { index: false, follow: false },
    };
  }

  const cliente = (project.clientName || project.title || "sua marca").trim();
  const handle = igLabel(project.igHandle);
  const title = `Aprovação de conteúdo · ${cliente}`;
  const description = handle
    ? `Revise e aprove os conteúdos de ${cliente} (${handle}) preparados pela V4 Oliveira & Co.`
    : `Revise e aprove os conteúdos de ${cliente} preparados pela V4 Oliveira & Co.`;

  return {
    title,
    description,
    // Link privado do cliente: fora de buscadores.
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      siteName: "V4 Oliveira & Co",
      type: "website",
      locale: "pt_BR",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function GuestApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const project = await getGuestProject(token);
  if (!project) notFound();

  // Rascunho é trabalho interno: o link do cliente só vê o que foi enviado.
  const posts = (await listPosts(project.id)).filter((p) => p.status !== "draft");

  return (
    <ClientApproval
      token={token}
      project={{
        id: project.id,
        title: project.title,
        clientName: project.clientName,
        igHandle: project.igHandle,
      }}
      initialPosts={posts}
    />
  );
}
