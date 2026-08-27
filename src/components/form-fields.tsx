import { SCALE_ANCHORS } from "@/lib/model/catalog";
import type { FieldDef } from "@/lib/model/types";

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
}: {
  field: FieldDef;
  values: Record<string, unknown>;
  defaults?: Record<string, number | string | null>;
}) {
  const i = field.input;
  const val = (k: string) => {
    const v = values[k] ?? defaults[k];
    return v === null || v === undefined ? "" : String(v);
  };

  return (
    <div className="border-b border-[var(--border-hair)] px-4 py-4 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-100">{field.label}</h3>
        <span className="text-[11px] text-ink-600">{RULE_HINT[field.rule]}</span>
      </div>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-400">{field.definition}</p>

      <div className="mt-3">
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

        {i.kind === "scale5" && <Scale5 name={i.key} current={Number(values[i.key]) || 0} />}

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
      <input
        name={name}
        defaultValue={value}
        inputMode="decimal"
        step={decimals ? `0.${"0".repeat(decimals - 1)}1` : "1"}
        type="number"
        required={required}
        className="field mt-1 tnum"
        placeholder="0"
      />
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

/** Escala 1–5 com âncora comportamental — o Account escolhe a descrição, não o número. */
function Scale5({ name, current }: { name: string; current: number }) {
  return (
    <div className="grid max-w-3xl gap-1.5">
      {[5, 4, 3, 2, 1].map((n) => (
        <label key={n} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={n}
            defaultChecked={current === n}
            required
            className="peer sr-only"
          />
          <span className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-[13px] text-ink-300 transition-colors peer-checked:border-v4-red peer-checked:bg-[rgba(229,9,20,0.12)] peer-checked:text-ink-100 hover:border-ink-600">
            <span className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink-800 text-xs font-bold">
              {n}
            </span>
            <span>{SCALE_ANCHORS[n]}</span>
            <span className="tnum ml-auto text-[11px] text-ink-600">{((n - 1) / 4) * 100} pts</span>
          </span>
        </label>
      ))}
    </div>
  );
}
