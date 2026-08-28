import Link from "next/link";
import { lastCheckinByClient, portfolio, today } from "@/lib/repo";
import { ACCOUNT_TYPE_LABEL } from "@/lib/model/types";
import { daysBetween } from "@/lib/model/scoring";
import { BandChip, Panel, Stat, dateBR } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  await requireUser();
  const at = today();
  const [carteira, lastChk] = await Promise.all([portfolio(at), lastCheckinByClient()]);
  const lastBy = new Map(lastChk.map((s) => [s.client_id, s]));

  const rows = carteira.map(({ client: c, score }) => {
    const last = lastBy.get(c.id) ?? null;
    return {
      c,
      last,
      age: last ? daysBetween(last.ref_date, at) : null,
      score,
      risk: last?.data.risk_flag === true,
    };
  });
  rows.sort((a, b) => a.c.name.localeCompare(b.c.name));

  const semLeitura = rows.filter((r) => r.age === null || r.age > 35);
  const byAcc = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.c.account_name ?? "Sem Account";
    byAcc.set(k, [...(byAcc.get(k) ?? []), r]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">Check-in — jornada do Account</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-400">
          Registre logo depois da call, em 2–3 minutos. Você avalia o que percebeu na conversa — não
          aplica questionário no cliente. Cada nota vem da âncora, não da intuição.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Contas" value={rows.length} />
        <Stat
          label="Com leitura fresca (≤35d)"
          value={rows.length - semLeitura.length}
          tone="verde"
        />
        <Stat
          label="Relação sem leitura"
          value={semLeitura.length}
          tone={semLeitura.length ? "vermelho" : "verde"}
          hint="derruba a confiança do score"
        />
        <Stat
          label="Flag de risco ativa"
          value={rows.filter((r) => r.risk).length}
          tone={rows.some((r) => r.risk) ? "vermelho" : "default"}
        />
      </div>

      {[...byAcc.entries()].map(([acc, list]) => (
        <Panel key={acc} title={acc} subtitle={`${list.length} contas sob sua gestão`}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Último check-in</th>
                <th>Leitura</th>
                <th>Score atual</th>
                <th className="text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.c.id}>
                  <td>
                    <span className="font-medium">{r.c.name}</span>
                    {r.risk && (
                      <span className="ml-2 rounded-sm bg-vermelho-dim px-1.5 py-0.5 text-[11px] font-semibold text-vermelho-fg">
                        risco explícito
                      </span>
                    )}
                  </td>
                  <td className="text-ink-400">{ACCOUNT_TYPE_LABEL[r.c.account_type]}</td>
                  <td className="text-xs text-ink-400">
                    {r.last ? `${dateBR(r.last.ref_date)} · ${r.last.filler ?? "—"}` : "—"}
                  </td>
                  <td className="text-xs">
                    {r.age === null ? (
                      <span className="font-semibold text-vermelho-fg">relação sem leitura</span>
                    ) : r.age > 35 ? (
                      <span className="font-semibold text-vermelho-fg">{r.age}d — vencida</span>
                    ) : r.age > 21 ? (
                      <span className="font-semibold text-amarelo-fg">{r.age}d</span>
                    ) : (
                      <span className="text-ink-400">{r.age}d</span>
                    )}
                  </td>
                  <td>
                    <BandChip band={r.score.band}>
                      {r.score.score === null ? "—" : Math.round(r.score.score)}
                    </BandChip>
                  </td>
                  <td className="text-right">
                    <Link href={`/account/${r.c.id}`} className="btn btn-primary py-1 text-xs">
                      Registrar check-in
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
