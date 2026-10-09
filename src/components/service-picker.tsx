"use client";

import { useState } from "react";
import { SERVICES, splitServices, type Service } from "@/lib/model/services";
import { Icon } from "./icon";

/**
 * Serviços contratados em pílulas, não em texto com vírgula.
 *
 * Cada pílula marcada vira um campo `services` do formulário — o servidor lê
 * com `getAll`. Serviços de cadastros antigos que não estão no catálogo
 * aparecem como pílulas próprias, já marcadas, e podem ser removidos; ainda
 * dá para acrescentar um avulso quando o contrato tem algo fora da lista.
 */
export function ServicePicker({ name = "services", defaultValue = [] }: { name?: string; defaultValue?: string[] }) {
  const initial = splitServices(defaultValue);
  const [picked, setPicked] = useState<Service[]>(initial.known);
  const [custom, setCustom] = useState<string[]>(initial.custom);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const toggle = (s: Service) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  const addCustom = () => {
    const v = draft.trim();
    if (v && !custom.includes(v) && !picked.some((p) => p === v)) setCustom((c) => [...c, v]);
    setDraft("");
    setAdding(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {SERVICES.map((s) => {
          const on = picked.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggle(s)}
              aria-pressed={on}
              className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] transition-colors ${
                on
                  ? "border-v4-red bg-vermelho-dim font-medium text-ink-100"
                  : "border-[var(--border-hair)] text-ink-300 hover:bg-ink-850 hover:text-ink-100"
              }`}
            >
              {on && <Icon name="check" size={12} />}
              {s}
            </button>
          );
        })}

        {custom.map((c) => (
          <span
            key={c}
            className="flex h-8 items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-ink-850 px-3 text-[12px] text-ink-200"
          >
            {c}
            <button
              type="button"
              onClick={() => setCustom((list) => list.filter((x) => x !== c))}
              aria-label={`Remover ${c}`}
              className="text-ink-500 hover:text-ink-100"
            >
              <Icon name="x" size={12} />
            </button>
          </span>
        ))}

        {adding ? (
          <span className="flex h-8 items-center gap-1 rounded-full border border-[var(--border-strong)] bg-ink-850 pl-3 pr-1">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={addCustom}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
                if (e.key === "Escape") {
                  setDraft("");
                  setAdding(false);
                }
              }}
              placeholder="Outro serviço"
              maxLength={60}
              className="w-[120px] bg-transparent text-[12px] text-ink-100 outline-none placeholder:text-ink-500"
            />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-8 items-center gap-1 rounded-full border border-dashed border-[var(--border-strong)] px-3 text-[12px] text-ink-400 hover:text-ink-100"
          >
            <Icon name="plus" size={12} />
            Outro
          </button>
        )}
      </div>

      {[...picked, ...custom].map((v) => (
        <input key={v} type="hidden" name={name} value={v} />
      ))}
    </div>
  );
}
