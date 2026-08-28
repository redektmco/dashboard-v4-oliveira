import Link from "next/link";
import { filledOn, lastPerfByClient, portfolio, today } from "@/lib/repo";
import { ACCOUNT_TYPE_LABEL } from "@/lib/model/types";
import { currentRitualDate, RITUAL_LABEL, weekLabel } from "@/lib/week";
import { BandChip, Panel, Stat, dateBR } from "@/components/ui";
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
      <div>
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">Performance — jornada do GT</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-400">
          Ritual de <strong className="text-ink-300">{RITUAL_LABEL}</strong>. Reporte o número cru e a
          meta; a régua é do sistema, não sua. Semana de referência{" "}
          <strong className="text-ink-300">{weekLabel(ref)}</strong> (fecha em {dateBR(ref)}).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
          <table className="data-table">
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
        </Panel>
      ))}
    </div>
  );
}
