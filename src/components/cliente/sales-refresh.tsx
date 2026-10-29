"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../icon";

/** Webhooks chegam fora do navegador: reler ao abrir a aba e enquanto ela estiver visível. */
export function SalesRefresh() {
  const router = useRouter();
  const ref = useRef<HTMLButtonElement>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    const refresh = () => {
      const button = ref.current;
      if (!document.hidden && button && !button.disabled && button.getClientRects().length)
        start(() => router.refresh());
    };
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) refresh(); });
    if (ref.current) observer.observe(ref.current);
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => { observer.disconnect(); window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [router, start]);
  return <button ref={ref} type="button" className="btn h-8 shrink-0" disabled={pending} aria-busy={pending}
    onClick={() => start(() => router.refresh())}>
    <Icon name="refresh" size={14} className={pending ? "animate-spin" : undefined} />
    {pending ? "Atualizando…" : "Atualizar vendas"}
  </button>;
}
