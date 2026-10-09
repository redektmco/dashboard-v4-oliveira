import Link from "next/link";
import { notFound } from "next/navigation";
import {
  checkinSnapshots,
  dimensionFieldsOn,
  getClient,
  getConfig,
  getTargets,
  listPlans,
  listUsers,
  perfSnapshots,
  scoreFor,
  scoreSeries,
  targetHistory,
  today,
  metaWeeks,
  googleWeeks,
  listMetaLinks,
  listGoogleLinks,
} from "@/lib/repo";
import { listClientChanges } from "@/lib/audit";
import { currentRitualDate } from "@/lib/week";
import { mediaSplit } from "@/lib/crm/media-split";
import { MediaChannels } from "@/components/cliente/media-channels";
import { requestsForClient } from "@/lib/churn/db";
import { isOpen } from "@/lib/churn/types";
import { ACCOUNT_TYPE_LABEL, type Band, type DimensionKey } from "@/lib/model/types";
import { fieldByKey, targetKeysFor } from "@/lib/model/catalog";
import { bandOf } from "@/lib/model/scoring";
import {
  accountEvents,
  accountStatus,
  checkinRow,
  ddmm,
  dimensionViews,
  hhmm,
  localDay,
  mainRisk,
  nextActions,
  perfDropDays,
  type AccountEvent,
  type DimView,
} from "@/lib/client-view";
import { CheckinHeatmap } from "@/components/charts";
import { ClientActions } from "@/components/client-actions";
import { PageHead } from "@/components/page-head";
import { Icon, type IconName } from "@/components/icon";
import { BAND_TEXT, Bar, BandPill, Card, ColLabel, DotLabel, Initials, KV, Pill, SectionHead, TONE, type Tone } from "@/components/kit";
import {
  ActionList,
  CheckinButton,
  ClientUI,
  DimButton,
  OpenActions,
  OpenHistory,
  PlanButton,
  PlanCards,
  type DrawerDim,
} from "@/components/cliente/client-ui";
import { EvolutionSection, type ChartEvent } from "@/components/cliente/evolution";
import { brl, TableScroll } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import {
  creativeStats,
  episodeHistory,
  episodeSteps,
  latestCrmDiagnostic,
  learningRecords,
  openEpisode,
  syncFlag,
  upsells,
} from "@/lib/playbook/db";
import { FLAG, howOf, stepTemplate } from "@/lib/playbook/templates";
import { creativeAttention, crmAttention } from "@/lib/playbook/attention";
import { PlaybookSection, type PlaybookData } from "@/components/cliente/playbook";

export const dynamic = "force-dynamic";

const fmt1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const shiftDays = (day: string, n: number) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const firstName = (n: string | null) => (n ? n.trim().split(/\s+/)[0] : "—");
const tone = (b: Band | null): Tone => b ?? "neutro";

