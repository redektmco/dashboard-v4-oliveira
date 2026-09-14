import Link from "next/link";
import { DIMENSIONS } from "@/lib/model/catalog";
import { getConfig, getWeights } from "@/lib/repo";
import { saveWeights } from "@/actions";
import { NumberField } from "@/components/number-field";
import { ActionForm, SubmitButton } from "@/components/form-controls";
import { RecomputeButton, ResetWeightsButton } from "@/components/calibration-actions";
import { Panel, SectionHeader } from "@/components/ui";
import { RITUAL_LABEL } from "@/lib/week";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CalibracaoPage() {
  await requireUser();
  const [weights, cfg] = await Promise.all([getWeights(), getConfig()]);
  const total = DIMENSIONS.reduce((a, d) => a + (weights[d.key] ?? 0), 0);

  return (
    <>
      <SectionHeader
        title="Calibração do modelo"
        description={
          <>
            Pesos e limiares da recalibração trimestral. Salvar reescreve os últimos 90 dias da série.{" "}
            <Link href="/config/modelo" className="font-semibold text-ink-200 underline-offset-2 hover:underline">
              Ver como o score é calculado
            </Link>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Panel title="Pesos das dimensões" subtitle={`Somam ${total}%${total !== 100 ? " — o ideal é 100%" : ""}.`}>
          <ActionForm action={saveWeights} className="space-y-4 px-4 py-4 sm:px-5">
            <div className="space-y-3">
              {DIMENSIONS.map((d) => (
                <div key={d.key} className="grid grid-cols-[1fr_96px] items-center gap-3">
                  <div>
                    <div className="text-sm text-ink-100">{d.label}</div>
                    <div className="text-[11px] text-ink-500">
                      {d.source} · padrão {d.defaultWeight}%
                    </div>
                  </div>
                  <NumberField name={`w_${d.key}`} defaultValue={weights[d.key]} min={0} max={100} align="right" />
                </div>
              ))}
            </div>

            <div className="border-t border-[var(--border-hair)] pt-4">
              <h3 className="label mb-2">Limiares</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <Num name="cfg_greenFloor" label="Piso do verde" value={cfg.greenFloor} />
                <Num name="cfg_yellowFloor" label="Piso do amarelo" value={cfg.yellowFloor} />
                <Num name="cfg_perfMaxAgeDays" label="Frescor performance (dias)" value={cfg.perfMaxAgeDays} />
                <Num name="cfg_checkinMaxAgeDays" label="Frescor check-in (dias)" value={cfg.checkinMaxAgeDays} />
                <Num name="cfg_underMetaThreshold" label="Override: performance abaixo de" value={cfg.underMetaThreshold} />
                <Num name="cfg_underMetaCycles" label="…por quantos ciclos" value={cfg.underMetaCycles} />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <SubmitButton pendingLabel="Salvando e recalculando…">Salvar e recalcular 90 dias</SubmitButton>
              <ResetWeightsButton />
            </div>
          </ActionForm>
        </Panel>

        <Panel title="Operação" subtitle="O único job é o recompute diário.">
          <div className="space-y-3 px-4 py-4 text-sm text-ink-300 sm:px-5">
            <p>
              Ritual do GT: <strong className="text-ink-100">{RITUAL_LABEL}</strong>. Check-in do Account: a cada
              contato relevante.
            </p>
            <p className="text-[13px] text-ink-400">
              O recompute roda sozinho todo dia (cron da Vercel). Use o botão só se precisar do score de hoje
              atualizado agora.
            </p>
            <RecomputeButton />
            <details className="text-xs text-ink-400">
              <summary className="cursor-pointer font-semibold text-ink-300">Chamar por HTTP</summary>
              <p className="mt-2">
                <code className="rounded bg-ink-850 px-1 py-0.5 font-mono text-[11px]">POST /api/recompute</code> com
                o header <code className="font-mono text-[11px]">x-recompute-token</code>.
              </p>
            </details>
          </div>
        </Panel>
      </div>
    </>
  );
}

function Num({ name, label, value }: { name: string; label: string; value: number }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="mt-1 block">
        <NumberField name={name} defaultValue={value} />
      </span>
    </label>
  );
}
