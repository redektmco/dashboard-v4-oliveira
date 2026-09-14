"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Icon } from "./icon";
import { toast } from "./toast";
import type { ActionResult } from "@/lib/action";

export type { ActionResult };

/**
 * Botão de envio que sabe que o formulário está em andamento: desabilita,
 * mostra o spinner e troca o texto. Sem isto o clique parecia não ter sido
 * registrado — e o segundo clique enviava de novo.
 */
export function SubmitButton({
  children,
  pendingLabel = "Salvando…",
  className = "btn-primary",
  disabled,
  formAction,
  title,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  formAction?: (fd: FormData) => void | Promise<void>;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`btn ${className}`}
      disabled={pending || disabled}
      aria-busy={pending}
      formAction={formAction}
      title={title}
    >
      {pending && <span className="spinner" aria-hidden />}
      {pending ? pendingLabel : children}
    </button>
  );
}

/**
 * Formulário ligado a uma Server Action que devolve `{ ok }` ou `{ error }`.
 * Sucesso: toast + `onSuccess` (ex.: fechar o modal). Erro: mensagem no
 * próprio formulário, sem perder o que foi digitado.
 */
export function ActionForm({
  action,
  onSuccess,
  children,
  className = "space-y-3",
}: {
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  onSuccess?: (r: ActionResult) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const handled = useRef<ActionResult>(null);
  useEffect(() => {
    if (!state || handled.current === state) return;
    handled.current = state;
    if (state.ok) {
      toast(state.ok);
      onSuccess?.(state);
    }
  }, [state, onSuccess]);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && <FormError message={state.error} />}
    </form>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-vermelho-dim px-3 py-2 text-[13px] font-semibold text-vermelho-fg" role="alert">
      <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
      {message}
    </p>
  );
}

/** Controle segmentado do painel (alternar modo/visão sem trocar de página). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; hint?: string }[];
  size?: "sm" | "md";
  label?: string;
}) {
  return (
    <div className={`seg ${size === "sm" ? "seg--sm" : ""}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.hint}
          className={value === o.value ? "on" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
