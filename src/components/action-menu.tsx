"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Icon, type IconName } from "./icon";

export type MenuItem =
  | {
      label: string;
      icon?: IconName;
      onSelect?: () => void;
      href?: string;
      external?: boolean;
      danger?: boolean;
      disabled?: boolean;
      /** Por que está desabilitado, ou detalhe curto. */
      hint?: string;
    }
  | "separator";

/**
 * Menu de três pontos: ações secundárias e destrutivas saem da linha e
 * ficam a um clique. Ordem sugerida: principais → secundárias → separador →
 * destrutivas (em vermelho, sempre por último).
 *
 * Renderizado no <body> (portal) para não ser cortado pelo `overflow:
 * hidden` dos painéis; posicionado sob o gatilho e virado para cima quando
 * não cabe embaixo.
 */
export function ActionMenu({
  items,
  label = "Mais ações",
  size = "md",
  trigger,
}: {
  items: MenuItem[];
  label?: string;
  size?: "sm" | "md";
  /** Conteúdo do botão; padrão são os três pontos. */
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = menu.current?.offsetHeight ?? 0;
    const w = menu.current?.offsetWidth ?? 220;
    const up = r.bottom + h + 8 > window.innerHeight && r.top - h - 8 > 0;
    const left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
    setPos({ top: up ? r.top - h - 6 : r.bottom + 6, left, up });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]:not([aria-disabled=true])")?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) close(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close();
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const list = [...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([aria-disabled=true])") ?? [])];
      const i = list.indexOf(document.activeElement as HTMLElement);
      list[(i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
    };
    const onScroll = () => close(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={trigger ? "menu-trigger-custom" : `menu-trigger ${size === "sm" ? "menu-trigger--sm" : ""}`}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        {trigger ?? <Icon name="dots" size={size === "sm" ? 16 : 18} stroke={2.2} />}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="menu"
            className="menu"
            style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
            data-up={pos?.up ? "" : undefined}
          >
            {items.map((it, i) => {
              if (it === "separator") return <div key={`s${i}`} className="menu-sep" role="separator" />;
              const content = (
                <>
                  {it.icon && <Icon name={it.icon} size={15} />}
                  <span className="min-w-0 flex-1">
                    {it.label}
                    {it.hint && <span className="menu-hint">{it.hint}</span>}
                  </span>
                  {it.external && <Icon name="external" size={12} className="text-ink-500" />}
                </>
              );
              const cls = `menu-item ${it.danger ? "is-danger" : ""}`;
              if (it.href && !it.disabled) {
                return it.external ? (
                  <a key={it.label} role="menuitem" className={cls} href={it.href} target="_blank" rel="noreferrer" onClick={() => close(false)}>
                    {content}
                  </a>
                ) : (
                  <Link key={it.label} role="menuitem" className={cls} href={it.href} onClick={() => close(false)}>
                    {content}
                  </Link>
                );
              }
              return (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  className={cls}
                  aria-disabled={it.disabled || undefined}
                  onClick={() => {
                    if (it.disabled) return;
                    close(false);
                    it.onSelect?.();
                  }}
                >
                  {content}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
