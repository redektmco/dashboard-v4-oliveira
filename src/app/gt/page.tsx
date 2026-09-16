import Link from "next/link";
import { filledOn, lastPerfByClient, portfolio, today } from "@/lib/repo";
import { ACCOUNT_TYPE_LABEL } from "@/lib/model/types";
import { currentRitualDate, RITUAL_LABEL, weekLabel } from "@/lib/week";
import {
  BandChip,
  CardList,
  CardMeta,
  CardRow,
  PageHeader,
  Panel,
  Stat,
  TableScroll,
  dateBR,
} from "@/components/ui";
import { Icon } from "@/components/icon";
import { daysBetween } from "@/lib/model/scoring";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function GtPage() {
  await requireUser();
  const ref = currentRitualDate();
  const at = today();
  // Em lote: uma query para a carteira, uma para o último preenchimento de
  // cada conta e uma para quem já fechou a semana de referência.
  const [carteira, lastPerf, done] = await Promise.all([
    portfolio(at),
    lastPerfByClient(),
    filledOn(ref),
  ]);
  const lastBy = new Map(lastPerf.map((s) => [s.client_id, s]));

  const rows = carteira.map(({ client: c, score }) => {
    const last = lastBy.get(c.id) ?? null;
    return {
      c,
      done: done.has(c.id),
      last,
      lastAge: last ? daysBetween(last.ref_date, at) : null,
      score,
    };
  });
  rows.sort((a, b) => a.c.name.localeCompare(b.c.name));

  const pending = rows.filter((r) => !r.done);
  const byGt = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.c.gt_name ?? "Sem GT";
    byGt.set(k, [...(byGt.get(k) ?? []), r]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon="chart"
        eyebrow="GT"
        title="Performance — jornada do GT"
        description={
          <>
            Ritual de <strong className="text-ink-300">{RITUAL_LABEL}</strong>. Reporte o número cru
            e a meta; a régua é do sistema, não sua. Semana de referência{" "}
            <strong className="text-ink-300">{weekLabel(ref)}</strong> (fecha em {dateBR(ref)}).
          </>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
        <Stat label="Contas na sua régua" value={rows.length} />
        <Stat
          label="Preenchidas nesta semana"
          value={rows.length - pending.length}
          tone={pending.length ? "default" : "verde"}
        />
        <Stat
          label="Pendentes"
          value={pending.length}
          tone={pending.length ? "vermelho" : "verde"}
          hint="não preencheu = sinal, não silêncio"
        />
        <Stat
          label="Sem preenchimento há +14d"
          value={rows.filter((r) => (r.lastAge ?? 999) > 14).length}
          tone={rows.some((r) => (r.lastAge ?? 999) > 14) ? "amarelo" : "default"}
        />
      </div>

      {[...byGt.entries()].map(([gt, list]) => (
        <Panel
          key={gt}
          title={gt}
          subtitle={`${list.filter((r) => r.done).length}/${list.length} contas preenchidas na semana`}
        >
          {/* Celular: a ação é o motivo da tela, então vira botão de
              largura cheia no pé de cada cartão — não um link de 12px
              encostado na margem direita de uma tabela que rola. */}
          <CardList>
            {list.map((r) => (
              <CardRow key={r.c.id} critical={!r.done}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-semibold text-ink-100">{r.c.name}</span>
                    <div className="mt-0.5 text-[11px] text-ink-500">
                      {ACCOUNT_TYPE_LABEL[r.c.account_type]}
                    </div>
                  </div>
                  <BandChip band={r.score.band}>
                    {r.score.score === null ? "—" : Math.round(r.score.score)}
                  </BandChip>
                </div>

                <CardMeta
                  items={[
                    {
                      label: "Semana atual",
                      value: r.done ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-verde-fg">
                          <Icon name="check" size={12} stroke={2.5} />
                          preenchida
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-vermelho-fg">
                          <Icon name="alert" size={12} />
                          pendente
                        </span>
                      ),
                    },
                    {
                      label: "Último preenchimento",
                      value: r.last ? (
                        <>
                          {dateBR(r.last.ref_date)}{" "}
                          <span className={(r.lastAge ?? 0) > 10 ? "text-amarelo-fg" : "text-ink-500"}>
                            ({r.lastAge}d)
                          </span>
                        </>
                      ) : (
                        <span className="text-vermelho-fg">nunca preenchido</span>
                      ),
                    },
                  ]}
                />

                <Link
                  href={`/gt/${r.c.id}`}
                  className={`btn mt-3 w-full justify-center ${r.done ? "" : "btn-primary"}`}
                >
                  {r.done ? "Novo snapshot" : "Preencher semana"}
                </Link>
              </CardRow>
            ))}
          </CardList>

          <div className="hidden lg:block">
          <TableScroll>
          <table className="data-table is-dense">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Semana atual</th>
                <th>Último preenchimento</th>
                <th>Score atual</th>
                <th className="text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.c.id}>
                  <td className="font-medium">{r.c.name}</td>
                  <td className="text-ink-400">{ACCOUNT_TYPE_LABEL[r.c.account_type]}</td>
                  <td>
                    {r.done ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-verde-fg">
                        <Icon name="check" size={13} stroke={2.5} />
                        preenchida
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-vermelho-fg">
                        <Icon name="alert" size={13} />
                        pendente
                      </span>
                    )}
                  </td>
                  <td className="text-xs text-ink-400">
                    {r.last ? (
                      <>
                        {dateBR(r.last.ref_date)}{" "}
                        <span className={(r.lastAge ?? 0) > 10 ? "text-amarelo-fg" : "text-ink-500"}>
                          ({r.lastAge}d · {r.last.filler ?? "—"})
                        </span>
                      </>
                    ) : (
                      <span className="text-vermelho-fg">nunca preenchido</span>
                    )}
                  </td>
                  <td>
                    <BandChip band={r.score.band}>
                      {r.score.score === null ? "—" : Math.round(r.score.score)}
                    </BandChip>
                  </td>
                  <td className="text-right">
                    <Link href={`/gt/${r.c.id}`} className="btn btn-primary py-1 text-xs">
                      {r.done ? "Novo snapshot" : "Preencher"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableScroll>
          </div>
        </Panel>
      ))}
    </div>
  );
}
