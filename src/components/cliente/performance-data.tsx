"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { PerformanceData } from "@/lib/performance/model";

type Resource = { data: PerformanceData | null; error: string | null; loading: boolean; retry: () => void };
const PerformanceContext = createContext<Resource | null>(null);

/** Uma leitura por ficha/período, compartilhada por resumo, abas e celular. */
export function PerformanceProvider({ clientId, query, revision, children }: {
  clientId: number; query: string; revision: number; children: React.ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const key = `${clientId}:${query}:${revision}:${attempt}`;
  const [state, setState] = useState<{ key: string; data?: PerformanceData; error?: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/clientes/${clientId}/performance${query ? `?${query}` : ""}`, { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        const body = await r.json() as { data?: PerformanceData; error?: string };
        if (controller.signal.aborted) return;
        setState(!r.ok || !body.data
          ? { key, error: body.error ?? `Não deu para carregar (${r.status}).` }
          : { key, data: body.data });
      })
      .catch(() => !controller.signal.aborted && setState({ key, error: "Não deu para carregar a mídia. Tente novamente." }));
    return () => controller.abort();
  }, [clientId, query, key]);
  const current = state?.key === key ? state : null;
  return (
    <PerformanceContext.Provider value={{ data: current?.data ?? null, error: current?.error ?? null, loading: !current, retry: () => setAttempt((n) => n + 1) }}>
      {children}
    </PerformanceContext.Provider>
  );
}

export function usePerformanceData() {
  const ctx = useContext(PerformanceContext);
  if (!ctx) throw new Error("PerformanceProvider ausente na ficha do cliente.");
  return ctx;
}
