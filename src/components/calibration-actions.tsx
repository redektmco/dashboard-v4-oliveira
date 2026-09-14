"use client";

import { useState, useTransition } from "react";
import { resetWeights, runRecompute } from "@/actions";
import { ConfirmDialog } from "./modal";
import { toast } from "./toast";
import { Icon } from "./icon";

/** "Voltar ao padrão" reescreve a série — pede confirmação. */
export function ResetWeightsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
        Voltar ao padrão
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Voltar pesos e limiares ao padrão?"
        confirmLabel="Voltar ao padrão"
        tone="default"
        pendingLabel="Recalculando 90 dias…"
        onConfirm={() => resetWeights()}
      >
        <p>
          A calibração atual é descartada e os últimos 90 dias da série são recalculados com os pesos padrão. Isso
          muda os scores históricos exibidos na carteira.
        </p>
      </ConfirmDialog>
    </>
  );
}

export function RecomputeButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        start(async () => {
          const r = await runRecompute();
          if (r?.error) toast(r.error, { tone: "error" });
          else if (r?.ok) toast(r.ok);
        })
      }
    >
      {pending ? <span className="spinner" aria-hidden /> : <Icon name="refresh" size={14} />}
      {pending ? "Recalculando…" : "Rodar recompute agora"}
    </button>
  );
}
