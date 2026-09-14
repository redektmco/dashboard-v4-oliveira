import { notFound } from "next/navigation";
import "@/app/social/approval.css";
import { requireSocial } from "@/lib/auth";
import { listClients } from "@/lib/repo";
import { getProject, listPosts } from "@/lib/social/db";
import ProjectWorkspace from "@/components/social/project-workspace";

export const dynamic = "force-dynamic";

export default async function SocialProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSocial();
  const { id } = await params;
  // Projeto, criativos e carteira em paralelo — um round-trip de espera, não três.
  const [project, posts, clients] = await Promise.all([getProject(id), listPosts(id), listClients()]);
  if (!project) notFound();

  return (
    <ProjectWorkspace
      project={project}
      initialPosts={posts}
      clients={clients.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
