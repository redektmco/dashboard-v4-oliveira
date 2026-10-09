import Link from "next/link";
import { Icon, type IconName } from "../icon";
import { Card, ColLabel, Pill, SectionHead, type Tone } from "../kit";
import { TableScroll } from "../ui";
import { GoalRowActions, NewGoalButton, NewSourceButton, SourceRowActions } from "./metas-ui";
import { GOAL_STATUS_LABEL, PERIOD_LABEL, SEM_ORIGEM, type GoalStatus, type GoalView, type LeadSource } from "@/lib/crm/goals";
import { fmtBR } from "@/lib/model/target-fields";
import type { MediaSplit } from "@/lib/crm/media-split";
import { CHANNEL_LABEL } from "@/lib/crm/media-split";
import type { Pendencia } from "@/lib/config-status";

/**
 * Aba "Metas e integrações" da ficha.
 *
 * Junta quatro coisas que até agora moravam em telas diferentes: a meta do
 * período (nova, de `crm_goals`), de onde vêm os leads (`mediaSplit` para o
 * que tem API + `crm_lead_sources` para o que é informado na mão), o que está
 * quebrado na configuração (`configSnapshot`, as mesmas pendências que
 * Configurações mostra) e o estado de cada integração.
 *
 * Presentacional de propósito — recebe tudo pronto. Quem calcula é a página,
 * numa rodada de leitura só, como o resto da ficha.
 */

const STATUS_TONE: Record<GoalStatus, Tone> = {
  saudavel: "verde",
  atencao: "amarelo",
  critico: "vermelho",
  sem_leitura: "neutro",
};

export type IntegrationState = "conectada" | "erro" | "pendente";

const STATE_TONE: Record<IntegrationState, Tone> = {
  conectada: "verde",
  erro: "vermelho",
  pendente: "amarelo",
};

const STATE_LABEL: Record<IntegrationState, string> = {
  conectada: "Conectada",
  erro: "Erro",
  pendente: "Pendente",
};

export type IntegrationRow = {
  id: string;
  name: string;
  icon: IconName;
  /** Linha de contexto: id da conta, última sincronização, o que falta. */
  detail: string;
  state: IntegrationState;
  action?: { label: string; href: string };
};

export type OriginRow = { origem: string; n: number };

