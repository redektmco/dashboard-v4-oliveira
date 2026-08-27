"use client";

import { useEffect, useRef } from "react";
import type { User } from "@/lib/model/types";

/**
 * Sem autenticação: o preenchedor se identifica uma vez e o navegador lembra.
 * O snapshot guarda quem preencheu — rastreabilidade é requisito do modelo.
 * O select fica não-controlado para não divergir entre servidor e cliente.
 */
export function FillerSelect({ users, role }: { users: User[]; role: "gt" | "account" }) {
  const storageKey = `healthscore.filler.${role}`;
  const ref = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved && ref.current && users.some((u) => String(u.id) === saved)) {
      ref.current.value = saved;
    }
  }, [storageKey, users]);

  return (
    <label className="flex items-center gap-2">
      <span className="label">Preenchido por</span>
      <select
        ref={ref}
        name="filled_by"
        className="field w-auto py-1.5 text-xs"
        defaultValue={users[0]?.id ?? ""}
        required
        onChange={(e) => localStorage.setItem(storageKey, e.target.value)}
      >
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </label>
  );
}
