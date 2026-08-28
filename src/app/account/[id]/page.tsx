import Link from "next/link";
import { notFound } from "next/navigation";
import { checkinSnapshots, getClient, listFillers, today } from "@/lib/repo";
import { fieldsFor } from "@/lib/model/catalog";
import { ACCOUNT_TYPE_LABEL } from "@/lib/model/types";
import { saveCheckin } from "@/actions";
import { FieldBlock } from "@/components/form-fields";
import { FillerSelect } from "@/components/filler-select";
import { PageHeader, Panel, TableScroll, dateBR } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const SCALE_ORDER = [
  "q1_satisfaction",
  "q2_climate",
  "q3_trust",
  "q4_lead_quality",
  "q5_engagement",
  "q6_expectation",
];

export default async function CheckinFormPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const client = await getClient(Number(id));
  if (!client) notFound();

  const [history, accounts] = await Promise.all([
    checkinSnapshots(client.id, 6),
    listFillers("account"),
  ]);
  const last = history[0] ?? null;

  const fields = fieldsFor(client.account_type, "account");
  const scales = SCALE_ORDER.map((k) => fields.find((f) => f.key === k)!).filter(Boolean);
  const attendance = fields.find((f) => f.key === "attendance")!;
  const payment = fields.find((f) => f.key === "payment_ok")!;
  const renewal = fields.find((f) => f.key === "renewal_window")!;

  const values: Record<string, unknown> = {};
  const defaults = { renewal_date: client.renewal_date };

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/account", label: "Check-in" }}
        title={client.name}
        description={`${ACCOUNT_TYPE_LABEL[client.account_type]} · Account ${client.account_name ?? "—"}`}
      />
      {last && (
        <div className="panel px-4 py-2.5 text-xs text-ink-400">
          Último check-in: <strong className="text-ink-200">{dateBR(last.ref_date)}</strong> por{" "}
          {last.filler ?? "—"}
          <div className="mt-0.5 text-ink-600">
            Cada check-in vira um snapshot — a série mostra a curva da relação.
          </div>
        </div>
      )}

      <form action={saveCheckin} className="space-y-4">
        <input type="hidden" name="client_id" value={client.id} />

        <Panel>
          <div className="grid gap-3 px-4 py-3 sm:flex sm:flex-wrap sm:items-end sm:gap-4 sm:px-5 sm:py-3.5">
            <label className="block">
              <span className="label">Data do check-in</span>
              <input
                type="date"
                name="ref_date"
                defaultValue={today()}
                className="field mt-1 sm:w-auto"
              />
            </label>
            <FillerSelect users={accounts} role="account" />
          </div>
        </Panel>

        <Panel
          title="Roteiro do check-in"
          subtitle="Seis perguntas para fazer ao cliente, ao vivo, na ordem. Leia o enunciado em voz alta e registre a nota que ele der — a âncora abaixo do número é só a conferência."
        >
          {scales.map((f, n) => (
            <FieldBlock key={f.key} field={f} values={values} index={n + 1} />
          ))}
        </Panel>

        <Panel title="Fatos objetivos" subtitle="Registro do Account depois da call — não se pergunta ao cliente.">
          <FieldBlock field={attendance} values={values} />
          <FieldBlock field={payment} values={values} />
          <div className="border-b border-[var(--border-hair)] px-5 py-5">
            <h3 className="font-display text-[15px] font-semibold text-ink-100">{renewal.label}</h3>
            <p className="mt-1 text-xs text-ink-400">{renewal.definition}</p>
            <div className="mt-3 max-w-xs">
              <input
                type="date"
                name="renewal_date"
                defaultValue={defaults.renewal_date ?? ""}
                className="field"
              />
            </div>
          </div>

          <div className="px-5 py-5">
            <h3 className="text-sm font-semibold text-vermelho-fg">Flag de risco explícito</h3>
            <p className="mt-1 max-w-3xl text-xs text-ink-400">
              Mencionou concorrente, corte de verba ou insatisfação séria? Marcar sim força a banda
              vermelha independentemente do resto do score.
            </p>
            <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
              {[
                { v: "nao", l: "Não" },
                { v: "sim", l: "Sim — há risco explícito" },
              ].map((o) => (
                <label key={o.v} className="cursor-pointer">
                  <input
                    type="radio"
                    name="risk_flag"
                    value={o.v}
                    defaultChecked={o.v === "nao"}
                    className="peer sr-only"
                  />
                  <span className="flex min-h-[44px] items-center justify-center rounded-lg border border-ink-700 bg-ink-850 px-3.5 py-1.5 text-[13px] font-medium text-ink-300 transition-colors peer-checked:border-v4-red peer-checked:bg-vermelho-dim peer-checked:text-vermelho-fg hover:border-ink-600 sm:min-h-0 sm:block">
                    {o.l}
                  </span>
                </label>
              ))}
            </div>
            <label className="mt-3 block max-w-3xl">
              <span className="label">Qual o risco?</span>
              <textarea
                name="risk_note"
                rows={2}
                className="field mt-1"
                placeholder="Ex.: pediu proposta comparativa de outra agência e falou em reduzir verba no próximo ciclo."
              />
            </label>
            <label className="mt-3 block max-w-3xl">
              <span className="label">Resumo da conversa (contexto, não pontua)</span>
              <textarea name="summary" rows={2} className="field mt-1" />
            </label>
          </div>
        </Panel>

        {/* Seis perguntas de escala rolam muito no celular; o salvar
            acompanha, grudado acima da barra de abas. */}
        <div className="form-actions">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <button type="submit" className="btn btn-primary justify-center">
              Salvar check-in
            </button>
            <Link href="/account" className="btn justify-center">
              Cancelar
            </Link>
          </div>
        </div>
      </form>

      {history.length > 0 && (
        <Panel title="Curva da relação" subtitle="Check-ins anteriores, do mais recente ao mais antigo.">
          <TableScroll>
<table className="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Account</th>
                {["Satisf.", "Clima", "Confiança", "Lead", "Engaj.", "Expect."].map((h) => (
                  <th key={h} className="text-center">
                    {h}
                  </th>
                ))}
                <th>Risco</th>
              </tr>
            </thead>
            <tbody>
              {history.map((s) => (
                <tr key={s.id}>
                  <td className="tnum">{dateBR(s.ref_date)}</td>
                  <td className="text-ink-300">{s.filler ?? "—"}</td>
                  {SCALE_ORDER.map((k) => {
                    const n = Number(s.data[k]) || 0;
                    return (
                      <td key={k} className="text-center">
                        <span
                          className={`tnum inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${
                            n >= 4
                              ? "bg-verde-dim text-verde-fg"
                              : n === 3
                                ? "bg-ink-800 text-ink-300"
                                : "bg-vermelho-dim text-vermelho-fg"
                          }`}
                        >
                          {n || "—"}
                        </span>
                      </td>
                    );
                  })}
                  <td className="max-w-[240px] text-xs text-vermelho-fg">
                    {s.data.risk_flag ? String(s.data.risk_note || "sim") : ""}
                  </td>
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