/** Perguntas do check-in, na ordem do roteiro, com o rótulo curto do mapa. */
const CHECKIN_ROWS = [
  { key: "q1_satisfaction", short: "Satisfação" },
  { key: "q2_climate", short: "Relacionamento" },
  { key: "q3_trust", short: "Continuidade" },
  { key: "q4_lead_quality", short: "Qualidade de lead" },
  { key: "q5_engagement", short: "Ritmo do cliente" },
  { key: "q6_expectation", short: "Expectativa" },
];

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ plano?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { plano } = await searchParams;
  const clientId = Number(id);
  if (!Number.isInteger(clientId)) notFound();

  const at = today();
  const [client, s, series, perf, checkins, plans, targets, users, targetHist, audit, config, churns] = await Promise.all([
    getClient(clientId),
    scoreFor(clientId, at),
    scoreSeries(clientId, 365, at),
    perfSnapshots(clientId, 30),
    checkinSnapshots(clientId, 30),
    listPlans(clientId),
    getTargets(clientId),
    listUsers(),
    targetHistory(clientId, 300),
    listClientChanges(clientId, 40),
    getConfig(),
    requestsForClient(clientId),
  ]);
  if (!client || !s) notFound();
  const openChurn = churns.find((r) => isOpen(r.status)) ?? null;

  // Playbook: a ficha também alinha a flag (cobre o primeiro uso e o dia em
  // que a flag muda antes do recálculo diário). Só escreve se mudou.
  let episode = await openEpisode(clientId);
  if (s.band && episode?.band !== s.band) {
    await syncFlag(clientId, s.band);
    episode = await openEpisode(clientId);
  }
  const [steps, episodes, learning, opps, crmDiag, creatives, metaBy, googleBy, metaLinks, googleLinks] = await Promise.all([
    episode ? episodeSteps(episode.id) : Promise.resolve([]),
    episodeHistory(clientId, 4),
    learningRecords(clientId),
    upsells(clientId),
    latestCrmDiagnostic(clientId),
    creativeStats(clientId),
    metaWeeks(clientId),
    googleWeeks(clientId),
    listMetaLinks(),
    listGoogleLinks(),
  ]);

  // Mídia separada por canal: o score lê Meta + Google somados, esta leitura
  // desfaz a soma para dizer de onde veio o movimento. Últimas 8 semanas-ritual.
  // `currentRitualDate` e a ultima sexta que JA passou: a semana fechada.
  // `ritualWeekEnd` devolveria a sexta que ainda vai fechar, e a ultima barra
  // seria sempre uma semana pela metade parecendo queda.
  const lastWeek = currentRitualDate(new Date(at + "T12:00:00"));
  const split = mediaSplit({
    weeks: Array.from({ length: 8 }, (_, i) => shiftDays(lastWeek, -7 * (7 - i))),
    meta: metaBy.get(clientId),
    google: googleBy.get(clientId),
    metaLinked: metaLinks.some((l) => l.client_id === clientId),
    googleLinked: googleLinks.some((l) => l.client_id === clientId),
  });
  const nowIso = new Date().toISOString();
  const playbook: PlaybookData = {
    clientId,
    clientName: client.name,
    now: nowIso,
    band: s.band,
    flag: episode ? FLAG[episode.band] : null,
    episode,
    steps: steps.map((st) => {
      const t = episode ? stepTemplate(episode.band, st.key) : null;
      return {
        ...st,
        how: t ? howOf(t, client.proximity) : "",
        when: t?.when ?? "",
        deadline: t?.deadline ?? "",
        goal: t?.goal ?? "",
      };
    }),
    previous: episodes.filter((e) => e.ended_at).slice(0, 3),
    proximity: client.proximity,
    niche: client.niche,
    churnOpen: openChurn ? { id: openChurn.id, code: openChurn.code } : null,
    learning,
    upsells: opps,
    crm: crmDiag,
    attention: [
      crmAttention(crmDiag, crmDiag ? Math.max(0, Math.floor((Date.parse(nowIso) - Date.parse(crmDiag.filled_at)) / 86_400_000)) : null),
      creativeAttention(creatives),
    ],
  };

  const drops = perfDropDays(series);
  const dropFields = await dimensionFieldsOn(clientId, "performance", drops.slice(-40));
  const perfDropDetail = new Map(
    [...dropFields].map(([day, fields]) => {
      const worst = fields.filter((f) => f.score !== null).sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
      return [day, worst ? `${worst.label} ${worst.actual ?? worst.raw}` : ""];
    }),
  );

  const dims = dimensionViews(s, series, config, client.account_type, at);
  const risk = mainRisk(dims, config);
  const status = accountStatus(s, dims, config);
  const hasTargets = targetKeysFor(client.account_type).some((t) => targets[t.key] !== undefined);
  const actions = nextActions({
    client,
    at,
    lastCheckin: checkins[0] ?? null,
    plans,
    config,
    hasTargets,
  });
  const events = accountEvents({ series, perf, checkins, plans, targets: targetHist, audit, perfDropDetail });
  const chartEvents: ChartEvent[] = events
    .filter((e): e is AccountEvent & { kind: ChartEvent["kind"] } => ["checkin", "meta", "queda", "plano"].includes(e.kind))
    .map((e) => ({ day: e.day, kind: e.kind, title: e.title, detail: e.detail }));
  const rows = checkins.map(checkinRow);

  // Health Score: o de hoje contra o de 7 dias atrás.
  const ref7 = series.filter((p) => p.day <= addDays(at, -7) && p.score !== null).pop() ?? null;
  const delta = s.score !== null && ref7?.score != null ? Math.round((s.score - ref7.score) * 10) / 10 : null;
  const lastDay = series.length ? series[series.length - 1].day : at;
  const lastInput = [perf[0]?.filled_at, checkins[0]?.filled_at].filter((x): x is string => Boolean(x)).sort().pop() ?? null;
  const responsible = client.account_name ?? client.gt_name ?? "—";

  const pAge = s.provenance.performance.ageDays;
  const cAge = s.provenance.checkin.ageDays;
  const perfStale =
    pAge === null ? "Ainda não chegou dado de performance — conecte Meta Ads, Google Ads ou CRM." : pAge > config.perfMaxAgeDays ? `Dados de performance sem atualização há ${pAge} dias.` : null;
  const chkStale =
    cAge === null ? "Nenhum check-in registrado nesta conta." : cAge > config.checkinMaxAgeDays ? `Último check-in há ${cAge} dias.` : null;

  const drawerDims: DrawerDim[] = s.dimensions.map((d) => {
    const fromGT = d.key === "performance" || d.key === "operational" || d.key === "lead_quality";
    return {
      key: d.key,
      label: d.label,
      score: d.score === null ? null : Math.round(d.score),
      band: d.score === null ? null : bandOf(d.score, config),
      meta: config.greenFloor,
      weight: d.weight,
      stale: fromGT ? perfStale : chkStale,
      fields: d.fields.map((f) => ({
        label: f.label,
        score: f.score,
        band: f.score === null ? null : bandOf(f.score, config),
        weight: f.effectiveWeight || f.weight,
        actual: f.actual ?? (f.score === null ? "—" : f.raw),
        target: f.target ?? "—",
        note: f.note,
        period: f.period,
      })),
      primary: fromGT
        ? { label: "Ajustar forecast", href: `/gt?c=${clientId}`, icon: "target" as IconName }
        : { label: "Registrar check-in", href: `/account/${clientId}`, icon: "plus" as IconName },
    };
  });

  const uiData = {
    clientId,
    clientName: client.name,
    today: at,
    dims: drawerDims,
    dimBands: Object.fromEntries(dims.map((d) => [d.key, d.band])) as Partial<Record<DimensionKey, Band | null>>,
    plans,
    owners: [...new Set(users.map((u) => u.name))],
    defaultOwner: client.gt_name ?? client.account_name ?? "",
    clickupBase: process.env.NEXT_PUBLIC_CLICKUP_LIST_URL ?? "https://app.clickup.com/",
    checkins: rows,
    actions,
    nextCheckinAt: client.next_checkin_at,
  };

  const metaParts: { k?: string; v: string }[] = [
    { v: ACCOUNT_TYPE_LABEL[client.account_type] },
    { k: "GT", v: firstName(client.gt_name) },
    { k: "Account", v: firstName(client.account_name) },
    { v: `${brl(client.mrr)}/mês` },
  ];
  if (!client.active) metaParts.push({ v: "arquivado" });

  const history = (
    <HistoryContent
      events={events}
      perf={perf}
      checkins={checkins}
      targets={targets}
      type={client.account_type}
    />
  );

  return (
    <ClientUI data={uiData} history={history} startWithNewPlan={plano === "novo"}>
      {/* Cabeçalho único (desktop e celular). O Churn abre a solicitação já
          com a conta — ou a que está em andamento, para não duplicar. */}
      <div className="mb-6 lg:mb-8">
        <PageHead
          crumbs={[{ href: "/clientes", label: "Clientes" }]}
          title={client.name}
          adornment={<BandPill band={s.band} />}
          description={<MetaLine parts={metaParts} />}
          actions={
            <>
              <Link href={`/account/${clientId}`} className="btn btn-light">
                <Icon name="plus" size={16} />
                Registrar check-in
              </Link>
              <Link href={`/gt?c=${clientId}`} className="btn">
                <Icon name="target" size={16} stroke={1.75} />
                Metas
              </Link>
              {(client.active || openChurn) && (
                <Link href={openChurn ? `/churn/${openChurn.id}` : `/churn/nova?cliente=${clientId}`} className="btn btn-danger">
                  <Icon name="userMinus" size={16} stroke={1.75} />
                  Churn
                </Link>
              )}
              <ClientActions client={client} users={users} targets={targets} size="md" />
            </>
          }
        />
      </div>

      {/* ============================ DESKTOP ============================ */}
      <div className="hidden flex-col gap-8 pb-6 lg:flex">
        {/* Resumo da conta */}
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_404px]">
          <HealthCard
            score={s.score}
            band={s.band}
            delta={delta}
            prev={ref7 && ref7.score !== null ? { score: ref7.score, day: ref7.day } : null}
            updated={lastDay}
            lastInput={lastInput}
            confidence={s.confidence}
            responsible={responsible}
          />
          <StatusCard status={status} dims={dims} />
          <Card className="flex flex-col gap-1.5 p-5 lg:col-span-2 xl:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-ink-300">Próximas ações</span>
              {actions.length > 0 && (
                <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[12px] font-medium text-ink-100">
                  {actions.length} {actions.length === 1 ? "pendente" : "pendentes"}
                </span>
              )}
            </div>
            <ActionList limit={3} stacked={false} />
            {actions.length > 0 && (
              <OpenActions className="mt-auto flex items-center gap-1.5 pt-2 text-[12px] text-ink-300 hover:text-ink-100">
                Ver todas as ações
                <Icon name="arrowRight" size={13} />
              </OpenActions>
            )}
          </Card>
        </div>

        {/* Diagnóstico */}
        <section className="flex flex-col gap-4">
          <SectionHead
            title="Diagnóstico da conta"
            subtitle="Veja onde a conta está saudável, onde existe risco e quais pontos precisam de intervenção."
            action={
              <Link href="/config/modelo" className="flex items-center gap-1.5 text-[13px] text-ink-300 hover:text-ink-100">
                <Icon name="sliders" size={14} />
                Pesos do score
              </Link>
            }
          />
          <div className="grid grid-cols-5 gap-3">
            {dims.map((d) => (
              <DimCard key={d.key} d={d} />
            ))}
          </div>
        </section>

        {risk && <RiskBanner risk={risk} />}

        <PlaybookSection data={playbook} variant="desktop" />

        <MediaChannels split={split} clientId={clientId} />

        <EvolutionSection
          points={series.map((p) => ({ day: p.day, score: p.score }))}
          events={chartEvents}
          greenFloor={config.greenFloor}
          yellowFloor={config.yellowFloor}
          band={s.band}
          at={at}
        />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="flex min-w-0 flex-col gap-4">
            <SectionHead
              title="Últimos check-ins"
              subtitle="Clique em um check-in para ver o registro completo."
              action={
                <Link href={`/account/${clientId}`} className="btn h-8">
                  <Icon name="plus" size={16} />
                  Registrar check-in
                </Link>
              }
            />
            <CheckinTable rows={rows.slice(0, 4)} />
          </section>
          <section id="plano" className="flex scroll-mt-20 flex-col gap-4">
            <SectionHead
              title="Plano de ação"
              subtitle="Tarefas ligadas aos problemas da conta."
              action={
                <PlanButton className="btn h-8">
                  <Icon name="plus" size={16} />
                  Novo plano
                </PlanButton>
              }
            />
            <Card className="flex-1 px-5">
              <PlanCards variant="desktop" />
            </Card>
          </section>
        </div>

        <section className="flex flex-col gap-4">
          <SectionHead
            title="Histórico da conta"
            subtitle="Tudo o que aconteceu na conta, em ordem cronológica."
            action={
              <OpenHistory className="flex items-center gap-1.5 text-[13px] text-ink-300 hover:text-ink-100">
                Ver histórico completo
                <Icon name="arrowRight" size={14} />
              </OpenHistory>
            }
          />
          <Card className="px-6 py-[22px]">
            {events.length ? (
              <div className="flex">
                {events.slice(0, 5).map((e, i, list) => (
                  <div key={i} className="flex min-w-0 flex-1 flex-col gap-3">
                    <div className="flex items-center gap-2.5">
                      <EventMarker kind={e.kind} fell={e.detail.includes("caiu")} />
                      {i < list.length - 1 ? <span className="h-px flex-1 bg-ink-700" /> : <span className="h-px flex-1 bg-[var(--border-hair)]" />}
                    </div>
                    <div className="flex flex-col gap-1 pr-5">
                      <span className="text-[12px] font-medium text-ink-400">{ddmm(e.day)}</span>
                      <span className="text-[13px] font-medium text-ink-100">{e.title}</span>
                      {e.detail && <span className="text-[12px] leading-[17px] text-ink-300">{e.detail}</span>}
                      {e.by && <span className="text-[12px] text-ink-400">por {firstName(e.by)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-[13px] text-ink-400">Nada registrado nesta conta ainda.</p>
            )}
          </Card>
        </section>
      </div>

      {/* ============================ CELULAR ============================ */}
      <div className="flex flex-col gap-4 pb-8 lg:hidden">
        <Card className="flex flex-col gap-3.5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-ink-300">Health Score</span>
            <span className="text-[12px] text-ink-400">
              Atualizado {ddmm(lastDay)}
              {lastInput ? ` · ${hhmm(lastInput)}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-[18px]">
            <Donut score={s.score} band={s.band} size={96} />
            <div className="flex flex-col gap-2">
              <BandPill band={s.band} />
              {delta !== null && <DeltaText delta={delta} />}
              <span className="text-[12px] text-ink-400">
                Confiança {s.confidence === "media" ? "média" : s.confidence} · {firstName(responsible)}
              </span>
            </div>
          </div>
        </Card>

        {risk && <RiskBanner risk={risk} compact />}

        <Card className="flex flex-col gap-2.5 p-4">
          <StatusHeadline status={status} compact />
          <p className="text-[13px] leading-5 text-ink-300">{status.short}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {dims.map((d) => (
              <span key={d.key} className="flex h-8 items-center gap-2 rounded-md bg-ink-850 px-2.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE[tone(d.band)].dot}`} />
                <span className="truncate text-[12px] text-ink-300">{d.short}</span>
              </span>
            ))}
          </div>
        </Card>

        <h2 className="pt-2 font-display text-[16px] font-semibold tracking-[-0.2px] text-ink-100">Próximas ações</h2>
        <Card className="px-4">
          <ActionList limit={3} stacked />
        </Card>

        <div className="flex flex-col gap-1 pt-2">
          <h2 className="font-display text-[16px] font-semibold tracking-[-0.2px] text-ink-100">Diagnóstico da conta</h2>
          <p className="text-[13px] leading-[19px] text-ink-400">Onde a conta está saudável, onde existe risco e o que precisa de intervenção.</p>
        </div>
        <Card className="px-4">
          {dims.map((d, i) => (
            <DimButton
              key={d.key}
              dim={d.key}
              className={`flex w-full items-center gap-3 py-3.5 text-left ${i < dims.length - 1 ? "border-b border-[var(--border-hair)]" : ""}`}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="text-[13px] text-ink-300">{d.label}</span>
                <Bar value={d.score ?? 0} tone={tone(d.band)} />
              </span>
              <span className="flex w-[58px] flex-col items-end gap-0.5">
                <span className="tnum font-display text-[20px] font-semibold tracking-[-0.5px] text-ink-100">{d.score === null ? "—" : Math.round(d.score)}</span>
                <span className={`text-[11px] font-medium ${TONE[tone(d.band)].text}`}>{d.band ? BAND_TEXT[d.band] : "sem dado"}</span>
              </span>
              <Icon name="chevronRight" size={16} className="shrink-0 text-ink-500" />
            </DimButton>
          ))}
        </Card>

        <PlaybookSection data={playbook} variant="mobile" />

        <MediaChannels split={split} clientId={clientId} />

        <EvolutionSection
          points={series.map((p) => ({ day: p.day, score: p.score }))}
          events={chartEvents}
          greenFloor={config.greenFloor}
          yellowFloor={config.yellowFloor}
          band={s.band}
          at={at}
          compact
        />

        <div className="flex items-center justify-between pt-2">
          <h2 className="font-display text-[16px] font-semibold tracking-[-0.2px] text-ink-100">Últimos check-ins</h2>
          <Link href={`/account/${clientId}`} className="flex items-center gap-1 text-[13px] font-medium text-ink-300">
            <Icon name="plus" size={14} />
            Registrar
          </Link>
        </div>
        {rows.slice(0, 2).map((r) => (
          <CheckinButton key={r.id} id={r.id} className="flex w-full flex-col gap-2.5 rounded-xl border border-[var(--border-hair)] bg-ink-900 p-4 text-left">
            <span className="flex w-full items-center justify-between">
              <span className="flex items-center gap-2 text-[13px]">
                <span className="font-semibold text-ink-100">{ddmm(r.day)}</span>
                <span className="text-ink-500">·</span>
                <span className="text-ink-300">{firstName(r.by)}</span>
              </span>
              <Pill tone={r.band}>{BAND_TEXT[r.band]}</Pill>
            </span>
            <span className="flex w-full items-center gap-3">
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-100">{r.title}</span>
              {r.nota !== null && <span className="shrink-0 text-[12px] text-ink-400">Nota {r.nota}/5</span>}
              <Icon name="chevronRight" size={16} className="shrink-0 text-ink-500" />
            </span>
          </CheckinButton>
        ))}
        {!rows.length && <Card className="py-6 text-center text-[13px] text-ink-400">Nenhum check-in registrado.</Card>}

        <div className="flex items-center justify-between pt-2">
          <h2 className="font-display text-[16px] font-semibold tracking-[-0.2px] text-ink-100">Plano de ação</h2>
          <PlanButton className="flex items-center gap-1 text-[13px] font-medium text-ink-300">
            <Icon name="plus" size={14} />
            Novo plano
          </PlanButton>
        </div>
        <PlanCards variant="mobile" />

        <div className="flex items-center justify-between pt-2">
          <h2 className="font-display text-[16px] font-semibold tracking-[-0.2px] text-ink-100">Histórico da conta</h2>
          <OpenHistory className="text-[13px] font-medium text-ink-300">Ver tudo</OpenHistory>
        </div>
        <Card className="flex flex-col p-4">
          {events.slice(0, 4).map((e, i, list) => (
            <div key={i} className="flex gap-3">
              <div className="flex w-6 flex-col items-center">
                <EventMarker kind={e.kind} fell={e.detail.includes("caiu")} size={24} />
                {i < list.length - 1 && <span className="w-px flex-1 bg-ink-700" />}
              </div>
              <div className={`flex min-w-0 flex-1 flex-col gap-0.5 pt-[3px] ${i < list.length - 1 ? "pb-[18px]" : ""}`}>
                <span className="text-[13px] font-medium text-ink-100">{e.title}</span>
                <span className="text-[12px] text-ink-400">
                  {ddmm(e.day)}
                  {e.by ? ` · por ${firstName(e.by)}` : ""}
                </span>
              </div>
            </div>
          ))}
          {!events.length && <p className="py-2 text-center text-[13px] text-ink-400">Nada registrado nesta conta ainda.</p>}
        </Card>
      </div>
    </ClientUI>
  );
}

