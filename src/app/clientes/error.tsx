"use client";

import { useEffect } from "react";
import { Icon } from "@/components/icon";

/**
 * Falha de rede ou de permissão ao montar a carteira. A mensagem é texto,
 * não só cor: quem está no celular, no sol, precisa ler o que aconteceu.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[clientes] falha ao carregar a carteira:", error);
  }, [error]);

  return (
    <section className="panel flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-vermelho-dim text-vermelho-fg">
        <Icon name="alertCircle" size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-[17px] font-semibold text-ink-100">Não foi possível carregar a carteira</h2>
        <p className="mt-1 text-[13px] text-ink-300">
          A leitura do banco falhou. Nada foi alterado — tente de novo e, se continuar, avise um administrador da unidade.
        </p>
        {error.digest && <p className="mt-1 font-mono text-[11px] text-ink-500">Referência: {error.digest}</p>}
      </div>
      <button type="button" className="btn btn-light shrink-0" onClick={reset}>
        <Icon name="refresh" size={15} />
        Tentar novamente
      </button>
    </section>
  );
}
