import Link from "next/link";
import { Icon, type IconName } from "../icon";
import { Card, ColLabel, Pill, SectionHead, type Tone } from "../kit";
import { TableScroll } from "../ui";
import { NewSourceButton, SourceRowActions } from "./metas-ui";
import { SEM_ORIGEM, type LeadSource } from "@/lib/crm/goals";
import { lineTone, type ForecastLine } from "@/lib/crm/forecast-view";
import type { SourceState, SourceView } from "@/lib/crm/sources";
import type { MediaSplit } from "@/lib/crm/media-split";
import { CHANNEL_LABEL } from "@/lib/crm/media-split";
import type { Pendencia } from "@/lib/config-status";

/**
 * Aba "Forecast e fontes" da ficha.
 *
 * Mesma leitura do painel da conta em Performance › Metas: o forecast
 * semanal contra o realizado que o score leu (`forecastLines`), as fontes de
 * dados (`clientSources`), de onde vêm os leads (`mediaSplit` para o que tem
 * API + `crm_lead_sources` para o que é informado na mão) e o que está
 * quebrado na configuração (`configSnapshot`). Editar o forecast e as fontes
 * acontece no painel de Performance — os botões daqui levam para lá.
 *
 * Presentacional de propósito — recebe tudo pronto. Quem calcula é a página,
 * numa rodada de leitura só, como o resto da ficha.
 */

export type IntegrationState = SourceState;
export type IntegrationRow = SourceView;

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

export type OriginRow = { origem: string; n: number };

export type MetasData = {
  clientId: number;
  /** Nome do cliente — usado nos diálogos, para confirmar o que se está mexendo. */
  clientName: string;
  /** Forecast × realizado, indicador a indicador (o mesmo de Performance). */
  forecast: ForecastLine[];
  greenFloor: number;
  yellowFloor: number;
  sources: LeadSource[];
  split: MediaSplit;
  origins: OriginRow[];
  integrations: SourceView[];
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

export function MetasIntegracoes({ data }: { data: MetasData }) {
  const {
    clientId,
    clientName,
    forecast,
    greenFloor,
    yellowFloor,
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
  const tone = (score: number | null) => lineTone(score, greenFloor, yellowFloor);
  const definidos = forecast.filter((f) => f.target !== null);
  const abaixo = definidos.filter((f) => f.score !== null && f.score < yellowFloor).length;
  const panel = `/gt?c=${clientId}`;
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
          label="Forecast"
          value={`${definidos.length} de ${forecast.length}`}
          hint={definidos.length === 0 ? "sem forecast — o score não é calculado" : abaixo ? `${abaixo} abaixo da régua` : "valores definidos"}
          tone={definidos.length === 0 || abaixo ? "vermelho" : undefined}
        />
      </div>

      {/* Forecast × realizado — a régua do score, igual ao painel de Performance */}
      <section className="flex flex-col gap-4">
        <SectionHead
          title="Forecast semanal"
          subtitle="A régua do score: o forecast de cada indicador contra o realizado que o score leu. Mesmo número de Performance › Metas."
          action={
            <Link href={panel} className="btn h-8">
              <Icon name="target" size={15} />
              Ajustar forecast
            </Link>
          }
        />
        {definidos.length === 0 ? (
          <Empty
            icon="target"
            title="Nenhum forecast definido para esta conta"
            text="Sem forecast não há régua: o score desta conta não é calculado. Defina em Performance › Metas — a sugestão pela média de 90 dias ajuda."
          />
        ) : (
          <TableScroll>
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    <ColLabel>Indicador</ColLabel>
                  </th>
                  <th>
                    <ColLabel>Realizado</ColLabel>
                  </th>
                  <th>
                    <ColLabel>Forecast</ColLabel>
                  </th>
                  <th>
                    <ColLabel>Atingimento</ColLabel>
                  </th>
                </tr>
              </thead>
              <tbody>
                {forecast.map((f) => (
                  <tr key={f.key}>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[13px] font-medium text-ink-100">{f.label}</span>
                        {(f.period || f.note) && <span className="text-[12px] text-ink-400">{f.note ?? f.period}</span>}
                      </div>
                    </td>
                    <td className="tnum text-[13px] text-ink-100">{f.actual ?? "—"}</td>
                    <td className="tnum text-[13px] text-ink-300">{f.target ?? "não definido"}</td>
                    <td>
                      {f.score === null ? (
                        <span className="text-[12px] text-ink-500">fora do cálculo</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Progress ratio={f.score / 100} tone={tone(f.score)} />
                          <Pill tone={tone(f.score)}>{Math.round(f.score)}</Pill>
                        </div>
                      )}
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
          title="Fontes de dados"
          subtitle="De onde os números desta conta entram no sistema: Meta Ads, Google Ads e o CRM (leads e vendas)."
          action={
            <Link href={panel} className="flex items-center gap-1.5 text-[13px] text-ink-300 hover:text-ink-100">
              <Icon name="sliders" size={14} />
              Configurar fontes e CRM
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
              <Pill tone={STATE_TONE[i.state]}>{i.missing ? "Não conectado" : STATE_LABEL[i.state]}</Pill>
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
function Progress({ ratio, elapsed, tone }: { ratio: number; elapsed?: number; tone: Tone }) {
  const w = Math.max(0, Math.min(1, ratio));
  const mark = elapsed === undefined ? null : Math.max(0, Math.min(1, elapsed));
  const bar = tone === "vermelho" ? "bg-vermelho" : tone === "amarelo" ? "bg-amarelo" : "bg-verde";
  return (
    <span className="relative block h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-ink-800">
      <span className={`absolute inset-y-0 left-0 rounded-full ${bar}`} style={{ width: `${w * 100}%` }} />
      {mark !== null && (
        <span className="absolute inset-y-0 w-px bg-ink-100/60" style={{ left: `${mark * 100}%` }} aria-hidden="true" />
      )}
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
