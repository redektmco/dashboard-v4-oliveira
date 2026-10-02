"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Painel lateral sobre a página (drawer da direita), com o fundo escurecido.
 * Esc e clique no fundo fecham; a página por trás não rola enquanto aberto.
 * No celular ocupa a tela inteira.
 */
export function SidePanel({
  open,
  onClose,
  label,
  width = 520,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  width?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const focused = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      focused?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[55]">
      <div className="absolute inset-0 bg-black/65 [animation:v4-fade-in_200ms_var(--ease-out)]" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="side-panel absolute inset-y-0 right-0 flex w-full flex-col border-l border-[var(--border-strong)] bg-ink-900 outline-none"
        style={{ maxWidth: width }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
