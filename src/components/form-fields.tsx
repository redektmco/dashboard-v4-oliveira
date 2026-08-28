import { SCALE_ANCHORS } from "@/lib/model/catalog";
import type { FieldDef } from "@/lib/model/types";
import { NumberField } from "./number-field";

const RULE_HINT: Record<string, string> = {
  A: "Régua A · min(100, real ÷ meta × 100)",
  B: "Régua B · min(100, meta ÷ real × 100) — menor é melhor",
  C5: "Régua C · 1→0, 3→50, 5→100",
  BOOL: "Régua C · sim 100 / não 0",
  TRI: "Régua C · 100 / 50 / 0",
  RATE: "Régua A sobre a taxa (real ÷ meta de taxa)",
  TREND: "Régua A contra a média das 4 semanas anteriores",
  RENEWAL: "Escala de exposição por proximidade da renovação",
};

export function FieldBlock({
  field,
  values,
  defaults = {},
  index,
}: {
  field: FieldDef;
  values: Record<string, unknown>;
  defaults?: Record<string, number | string | null>;
  /** Numeração da pergunta no roteiro da call, quando houver. */
  index?: number;
}) {
  const i = field.input;
  const val = (k: string) => {
    const v = values[k] ?? defaults[k];
    return v === null || v === undefined ? "" : String(v);
  };

  // Perguntas de escala ocupam a linha inteira: o enunciado no topo e as
  // cinco respostas em colunas iguais. Sem isso o bloco encostava na
  // esquerda do painel e sobrava um vazio à direita.
  const isQuestion = i.kind === "scale5";

  return (
    <div className="border-b border-[var(--border-hair)] px-5 py-5 last:border-b-0">
      {isQuestion ? (
        <div className="flex items-start gap-3">
          {index !== undefined && (
            <span className="tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink-800 font-mono text-[11px] font-bold text-ink-400">
              {index}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="eyebrow">{field.label}</div>
            <p className="mt-1.5 font-display text-[16px] font-semibold leading-snug text-ink-100">
              &ldquo;{field.question ?? field.label}&rdquo;
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-400">{field.definition}</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink-100">{field.label}</h3>
          <span className="text-[11px] text-ink-600">{RULE_HINT[field.rule]}</span>
        </div>
      )}
      {!isQuestion && (
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-400">{field.definition}</p>
      )}

      <div className="mt-3.5">
        {i.kind === "pair" && (
          <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
            <NumberInput name={i.realKey} label={i.realLabel} value={val(i.realKey)} decimals={i.decimals} required />
            <NumberInput
              name={i.metaKey}
              label={i.metaLabel}
              value={val(i.metaKey)}
              decimals={i.decimals}
              hint="pré-preenchida pela meta vigente"
              required
            />
          </div>
        )}

        {i.kind === "number" && (
          <div className="max-w-xs">
            <NumberInput name={i.key} label={i.label} value={val(i.key)} decimals={i.decimals} />
          </div>
        )}

        {i.kind === "bool" && (
          <RadioRow
            name={i.key}
            options={[
              { value: "sim", label: i.trueLabel },
              { value: "nao", label: i.falseLabel },
            ]}
            current={values[i.key] === true ? "sim" : values[i.key] === false ? "nao" : "sim"}
          />
        )}

        {i.kind === "tri" && (
          <RadioRow
            name={i.key}
            options={[
              { value: "full", label: i.options[0] },
              { value: "partial", label: i.options[1] },
              { value: "none", label: i.options[2] },
            ]}
            current={(values[i.key] as string) || "full"}
          />
        )}

        {i.kind === "scale5" && (
          <Scale5 name={i.key} current={Number(values[i.key]) || 0} anchors={i.anchors} />
        )}

        {i.kind === "date" && (
          <div className="max-w-xs">
            <input type="date" name={i.key} defaultValue={val(i.key)} className="field" />
          </div>
        )}
      </div>
    </div>
  );
}

export function NumberInput({
  name,
  label,
  value,
  decimals,
  hint,
  required,
}: {
  name: string;
  label: string;
  value: string;
  decimals?: number;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="mt-1 block">
        <NumberField
          name={name}
          defaultValue={value}
          step={decimals ? `0.${"0".repeat(decimals - 1)}1` : "1"}
          required={required}
        />
      </span>
      {hint && <span className="mt-1 block text-[11px] text-ink-600">{hint}</span>}
    </label>
  );
}

function RadioRow({
  name,
  options,
  current,
}: {
  name: string;
  options: { value: string; label: string }[];
  current: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <label key={o.value} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={o.value}
            defaultChecked={current === o.value}
            className="peer sr-only"
          />
          <span className="block rounded-lg border border-ink-700 bg-ink-850 px-3.5 py-1.5 text-[13px] font-medium text-ink-300 transition-colors peer-checked:border-v4-red peer-checked:bg-[rgba(229,9,20,0.12)] peer-checked:text-ink-100 hover:border-ink-600">
            {o.label}
          </span>
        </label>
      ))}
    </div>
  );
}

/**
 * Escala 1–5 com âncora comportamental, em cinco colunas de largura igual.
 * O Account lê a pergunta, o cliente responde o número, o Account confere a
 * âncora — é ela que mantém dois Accounts na mesma régua.
 */
function Scale5({
  name,
  current,
  anchors,
}: {
  name: string;
  current: number;
  anchors?: Record<number, string>;
}) {
  const text = (n: number) => anchors?.[n] ?? SCALE_ANCHORS[n];
  const tone: Record<number, string> = {
    5: "peer-checked:border-verde peer-checked:bg-verde-dim peer-checked:text-verde-fg",
    4: "peer-checked:border-verde peer-checked:bg-verde-dim peer-checked:text-verde-fg",
    3: "peer-checked:border-ink-600 peer-checked:bg-ink-800 peer-checked:text-ink-100",
    2: "peer-checked:border-amarelo peer-checked:bg-amarelo-dim peer-checked:text-amarelo-fg",
    1: "peer-checked:border-v4-red peer-checked:bg-vermelho-dim peer-checked:text-vermelho-fg",
  };
  return (
    <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-5">
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={n}
            defaultChecked={current === n}
            required
            className="peer sr-only"
          />
          <span
            className={`flex h-full flex-row items-center gap-3 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-[12px] leading-snug text-ink-400 transition-colors hover:border-ink-600 sm:flex-col sm:items-start sm:gap-2 ${tone[n]}`}
          >
            <span className="tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-black/40 font-display text-[13px] font-bold text-current">
              {n}
            </span>
            <span className="min-w-0">{text(n)}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
