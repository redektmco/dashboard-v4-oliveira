"use client";

import { useId, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Icon } from "@/components/icon";
import { Segmented } from "@/components/form-controls";
import { BLOCKS } from "@/lib/reports/layout";
import { autoTarget, formatValue, METRIC_KEYS, METRICS, parseNumberBR, VARIABLES } from "@/lib/reports/metrics";
import {
  SOURCE_LABEL,
  type Align,
  type Block,
  type MetricKey,
  type NumberFormat,
  type ReportData,
  type Source,
  type Surface,
} from "@/lib/reports/types";

/**
 * Painel de propriedades do bloco selecionado — o "Editar widget" do
 * Elementor: conteúdo em cima, aparência embaixo. Toda mudança volta por
 * `onChange(patch, chave)`; a chave junta digitação seguida num passo só do
 * desfazer.
 */

type Change = (patch: Record<string, unknown>, key?: string) => void;

/**
 * Campo do painel. Grupo com rótulo, não `<label>`: muitos campos aqui são
 * botões segmentados, e um `<label>` em volta faria o clique no texto do
 * rótulo apertar o primeiro botão.
 */
export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  const id = useId();
  return (
    <div className="block" role="group" aria-labelledby={id}>
      <span id={id} className="label block">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-[11px] leading-snug text-ink-500">{hint}</span>}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-[var(--border-hair)] px-4 py-4 first:border-t-0">
      <h3 className="font-display text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-300">{title}</h3>
      {children}
    </section>
  );
}

const FORMAT_OPTS: { value: NumberFormat; label: string }[] = [
  { value: "int", label: "Número" },
  { value: "decimal", label: "Decimal" },
  { value: "currency", label: "R$" },
  { value: "percent", label: "%" },
  { value: "x", label: "x" },
];

function MetricSelect({ value, onChange }: { value: MetricKey; onChange: (m: MetricKey) => void }) {
  return (
    <select className="field" value={value} onChange={(e) => onChange(e.target.value as MetricKey)}>
      {METRIC_KEYS.map((k) => (
        <option key={k} value={k}>
          {METRICS[k].label}
        </option>
      ))}
    </select>
  );
}

function SourceSelect({ metric, value, onChange }: { metric?: MetricKey; value: Source; onChange: (s: Source) => void }) {
  if (metric && METRICS[metric].only)
    return <p className="text-[12px] text-ink-500">{METRICS[metric].only === "crm" ? "Vem do webhook do CRM." : "Só existe na Meta Ads."}</p>;
  return (
    <Segmented
      size="sm"
      value={value}
      onChange={onChange}
      options={(["all", "meta", "google"] as const).map((s) => ({ value: s, label: s === "all" ? "Todos" : SOURCE_LABEL[s].replace(" Ads", "") }))}
    />
  );
}

function ModeSeg({ value, onChange }: { value: "auto" | "manual"; onChange: (v: "auto" | "manual") => void }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[
        { value: "auto", label: "Do painel", hint: "Meta Ads, Google Ads e CRM, pelo período do relatório" },
        { value: "manual", label: "Digitar", hint: "Para o que o painel não tem: orgânico, balcão, outra ferramenta" },
      ]}
    />
  );
}

function SurfaceSeg({ value, onChange }: { value: Surface; onChange: (v: Surface) => void }) {
  return (
    <Field label="Fundo">
      <Segmented
        size="sm"
        value={value}
        onChange={onChange}
        options={[
          { value: "none", label: "Nenhum" },
          { value: "card", label: "Cartão" },
          { value: "accent", label: "Destaque" },
        ]}
      />
    </Field>
  );
}

function AlignSeg({ value, onChange }: { value: Align; onChange: (v: Align) => void }) {
  return (
    <Field label="Alinhamento">
      <Segmented
        size="sm"
        value={value}
        onChange={onChange}
        options={[
          { value: "left", label: "Esquerda" },
          { value: "center", label: "Centro" },
          { value: "right", label: "Direita" },
        ]}
      />
    </Field>
  );
}

