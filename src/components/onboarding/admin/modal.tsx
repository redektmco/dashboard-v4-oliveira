"use client";

import { useEffect } from "react";
import { Icon } from "@/components/icon";

/**
 * Modal do CMS — leve e autocontido (Tailwind, sem dependência de classe
 * global), então funciona igual em qualquer base. Fecha no backdrop e no Esc,
 * trava a rolagem do fundo enquanto aberto.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--border-strong)] bg-ink-900 shadow-2xl sm:rounded-2xl ${
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg"
        }`}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--border-hair)] px-5 py-3.5">
          <h2 className="font-display text-[16px] font-semibold text-ink-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink-400 hover:bg-ink-850 hover:text-ink-100"
          >
            <Icon name="x" size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/** Confirmação destrutiva reutilizável. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Excluir",
  pending = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  pending?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-[13px] text-ink-300">{message}</div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn" onClick={onClose} disabled={pending}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={onConfirm}
          disabled={pending}
          aria-busy={pending}
        >
          {pending && <span className="spinner" aria-hidden />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