/* ------------------------------------------------------------------ */

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function MetaLine({ parts }: { parts: { k?: string; v: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      {parts.map((p, i) => (
        // O ponto fica no fim do item: quando a linha quebra, a seguinte não começa com "·".
        <span key={i} className="flex items-center gap-2">
          <span className="flex gap-[5px]">
            {p.k && <span className="text-ink-400">{p.k}</span>}
            <span className="text-ink-300">{p.v}</span>
          </span>
          {i < parts.length - 1 && <span className="text-ink-500">·</span>}
        </span>
      ))}
    </div>
  );
}

function Donut({ score, band, size }: { score: number | null; band: Band | null; size: number }) {
  const stroke = size > 100 ? 10 : 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score ?? 0)) / 100;
  const color = band === "verde" ? "var(--color-verde)" : band === "amarelo" ? "var(--color-amarelo)" : band === "vermelho" ? "var(--color-vermelho)" : "var(--color-ink-600)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-ink-800)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${c * pct} ${c}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`tnum font-display font-semibold tracking-[-1px] text-ink-100 ${size > 100 ? "text-[36px] leading-10" : "text-[30px] leading-[33px]"}`}>
          {score === null ? "—" : Math.round(score)}
        </span>
        <span className={`text-ink-400 ${size > 100 ? "text-[12px]" : "text-[11px]"}`}>/ 100</span>
      </div>
    </div>
  );
}

