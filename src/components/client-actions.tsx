"use client";

import { useState } from "react";
import { setClientArchived } from "@/actions";
import type { User } from "@/lib/model/types";
import { ActionMenu } from "./action-menu";
import { ClientDialog, type ClientFormClient } from "./client-form";
import { ConfirmDialog } from "./modal";
import { toast } from "./toast";
import { Icon } from "./icon";

/** ⋯ da ficha do cliente: editar cadastro/metas e arquivar, sem sair da página. */
export function ClientActions({
  client,
  users,
  targets,
  size,
}: {
  client: ClientFormClient;
  users: User[];
  targets: Record<string, number>;
  /** Botão quadrado do cabeçalho da ficha (36px; 42px no celular). */
  size?: "md" | "lg";
}) {
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  return (
    <>
      <ActionMenu
        label="Mais ações do cliente"
        trigger={
          size ? (
            <span
              className={`flex items-center justify-center rounded-lg border border-[var(--border-strong)] bg-ink-850 text-ink-100 hover:bg-ink-800 ${
                size === "lg" ? "h-[42px] w-[42px]" : "h-9 w-9"
              }`}
            >
              <Icon name="dots" size={16} />
            </span>
          ) : undefined
        }
        items={[
          { label: "Editar cadastro e metas", icon: "settings", onSelect: () => setEditing(true) },
          ...(client.active
            ? [{ label: "Registrar pedido de cancelamento", icon: "userMinus" as const, href: `/churn/nova?cliente=${client.id}` }]
            : []),
          "separator",
          client.active
            ? { label: "Arquivar cliente", icon: "lock", hint: "Sai da carteira, mantém o histórico", onSelect: () => setArchiving(true) }
            : {
                label: "Restaurar para a carteira",
                icon: "refresh",
                onSelect: async () => {
                  const r = await setClientArchived(client.id, false);
                  if (r?.error) toast(r.error, { tone: "error" });
                  else if (r?.ok) toast(r.ok);
                },
              },
        ]}
      />
      <ClientDialog open={editing} onClose={() => setEditing(false)} users={users} client={client} targets={targets} />
      <ConfirmDialog
        open={archiving}
        onClose={() => setArchiving(false)}
        title={`Arquivar ${client.name}?`}
        confirmLabel="Arquivar"
        tone="default"
        pendingLabel="Arquivando…"
        onConfirm={() => setClientArchived(client.id, true)}
      >
        <p>
          O cliente sai da carteira, da triagem e dos formulários de GT e Account. O histórico fica guardado e dá para
          restaurar em Clientes › Arquivados.
        </p>
      </ConfirmDialog>
    </>
  );
}
