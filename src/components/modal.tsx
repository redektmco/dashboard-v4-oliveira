"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icon";
import { toast } from "./toast";

/**
 * Janela modal sobre o `<dialog>` nativo: foco preso dentro, Esc fecha, o
 * resto da página fica inerte. O conteúdo só existe enquanto aberta — cada
 * abertura começa com o formulário limpo.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  cardClassName = "",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** Variação visual do cartão (ex.: `modal-card--form`). */
  cardClassName?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        // Clique no fundo (fora do cartão) fecha.
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className={`modal-card modal-card--${size} ${cardClassName}`}>
          <header className="modal-head">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-[17px] font-semibold leading-snug text-ink-100">
                {title}
              </h2>
              {description && <p className="mt-1 text-[13px] leading-relaxed text-ink-400">{description}</p>}
            </div>
            <button type="button" onClick={onClose} className="modal-x" aria-label="Fechar">
              <Icon name="x" size={16} />
            </button>
          </header>
          {children && <div className="modal-body">{children}</div>}
          {footer && <footer className="modal-foot">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

/**
 * Confirmação de ação importante. Diz o impacto antes do clique, mostra o
 * andamento e mantém a janela aberta com a mensagem se der erro.
 * `requireText`: para exclusão sem volta, pede para digitar o nome.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  pendingLabel = "Processando…",
  tone = "danger",
  requireText,
  onConfirm,
  successMessage,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  tone?: "danger" | "default";
  requireText?: string;
  /** Devolva uma string para exibir como erro e manter a janela aberta. */
  onConfirm: () => Promise<void | string | { error?: string; ok?: string } | null | undefined>;
  successMessage?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  const close = () => {
    if (pending) return;
    setError(null);
    setTyped("");
    onClose();
  };

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      const r = await onConfirm();
      const err = typeof r === "string" ? r : r && typeof r === "object" ? r.error : undefined;
      if (err) {
        setError(err);
        return;
      }
      const ok = r && typeof r === "object" && r.ok ? r.ok : successMessage;
      if (ok) toast(ok);
      setTyped("");
      onClose();
    } catch (e) {
      // redirect() de Server Action chega aqui como exceção de controle:
      // deixa o Next seguir com a navegação.
      if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
      setError("Não foi possível concluir. Verifique a conexão e tente de novo.");
    } finally {
      setPending(false);
    }
  };

  const blocked = Boolean(requireText) && typed.trim().toLowerCase() !== requireText!.trim().toLowerCase();

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn" onClick={close} disabled={pending}>
            Cancelar
          </button>
          <button
            type="button"
            className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`}
            onClick={confirm}
            disabled={pending || blocked}
            aria-busy={pending}
          >
            {pending && <span className="spinner" aria-hidden />}
            {pending ? pendingLabel : confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-[13.5px] leading-relaxed text-ink-300">
        {children}
        {requireText && (
          <label className="block">
            <span className="label">
              Para confirmar, digite <strong className="normal-case tracking-normal text-ink-100">{requireText}</strong>
            </span>
            <input
              className="field mt-1"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </label>
        )}
        {error && (
          <p className="flex items-start gap-2 rounded-lg bg-vermelho-dim px-3 py-2 text-[13px] font-semibold text-vermelho-fg">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Lista do que uma ação destrutiva leva junto — o "impacto" da confirmação. */
export function ImpactList({ items }: { items: { label: string; count?: number; tone?: "danger" | "muted" }[] }) {
  const shown = items.filter((i) => i.count === undefined || i.count > 0);
  if (!shown.length) return null;
  return (
    <ul className="space-y-1.5 rounded-lg border border-[var(--border-hair)] bg-ink-950 px-3 py-2.5 text-[13px]">
      {shown.map((i) => (
        <li key={i.label} className="flex items-baseline gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full ${i.tone === "muted" ? "bg-ink-500" : "bg-vermelho"}`} />
          <span className={i.tone === "muted" ? "text-ink-400" : "text-ink-200"}>
            {i.count !== undefined && <strong className="tnum text-ink-100">{i.count} </strong>}
            {i.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