function DeltaText({ delta }: { delta: number }) {
  const up = delta > 0;
  const cls = delta === 0 ? "text-ink-300" : up ? "text-verde-fg" : "text-vermelho-fg";
  return (
    <span className={`tnum text-[13px] font-medium ${cls}`}>
      {delta === 0 ? "=" : up ? "↑" : "↓"} {fmt1(Math.abs(delta))} na série
    </span>
  );
}

function HealthCard({
  score,
  band,
  delta,
  prev,
  updated,
  lastInput,
  confidence,
  responsible,
}: {
  score: number | null;
  band: Band | null;
  delta: number | null;
  prev: { score: number; day: string } | null;
  updated: string;
  lastInput: string | null;
  confidence: "alta" | "media" | "baixa";
  responsible: string;
}) {
  const n = confidence === "alta" ? 3 : confidence === "media" ? 2 : 1;
  const confTone = confidence === "alta" ? "bg-verde" : confidence === "media" ? "bg-amarelo" : "bg-vermelho";
  return (
    <Card className="flex flex-col justify-between gap-[18px] p-5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink-300">Health Score</span>
        <span className="text-[12px] text-ink-400">Atualizado {ddmm(updated)}</span>
      </div>
      <div className="flex items-center gap-5">
        <Donut score={score} band={band} size={116} />
        <div className="flex flex-col gap-2.5">
          <BandPill band={band} />
          {delta !== null && <DeltaText delta={delta} />}
          {prev && (
            <span className="text-[12px] text-ink-400">
              era {fmt1(prev.score)} em {ddmm(prev.day)}
            </span>
          )}
        </div>
      </div>
      <dl className="flex flex-col gap-[9px] border-t border-[var(--border-hair)] pt-3.5 text-[13px]">
        <div className="flex items-center justify-between">
          <dt className="text-ink-400">Confiança</dt>
          <dd className="flex items-center gap-2 text-ink-100">
            <span className="flex items-end gap-0.5" aria-hidden>
              {[6, 9, 12].map((h, i) => (
                <span key={h} className={`w-[3px] rounded-[1px] ${i < n ? confTone : "bg-ink-800"}`} style={{ height: h }} />
              ))}
            </span>
            {confidence === "media" ? "Média" : confidence === "alta" ? "Alta" : "Baixa"}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-ink-400">Última atualização</dt>
          <dd className="tnum text-ink-100">{lastInput ? `${ddmm(localDay(lastInput))} · ${hhmm(lastInput)}` : "—"}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-ink-400">Responsável</dt>
          <dd className="truncate text-ink-100">{responsible}</dd>
        </div>
      </dl>
    </Card>
  );
}