export type MetasData = {
  clientId: number;
  /** Nome do cliente — usado nos diálogos, para confirmar o que se está mexendo. */
  clientName: string;
  goals: GoalView[];
  sources: LeadSource[];
  split: MediaSplit;
  origins: OriginRow[];
  integrations: IntegrationRow[];
  /** Pendências de configuração desta conta, já filtradas. */
  pendencias: Pendencia[];
  /** Leads do período somados — denominador da fatia sem origem. */
  leadsNoPeriodo: number;
  /** Rótulo do período que os blocos de leads usam ("outubro"). */
  periodoLabel: string;
  lastSync: string | null;
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Meta formatada com a unidade do catálogo (R$, %, casas) quando existe. */
function fmtGoal(v: number, g: GoalView) {
  const f = g.field;
  if (!f) return fmtBR(v, 0);
  const n = fmtBR(v, f.decimals);
  return `${f.prefix ? `${f.prefix} ` : ""}${n}${f.suffix && f.suffix !== "/sem." ? f.suffix : ""}`;
}

export function MetasIntegracoes({ data }: { data: MetasData }) {
  const {
    clientId,
    clientName,
    goals,
    sources,
    split,
    origins,
    integrations,
    pendencias,
    leadsNoPeriodo,
    periodoLabel,
    lastSync,
  } = data;

  const semOrigem = origins.find((o) => o.origem === SEM_ORIGEM)?.n ?? 0;
  const semOrigemShare = leadsNoPeriodo > 0 ? semOrigem / leadsNoPeriodo : 0;
  const conectadas = integrations.filter((i) => i.state === "conectada").length;
  const comErro = integrations.filter((i) => i.state === "erro").length;
  const pendentes = integrations.filter((i) => i.state === "pendente").length;

  return (
    <>
      {/* Resumo: o que o time olha antes de abrir qualquer tabela. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label={`Leads no período · ${periodoLabel}`}
          value={leadsNoPeriodo.toLocaleString("pt-BR")}
          hint={lastSync ? `última sincronização ${lastSync}` : "sem evento de integração ainda"}
        />
        <Kpi
          label="Leads sem origem"
          value={leadsNoPeriodo > 0 ? pct(semOrigemShare) : "—"}
          hint={
            leadsNoPeriodo === 0
              ? "sem leads no período"
              : semOrigem === 0
                ? "todos os leads têm origem"
                : `${semOrigem} ${semOrigem === 1 ? "lead" : "leads"} sem campo de origem`
          }
          tone={semOrigemShare > 0.1 ? "amarelo" : undefined}
        />
        <Kpi
          label="Integrações"
          value={`${conectadas} de ${integrations.length}`}
          hint={
            comErro || pendentes
              ? [comErro ? `${comErro} com erro` : null, pendentes ? `${pendentes} pendente` : null]
                  .filter(Boolean)
                  .join(" · ")
              : "todas conectadas"
          }
          tone={comErro ? "vermelho" : pendentes ? "amarelo" : undefined}
        />
        <Kpi
          label="Metas no período"
          value={String(goals.length)}
          hint={
            goals.length === 0
              ? "nenhuma meta definida"
              : (() => {
                  const fora = goals.filter((g) => g.status === "critico" || g.status === "atencao").length;
                  return fora ? `${fora} fora do ritmo` : "todas no ritmo";
                })()
          }
          tone={goals.some((g) => g.status === "critico") ? "vermelho" : undefined}
        />
      </div>

      {/* Metas */}
      <section className="flex flex-col gap-4">
        <SectionHead
          title="Metas"
          subtitle="O compromisso do período. Meta de piso é julgada pelo ritmo; meta de teto, pelo valor."
          action={<NewGoalButton clientId={clientId} clientName={clientName} />}
        />
        {goals.length === 0 ? (
          <Empty
            icon="target"
            title="Nenhuma meta definida para esta conta"
            text="Sem meta, a aba mostra o realizado mas não tem com o que comparar. Comece pelo número que o cliente cobra."
          />
        ) : (
          <TableScroll>
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    <ColLabel>Meta</ColLabel>
                  </th>
                  <th>
                    <ColLabel>Progresso no período</ColLabel>
                  </th>
                  <th>
                    <ColLabel>Status</ColLabel>
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {goals.map((g) => (
                  <tr key={g.goal.id}>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[13px] font-medium text-ink-100">{g.goal.label}</span>
                        <span className="text-[12px] text-ink-400">
                          {PERIOD_LABEL[g.goal.period]} · {g.period.label}
                          {g.goal.direction === "teto"
                            ? ` · teto de ${fmtGoal(g.goal.target, g)}`
                            : ` · meta de ${fmtGoal(g.goal.target, g)}`}
                          {g.goal.scope && g.goal.scope !== "todas" ? ` · ${g.goal.scope}` : ""}
                        </span>
                      </div>
                    </td>
                    <td>
                      {g.real === null ? (
                        <span className="text-[13px] text-ink-500">sem leitura no período</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          <span className="tnum text-[13px] text-ink-100">
                            {g.goal.direction === "teto"
                              ? `${fmtGoal(g.real, g)} · ${
                                  g.ratio !== null && g.ratio > 1
                                    ? `${Math.round((g.ratio - 1) * 100)}% acima`
                                    : "dentro do teto"
                                }`
                              : `${fmtGoal(g.real, g)} de ${fmtGoal(g.goal.target, g)} · ${
                                  g.ratio !== null ? pct(g.ratio) : "—"
                                }`}
                          </span>
                          <Progress ratio={g.ratio ?? 0} elapsed={g.period.elapsed} tone={STATUS_TONE[g.status]} />
                        </div>
                      )}
                    </td>
                    <td>
                      <Pill tone={STATUS_TONE[g.status]}>{GOAL_STATUS_LABEL[g.status]}</Pill>
                    </td>
                    <td>
                      <GoalRowActions id={g.goal.id} label={g.goal.label} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </section>

      {/* Fontes de leads */}
      <section className="flex flex-col gap-4">
        <SectionHead
          title="Fontes de leads"
          subtitle="Meta e Google saem da própria plataforma, com verba e custo reais. As demais o time declara."
          action={<NewSourceButton clientId={clientId} clientName={clientName} />}
        />
        <TableScroll>
          <table className="data-table">
            <thead>
              <tr>
                <th>
                  <ColLabel>Fonte</ColLabel>
                </th>
                <th>
                  <ColLabel>Participação na verba</ColLabel>
                </th>
                <th>
                  <ColLabel>Resultados</ColLabel>
                </th>
                <th>
                  <ColLabel>Custo por resultado</ColLabel>
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {(["meta", "google"] as const).map((ch) => {
                const t = split.byChannel[ch].totals;
                if (!t.linked && t.spend === 0 && t.results === 0) return null;
                return (
                  <tr key={ch}>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[13px] font-medium text-ink-100">{CHANNEL_LABEL[ch]}</span>
                        <span className="text-[12px] text-ink-400">
                          {t.linked ? "conta vinculada" : "sem conta vinculada"}
                        </span>
                      </div>
                    </td>
                    <td className="tnum text-[13px] text-ink-200">{t.spend > 0 ? pct(t.share) : "—"}</td>
                    <td className="tnum text-[13px] text-ink-200">{t.results.toLocaleString("pt-BR")}</td>
                    <td className="tnum text-[13px] text-ink-200">{t.cpr === null ? "—" : brl(t.cpr)}</td>
                    <td />
                  </tr>
                );
              })}
              {sources.map((s) => {
                // Fonte declarada casa com a origem do lead pelo nome, sem
                // diferenciar caixa: é o time digitando dos dois lados.
                const hit = origins.find((o) => o.origem.toLowerCase() === s.name.toLowerCase());
                return (
                  <tr key={`src-${s.id}`}>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[13px] font-medium text-ink-100">{s.name}</span>
                        <span className="text-[12px] text-ink-400">{s.note || "informada na mão"}</span>
                      </div>
                    </td>
                    <td className="text-[13px] text-ink-500">sem verba</td>
                    <td className="tnum text-[13px] text-ink-200">{(hit?.n ?? 0).toLocaleString("pt-BR")}</td>
                    <td className="text-[13px] text-ink-500">—</td>
                    <td>
                      <SourceRowActions id={s.id} name={s.name} />
                    </td>
                  </tr>
                );
              })}
              {semOrigem > 0 && (
                <tr>
                  <td>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[13px] font-medium text-amarelo-fg">Sem origem</span>
                      <span className="text-[12px] text-ink-400">
                        o lead chegou sem os campos `origem`, `source` ou `utm_source`
                      </span>
                    </div>
                  </td>
                  <td className="text-[13px] text-ink-500">—</td>
                  <td className="tnum text-[13px] text-ink-200">{semOrigem.toLocaleString("pt-BR")}</td>
                  <td className="text-[13px] text-ink-500">—</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      </section>

      {/* Pendências de configuração */}
      {pendencias.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHead
            title="Pendências de configuração"
            subtitle="Cada uma destas está travando um número desta conta agora."
          />
          <div className="flex flex-col gap-2">
            {pendencias.map((p) => (
              <Card key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                    p.severity === "bloqueia" ? "bg-vermelho-dim text-vermelho-fg" : "bg-amarelo-dim text-amarelo-fg"
                  }`}
                >
                  <Icon name="alertCircle" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink-100">{p.title}</p>
                  {p.consequence && <p className="mt-0.5 text-[12px] text-ink-400">{p.consequence}</p>}
                </div>
                {p.action && (
                  <Link href={p.action.href} className="btn btn-light h-8 shrink-0">
                    {p.action.label}
                    <Icon name="arrowRight" size={14} />
                  </Link>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Integrações */}
      <section className="flex flex-col gap-4">
        <SectionHead
          title="Integrações"
          subtitle="De onde os números desta conta entram no sistema."
          action={
            <Link href="/gt/integracoes" className="flex items-center gap-1.5 text-[13px] text-ink-300 hover:text-ink-100">
              <Icon name="sliders" size={14} />
              Saúde das integrações
            </Link>
          }
        />
        <div className="flex flex-col gap-2">
          {integrations.map((i) => (
            <Card key={i.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-800 text-ink-200">
                <Icon name={i.icon} size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink-100">{i.name}</p>
                <p className="mt-0.5 text-[12px] text-ink-400">{i.detail}</p>
              </div>
              <Pill tone={STATE_TONE[i.state]}>{STATE_LABEL[i.state]}</Pill>
              {i.action && (
                <Link href={i.action.href} className="btn btn-light h-8 shrink-0">
                  {i.action.label}
                </Link>
              )}
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}

/* --------------------------- peças internas --------------------------- */

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: Tone }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-400">{label}</span>
      <span
        className={`tnum font-display text-[24px] font-semibold tracking-[-0.6px] ${
          tone === "vermelho" ? "text-vermelho-fg" : tone === "amarelo" ? "text-amarelo-fg" : "text-ink-100"
        }`}
      >
        {value}
      </span>
      <span className="text-[12px] text-ink-400">{hint}</span>
    </Card>
  );
}

/**
 * Barra de progresso com a marca do ritmo esperado.
 *
 * O tracinho é o que faz a barra significar algo no meio do período: sem ele,
 * 31% parece pouco em qualquer dia do mês. Com ele, dá para ver que 31% no
 * dia 9 está à frente do esperado.
 */
function Progress({ ratio, elapsed, tone }: { ratio: number; elapsed: number; tone: Tone }) {
  const w = Math.max(0, Math.min(1, ratio));
  const mark = Math.max(0, Math.min(1, elapsed));
  const bar = tone === "vermelho" ? "bg-vermelho" : tone === "amarelo" ? "bg-amarelo" : "bg-verde";
  return (
    <span className="relative block h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-ink-800">
      <span className={`absolute inset-y-0 left-0 rounded-full ${bar}`} style={{ width: `${w * 100}%` }} />
      <span
        className="absolute inset-y-0 w-px bg-ink-100/60"
        style={{ left: `${mark * 100}%` }}
        aria-hidden="true"
      />
    </span>
  );
}

function Empty({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-ink-800 text-ink-300">
        <Icon name={icon} size={20} />
      </span>
      <p className="text-[14px] font-medium text-ink-100">{title}</p>
      <p className="max-w-[46ch] text-[12px] text-ink-400">{text}</p>
    </Card>
  );
}
