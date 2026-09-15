import { adminStats, teamProgress } from "@/lib/onboarding/db";
import { pct } from "@/lib/onboarding/types";
import { Empty, Panel, Stat, TableScroll, dateBR } from "@/components/ui";
import { ProgressBar } from "@/components/onboarding/progress";

const ROLE_LABEL: Record<string, string> = {
  gt: "GT",
  account: "Account",
  coord: "Coordenação",
  social: "Social Media",
};

function statusLabel(done: number, total: number) {
  if (total === 0) return { label: "—", cls: "text-ink-500" };
  if (done === 0) return { label: "Não iniciou", cls: "text-ink-400" };
  if (done >= total) return { label: "Concluído", cls: "text-verde-fg" };
  return { label: "Em andamento", cls: "text-amarelo-fg" };
}

export default async function AdminOverview() {
  const [stats, team] = await Promise.all([adminStats(), teamProgress()]);

  const started = team.filter((t) => t.done > 0);
  const completed = team.filter((t) => t.total > 0 && t.done >= t.total);
  const avg =
    team.length && stats.published
      ? Math.round(team.reduce((a, t) => a + pct({ done: t.done, total: t.total }), 0) / team.length)
      : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Funcionários" value={team.length} hint="Ativos no painel" />
        <Stat label="Em onboarding" value={started.length} hint="Começaram ao menos uma aula" />
        <Stat label="Concluíram" value={completed.length} tone="verde" hint="100% das aulas publicadas" />
        <Stat label="Progresso médio" value={`${avg}%`} hint="Média do time" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Categorias" value={stats.categories} />
        <Stat label="Módulos" value={stats.modules} />
        <Stat label="Aulas publicadas" value={`${stats.published}/${stats.lessons}`} />
      </div>

      <Panel title="Progresso do time" subtitle="Acompanhe quem já concluiu e quem ainda está começando.">
        {team.length === 0 ? (
          <Empty>Nenhum funcionário ativo.</Empty>
        ) : (
          <TableScroll>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Funcionário</th>
                  <th>Função</th>
                  <th style={{ minWidth: 180 }}>Progresso</th>
                  <th className="text-right">Concluídas</th>
                  <th>Status</th>
                  <th>Última atividade</th>
                </tr>
              </thead>
              <tbody>
                {team.map((t) => {
                  const p = pct({ done: t.done, total: t.total });
                  const st = statusLabel(t.done, t.total);
                  return (
                    <tr key={t.userId}>
                      <td className="font-semibold text-ink-100">{t.name}</td>
                      <td className="text-ink-400">{ROLE_LABEL[t.role] ?? t.role}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-28">
                            <ProgressBar value={p} />
                          </div>
                          <span className="tnum text-[12px] text-ink-400">{p}%</span>
                        </div>
                      </td>
                      <td className="tnum text-right text-ink-300">
                        {t.done}/{t.total}
                      </td>
                      <td className={`font-semibold ${st.cls}`}>{st.label}</td>
                      <td className="text-ink-400">{dateBR(t.lastActivity)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>
    </div>
  );
}