function StatusHeadline({ status, compact }: { status: ReturnType<typeof accountStatus>; compact?: boolean }) {
  const icon: IconName = status.tone === "verde" ? "checkCircle" : "alert";
  return (
    <div className="flex items-center gap-2">
      <Icon name={icon} size={compact ? 16 : 18} className={status.tone === "verde" ? "text-verde-fg" : status.tone ? "text-amarelo-fg" : "text-ink-400"} />
      <span className={`font-display font-semibold tracking-[-0.3px] text-ink-100 ${compact ? "text-[16px]" : "text-[18px]"}`}>{status.headline}</span>
    </div>
  );
}

function StatusCard({ status, dims }: { status: ReturnType<typeof accountStatus>; dims: DimView[] }) {
  return (
    <Card className="flex min-w-0 flex-col gap-3 p-5">
      <span className="text-[13px] font-medium text-ink-300">Status da conta</span>
      <StatusHeadline status={status} />
      <p className="text-[13px] leading-5 text-ink-300">{status.summary}</p>
      <div className="flex flex-col pt-1">
        {dims.map((d) => (
          <DimButton
            key={d.key}
            dim={d.key}
            className="flex h-[28.5px] items-center justify-between border-t border-[var(--border-hair)] text-left text-[13px] text-ink-300 hover:text-ink-100"
          >
            {d.short}
            {d.band ? <DotLabel tone={d.band}>{BAND_TEXT[d.band]}</DotLabel> : <span className="text-[12px] text-ink-500">sem dado</span>}
          </DimButton>
        ))}
      </div>
    </Card>
  );
}

