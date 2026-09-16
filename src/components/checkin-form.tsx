import Link from "next/link";
import { fieldsFor } from "@/lib/model/catalog";
import { ACCOUNT_TYPE_LABEL, type ScoreResult, type User } from "@/lib/model/types";
import type { ClientRow, Snap } from "@/lib/repo";
import { daysBetween } from "@/lib/model/scoring";
import { saveCheckin } from "@/actions";
import { FieldBlock } from "@/components/form-fields";
import { FillerSelect } from "@/components/filler-select";
import { BandChip, ConfidenceTag, PageHeader, Panel, ScoreBar, brl, dateBR } from "@/components/ui";
import { Icon } from "@/components/icon";
import { SubmitButton } from "@/components/form-controls";

const SCALE_ORDER = [
  "q1_satisfaction",
  "q2_climate",
  "q3_trust",
  "q4_lead_quality",
  "q5_engagement",
  "q6_expectation",
];

const SCALE_SHORT = ["Satisf.", "Clima", "Confiança", "Lead", "Engaj.", "Expect."];

/**
 * A tela do check-in (só a visão — quem busca os dados é a rota).
 *
 * Duas colunas: à esquerda o formulário (identificação → situação do cliente
 * → roteiro → fatos → risco), à direita o histórico que dá contexto ao que
 * está sendo respondido. Antes tudo era uma coluna só e a curva da relação
 * ficava depois do botão de salvar — ou seja, ninguém via antes de decidir.
 */
