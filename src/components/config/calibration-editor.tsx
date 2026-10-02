"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { previewCalibration, restoreCalibration, resetWeights, runRecompute, saveCalibration } from "@/actions";
import type { ImpactPreview } from "@/lib/calibration";
import type { DimensionKey } from "@/lib/model/types";
import type { ScoreConfig } from "@/lib/model/scoring";
import { ConfirmDialog, Modal } from "../modal";
import { toast } from "../toast";
import { Icon, type IconName } from "../icon";
import { Bar, PageTitle, Pill } from "../kit";

type Dim = { key: DimensionKey; label: string; defaultWeight: number; indicators: string[] };
type Version = { version: number; note: string; created_at: string; by: string | null };
type Rules = Pick<ScoreConfig, "greenFloor" | "yellowFloor" | "perfMaxAgeDays" | "checkinMaxAgeDays" | "underMetaThreshold" | "underMetaCycles">;

const RULE_KEYS: (keyof Rules)[] = ["greenFloor", "yellowFloor", "perfMaxAgeDays", "checkinMaxAgeDays", "underMetaThreshold", "underMetaCycles"];

const dd = (ts: string) => {
  const d = new Date(ts.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
};

/**
 * Modelo e calibração: explica como o score sai e deixa ajustar pesos e
 * regras com a prévia do impacto na carteira antes de salvar. Nada muda até
 * "Salvar e recalcular" — que grava uma versão nova (dá para voltar).
 */
export function CalibrationEditor({
  dims,
  weights,
  rules,
  versions,
  clients,
  recompute,
}: {
  dims: Dim[];
  weights: Record<DimensionKey, number>;
  rules: Rules;
  versions: Version[];
  clients: number;
  recompute: { label: string; ok: boolean } | null;
}) {
  const [w, setW] = useState(weights);
  const [r, setR] = useState(rules);
  const [preview, setPreview] = useState<ImpactPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, startSave] = useTransition();
  const [showVersions, setShowVersions] = useState(false);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [resetting, setResetting] = useState(false);
  const [http, setHttp] = useState(false);

  const current = versions[0];
  const changed = [
    ...dims.filter((d) => w[d.key] !== weights[d.key]).map((d) => d.key as string),
    ...RULE_KEYS.filter((k) => r[k] !== rules[k]),
  ];
  const dirty = changed.length > 0;
  const total = dims.reduce((a, d) => a + (Number(w[d.key]) || 0), 0);
  const maxW = Math.max(...dims.map((d) => d.defaultWeight), ...dims.map((d) => w[d.key] || 0), 1);
  const floorsOk = r.yellowFloor < r.greenFloor;

  // Prévia: a carteira de hoje com a configuração na tela (espera parar de digitar).
  const key = JSON.stringify({ w, r });
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      setPreviewing(true);
      previewCalibration({ weights: w, config: r }).then((p) => {
        if (!alive) return;
        setPreviewing(false);
        if ("error" in p) return;
        setPreview(p);
      });
    }, 450);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const discard = () => {
    setW(weights);
    setR(rules);
  };

  const save = () =>
    startSave(async () => {
      const res = await saveCalibration({ weights: w, config: r });
      if (res?.error) toast(res.error, { tone: "error" });
      else if (res?.ok) toast(res.ok);
    });

  // Depois do salvar, a página recarrega com os valores novos como base.
  const [base, setBase] = useState(key);
  const baseKey = JSON.stringify({ w: weights, r: rules });
  if (base !== baseKey) {
    setBase(baseKey);
    setW(weights);
    setR(rules);
  }

  const setRule = (k: keyof Rules) => (v: number) => setR({ ...r, [k]: v });

  return (
    <div className="flex flex-col gap-6">
      {dirty && (
        <div className="sticky top-0 z-20 -mt-5 flex items-center gap-3 rounded-b-[10px] border border-t-0 border-amarelo/25 bg-[color-mix(in_srgb,var(--color-amarelo)_10%,var(--color-ink-950))] px-4 py-3 lg:-mt-9">
          <Icon name="pencil" size={14} className="shrink-0 text-amarelo-fg" />
          <span className="min-w-0 flex-1 text-[13px] font-medium text-amarelo-fg">
            Editando calibração · {changed.length} {changed.length === 1 ? "alteração não salva" : "alterações não salvas"}.
            <span className="hidden sm:inline"> Nada muda na carteira até você salvar.</span>
          </span>
          <button type="button" onClick={discard} className="text-[13px] font-semibold text-amarelo-fg hover:underline">
            Descartar
          </button>
        </div>
      )}

      <div className={dirty ? "pt-2" : ""}>
        <PageTitle
          title="Modelo e calibração"
          description="Como o Health Score é formado — e onde ajustar. Revisão trimestral."
          aside={
            current && (
              <button type="button" onClick={() => setShowVersions(true)} className="text-[12px] text-ink-400 hover:text-ink-100">
                Versão em uso: v{current.version} · desde {dd(current.created_at)}
              </button>
            )
          }
        />
      </div>

      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Como funciona */}
          <section className="flex flex-col gap-[18px] rounded-xl border border-[var(--border-hair)] bg-ink-900 p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-col gap-1">
                <h2 className="font-display text-[15px] font-semibold text-ink-100">Como o score funciona</h2>
                <p className="text-[13px] leading-[19px] text-ink-400">
                  Cada dimensão recebe uma nota de 0 a 100 a partir dos seus indicadores. O score é a média ponderada pelos pesos abaixo, e a faixa define a
                  cor da conta.
                </p>
              </div>
              <Link href="/config/modelo/detalhes" className="flex shrink-0 items-center gap-1 text-[12px] text-ink-300 hover:text-ink-100">
                Ver o modelo completo
                <Icon name="arrowRight" size={13} />
              </Link>
            </div>
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              {[
                ["Indicadores", "ROAS, CPL, check-ins"],
                ["Nota por dimensão", "0 a 100"],
                ["Média ponderada", "pelos pesos"],
                ["Faixa", "cor da conta"],
              ].map(([t, s], i) => (
                <div key={t} className="contents">
                  {i > 0 && <Icon name="arrowRight" size={14} className="hidden shrink-0 text-ink-500 sm:block" />}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg bg-ink-850 px-3 py-2.5">
                    <span className="truncate text-[12px] font-semibold text-ink-100">{t}</span>
                    <span className="truncate text-[11px] text-ink-400">{s}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Pesos */}
          <section className="flex flex-col gap-1 rounded-xl border border-[var(--border-hair)] bg-ink-900 p-6">
            <div className="flex justify-between gap-3 pb-3">
              <div className="flex flex-col gap-1">
                <h2 className="font-display text-[15px] font-semibold text-ink-100">Pesos das dimensões</h2>
                <p className="text-[13px] leading-[19px] text-ink-400">Quanto cada dimensão pesa no score. Precisam somar 100%.</p>
              </div>
              <span
                className={`flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold ${
                  total === 100 ? "bg-verde-dim text-verde-fg" : "bg-vermelho-dim text-vermelho-fg"
                }`}
              >
                <Icon name={total === 100 ? "checkCircle" : "alertCircle"} size={13} />
                {total}%
              </span>
            </div>
            {dims.map((d) => {
              const edited = w[d.key] !== weights[d.key];
              const shown = d.indicators.slice(0, 4);
              return (
                <div key={d.key} className="flex items-center gap-4 border-t border-[var(--border-hair)] py-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-ink-100">{d.label}</span>
                    <span className="flex flex-wrap gap-1">
                      {shown.map((i) => (
                        <span key={i} className="rounded bg-ink-850 px-1.5 py-0.5 text-[11px] text-ink-400">
                          {i}
                        </span>
                      ))}
                      {d.indicators.length > shown.length && <span className="px-1 py-0.5 text-[11px] text-ink-500">+{d.indicators.length - shown.length}</span>}
                    </span>
                  </div>
                  <div className="hidden w-[120px] shrink-0 sm:block">
                    <Bar value={((w[d.key] || 0) / maxW) * 100} tone={edited ? "amarelo" : "neutro"} />
                  </div>
                  <span className="flex w-[110px] shrink-0 items-center justify-end gap-2">
                    {edited && <span className="tnum text-[12px] text-ink-400 line-through decoration-ink-600">{weights[d.key]}%</span>}
                    <InlineNumber value={w[d.key]} onChange={(v) => setW({ ...w, [d.key]: v })} suffix="%" width={56} edited={edited} label={`Peso de ${d.label}`} />
                  </span>
                </div>
              );
            })}
          </section>

          {/* Regras */}
          <section className="flex flex-col gap-1 rounded-xl border border-[var(--border-hair)] bg-ink-900 p-6">
            <div className="flex flex-col gap-1 pb-3">
              <h2 className="font-display text-[15px] font-semibold text-ink-100">Regras</h2>
              <p className="text-[13px] leading-[19px] text-ink-400">Escritas como frases: o que você lê é exatamente o que o sistema faz.</p>
            </div>
            <Rule icon="palette">
              Score a partir de <InlineNumber value={r.greenFloor} onChange={setRule("greenFloor")} edited={r.greenFloor !== rules.greenFloor} label="Piso do Saudável" /> fica{" "}
              <Tone tone="verde">Saudável</Tone>; a partir de{" "}
              <InlineNumber value={r.yellowFloor} onChange={setRule("yellowFloor")} edited={r.yellowFloor !== rules.yellowFloor} label="Piso da Atenção" /> fica{" "}
              <Tone tone="amarelo">Atenção</Tone>; abaixo, <Tone tone="vermelho">Crítico</Tone>
              {!floorsOk && <span className="w-full text-[12px] text-vermelho-fg">O piso da Atenção precisa ser menor que o do Saudável.</span>}
            </Rule>
            <Rule icon="clock">
              Performance sem atualização há mais de{" "}
              <InlineNumber value={r.perfMaxAgeDays} onChange={setRule("perfMaxAgeDays")} edited={r.perfMaxAgeDays !== rules.perfMaxAgeDays} label="Dias de frescor da performance" max={365} />{" "}
              dias reduz a confiança do score.
            </Rule>
            <Rule icon="calendarCheck">
              Cliente sem check-in há mais de{" "}
              <InlineNumber value={r.checkinMaxAgeDays} onChange={setRule("checkinMaxAgeDays")} edited={r.checkinMaxAgeDays !== rules.checkinMaxAgeDays} label="Dias sem check-in" max={365} /> dias
              entra em Pendências do Account e reduz a confiança.
            </Rule>
            <Rule icon="trendingDown">
              Se Performance ficar abaixo de{" "}
              <InlineNumber value={r.underMetaThreshold} onChange={setRule("underMetaThreshold")} edited={r.underMetaThreshold !== rules.underMetaThreshold} label="Limite de performance" /> por{" "}
              <InlineNumber value={r.underMetaCycles} onChange={setRule("underMetaCycles")} edited={r.underMetaCycles !== rules.underMetaCycles} label="Ciclos seguidos" max={12} /> ciclos
              seguidos, a conta fica <Tone tone="vermelho">Crítico</Tone>
            </Rule>
          </section>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-4 xl:w-[360px]">
          {/* Prévia do impacto */}
          <section className={`flex flex-col gap-4 rounded-xl border bg-ink-900 p-6 ${dirty ? "border-amarelo/25" : "border-[var(--border-hair)]"}`}>
            <div className="flex flex-col gap-1">
              <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold text-ink-100">
                Prévia do impacto
                {previewing && <span className="spinner text-ink-400" aria-hidden />}
              </h2>
              <p className="text-[13px] leading-[19px] text-ink-400">
                {dirty ? "Simulado na carteira de hoje, com as alterações não salvas." : "Altere um peso ou uma regra para ver quem muda de faixa antes de salvar."}
              </p>
            </div>
            {preview && (
              <>
                <Dist label="Hoje" c={preview.today} />
                {dirty && <Dist label="Com as alterações" c={preview.next} />}
                {dirty && (
                  <div className="flex flex-col pt-1">
                    <span className="text-[12px] font-semibold text-ink-300">
                      {preview.changes.length === 0
                        ? "Nenhum cliente muda de faixa"
                        : `${preview.changes.length} ${preview.changes.length === 1 ? "cliente muda" : "clientes mudam"} de faixa`}
                    </span>
                    {preview.changes.slice(0, 6).map((c) => (
                      <div key={c.id} className="flex items-center gap-2 border-b border-[var(--border-hair)] py-2.5">
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-100">{c.name}</span>
                        <BandDot band={c.from} />
                        <span className="tnum text-[12px] text-ink-400">{c.a === null ? "—" : Math.round(c.a)}</span>
                        <Icon name="arrowRight" size={12} className="text-ink-500" />
                        <BandDot band={c.to} />
                        <span className="tnum text-[12px] font-semibold text-ink-100">{c.b === null ? "—" : Math.round(c.b)}</span>
                      </div>
                    ))}
                    {preview.changes.length > 6 && <span className="pt-2 text-[12px] text-ink-400">e mais {preview.changes.length - 6}.</span>}
                  </div>
                )}
              </>
            )}
            <div className="flex gap-2">
              <Icon name="history" size={14} className="mt-0.5 shrink-0 text-ink-400" />
              <span className="text-[12px] leading-[17px] text-ink-400">
                Salvar reescreve a série de 90 dias de {clients} {clients === 1 ? "cliente" : "clientes"} e cria a versão v{(current?.version ?? 0) + 1}.
                {current ? ` Dá para voltar à v${current.version} depois.` : ""}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary w-full"
              disabled={!dirty || saving || total !== 100 || !floorsOk}
              aria-busy={saving}
              onClick={save}
              title={total !== 100 ? "Os pesos precisam somar 100%" : undefined}
            >
              {saving ? <span className="spinner" aria-hidden /> : <Icon name="refresh" size={16} />}
              {saving ? "Salvando e recalculando…" : "Salvar e recalcular 90 dias"}
            </button>
          </section>

          {/* Operação */}
          <section className="flex flex-col gap-3 rounded-xl border border-[var(--border-hair)] bg-ink-900 p-5">
            <h2 className="font-display text-[15px] font-semibold text-ink-100">Operação</h2>
            <div className="flex items-center gap-2 text-[12px] text-ink-300">
              <Icon name="clock" size={14} className="shrink-0 text-ink-400" />
              Recompute diário às 06:00, após as integrações
            </div>
            <div className="flex items-center gap-2 text-[12px] text-ink-300">
              <Icon name={recompute?.ok ? "checkCircle" : "alertCircle"} size={14} className={`shrink-0 ${recompute?.ok ? "text-verde-fg" : "text-amarelo-fg"}`} />
              {recompute ? recompute.label : "Ainda não rodou"}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <RecomputeNow />
              <button type="button" onClick={() => setHttp(!http)} className="btn btn-ghost h-8 px-2.5">
                <Icon name="code" size={15} />
                Chamar por HTTP
              </button>
            </div>
            {http && (
              <p className="rounded-md bg-ink-850 px-3 py-2 text-[12px] text-ink-300">
                <code className="font-mono text-[11px]">POST /api/recompute</code> com o header <code className="font-mono text-[11px]">x-recompute-token</code>.{" "}
                <code className="font-mono text-[11px]">?days=90</code> refaz a série.
              </p>
            )}
          </section>
        </div>
      </div>

      <Modal open={showVersions} onClose={() => setShowVersions(false)} title="Versões da calibração" description="A versão em uso é a mais recente. Voltar a uma anterior cria uma versão nova com os valores dela.">
        <ul className="divide-y divide-[var(--border-hair)] rounded-lg border border-[var(--border-hair)]">
          {versions.map((v, i) => (
            <li key={v.version} className="flex items-center gap-3 px-3 py-2.5">
              <span className="tnum w-8 text-[13px] font-semibold text-ink-100">v{v.version}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink-300">{v.note || "Calibração salva"}</span>
                <span className="block text-[11px] text-ink-400">
                  {dd(v.created_at)}
                  {v.by ? ` · ${v.by}` : ""}
                </span>
              </span>
              {i === 0 ? (
                <Pill tone="verde">Em uso</Pill>
              ) : (
                <button type="button" className="btn btn-sm" onClick={() => setRestoring(v.version)}>
                  Voltar a esta
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost mr-auto" onClick={() => setResetting(true)}>
            Voltar ao padrão do modelo
          </button>
          <button type="button" className="btn" onClick={() => setShowVersions(false)}>
            Fechar
          </button>
        </div>
      </Modal>
      <ConfirmDialog
        open={restoring !== null}
        onClose={() => setRestoring(null)}
        title={`Voltar à v${restoring}?`}
        confirmLabel="Voltar e recalcular"
        tone="default"
        pendingLabel="Recalculando 90 dias…"
        onConfirm={async () => {
          const res = await restoreCalibration(restoring!);
          if (!res?.error) setShowVersions(false);
          return res;
        }}
      >
        <p>Os pesos e regras da v{restoring} voltam a valer como uma versão nova, e os últimos 90 dias da série são recalculados.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={resetting}
        onClose={() => setResetting(false)}
        title="Voltar ao padrão do modelo?"
        confirmLabel="Voltar ao padrão"
        tone="default"
        pendingLabel="Recalculando 90 dias…"
        onConfirm={async () => {
          const res = await resetWeights();
          if (!res?.error) setShowVersions(false);
          return res;
        }}
      >
        <p>Pesos e regras voltam aos valores padrão do modelo (vira uma versão nova) e os últimos 90 dias são recalculados.</p>
      </ConfirmDialog>
    </div>
  );
}

function Rule({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-t border-[var(--border-hair)] py-3">
      <Icon name={icon} size={16} className="mt-[7px] shrink-0 text-ink-400" />
      <div className="flex flex-1 flex-wrap items-center gap-1.5 text-[13px] leading-[30px] text-ink-300">{children}</div>
    </div>
  );
}

function Tone({ tone, children }: { tone: "verde" | "amarelo" | "vermelho"; children: React.ReactNode }) {
  const cls = { verde: "bg-verde-dim text-verde-fg", amarelo: "bg-amarelo-dim text-amarelo-fg", vermelho: "bg-vermelho-dim text-vermelho-fg" }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold leading-normal ${cls}`}>{children}</span>;
}

function InlineNumber({
  value,
  onChange,
  suffix = "",
  width = 48,
  edited,
  label,
  max = 100,
}: {
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  width?: number;
  edited?: boolean;
  label: string;
  max?: number;
}) {
  // Texto livre enquanto digita; fora do foco mostra sempre o valor aplicado.
  const [text, setText] = useState<string | null>(null);
  return (
    <span
      className={`tnum inline-flex h-[30px] items-center justify-center rounded-md border bg-ink-950 px-1.5 focus-within:border-ink-300 ${
        edited ? "border-amarelo" : "border-[var(--border-strong)]"
      }`}
      style={{ width }}
    >
      <input
        aria-label={label}
        inputMode="numeric"
        value={text ?? String(value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => setText(null)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d]/g, "").slice(0, 3);
          setText(raw);
          if (raw !== "") onChange(Math.min(max, Number(raw)));
        }}
        className={`min-w-0 bg-transparent text-[13px] font-semibold text-ink-100 outline-none ${suffix ? "text-right" : "w-full text-center"}`}
        style={suffix ? { width: `${Math.max(1, (text ?? String(value)).length) + 0.4}ch` } : undefined}
      />
      {suffix && <span className="text-[13px] font-semibold text-ink-100">{suffix}</span>}
    </span>
  );
}

function BandDot({ band }: { band: "verde" | "amarelo" | "vermelho" | null }) {
  const cls = band === "verde" ? "bg-verde" : band === "amarelo" ? "bg-amarelo" : band === "vermelho" ? "bg-vermelho" : "bg-ink-500";
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cls}`} />;
}

function Dist({ label, c }: { label: string; c: ImpactPreview["today"] }) {
  const total = c.verde + c.amarelo + c.vermelho || 1;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-[12px]">
        <span className="text-ink-300">{label}</span>
        <span className="tnum text-ink-400">
          {c.verde} · {c.amarelo} · {c.vermelho}
        </span>
      </div>
      <div className="flex h-2 gap-0.5">
        {c.verde > 0 && <span className="rounded-sm bg-verde" style={{ flex: c.verde / total }} />}
        {c.amarelo > 0 && <span className="rounded-sm bg-amarelo" style={{ flex: c.amarelo / total }} />}
        {c.vermelho > 0 && <span className="rounded-sm bg-vermelho" style={{ flex: c.vermelho / total }} />}
        {c.verde + c.amarelo + c.vermelho === 0 && <span className="flex-1 rounded-sm bg-ink-800" />}
      </div>
    </div>
  );
}

function RecomputeNow() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn h-8"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        start(async () => {
          const r = await runRecompute();
          if (r?.error) toast(r.error, { tone: "error" });
          else if (r?.ok) toast(r.ok);
        })
      }
    >
      {pending ? <span className="spinner" aria-hidden /> : <Icon name="play" size={16} />}
      {pending ? "Rodando…" : "Rodar agora"}
    </button>
  );
}

export type { Dim as CalibrationDim, Version as CalibrationVersionView, Rules as CalibrationRules };