function DimCard({ d }: { d: DimView }) {
  const t = tone(d.band);
  const critical = d.band === "vermelho";
  const delta =
    d.delta === null ? "— na série" : d.delta === 0 ? "= 0 na série" : `${d.delta > 0 ? "↑" : "↓"} ${Math.abs(d.delta)} na série`;
  return (
    <DimButton
      dim={d.key}
      label={`Ver indicadores de ${d.label}`}
      className={`group flex min-w-0 flex-col gap-3.5 rounded-[10px] border bg-ink-900 p-4 text-left transition-colors hover:bg-ink-850 ${
        critical ? "border-vermelho/40" : "border-[var(--border-hair)]"
      }`}
    >
      <span className="flex h-9 w-full gap-2">
        <span className="min-w-0 flex-1 text-[13px] leading-[18px] text-ink-300">{d.label}</span>
        <Icon name="chevronRight" size={15} className="shrink-0 text-ink-500 group-hover:text-ink-100" />
      </span>
      <span className="flex items-end gap-2">
        <span className="tnum font-display text-[28px] font-semibold leading-7 tracking-[-0.8px] text-ink-100">{d.score === null ? "—" : Math.round(d.score)}</span>
        <span className={`text-[13px] font-medium ${TONE[t].text}`}>· {d.band ? BAND_TEXT[d.band] : "sem dado"}</span>
      </span>
      <Bar value={d.score ?? 0} tone={t} />
      <span className="flex w-full justify-between gap-2 text-[12px]">
        <span className="text-ink-400">
          {d.indicators} {d.indicators === 1 ? "indicador" : "indicadores"}
        </span>
        <span className={critical && (d.delta ?? 0) < 0 ? "text-vermelho-fg" : "text-ink-400"}>{delta}</span>
      </span>
    </DimButton>
  );
}