/** Cor: a do tema (padrão), a de destaque ou uma escolhida. */
export function ColorField({
  label,
  value,
  onChange,
  allowTheme = true,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  allowTheme?: boolean;
}) {
  const custom = value && value !== "accent" ? value : "#ffffff";
  return (
    <Field label={label}>
      <div className="flex flex-wrap items-center gap-1.5">
        {allowTheme && (
          <button type="button" className="chip" aria-pressed={!value} onClick={() => onChange(undefined)}>
            Tema
          </button>
        )}
        <button type="button" className="chip" aria-pressed={value === "accent"} onClick={() => onChange("accent")}>
          <span className="h-3 w-3 rounded-full bg-v4-red" /> Destaque
        </button>
        <label className="chip cursor-pointer" aria-pressed={Boolean(value && value !== "accent")}>
          <span className="h-3 w-3 rounded-full border border-white/20" style={{ background: custom }} />
          Outra
          <input type="color" className="sr-only" value={custom} onChange={(e) => onChange(e.target.value)} />
        </label>
      </div>
    </Field>
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  // Texto livre no padrão brasileiro ("12.480,50"); vira número ao sair do campo.
  const [text, setText] = useState(value === null ? "" : String(value).replace(".", ","));
  return (
    <input
      className="field tnum"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseNumberBR(e.target.value));
      }}
    />
  );
}

function VariableChips({ onInsert }: { onInsert: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {VARIABLES.map((v) => (
        <button key={v.key} type="button" className="chip font-mono text-[11px]" title={v.hint} onClick={() => onInsert(v.key)}>
          {v.key}
        </button>
      ))}
    </div>
  );
}

function TextArea({
  value,
  onChange,
  rows = 5,
  mono = false,
  withVariables = false,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  mono?: boolean;
  withVariables?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="space-y-1.5">
      <textarea
        ref={ref}
        className={`field ${mono ? "font-mono text-[12px]" : ""}`}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-rp-text
      />
      {withVariables && (
        <VariableChips
          onInsert={(v) => {
            const el = ref.current;
            const at = el?.selectionStart ?? value.length;
            onChange(value.slice(0, at) + v + value.slice(el?.selectionEnd ?? at));
            requestAnimationFrame(() => {
              el?.focus();
              el?.setSelectionRange(at + v.length, at + v.length);
            });
          }}
        />
      )}
    </div>
  );
}

