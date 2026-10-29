"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { resyncClientMedia } from "@/actions";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";

/**
 * "Sincronizar" da ficha: relê da Meta e do Google as 12 últimas semanas das
 * contas do cliente (com a regra de leitura atual) e recalcula o score —
 * sem esperar o sync da madrugada.
 */
export function SyncClientButton({ clientId }: { clientId: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn"
      disabled={pending}
      aria-busy={pending}
      title="Relê as 12 últimas semanas da Meta e do Google deste cliente e recalcula o score"
      onClick={() =>
        start(async () => {
          try {
          const r = await resyncClientMedia(clientId);
          if (r?.error) toast(r.error, { tone: "error" });
          else if (r?.ok) toast(r.ok);
          router.refresh();
          } catch {
            toast("Não foi possível sincronizar. Confira a conexão e tente novamente.", { tone: "error" });
          }
        })
      }
    >
      {pending ? <span className="spinner" aria-hidden /> : <Icon name="refresh" size={16} />}
      {pending ? "Sincronizando…" : "Sincronizar"}
    </button>
  );
}
