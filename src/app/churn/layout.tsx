import { requireUser } from "@/lib/auth";

/**
 * Churn: solicitações de cancelamento já formalizadas pelo cliente — da
 * análise ao encerramento ou retenção — e o histórico para entender por que
 * os clientes saem.
 */
export default async function ChurnLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="flex flex-col gap-6">{children}</div>;
}
