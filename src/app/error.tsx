"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";

/** Falha inesperada numa página: explica, oferece tentar de novo e um caminho de volta. */
export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-vermelho-dim text-vermelho-fg">
        <Icon name="alert" size={22} />
      </span>
      <h1 className="mt-4 font-display text-[20px] font-bold text-ink-100">Não conseguimos carregar esta página</h1>
      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-400">
        Pode ter sido uma instabilidade de conexão com o banco. Tente de novo — se continuar, avise a coordenação
        {error.digest ? (
          <>
            {" "}
            com o código <code className="font-mono text-[12px] text-ink-300">{error.digest}</code>
          </>
        ) : null}
        .
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <button type="button" className="btn btn-primary" onClick={() => retry()}>
          <Icon name="refresh" size={14} />
          Tentar de novo
        </button>
        <Link href="/" className="btn">
          Ir para a carteira
        </Link>
      </div>
    </div>
  );
}