export function CheckinForm({
  client,
  history,
  accounts,
  score,
  at,
}: {
  client: ClientRow;
  history: Snap[];
  accounts: User[];
  score: ScoreResult | null;
  at: string;
}) {
  const last = history[0] ?? null;
  const readingAge = last ? daysBetween(last.ref_date, at) : null;
  const renewalIn = client.renewal_date ? daysBetween(at, client.renewal_date) : null;

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
        icon="users"
        back={{ href: "/account", label: "Check-in" }}
        title={client.name}
        eyebrow={ACCOUNT_TYPE_LABEL[client.account_type]}
        description={
          <>
            Account {client.account_name ?? "—"} · {brl(client.mrr)}/mês
            {last ? ` · último check-in em ${dateBR(last.ref_date)} por ${last.filler ?? "—"}` : " · sem check-in registrado"}
          </>
        }
      />

      <form action={saveCheckin} className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <input type="hidden" name="client_id" value={client.id} />

        {/* ---------------- coluna do formulário ---------------- */}
        <div className="space-y-4">
          <Panel title="Novo check-in" subtitle="Registre logo depois da call, em 2–3 minutos.">
            <div className="grid gap-3 px-4 py-3.5 sm:grid-cols-2 sm:px-5">
              <label className="block">
                <span className="label">Data do check-in</span>
                <input type="date" name="ref_date" defaultValue={at} className="field mt-1" />
              </label>
              <FillerSelect users={accounts} role="account" />
            </div>

            {/* Situação do cliente: o número que o check-in vai mover, à
                vista antes da primeira resposta. */}
            <div className="border-t border-[var(--border-hair)] px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Icon name="alert" size={16} className="text-v4-red" />
                <h3 className="font-display text-[15px] font-semibold text-ink-100">
                  Situação do cliente
                </h3>
                <div className="ml-auto flex items-center gap-2.5">
                  <BandChip band={score?.band ?? null}>
                    {score?.score === null || !score ? "—" : Math.round(score.score)}
                  </BandChip>
                  {score && <ConfidenceTag c={score.confidence} compact />}
                </div>
              </div>
              <div className="mt-2.5">
                <ScoreBar value={score?.score ?? null} />
              </div>
              <dl className="mt-3.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                {[
                  { k: "MRR", v: brl(client.mrr) },
                  {
                    k: "Renovação",
                    v: renewalIn === null ? "—" : `em ${renewalIn}d`,
                    tone: renewalIn !== null && renewalIn <= 30 ? "text-amarelo-fg" : "",
                  },
                  {
                    k: "Última leitura",
                    v: readingAge === null ? "nunca" : `${readingAge}d`,
                    tone: readingAge === null || readingAge > 35 ? "text-vermelho-fg" : "",
                  },
                  { k: "Check-ins", v: String(history.length) },
                ].map((s) => (
                  <div key={s.k} className="rounded-lg border border-[var(--border-hair)] bg-ink-850 px-3 py-2.5">
                    <dt className="eyebrow">{s.k}</dt>
                    <dd className={`tnum mt-1 font-display text-[15px] font-bold ${s.tone ?? ""}`}>
                      {s.v}
                    </dd>
                  </div>
                ))}
              </dl>
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
            <div className="border-b border-[var(--border-hair)] px-4 py-4 sm:px-5 sm:py-5">
              <h3 className="text-sm font-semibold text-ink-100">{renewal.label}</h3>
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

            <div className="px-4 py-4 sm:px-5 sm:py-5">
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
              <SubmitButton className="btn-primary justify-center" pendingLabel="Salvando check-in…">
                Salvar check-in
              </SubmitButton>
              <Link href="/account" className="btn justify-center">
                Cancelar
              </Link>
              <span className="hidden text-xs text-ink-600 lg:inline">
                Salvar não sobrescreve — cada check-in vira um snapshot datado.
              </span>
            </div>
          </div>
        </div>

        {/* ---------------- coluna de contexto ---------------- */}
        <aside className="space-y-4 lg:sticky lg:top-4">
          <Panel title="Check-ins recentes" subtitle="Do mais recente ao mais antigo.">
            {history.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-ink-400 sm:px-5">
                Nenhum check-in registrado ainda. Este será o primeiro ponto da curva.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border-hair)]">
                {history.map((s) => {
                  const risk = Boolean(s.data.risk_flag);
                  return (
                    <li key={s.id} className="px-4 py-3 sm:px-5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="tnum text-[13px] font-semibold text-ink-100">
                          {dateBR(s.ref_date)}
                        </span>
                        <span className="truncate text-[11px] text-ink-500">{s.filler ?? "—"}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {SCALE_ORDER.map((k, i) => {
                          const n = Number(s.data[k]) || 0;
                          return (
                            <span
                              key={k}
                              title={SCALE_SHORT[i]}
                              className={`tnum inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${
                                n >= 4
                                  ? "bg-verde-dim text-verde-fg"
                                  : n === 3
                                    ? "bg-ink-800 text-ink-300"
                                    : n > 0
                                      ? "bg-vermelho-dim text-vermelho-fg"
                                      : "bg-ink-850 text-ink-600"
                              }`}
                            >
                              {n || "—"}
                            </span>
                          );
                        })}
                      </div>
                      {risk && (
                        <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug text-vermelho-fg">
                          {String(s.data.risk_note || "risco explícito")}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Ficha do cliente" subtitle="Para consultar sem sair do formulário.">
            <dl className="divide-y divide-[var(--border-hair)] text-[13px]">
              {[
                ["Tipo", ACCOUNT_TYPE_LABEL[client.account_type]],
                ["GT", client.gt_name ?? "—"],
                ["Account", client.account_name ?? "—"],
                ["MRR", brl(client.mrr)],
                ["Renovação", client.renewal_date ? dateBR(client.renewal_date) : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 px-4 py-2.5 sm:px-5">
                  <dt className="text-ink-400">{k}</dt>
                  <dd className="truncate font-medium text-ink-100">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-[var(--border-hair)] px-4 py-3 sm:px-5">
              <Link href={`/clientes/${client.id}`} className="btn btn-sm btn-ghost w-full justify-center">
                <Icon name="external" size={13} />
                Abrir a ficha completa
              </Link>
            </div>
          </Panel>
        </aside>
      </form>
    </div>
  );
}
