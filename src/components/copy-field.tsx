"use client";

import { useState } from "react";
import { Icon } from "./icon";

/**
 * Campo somente-leitura com botão de copiar. Usado no endpoint do webhook —
 * a URL carrega o token do cliente, então é para copiar e colar no CRM, não
 * para digitar. `clipboard` pode falhar em contexto inseguro; cai para um
 * `select()` manual sem quebrar.
 */
export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* contexto inseguro — o usuário copia manualmente do campo */
    }
  }

  return (
    <label className="block">
      {label && <span className="label">{label}</span>}
      <div className="mt-1 flex items-stretch gap-2">
        <input
          type="text"
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="field flex-1 font-mono text-[12px]"
        />
        <button
          type="button"
          onClick={copy}
          className={`btn btn-sm shrink-0 ${copied ? "btn-primary" : ""}`}
          title="Copiar URL do webhook"
        >
          <Icon name={copied ? "check" : "layers"} size={14} />
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </label>
  );
}