function RiskBanner({ risk, compact }: { risk: NonNullable<ReturnType<typeof mainRisk>>; compact?: boolean }) {
  const score = Math.round(risk.dim.score ?? 0);
  const bar = (
    <div className="relative h-3.5 w-full">
      <div className="absolute inset-x-0 top-[5px] h-1 rounded-sm bg-ink-800" />
      <div className="absolute left-0 top-[5px] h-1 rounded-sm bg-vermelho" style={{ width: `${score}%` }} />
      <div className="absolute top-[5px] h-1 bg-vermelho/25" style={{ left: `${score}%`, width: `${Math.max(0, risk.meta - score)}%` }} />
      <div className="absolute top-0 h-3.5 w-0.5 rounded-[1px] bg-ink-100" style={{ left: `${risk.meta}%` }} />
    </div>
  );
  const metric = (
    <>
      <div className="flex w-full items-end justify-between">
        <span className="flex items-end gap-1">
          <span className={`tnum font-display font-semibold tracking-[-1px] text-ink-100 ${compact ? "text-[28px] leading-7" : "text-[32px] leading-8"}`}>{score}</span>
          <span className="text-[13px] text-ink-400">/ 100</span>
        </span>
        <span className={`flex ${compact ? "gap-4" : "gap-3.5"}`}>
          <KV k="Meta" v={risk.meta} />
          <KV k="Gap" v={`−${Math.abs(risk.gap)} pontos`} tone="vermelho" />
        </span>
      </div>
      {bar}
    </>
  );
  const eyebrow = (
    <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-vermelho-fg">
      <Icon name="alert" size={14} />
      Principal risco da conta
    </span>
  );
  if (compact)
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-vermelho/25 bg-vermelho/5 p-4">
        {eyebrow}
        <span className="font-display text-[17px] font-semibold text-ink-100">{risk.dim.label}</span>
        <p className="text-[13px] leading-5 text-ink-300">{risk.text}</p>
        {metric}
        <DimButton dim={risk.dim.key} className="btn btn-light h-10 w-full">
          <Icon name="layoutList" size={16} />
          Ver indicadores
        </DimButton>
      </div>
    );
  return (
    <section className="flex items-center gap-8 rounded-xl border border-vermelho/25 bg-vermelho/5 px-6 py-[22px]">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {eyebrow}
        <span className="font-display text-[20px] font-semibold tracking-[-0.3px] text-ink-100">{risk.dim.label}</span>
        <p className="text-[13px] leading-5 text-ink-300">{risk.text}</p>
      </div>
      <div className="flex w-[339px] shrink-0 flex-col gap-3 border-x border-vermelho/20 px-8">{metric}</div>
      <div className="flex w-[180px] shrink-0 flex-col gap-2">
        <DimButton dim={risk.dim.key} className="btn btn-light w-full">
          <Icon name="layoutList" size={16} />
          Ver indicadores
        </DimButton>
        <PlanButton dimension={risk.dim.key} className="btn w-full">
          <Icon name="plus" size={16} />
          Criar plano de ação
        </PlanButton>
      </div>
    </section>
  );
}

function CheckinTable({ rows }: { rows: ReturnType<typeof checkinRow>[] }) {
  return (
    <Card className="flex flex-1 flex-col overflow-hidden">
      <TableScroll>
        <div className="min-w-[640px]">
          <div className="flex h-[39.5px] items-center gap-4 border-b border-[var(--border-hair)] px-5">
            <ColLabel className="w-14">Data</ColLabel>
            <ColLabel className="w-32">Responsável</ColLabel>
            <ColLabel className="w-[84px]">Nota</ColLabel>
            <ColLabel className="flex-1">Resumo</ColLabel>
            <ColLabel className="w-24">Status</ColLabel>
            <span className="w-4" />
          </div>
          {rows.map((r, i) => (
            <CheckinButton
              key={r.id}
              id={r.id}
              className={`flex h-[59.5px] w-full items-center gap-4 px-5 text-left hover:bg-ink-850 ${i === 0 ? "bg-white/[0.02]" : ""} ${
                i < rows.length - 1 ? "border-b border-[var(--border-hair)]" : ""
              }`}
            >
              <span className="tnum w-14 text-[13px] font-medium text-ink-100">{ddmm(r.day)}</span>
              <span className="flex w-32 items-center gap-2">
                <Initials name={r.by} />
                <span className="truncate text-[13px] text-ink-300">{firstName(r.by)}</span>
              </span>
              <span className="flex w-[84px] items-center gap-2">
                <span className="tnum text-[13px] font-medium text-ink-100">{r.nota === null ? "—" : `${r.nota}/5`}</span>
                <span className="flex gap-[3px]" aria-hidden>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span key={n} className={`h-2.5 w-1 rounded-[1px] ${r.nota !== null && n <= r.nota ? "bg-ink-300" : "bg-ink-800"}`} />
                  ))}
                </span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <span className="truncate text-[13px] text-ink-100">{r.title}</span>
                {r.note && <span className="truncate text-[12px] text-ink-400">{r.note}</span>}
              </span>
              <span className="w-24">
                <Pill tone={r.band}>{BAND_TEXT[r.band]}</Pill>
              </span>
              <Icon name="chevronRight" size={16} className="w-4 shrink-0 text-ink-500" />
            </CheckinButton>
          ))}
          {!rows.length && <p className="px-5 py-10 text-center text-[13px] text-ink-400">Nenhum check-in registrado nesta conta.</p>}
        </div>
      </TableScroll>
    </Card>
  );
}

