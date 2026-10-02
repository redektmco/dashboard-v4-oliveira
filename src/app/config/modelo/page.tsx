import { DIMENSIONS, fieldsFor } from "@/lib/model/catalog";
import { getConfig, getWeights, lastRecompute, listClients } from "@/lib/repo";
import { listVersions } from "@/lib/calibration";
import { daysSince, whenBR } from "@/lib/config-status";
import { requireUser } from "@/lib/auth";
import type { DimensionKey } from "@/lib/model/types";
import { ConfigPage } from "@/components/config-shell";
import { CalibrationEditor } from "@/components/config/calibration-editor";

export const dynamic = "force-dynamic";

/** Indicadores de cada dimensão, somando os três tipos de conta (sem repetir). */
function indicators(key: DimensionKey) {
  const all = [...fieldsFor("lead_gen"), ...fieldsFor("ecommerce"), ...fieldsFor("branding")].filter((f) => f.dimension === key);
  return [...new Set(all.map((f) => f.label))];
}

export default async function ModeloPage() {
  await requireUser();
  const [weights, cfg, versions, stamp, clients] = await Promise.all([getWeights(), getConfig(), listVersions(12), lastRecompute(), listClients()]);
  const age = daysSince(stamp?.at);

  return (
    <ConfigPage>
      <CalibrationEditor
        dims={DIMENSIONS.map((d) => ({ key: d.key, label: d.label, defaultWeight: d.defaultWeight, indicators: indicators(d.key) }))}
        weights={Object.fromEntries(DIMENSIONS.map((d) => [d.key, weights[d.key] ?? d.defaultWeight])) as Record<DimensionKey, number>}
        rules={{
          greenFloor: cfg.greenFloor,
          yellowFloor: cfg.yellowFloor,
          perfMaxAgeDays: cfg.perfMaxAgeDays,
          checkinMaxAgeDays: cfg.checkinMaxAgeDays,
          underMetaThreshold: cfg.underMetaThreshold,
          underMetaCycles: cfg.underMetaCycles,
        }}
        versions={versions.map((v) => ({ version: v.version, note: v.note, created_at: v.created_at, by: v.by }))}
        clients={clients.length}
        recompute={
          stamp
            ? {
                label: `Último: ${whenBR(stamp.at).replace(/^Hoje/, "hoje").replace(/^Ontem/, "ontem")} · ${stamp.clients} clientes · ${(stamp.ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`,
                ok: age !== null && age <= 1,
              }
            : null
        }
      />
    </ConfigPage>
  );
}