/** Lista ordenada de métricas (colunas da tabela, etapas do funil). */
function MetricList({ value, onChange, max = 8 }: { value: MetricKey[]; onChange: (v: MetricKey[]) => void; max?: number }) {
  const rest = METRIC_KEYS.filter((k) => !value.includes(k));
  const move = (i: number, d: number) => {
    const next = [...value];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      {value.map((m, i) => (
        <div key={m} className="flex items-center gap-1 rounded-md border border-[var(--border-hair)] bg-ink-850 py-1 pl-2.5 pr-1 text-[12px]">
          <span className="min-w-0 flex-1 truncate">{METRICS[m].label}</span>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Subir" onClick={() => move(i, -1)} disabled={i === 0}>
            <Icon name="chevronUp" size={13} />
          </button>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Descer" onClick={() => move(i, 1)} disabled={i === value.length - 1}>
            <Icon name="chevronDown" size={13} />
          </button>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Remover" onClick={() => onChange(value.filter((x) => x !== m))}>
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
      {value.length < max && rest.length > 0 && (
        <select className="field" value="" onChange={(e) => e.target.value && onChange([...value, e.target.value as MetricKey])}>
          <option value="">+ Adicionar métrica…</option>
          {rest.map((k) => (
            <option key={k} value={k}>
              {METRICS[k].label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function ImageField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File) {
    setError(null);
    setBusy(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const r = await upload(`relatorios/${Date.now()}-${safe}`, file, { access: "public", handleUploadUrl: "/api/relatorios/upload" });
      onChange(r.url);
    } catch (e) {
      setError((e as Error).message || "Falha no envio.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" className="btn btn-sm w-full justify-center" onClick={() => input.current?.click()} disabled={busy} aria-busy={busy}>
        {busy ? <span className="spinner" aria-hidden /> : <Icon name="upload" size={14} />}
        {value ? "Trocar imagem" : "Enviar imagem"}
      </button>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
      <Field label="Ou cole o endereço">
        <input className="field" value={value} placeholder="https://…" onChange={(e) => onChange(e.target.value.trim())} />
      </Field>
      {error && <p className="text-[12px] text-vermelho-fg">{error}</p>}
    </div>
  );
}

/** Escrever com IA: pedido opcional + botão. O texto gerado substitui o do bloco (Ctrl+Z desfaz). */
export type AiControl = { busy: boolean; run: (instruction: string) => Promise<boolean> };

function AiSection({ ai, heading }: { ai: AiControl; heading: boolean }) {
  const [instruction, setInstruction] = useState("");
  return (
    <Section title="Escrever com IA">
      <Field
        label="Pedido (opcional)"
        hint="A IA usa os números deste relatório e o que já está escrito no bloco como roteiro. O texto novo substitui o atual — Ctrl+Z desfaz."
      >
        <textarea
          className="field"
          rows={2}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={heading ? "Ex.: título que destaque a queda do CPL" : "Ex.: foque no CPL e no WhatsApp, tom mais direto"}
        />
      </Field>
      <button type="button" className="btn btn-primary w-full justify-center" onClick={() => ai.run(instruction)} disabled={ai.busy} aria-busy={ai.busy}>
        {ai.busy ? <span className="spinner" aria-hidden /> : <Icon name="sparkles" size={14} />}
        {ai.busy ? "Escrevendo…" : heading ? "Sugerir título" : "Escrever com IA"}
      </button>
    </Section>
  );
}

export function BlockInspector({ block: b, data, onChange, ai }: { block: Block; data: ReportData; onChange: Change; ai?: AiControl }) {
  const set = (patch: Record<string, unknown>) => onChange(patch);
  const typing = (k: string) => (v: unknown) => onChange({ [k]: v }, `${b.id}:${k}`);

  switch (b.type) {
    case "heading":
    case "text":
      return (
        <>
          {ai && <AiSection ai={ai} heading={b.type === "heading"} />}
          <Section title="Conteúdo">
            <Field label="Texto" hint={b.type === "text" ? "Use **asteriscos** para negrito. Dê dois cliques no bloco para escrever direto na página." : "Dê dois cliques no bloco para escrever direto na página."}>
              <TextArea value={b.text} onChange={typing("text")} rows={b.type === "text" ? 7 : 3} withVariables />
            </Field>
          </Section>
          <Section title="Estilo">
            <Field label="Tamanho">
              <Segmented
                size="sm"
                value={b.size}
                onChange={(v) => set({ size: v })}
                options={
                  b.type === "heading"
                    ? [
                        { value: "xl", label: "Capa" },
                        { value: "lg", label: "Grande" },
                        { value: "md", label: "Médio" },
                        { value: "sm", label: "Pequeno" },
                      ]
                    : [
                        { value: "sm", label: "Pequeno" },
                        { value: "md", label: "Normal" },
                        { value: "lg", label: "Grande" },
                      ]
                }
              />
            </Field>
            <AlignSeg value={b.align} onChange={(v) => set({ align: v })} />
            <ColorField label="Cor do texto" value={b.color} onChange={(v) => set({ color: v })} />
            <SurfaceSeg value={b.surface} onChange={(v) => set({ surface: v })} />
          </Section>
        </>
      );

    case "kpi":
      return (
        <>
          <Section title="Dados">
            <ModeSeg value={b.mode} onChange={(v) => set({ mode: v })} />
            {b.mode === "auto" ? (
              <>
                <Field label="Métrica" hint={METRICS[b.metric].hint}>
                  <MetricSelect value={b.metric} onChange={(m) => set({ metric: m })} />
                </Field>
                <Field label="Canal">
                  <SourceSelect metric={b.metric} value={b.source} onChange={(s) => set({ source: s })} />
                </Field>
              </>
            ) : (
              <>
                <Field label="Valor do período">
                  <NumberInput value={b.manual.value} onChange={(v) => onChange({ manual: { ...b.manual, value: v } }, `${b.id}:mv`)} />
                </Field>
                <Field label="Período anterior" hint="Opcional — é o que calcula a variação.">
                  <NumberInput value={b.manual.previous} onChange={(v) => onChange({ manual: { ...b.manual, previous: v } }, `${b.id}:mp`)} />
                </Field>
                <Field label="Formato">
                  <Segmented size="sm" value={b.manual.format} onChange={(f) => set({ manual: { ...b.manual, format: f } })} options={FORMAT_OPTS} />
                </Field>
              </>
            )}
            <Field label="Rótulo" hint="Em branco: o nome da métrica.">
              <input className="field" value={b.label} onChange={(e) => typing("label")(e.target.value)} placeholder={b.mode === "auto" ? METRICS[b.metric].label : "Ex.: Seguidores no Instagram"} />
            </Field>
            <label className="flex items-center gap-2 text-[13px] text-ink-200">
              <input type="checkbox" checked={b.showDelta} onChange={(e) => set({ showDelta: e.target.checked })} className="accent-[#e50914]" />
              Mostrar variação contra o período anterior
            </label>
          </Section>
          <Section title="Estilo">
            <SurfaceSeg value={b.surface} onChange={(v) => set({ surface: v })} />
          </Section>
        </>
      );

    case "chart":
      return (
        <>
          <Section title="Gráfico">
            <Field label="Tipo">
              <Segmented
                size="sm"
                value={b.kind}
                onChange={(v) => set({ kind: v })}
                options={[
                  { value: "bar", label: "Barras" },
                  { value: "line", label: "Linha" },
                  { value: "donut", label: "Rosca" },
                ]}
              />
            </Field>
            <ModeSeg value={b.mode} onChange={(v) => set({ mode: v })} />
            {b.mode === "auto" ? (
              <>
                <Field label="Métrica">
                  <MetricSelect value={b.metric} onChange={(m) => set({ metric: m })} />
                </Field>
                <Field label="Agrupar por">
                  <Segmented
                    size="sm"
                    value={b.by}
                    onChange={(v) => set({ by: v })}
                    options={[
                      { value: "week", label: "Semana" },
                      { value: "channel", label: "Meta x Google" },
                    ]}
                  />
                </Field>
                {b.by === "week" && (
                  <Field label="Canal">
                    <SourceSelect metric={b.metric} value={b.source} onChange={(s) => set({ source: s })} />
                  </Field>
                )}
              </>
            ) : (
              <>
                <Field label="Pontos" hint='Uma linha por ponto: "Rótulo; valor". Dá para colar duas colunas da planilha.'>
                  <TextArea value={b.manualText} onChange={typing("manualText")} rows={6} mono />
                </Field>
                <Field label="Formato">
                  <Segmented size="sm" value={b.manualFormat} onChange={(f) => set({ manualFormat: f })} options={FORMAT_OPTS} />
                </Field>
              </>
            )}
            <Field label="Título" hint="Em branco: gerado pela métrica.">
              <input className="field" value={b.title} onChange={(e) => typing("title")(e.target.value)} />
            </Field>
          </Section>
          <Section title="Estilo">
            <SurfaceSeg value={b.surface} onChange={(v) => set({ surface: v })} />
          </Section>
        </>
      );

    case "table":
      return (
        <>
          <Section title="Tabela">
            <ModeSeg value={b.mode} onChange={(v) => set({ mode: v })} />
            {b.mode === "auto" ? (
              <>
                <Field label="Linhas">
                  <Segmented
                    size="sm"
                    value={b.rows}
                    onChange={(v) => set({ rows: v })}
                    options={[
                      { value: "week", label: "Semana a semana" },
                      { value: "channel", label: "Por canal" },
                    ]}
                  />
                </Field>
                {b.rows === "week" && (
                  <Field label="Canal">
                    <SourceSelect value={b.source} onChange={(s) => set({ source: s })} />
                  </Field>
                )}
                <Field label="Colunas">
                  <MetricList value={b.metrics} onChange={(m) => set({ metrics: m })} max={7} />
                </Field>
              </>
            ) : (
              <Field label="Conteúdo" hint="Copie e cole da planilha (ou separe por ;). A primeira linha é o cabeçalho.">
                <TextArea value={b.manualText} onChange={typing("manualText")} rows={7} mono />
              </Field>
            )}
            <Field label="Título" hint="Em branco: gerado automaticamente.">
              <input className="field" value={b.title} onChange={(e) => typing("title")(e.target.value)} />
            </Field>
          </Section>
          <Section title="Estilo">
            <SurfaceSeg value={b.surface} onChange={(v) => set({ surface: v })} />
          </Section>
        </>
      );

    case "funnel":
      return (
        <>
          <Section title="Funil">
            <ModeSeg value={b.mode} onChange={(v) => set({ mode: v })} />
            {b.mode === "auto" ? (
              <>
                <Field label="Etapas">
                  <MetricList value={b.steps} onChange={(m) => set({ steps: m })} max={6} />
                </Field>
                <Field label="Canal">
                  <SourceSelect value={b.source} onChange={(s) => set({ source: s })} />
                </Field>
              </>
            ) : (
              <Field label="Etapas" hint='Uma por linha: "Etapa; valor".'>
                <TextArea value={b.manualText} onChange={typing("manualText")} rows={6} mono />
              </Field>
            )}
            <Field label="Título">
              <input className="field" value={b.title} onChange={(e) => typing("title")(e.target.value)} />
            </Field>
          </Section>
          <Section title="Estilo">
            <SurfaceSeg value={b.surface} onChange={(v) => set({ surface: v })} />
          </Section>
        </>
      );

    case "goal": {
      const auto = autoTarget(data, b.metric);
      const def = METRICS[b.metric];
      return (
        <>
          <Section title="Meta x realizado">
            <Field label="Métrica">
              <MetricSelect value={b.metric} onChange={(m) => set({ metric: m })} />
            </Field>
            <Field label="Canal">
              <SourceSelect metric={b.metric} value={b.source} onChange={(s) => set({ source: s })} />
            </Field>
            <Field
              label="Meta"
              hint={
                b.targetMode === "auto"
                  ? auto === null
                    ? "O cliente não tem meta cadastrada para esta métrica — digite a meta."
                    : `Meta do cliente${def.targetSums ? ` × ${Math.max(1, data.weeks.length)} semanas` : ""}: ${formatValue(auto, def.format)}.`
                  : def.lowerIsBetter
                    ? "Para custo, a meta é um teto: abaixo dela é bom."
                    : undefined
              }
            >
              <Segmented
                size="sm"
                value={b.targetMode}
                onChange={(v) => set({ targetMode: v })}
                options={[
                  { value: "auto", label: "Do cliente" },
                  { value: "manual", label: "Digitar" },
                ]}
              />
            </Field>
            {b.targetMode === "manual" && <NumberInput value={b.target} onChange={(v) => onChange({ target: v }, `${b.id}:t`)} placeholder="Ex.: 500" />}
            <Field label="Rótulo">
              <input className="field" value={b.label} onChange={(e) => typing("label")(e.target.value)} placeholder={def.label} />
            </Field>
          </Section>
          <Section title="Estilo">
            <SurfaceSeg value={b.surface} onChange={(v) => set({ surface: v })} />
          </Section>
        </>
      );
    }

    case "score":
      return (
        <Section title="Health Score">
          <p className="text-[12px] leading-relaxed text-ink-400">A nota de saúde do cliente no último dia do período, com a faixa (Saudável, Atenção, Crítico).</p>
          <Field label="Rótulo">
            <input className="field" value={b.label} onChange={(e) => typing("label")(e.target.value)} />
          </Field>
          <SurfaceSeg value={b.surface} onChange={(v) => set({ surface: v })} />
        </Section>
      );

    case "image":
      return (
        <>
          <Section title="Imagem">
            <ImageField value={b.url} onChange={(url) => set({ url })} />
          </Section>
          <Section title="Estilo">
            <Field label="Encaixe">
              <Segmented
                size="sm"
                value={b.fit}
                onChange={(v) => set({ fit: v })}
                options={[
                  { value: "cover", label: "Preencher" },
                  { value: "contain", label: "Inteira" },
                ]}
              />
            </Field>
            <Field label={`Cantos · ${b.radius}px`}>
              <input type="range" min={0} max={40} value={b.radius} onChange={(e) => onChange({ radius: Number(e.target.value) }, `${b.id}:r`)} className="w-full accent-[#e50914]" />
            </Field>
          </Section>
        </>
      );

    case "logo":
      return (
        <Section title="Logo V4">
          <Field label="Versão">
            <Segmented
              size="sm"
              value={b.variant}
              onChange={(v) => set({ variant: v })}
              options={[
                { value: "full", label: "V4 Company" },
                { value: "symbol", label: "Símbolo" },
              ]}
            />
          </Field>
          <AlignSeg value={b.align} onChange={(v) => set({ align: v })} />
        </Section>
      );

    case "shape":
      return (
        <Section title="Forma">
          <ColorField label="Cor" value={b.color} onChange={(v) => set({ color: v ?? "accent" })} allowTheme={false} />
          <Field label={`Cantos · ${b.radius}px`}>
            <input type="range" min={0} max={60} value={b.radius} onChange={(e) => onChange({ radius: Number(e.target.value) }, `${b.id}:r`)} className="w-full accent-[#e50914]" />
          </Field>
          <Field label={`Opacidade · ${Math.round(b.opacity * 100)}%`}>
            <input type="range" min={5} max={100} value={Math.round(b.opacity * 100)} onChange={(e) => onChange({ opacity: Number(e.target.value) / 100 }, `${b.id}:o`)} className="w-full accent-[#e50914]" />
          </Field>
        </Section>
      );
  }
}

export const blockLabel = (b: Block) => BLOCKS[b.type].label;
