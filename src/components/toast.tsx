"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "./icon";

/**
 * Avisos efêmeros no canto da tela — o retorno de toda ação que não troca de
 * página. Estado num store de módulo: qualquer componente chama `toast()`
 * sem precisar de provider.
 */
export type ToastTone = "success" | "error" | "info";
type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
  at: number;
};

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(
  message: string,
  opts: { tone?: ToastTone; action?: ToastItem["action"]; duration?: number } = {},
) {
  const tone = opts.tone ?? "success";
  // O mesmo aviso disparado duas vezes seguidas (efeito que roda de novo,
  // clique duplo) aparece uma vez só.
  const now = Date.now();
  const dup = items.find((t) => t.message === message && t.tone === tone && now - t.at < 1500);
  if (dup) return dup.id;
  const id = ++seq;
  items = [...items.slice(-3), { id, message, tone, action: opts.action, at: now }];
  emit();
  const ms = opts.duration ?? (tone === "error" ? 7000 : 3800);
  setTimeout(() => dismiss(id), ms);
  return id;
}

export function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const EMPTY: ToastItem[] = [];

export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => EMPTY);
  return (
    <div className="toast-stack" aria-live="polite" aria-relevant="additions">
      {list.map((t) => (
        <div key={t.id} className={`toast-item is-${t.tone}`} role={t.tone === "error" ? "alert" : "status"}>
          <Icon name={t.tone === "error" ? "alert" : t.tone === "success" ? "check" : "message"} size={15} />
          <span className="min-w-0 flex-1">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                t.action!.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Fechar aviso">
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Mensagem que chega do servidor pela URL (`?ok=` / `?erro=`, depois de um
 * redirect de Server Action) vira toast e sai da URL — antes ficava presa
 * na página como faixa até a próxima navegação.
 */
export function FlashFromUrl() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const ok = params.get("ok");
  const erro = params.get("erro");
  useEffect(() => {
    if (!ok && !erro) return;
    if (ok) toast(ok);
    if (erro) toast(erro === "sem-permissao" ? "Você não tem permissão para essa área." : erro, { tone: "error" });
    const rest = new URLSearchParams(params);
    rest.delete("ok");
    rest.delete("erro");
    const qs = rest.toString();
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  }, [ok, erro, params, path, router]);
  return null;
}
