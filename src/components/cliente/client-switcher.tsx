"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function ClientSwitcher({ clients, current, query }: { clients: { id: number; name: string; status: string }[]; current: number; query: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <label className="flex min-w-0 flex-col gap-1 text-[11px] text-ink-400">
    {pending ? "Abrindo cliente…" : "Trocar cliente"}
    <select aria-label="Trocar cliente" aria-busy={pending} disabled={pending} value={current}
      className="field h-9 w-full max-w-[300px] text-[13px]"
      onChange={(e) => { const id = Number(e.target.value); start(() => router.push(`/clientes/${id}${query ? `?${query}` : ""}`)); }}>
      {clients.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.status}</option>)}
    </select>
  </label>;
}
