import type { ProgressStatus } from "@/lib/onboarding/types";
import { Icon } from "@/components/icon";

/**
 * Peças de progresso do LMS — presentacionais e puras (sem estado, sem
 * "use client"), então rodam no servidor e não pesam no bundle do cliente.
 */

/** Anel de progresso (0–100). Vermelho da marca; verde só quando conclui. */
export function ProgressRing({
  value,
  size = 56,
  stroke = 5,
  showLabel = true,
}: {
  value: number;
  size?: number;
  stroke?: number;
  showLabel?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const done = pct >= 100;
  const color = done ? "var(--color-verde)" : "var(--color-v4-red)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex items-center justify-center">
          {done ? (
            <Icon name="check" size={size * 0.34} stroke={3} className="text-verde-fg" />
          ) : (
            <span className="tnum font-display text-[13px] font-bold text-ink-100" style={{ fontSize: size * 0.24 }}>
              {pct}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Barra fina de progresso — vermelho da marca, verde ao concluir. */
export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-ink-850">
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.max(pct, 2)}%`,
          background: pct >= 100 ? "var(--color-verde)" : "var(--color-v4-red)",
        }}
      />
    </div>
  );
}

/** Bolinha de status de uma aula na navegação: ○ / → / ✓. */
export function StatusDot({ status }: { status: ProgressStatus }) {
  if (status === "done") return <Icon name="checkCircle" size={16} className="text-verde-fg" />;
  if (status === "in_progress") return <Icon name="arrowRight" size={15} className="text-amarelo-fg" />;
  return <Icon name="circle" size={15} className="text-ink-600" />;
}
