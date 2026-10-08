import { redirect } from "next/navigation";

/**
 * O formulário semanal do GT acabou: performance vem só das integrações e o
 * que se ajusta à mão são as metas. Links antigos abrem as metas do cliente.
 */
export default async function GtClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/gt?c=${encodeURIComponent(id)}`);
}
