import { notFound } from "next/navigation";
import "@/app/social/approval.css";
import { requireSocial } from "@/lib/auth";
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
  const project = await getProject(id);
  if (!project) notFound();

  const posts = await listPosts(id);

  return (
    <div className="sm-scope">
      <ProjectWorkspace project={project} initialPosts={posts} />
    </div>
  );
}
