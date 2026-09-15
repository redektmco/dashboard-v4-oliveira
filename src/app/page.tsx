import Link from "next/link";
import { portfolio, portfolioSummary, listOpenPlans, today } from "@/lib/repo";
import { ACCOUNT_TYPE_LABEL } from "@/lib/model/types";
import { PortfolioTable, type Row } from "@/components/portfolio-table";
import {
  BandChip,
  CardList,
  CardMeta,
  CardRow,
  ClientLink,
  ConfidenceTag,
  Delta,
  Empty,
  PageHeader,
  Panel,
  Stat,
  TableScroll,
  brl,
  dateBR,
} from "@/components/ui";
import { daysBetween } from "@/lib/model/scoring";
import { Icon } from "@/components/icon";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CarteiraPage() {
  await requireUser();
  const at = today();
  const [rows, plans] = await Promise.all([portfolio(at), listOpenPlans()]);
  const summary = portfolioSummary(rows);

  const view: Row[] = rows.map((r) => ({
    id: r.client.id,
    name: r.client.name,
    type: ACCOUNT_TYPE_LABEL[r.client.account_type],
    typeKey: r.client.account_type,
    gt: r.client.gt_name ?? "—",
    account: r.client.account_name ?? "—",
    mrr: r.client.mrr,
    renewal: r.client.renewal_date,
    renewalIn: r.client.renewal_date ? daysBetween(at, r.client.renewal_date) : null,
    score: r.score.score,
    band: r.score.band,
    rawBand: r.score.rawBand,
    confidence: r.score.confidence,
    delta7: r.delta7,
    overrides: r.score.overrides.map((o) => o.trigger),
    history: r.history.map((h) => h.score),
    perfAge: r.score.provenance.performance.ageDays,
    checkinAge: r.score.provenance.checkin.ageDays,
    openPlans: r.openPlans,
  }));

  // Triagem diária por exceção — briefing 6.
  const bandChanged = rows.filter((r) => r.bandChanged48h);
  const withOverride = rows.filter((r) => r.score.overrides.length > 0);
  const movers = rows.filter((r) => !r.bandChanged48h && (r.delta7 ?? 0) <= -3);
  const stale = summary.staleFills;
  const renewals = rows
    .filter((r) => {
      const d = r.client.renewal_date ? daysBetween(at, r.client.renewal_date) : null;
      return d !== null && d <= 60;
    })
    .sort((a, b) => daysBetween(at, a.client.renewal_date!) - daysBetween(at, b.client.renewal_date!));

  const total = rows.length || 1;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Unidade Oliveira & Co"
        title="Saúde da carteira"
        description={`Recompute de ${dateBR(at)} · ${rows.length} contas ativas · ordenado por risco`}
        actions={
          <Link href="/config/modelo" className="btn btn-ghost shrink-0">
            <Icon name="target" size={14} />
            Como o score é calculado
          </Link>
        }
      />

      {/* Quatro números: a contagem de "confiança < alta" vive na caixa
          "Dado desatualizado" da triagem, logo abaixo — não repete aqui. */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Stat
          label="Vermelho"
          value={summary.byBand.vermelho}
          tone="vermelho"
          hint={`${Math.round((summary.byBand.vermelho / total) * 100)}% da carteira`}
        />
        <Stat
          label="Amarelo"
          value={summary.byBand.amarelo}
          tone="amarelo"
          hint="janela onde a intervenção ainda muda o desfecho"
        />
        <Stat
          label="Verde"
          value={summary.byBand.verde}
          tone="verde"
          hint={`${Math.round((summary.byBand.verde / total) * 100)}% da carteira`}
        />
        <Stat
          label="MRR em risco"
          value={brl(summary.mrrAtRisk)}
          hint={`de ${brl(summary.mrrTotal)} na carteira`}
          tone={summary.mrrAtRisk > summary.mrrTotal * 0.3 ? "vermelho" : "default"}
          accent
        />
      </div>

      {/* -------------------- Triagem diária -------------------- */}
      <Panel
        title="Triagem diária"
        subtitle="Por exceção — só o que mudou ou não pode esperar. ~5 minutos."
      >
        <div className="grid gap-px bg-[var(--border-hair)] sm:grid-cols-2 xl:grid-cols-4">
          <TriageBox
            title="Trocou de banda (48h)"
            empty="Nenhuma troca de banda."
            items={bandChanged.map((r) => ({
              id: r.client.id,
              name: r.client.name,
              detail: (
                <span className="flex items-center gap-2">
                  <BandChip band={r.score.band} />
                  <Delta value={r.delta7} suffix=" em 7d" />
                </span>
              ),
            }))}
          />
          <TriageBox
            title="Overrides disparados"
            empty="Nenhum override ativo."
            items={withOverride.map((r) => ({
              id: r.client.id,
              name: r.client.name,
              detail: (
                <span className="text-xs text-vermelho-fg">
                  {r.score.overrides.map((o) => o.trigger).join(" · ")}
                </span>
              ),
            }))}
          />
          <TriageBox
            title="Movers negativos"
            empty="Ninguém caindo forte dentro da banda."
            items={movers.map((r) => ({
              id: r.client.id,
              name: r.client.name,
              detail: (
                <span className="flex items-center gap-2">
                  <Delta value={r.delta7} suffix=" em 7d" />
                  <BandChip band={r.score.band} />
                </span>
              ),
            }))}
          />
          <TriageBox
            title="Dado desatualizado"
            empty="Carteira toda com leitura fresca."
            items={stale.map((r) => ({
              id: r.client.id,
              name: r.client.name,
              detail: (
                <span className="flex flex-wrap items-center gap-2">
                  <ConfidenceTag c={r.score.confidence} compact />
                  <span className="text-xs text-ink-400">
                    perf{" "}
                    {r.score.provenance.performance.ageDays === null
                      ? "nunca"
                      : `${r.score.provenance.performance.ageDays}d`}{" "}
                    · check-in{" "}
                    {r.score.provenance.checkin.ageDays === null
                      ? "nunca"
                      : `${r.score.provenance.checkin.ageDays}d`}
                  </span>
                </span>
              ),
            }))}
          />
        </div>
      </Panel>

      {/* -------------------- Carteira -------------------- */}
      <PortfolioTable rows={view} />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Acompanhamento, não alarme: recolhido por padrão para aliviar a
            primeira dobra — mas abre sozinho se há plano vencido, que é o caso
            em que ele não pode esperar. */}
        <details className="panel group" open={plans.some((p) => p.due_date && p.due_date < at)}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
            <div>
              <h2 className="font-display text-[16px] font-semibold text-ink-100">Planos em aberto</h2>
              <p className="mt-0.5 text-[12.5px] text-ink-400">
                {plans.length} em aberto · cada risco tem plano, dono e prazo. O loop fecha na revisão semanal.
              </p>
            </div>
            <Icon name="chevronDown" size={16} className="shrink-0 text-ink-400 transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-[var(--border-hair)]">
          {plans.length === 0 ? (
            <Empty>Nenhum plano em aberto.</Empty>
          ) : (
            <>
              <CardList>
                {plans.map((p) => {
                  const late = p.due_date && p.due_date < at;
                  return (
                    <CardRow key={p.id}>
                      <ClientLink id={p.client_id} name={p.client_name} />
                      <p className="mt-1 text-[13px] leading-snug text-ink-300">{p.risk}</p>
                      <CardMeta
                        items={[
                          { label: "Dono", value: p.owner },
                          {
                            label: "Prazo",
                            value: dateBR(p.due_date),
                            className: late ? "text-vermelho-fg" : undefined,
                          },
                          { label: "Status", value: p.status.replace("_", " ") },
                        ]}
                      />
                    </CardRow>
                  );
                })}
              </CardList>

              <div className="hidden lg:block">
                <TableScroll>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Risco</th>
                        <th>Dono</th>
                        <th>Prazo</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plans.map((p) => {
                        const late = p.due_date && p.due_date < at;
                        return (
                          <tr key={p.id}>
                            <td>
                              <ClientLink id={p.client_id} name={p.client_name} />
                            </td>
                            <td className="max-w-[300px] text-ink-300">{p.risk}</td>
                            <td className="text-ink-300">{p.owner}</td>
                            <td className={late ? "text-vermelho-fg" : "text-ink-300"}>
                              {dateBR(p.due_date)}
                            </td>
                            <td className="text-ink-300">{p.status.replace("_", " ")}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableScroll>
              </div>
            </>
          )}
          </div>
        </details>

        <Panel
          title="Renovações nos próximos 60 dias"
          subtitle="Renovação x health — onde o problema custa o contrato."
        >
          {renewals.length === 0 ? (
            <Empty>Nenhuma renovação na janela.</Empty>
          ) : (
            <>
              <CardList>
                {renewals.map((r) => {
                  const d = daysBetween(at, r.client.renewal_date!);
                  return (
                    <CardRow key={r.client.id} critical={r.score.band === "vermelho"}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <ClientLink id={r.client.id} name={r.client.name} />
                          <div className="mt-0.5 text-[11px] text-ink-500">
                            {dateBR(r.client.renewal_date)} · {brl(r.client.mrr)}/mês
                          </div>
                        </div>
                        <BandChip band={r.score.band}>
                          {r.score.score === null ? "—" : Math.round(r.score.score)}
                        </BandChip>
                      </div>
                      <p
                        className={`tnum mt-2 text-[13px] font-semibold ${
                          d <= 30 ? "text-amarelo-fg" : "text-ink-300"
                        }`}
                      >
                        {d < 0 ? `renovação vencida há ${-d}d` : `renova em ${d} dias`}
                      </p>
                    </CardRow>
                  );
                })}
              </CardList>

              <div className="hidden lg:block">
                <TableScroll>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>Renova em</th>
                        <th>Score</th>
                        <th className="text-right">MRR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {renewals.map((r) => {
                        const d = daysBetween(at, r.client.renewal_date!);
                        return (
                          <tr key={r.client.id}>
                            <td>
                              <ClientLink id={r.client.id} name={r.client.name} />
                              <div className="text-xs text-ink-500">
                                {dateBR(r.client.renewal_date)}
                              </div>
                            </td>
                            <td className={`tnum ${d <= 30 ? "text-amarelo-fg" : "text-ink-300"}`}>
                              {d < 0 ? `vencida (${-d}d)` : `${d} dias`}
                            </td>
                            <td>
                              <BandChip band={r.score.band}>
                                {r.score.score === null ? "—" : Math.round(r.score.score)}
                              </BandChip>
                            </td>
                            <td className="tnum text-right text-ink-300">{brl(r.client.mrr)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableScroll>
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

function TriageBox({
  title,
  items,
  empty,
}: {
  title: string;
  items: { id: number; name: string; detail: React.ReactNode }[];
  empty: string;
}) {
  return (
    <div className={`bg-ink-900 px-4 ${items.length ? "py-3" : "py-2.5 sm:py-3"}`}>
      <div className="flex items-center gap-2">
        <span className="label shrink-0">{title}</span>
        {/* Caixa vazia vira uma linha só no celular: quatro "nada a fazer"
            empilhados empurram a carteira para fora da primeira dobra. */}
        {items.length === 0 && (
          <span className="min-w-0 truncate text-[11px] text-ink-600 sm:hidden">— {empty}</span>
        )}
        <span
          className={`tnum ml-auto text-xs font-semibold ${items.length ? "text-ink-100" : "text-ink-600"}`}
        >
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 hidden text-xs text-ink-600 sm:block">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.slice(0, 5).map((i) => (
            <li key={i.id} className="text-sm">
              <ClientLink id={i.id} name={i.name} />
              <div className="mt-0.5">{i.detail}</div>
            </li>
          ))}
          {items.length > 5 && (
            <li className="text-xs text-ink-500">+ {items.length - 5} na tabela abaixo</li>
          )}
        </ul>
      )}
    </div>
  );
}
