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
    /* No celular vira campo empilhado de largura cheia, como os outros;
       na barra do desktop continua sendo rótulo + select na mesma linha. */
    <label className="block sm:flex sm:items-center sm:gap-2">
      <span className="label">Preenchido por</span>
      <select
        ref={ref}
        name="filled_by"
        className="field mt-1 sm:mt-0 sm:w-auto sm:py-1.5 sm:text-xs"
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
