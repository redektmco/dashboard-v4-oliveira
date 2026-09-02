import { notFound } from "next/navigation";
import ClientApproval from "@/components/social/client-approval";
import { getProjectByToken, listPosts } from "@/lib/social/db";

export const dynamic = "force-dynamic";

export default async function GuestApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const project = await getProjectByToken(token);
  if (!project) notFound();

  const posts = await listPosts(project.id);

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