const EVENT_MARK: Record<AccountEvent["kind"], { icon: IconName; cls: string }> = {
  checkin: { icon: "message", cls: "text-ink-300" },
  performance: { icon: "trendingDown", cls: "text-vermelho-fg" },
  queda: { icon: "trendingDown", cls: "text-vermelho-fg" },
  meta: { icon: "target", cls: "text-amarelo-fg" },
  plano: { icon: "listTodo", cls: "text-verde-fg" },
  outro: { icon: "history", cls: "text-ink-300" },
};

function EventMarker({ kind, fell, size = 26 }: { kind: AccountEvent["kind"]; fell?: boolean; size?: number }) {
  const m = kind === "performance" && !fell ? { icon: "chart" as IconName, cls: "text-ink-300" } : EVENT_MARK[kind];
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] bg-ink-850" style={{ width: size, height: size }}>
      <Icon name={m.icon} size={size > 24 ? 13 : 12} className={m.cls} />
    </span>
  );
}

/** "Ver histórico completo": a linha do tempo inteira e os inputs crus. */
function HistoryContent({
  events,
  perf,
  checkins,
  targets,
  type,
}: {
  events: AccountEvent[];
  perf: Awaited<ReturnType<typeof perfSnapshots>>;
  checkins: Awaited<ReturnType<typeof checkinSnapshots>>;
  targets: Record<string, number>;
  type: string;
}) {
  const heatRows = CHECKIN_ROWS.map((r) => ({ ...r, label: fieldByKey(r.key)?.question ?? fieldByKey(r.key)?.label ?? r.short }));
  return (
    <div className="space-y-6">
      <section>
        <h3 className="label mb-2">Linha do tempo</h3>
        <ol className="divide-y divide-[var(--border-hair)] rounded-lg border border-[var(--border-hair)]">
          {events.map((e, i) => (
            <li key={i} className="flex gap-3 px-3 py-2.5">
              <EventMarker kind={e.kind} fell={e.detail.includes("caiu")} size={24} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink-100">{e.title}</div>
                {e.detail && <div className="text-[12px] text-ink-300">{e.detail}</div>}
              </div>
              <div className="shrink-0 text-right text-[12px] text-ink-400">
                {ddmm(e.day)}/{e.day.slice(2, 4)}
                {e.by && <div>{firstName(e.by)}</div>}
              </div>
            </li>
          ))}
          {!events.length && <li className="px-3 py-6 text-center text-[13px] text-ink-400">Nada registrado ainda.</li>}
        </ol>
      </section>

      <section>
        <h3 className="label mb-2">Mapa dos check-ins</h3>
        <div className="overflow-hidden rounded-lg border border-[var(--border-hair)]">
          <CheckinHeatmap rows={heatRows} snapshots={checkins} />
        </div>
      </section>

      <section>
        <h3 className="label mb-2">Performance · GT, semanal</h3>
        <div className="overflow-hidden rounded-lg border border-[var(--border-hair)]">
          <TableScroll>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Semana</th>
                  <th>Principais números</th>
                  <th>Por</th>
                </tr>
              </thead>
              <tbody>
                {perf.map((p) => (
                  <tr key={p.id}>
                    <td className="tnum whitespace-nowrap">{ddmm(p.ref_date)}</td>
                    <td className="text-xs text-ink-300">{summarizePerf(p.data, type)}</td>
                    <td className="text-xs text-ink-400">{p.filler ?? "—"}</td>
                  </tr>
                ))}
                {!perf.length && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-sm text-ink-400">
                      Nunca preenchido.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableScroll>
        </div>
      </section>

      <section>
        <h3 className="label mb-2">Forecast vigente · base das réguas</h3>
        <div className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {Object.entries(targets).length === 0 && <span className="text-sm text-ink-400">Nenhum forecast cadastrado — sem forecast não há régua.</span>}
          {Object.entries(targets).map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between border-b border-[var(--border-hair)] pb-1">
              <span className="text-xs text-ink-400">{fieldByKey(k)?.label ?? k}</span>
              <span className="tnum text-sm text-ink-100">{v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function summarizePerf(data: Record<string, unknown>, type: string) {
  const n = (k: string) =>
    data[k] === null || data[k] === undefined ? "—" : Number(data[k]).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  if (type === "lead_gen") return `${n("leads_real")}/${n("leads_meta")} leads · CPL ${n("cpl_real")} (forecast ${n("cpl_meta")}) · MQL ${n("mql_real")}`;
  if (type === "ecommerce") return `Fat. ${n("revenue_real")}/${n("revenue_meta")} · ROAS ${n("roas_real")} (forecast ${n("roas_meta")})`;
  return `Alcance ${n("reach_real")}/${n("reach_meta")} · Entregas ${n("deliveries_real")}/${n("deliveries_meta")}`;
}
