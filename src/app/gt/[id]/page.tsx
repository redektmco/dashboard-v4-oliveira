import Link from "next/link";
import { notFound } from "next/navigation";
import { getClient, getTargets, listFillers, perfSnapshots } from "@/lib/repo";
import { fieldsFor } from "@/lib/model/catalog";
import { ACCOUNT_TYPE_LABEL } from "@/lib/model/types";
import { currentRitualDate, weekLabel } from "@/lib/week";
import { savePerformance } from "@/actions";
import { FieldBlock } from "@/components/form-fields";
import { FillerSelect } from "@/components/filler-select";
import { PageHeader, Panel, TableScroll, dateBR } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function GtFormPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const client = await getClient(Number(id));
  if (!client) notFound();

  const ref = currentRitualDate();
  const [history, targets, gts] = await Promise.all([
    perfSnapshots(client.id, 6),
    getTargets(client.id),
    listFillers("gt"),
  ]);
  const last = history[0] ?? null;

  const fields = fieldsFor(client.account_type, "gt");
  const perfFields = fields.filter((f) => f.dimension === "performance");
  const qualityFields = fields.filter((f) => f.dimension === "lead_quality");
  const opsFields = fields.filter((f) => f.dimension === "operational");

  // Metas pré-preenchidas; números reais sempre em branco (é dado novo da semana).
  const defaults: Record<string, number | string | null> = { ...targets };
  const values: Record<string, unknown> = {};

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/gt", label: "Performance" }}
        title={client.name}
        description={`${ACCOUNT_TYPE_LABEL[client.account_type]} · semana ${weekLabel(ref)} · GT ${client.gt_name ?? "—"}`}
      />
      {last && (
        <div className="panel px-4 py-2.5 text-xs text-ink-400">
          Último snapshot: <strong className="text-ink-200">{dateBR(last.ref_date)}</strong> por{" "}
          {last.filler ?? "—"}
          <div className="mt-0.5 text-ink-600">
            Salvar não sobrescreve — gera um novo registro datado.
          </div>
        </div>
      )}

      <form action={savePerformance} className="space-y-4">
        <input type="hidden" name="client_id" value={client.id} />
        <input type="hidden" name="account_type" value={client.account_type} />

        <Panel>
          <div className="grid gap-3 px-4 py-3 sm:flex sm:flex-wrap sm:items-end sm:gap-4">
            <label className="block">
              <span className="label">Semana de referência</span>
              <input type="date" name="ref_date" defaultValue={ref} className="field mt-1 sm:w-auto" />
            </label>
            <FillerSelect users={gts} role="gt" />
          </div>
        </Panel>

        <Panel
          title="Resultado da semana"
          subtitle="Número cru + meta. Você não dá nota — a normalização é do sistema."
        >
          {perfFields.map((f) => (
            <FieldBlock key={f.key} field={f} values={values} defaults={defaults} />
          ))}
        </Panel>

        {qualityFields.length > 0 && (
          <Panel
            title="Qualidade de lead"
            subtitle="Cruza com a percepção do comercial registrada pelo Account."
          >
            {qualityFields.map((f) => (
              <FieldBlock key={f.key} field={f} values={values} defaults={defaults} />
            ))}
          </Panel>
        )}

        <Panel title="Saúde operacional" subtitle="Higiene do dado e do SLA. Vale para toda conta.">
          {opsFields.map((f) => (
            <FieldBlock key={f.key} field={f} values={values} defaults={defaults} />
          ))}
          <div className="px-4 py-4">
            <label className="block">
              <span className="label">Observação da semana</span>
              <textarea
                name="note"
                rows={2}
                className="field mt-1"
                placeholder="Contexto — não pontua. Ex.: verba pausada 3 dias por troca de cartão do cliente."
              />
            </label>
          </div>
        </Panel>

        {/* No celular o formulário tem uns três metros de rolagem: o
            salvar gruda acima da barra de abas em vez de esperar lá
            embaixo. No desktop volta a ser uma linha comum. */}
        <div className="form-actions">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <button type="submit" className="btn btn-primary justify-center">
              Salvar snapshot da semana
            </button>
            <Link href="/gt" className="btn justify-center">
              Cancelar
            </Link>
            <span className="hidden text-xs text-ink-600 lg:inline">
              As metas informadas passam a valer como meta vigente do cliente.
            </span>
          </div>
        </div>
      </form>

      {history.length > 0 && (
        <Panel title="Histórico de preenchimento" subtitle="Série datada — o ativo do modelo.">
          <TableScroll>
<table className="data-table">
            <thead>
              <tr>
                <th>Semana</th>
                <th>Preenchido por</th>
                <th>Registrado em</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              {history.map((s) => (
                <tr key={s.id}>
                  <td className="tnum">{dateBR(s.ref_date)}</td>
                  <td className="text-ink-300">{s.filler ?? "—"}</td>
                  <td className="text-ink-500">{s.filled_at}</td>
                  <td className="max-w-[420px] text-ink-400">{String(s.data.note ?? "") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
</TableScroll>
        </Panel>
      )}
    </div>
  );
}
