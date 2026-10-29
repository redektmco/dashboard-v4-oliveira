"use client";
export default function SalesError({ reset }: { reset: () => void }) {
  return <div role="alert" className="space-y-3 rounded-xl border border-[var(--border-hair)] p-6"><h2 className="font-semibold text-ink-100">Não foi possível carregar as vendas.</h2><p className="text-[13px] text-ink-400">Tente novamente para consultar o histórico.</p><button className="btn btn-light" onClick={reset}>Tentar novamente</button></div>;
}
