"use client";

import { useRef } from "react";
import { Icon } from "./icon";

/**
 * Campo numérico do design system.
 *
 * As setas nativas do `input[type=number]` são escondidas no globals.css
 * (desenho, tamanho e cor vêm do sistema operacional e destoam do kit).
 * Aqui elas voltam desenhadas com os tokens da marca: par de botões colado
 * à direita do campo, mesma altura, mesma borda, hover/active do kit.
 */
export function NumberField({
  name,
  defaultValue,
  step = "1",
  min,
  max,
  required,
  placeholder = "0",
  className = "",
  align = "left",
}: {
  name: string;
  defaultValue?: string | number;
  step?: string;
  min?: number;
  max?: number;
  required?: boolean;
  placeholder?: string;
  className?: string;
  align?: "left" | "right";
}) {
  const ref = useRef<HTMLInputElement>(null);

  // `stepUp/stepDown` respeitam step/min/max do próprio input; o evento
  // sintético mantém React e formulários não-controlados em dia.
  const bump = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    if (el.value === "") el.value = "0";
    if (dir > 0) el.stepUp();
    else el.stepDown();
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
  };

  return (
    <span className="stepper">
      <input
        ref={ref}
        name={name}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={`field tnum ${align === "right" ? "text-right" : ""} ${className}`}
      />
      <span className="stepper-btns" aria-hidden>
        <button type="button" tabIndex={-1} onClick={() => bump(1)} title="Aumentar">
          <Icon name="arrowUp" size={11} stroke={2.5} />
        </button>
        <button type="button" tabIndex={-1} onClick={() => bump(-1)} title="Diminuir">
          <Icon name="arrowDown" size={11} stroke={2.5} />
        </button>
      </span>
    </span>
  );
}
