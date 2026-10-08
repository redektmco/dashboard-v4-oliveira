import Link from "next/link";
import { notFound } from "next/navigation";
import { getRequest, listAttempts, listEvents, listTasks, requestsForClient, statusDates } from "@/lib/churn/db";
import {
  CHANNEL,
  FLOW,
  OUTCOME,
  RESULT,
  STATUS,
  addDays,
  addMonths,
  dateBr,
  daysUntil,
  ddmm,
  inDays,
  isOpen,
  money,
  monthYear,
  reasonLabel,
  strategyLabel,
  type ChurnStatus,
} from "@/lib/churn/types";
import { getClient, listUsers, scoreFor, today } from "@/lib/repo";
import { BAND_TEXT } from "@/components/kit";
import { Icon, type IconName } from "@/components/icon";
import { Box, BoxHead, Caps, ChurnHeader, KRow, TonePill } from "@/components/churn/ui";
import { EvidenceFile } from "@/components/churn/evidence";
import { EditReasons, HistoryPanel, StatusMenu, TasksCard } from "@/components/churn/detail-islands";
import { Initials } from "@/components/kit";

export const dynamic = "force-dynamic";

const REASON_ICON: Record<string, IconName> = {
  custo: "wallet",
  resultados: "trendingDown",
  estrategia: "repeat",
  internalizacao: "users",
  atendimento: "message",
  concorrente: "arrowRightLeft",
  prazo: "clock",
  fim_operacao: "xCircle",
  outro: "tag",
};

/** Churn 03 — Detalhes da solicitação. */
export default async function ChurnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = Number(raw);
  const req = await getRequest(id);
  if (!req) notFound();
  const at = today();
  const [attempts, tasks, events, dates, client, score, history, users] = await Promise.all([
    listAttempts(id),
    listTasks(id),
    listEvents(id),
    statusDates(id),
    getClient(req.client_id),
    scoreFor(req.client_id, at).catch(() => null),
    requestsForClient(req.client_id),
    listUsers(),
  ]);

  const open = isOpen(req.status);
  const st = STATUS[req.status];
  const openAttempt = attempts.find((a) => a.result === "aguardando") ?? null;
  const previous = history.filter((h) => h.requested_at < req.requested_at || (h.requested_at === req.requested_at && h.id < id));
  const contractStart = client?.contract_start ?? client?.created_at.slice(0, 10) ?? null;
  const fidelityEnd = client?.fidelity_months && contractStart ? addMonths(contractStart, client.fidelity_months) : null;
  const noticeEnd = client?.notice_days ? addDays(req.requested_at, client.notice_days) : null;
  const people = [
    { name: req.owner_name, role: "Responsável pela solicitação" },
    ...[...new Set(attempts.map((a) => a.owner_name).filter((n): n is string => !!n && n !== req.owner_name))].map((n) => ({
      name: n,
      role: "Apoio · tentativas de retenção",
    })),
  ].filter((p) => p.name);

  // Receita envolvida: em negociação (aberta), perdida (cancelada) ou preservada (retida).
  const proposed = openAttempt?.proposed_mrr ?? null;
  const money3 =
    req.status === "cancelado"
      ? { label: "RECEITA MENSAL PERDIDA", value: req.mrr, cls: "text-vermelho-fg", note: req.effective_end ? `Contabilizada como perda a partir de ${dateBr(req.effective_end)}.` : "" }
      : req.status === "retido"
        ? {
            label: "RECEITA PRESERVADA",
            value: req.new_mrr ?? req.mrr,
            cls: "text-verde-fg",
            note: req.new_mrr !== null ? `Contrato mantido com novo valor (antes ${money(req.mrr)}).` : "Contrato mantido sem alteração de valor.",
          }
        : { label: "RECEITA EM NEGOCIAÇÃO", value: req.mrr, cls: "text-amarelo-fg", note: "Não contabilizada como perda — contrato ativo." };

  return (
    <>
      <ChurnHeader
        crumbs={[{ href: "/churn", label: "Churn" }, { label: req.code }]}
        title={req.client_name}
        pill={<TonePill tone={req.outcome ? OUTCOME[req.outcome].tone : st.tone}>{req.outcome ? OUTCOME[req.outcome].short : st.label}</TonePill>}
        description={`Solicitação ${req.code} · aberta em ${dateBr(req.requested_at)}${req.created_by_name ? ` por ${req.created_by_name}` : ""}${req.contract_code ? ` · contrato ${req.contract_code}` : ""}`}
        actions={
          <>
            <StatusMenu id={id} status={req.status} clientId={req.client_id} />
            {open && (
              <>
                <Link href={`/churn/${id}/retencao`} className="btn">
                  <Icon name="handshake" size={15} />
                  Registrar tentativa de retenção
                </Link>
                <Link href={`/churn/${id}/concluir`} className="btn btn-light">
                  <Icon name="flag" size={15} />
                  Concluir solicitação
                </Link>
              </>
            )}
          </>
        }
      />

      {/* -------------------------- status do processo -------------------------- */}
      <Box className="flex flex-col gap-5 px-5 py-[18px] lg:flex-row lg:items-center lg:gap-7 lg:px-6">
        <ol className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center md:gap-2">
          {[...FLOW, "desfecho" as const].map((s, i, arr) => {
            const idx = FLOW.indexOf(req.status);
            const final = !open;
            const state: "done" | "current" | "todo" =
              s === "desfecho" ? (final ? "done" : "todo") : final ? (dates[s] ? "done" : "todo") : i < idx ? "done" : i === idx ? "current" : "todo";
            const label = s === "desfecho" ? (req.outcome ? OUTCOME[req.outcome].label : "Desfecho") : STATUS[s as ChurnStatus].label;
            const sub =
              s === "desfecho"
                ? final
                  ? ddmm((req.closed_at ?? req.updated_at).slice(0, 10))
                  : "Retido ou Cancelado"
                : state === "current"
                  ? `desde ${ddmm(req.status_since)} · ${Math.max(0, daysUntil(req.status_since ?? at, at))} dias`
                  : dates[s as ChurnStatus]
                    ? ddmm(dates[s as ChurnStatus]!)
                    : "—";
            return (
              <li key={s} className="flex min-w-0 items-center gap-2 md:flex-1 md:last:flex-none">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`tnum grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] ${
                      state === "done"
                        ? "bg-ink-800 text-ink-100"
                        : state === "current"
                          ? "bg-amarelo-dim text-amarelo-fg"
                          : "border border-ink-700 text-ink-500"
                    }`}
                  >
                    {state === "done" ? <Icon name="check" size={12} stroke={2.5} /> : i + 1}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={`text-[13px] leading-4 ${state === "todo" ? "text-ink-500" : "text-ink-100"}`}>{label}</span>
                    <span className={`truncate text-[11px] ${state === "current" ? "text-amarelo-fg" : "text-ink-500"}`}>{sub}</span>
                  </span>
                </span>
                {i < arr.length - 1 && <span className={`hidden h-px min-w-4 flex-1 md:block ${state === "done" ? "bg-ink-500" : "bg-ink-700"}`} />}
              </li>
            );
          })}
        </ol>
        <span className="hidden h-12 w-px bg-[var(--border-hair)] lg:block" aria-hidden />
        <div className="flex flex-col gap-1">
          <span className="text-[12px] text-ink-500">{req.status === "cancelado" ? "Encerramento efetivo" : "Encerramento desejado"}</span>
          <span className={`text-[14px] ${open ? "text-amarelo-fg" : "text-ink-100"}`}>
            {req.status === "cancelado"
              ? dateBr(req.effective_end)
              : req.status === "retido"
                ? "—"
                : `${dateBr(req.desired_end)}${req.desired_end ? ` · ${inDays(at, req.desired_end)}` : ""}`}
          </span>
        </div>
      </Box>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* -------------------------------- motivos -------------------------------- */}
          <Box>
            <BoxHead
              title="Motivos da solicitação"
              subtitle={open ? "Registrados na abertura · editáveis até a conclusão" : "Registrados na abertura"}
              action={
                open && (
                  <EditReasons
                    id={id}
                    main={req.main_reason}
                    secondary={req.secondary_reasons}
                    justification={req.justification}
                    desiredEnd={req.desired_end}
                    chance={req.retention_chance}
                  />
                )
              }
            />
            <div className="flex flex-col gap-6 p-5 md:flex-row">
              <div className="flex min-w-0 flex-1 flex-col gap-3.5">
                <div className="flex flex-col gap-2">
                  <Caps>Motivo principal</Caps>
                  <span className="flex h-8 w-fit items-center gap-1.5 rounded-lg bg-vermelho-dim px-[11px] text-[13px] text-vermelho-fg">
                    <Icon name={REASON_ICON[req.main_reason] ?? "tag"} size={14} />
                    {reasonLabel(req.main_reason)}
                  </span>
                </div>
                {req.secondary_reasons.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <Caps>Motivos secundários</Caps>
                    <span className="flex flex-wrap gap-1.5">
                      {req.secondary_reasons.map((s) => (
                        <span key={s} className="flex h-7 items-center rounded-lg border border-[var(--border-hair)] px-2.5 text-[12px] text-ink-300">
                          {reasonLabel(s)}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
                {req.final_reason && req.final_reason !== req.main_reason && (
                  <div className="flex flex-col gap-2">
                    <Caps>Motivo final</Caps>
                    <span className="text-[13px] text-ink-100">{reasonLabel(req.final_reason)}</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-6">
                  <MetaIcon k="Canal" icon="messageCircle" v={CHANNEL[req.channel]} />
                  <MetaIcon k="Solicitado em" icon="calendar" v={dateBr(req.requested_at)} />
                  <MetaIcon k="Evidências" icon="paperclip" v={`${req.evidences.length} ${req.evidences.length === 1 ? "anexo" : "anexos"}`} />
                </div>
              </div>
              <div className="flex flex-col gap-2.5 rounded-lg bg-ink-850 px-4 py-3.5 md:w-[340px]">
                <Caps>Justificativa do cliente</Caps>
                <p className="whitespace-pre-line text-[13px] leading-[19px] text-ink-100">“{req.justification}”</p>
                {req.evidences.map((f) => (
                  <EvidenceFile key={f.url} f={f} />
                ))}
              </div>
            </div>
            {req.final_note && (
              <div className="border-t border-[var(--border-hair)] px-5 py-4">
                <Caps>Observação final</Caps>
                <p className="mt-1.5 whitespace-pre-line text-[13px] text-ink-300">{req.final_note}</p>
              </div>
            )}
          </Box>

          {/* -------------------------- propostas de retenção -------------------------- */}
          <Box>
            <BoxHead
              title="Propostas de retenção"
              subtitle={
                attempts.length
                  ? `${attempts.length} ${attempts.length === 1 ? "tentativa" : "tentativas"}${req.attempts_open ? ` · ${req.attempts_open} aguardando retorno do cliente` : ""}`
                  : "Nenhuma tentativa registrada"
              }
              action={
                <Link href={`/churn/${id}/retencao`} className="btn btn-ghost btn-sm">
                  <Icon name="arrowUpRight" size={14} />
                  {attempts.length ? "Gerenciar tentativas" : "Registrar tentativa"}
                </Link>
              }
            />
            {attempts.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-b border-[var(--border-hair)] px-5 py-3 last:border-b-0">
                <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-850 text-[11px] text-ink-300">{a.n}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13px] text-ink-100">{strategyLabel(a.strategy)}</span>
                  <span className="text-[12px] text-ink-500">
                    {ddmm(a.sent_at)}
                    {a.owner_name ? ` · ${a.owner_name.split(" ")[0]}` : ""}
                  </span>
                </span>
                <span className="text-[12px] text-ink-300">
                  {a.proposed_mrr !== null && a.proposed_mrr !== a.current_mrr ? `${money(a.current_mrr)} → ${money(a.proposed_mrr)}` : "Sem alteração de valor"}
                </span>
                <span className="flex sm:w-[180px] sm:justify-end">
                  <TonePill tone={RESULT[a.result].tone}>{RESULT[a.result].label}</TonePill>
                </span>
              </div>
            ))}
          </Box>

          <HistoryPanel id={id} events={events} closed={!open} />
        </div>

        {/* -------------------------------- lateral -------------------------------- */}
        <aside className="flex flex-col gap-4">
          <Box className="flex flex-col gap-3 p-[18px]">
            <Caps>{money3.label}</Caps>
            <span className="flex items-end gap-1.5">
              <span className={`tnum font-display text-[28px] font-semibold leading-none ${money3.cls}`}>{money(money3.value)}</span>
              <span className="pb-0.5 text-[13px] text-ink-500">/mês</span>
            </span>
            {open && proposed !== null && proposed < req.mrr && (
              <>
                <div className="flex h-1.5 gap-0.5">
                  <span className="rounded-l-[3px] bg-verde" style={{ width: `${(proposed / req.mrr) * 100}%` }} />
                  <span className="flex-1 rounded-r-[3px] bg-ink-800" />
                </div>
                <div className="flex justify-between text-[12px]">
                  <span className="text-verde-fg">Proposta atual {money(proposed)}</span>
                  <span className="text-ink-500">Redução {money(req.mrr - proposed)}</span>
                </div>
              </>
            )}
            {money3.note && <p className="text-[12px] text-ink-500">{money3.note}</p>}
          </Box>

          <Box>
            <BoxHead
              size="sm"
              title="Cliente e contrato"
              action={
                <Link href={`/clientes/${req.client_id}`} className="text-[12px] text-ink-300 hover:text-ink-100">
                  Abrir ficha
                </Link>
              }
            />
            <div className="flex flex-col gap-[11px] px-[18px] pb-4 pt-3.5">
              <KRow k="Contrato" v={req.contract_code ?? "—"} />
              <KRow k="Serviços" v={req.services.length ? req.services.join(" + ") : "—"} />
              <KRow k="Valor mensal" v={money(req.mrr)} />
              <KRow k={client?.contract_start ? "Início" : "Cliente desde"} v={dateBr(contractStart)} />
              <KRow k="Fidelidade" v={fidelityEnd ? `${fidelityEnd <= at ? "encerrada" : "vigente até"} ${dateBr(fidelityEnd)}` : "sem fidelidade"} />
              <KRow k="Aviso prévio" v={client?.notice_days ? `${client.notice_days} dias · até ${ddmm(noticeEnd)}` : "—"} />
              <KRow
                k="Saúde do cliente"
                v={score?.score != null && score.band ? `${Math.round(score.score)} · ${BAND_TEXT[score.band]}` : "Sem score"}
                cls={score?.band === "vermelho" ? "text-vermelho-fg" : score?.band === "amarelo" ? "text-amarelo-fg" : score?.band === "verde" ? "text-verde-fg" : "text-ink-300"}
              />
              <KRow
                k="Solicitações anteriores"
                v={
                  previous.length
                    ? `${previous.length} · ${previous[0].outcome ? OUTCOME[previous[0].outcome].short : STATUS[previous[0].status].short} em ${monthYear((previous[0].closed_at ?? previous[0].requested_at).slice(0, 10))}`
                    : "nenhuma"
                }
              />
            </div>
          </Box>

          <Box>
            <BoxHead size="sm" title="Responsáveis e prazos" />
            <div className="flex flex-col gap-2.5 px-[18px] pb-1 pt-3.5">
              {people.map((p) => (
                <div key={p.name} className="flex items-center gap-2.5">
                  <Initials name={p.name} size={28} />
                  <span className="flex flex-col">
                    <span className="text-[13px] text-ink-100">{p.name}</span>
                    <span className="text-[11px] text-ink-500">{p.role}</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-[11px] px-[18px] pb-4 pt-3.5">
              {openAttempt?.due_date && (
                <KRow
                  k={`Retorno da tentativa ${openAttempt.n}`}
                  v={`${ddmm(openAttempt.due_date)} · ${inDays(at, openAttempt.due_date)}`}
                  cls={daysUntil(at, openAttempt.due_date) < 0 ? "text-vermelho-fg" : "text-amarelo-fg"}
                />
              )}
              {noticeEnd && open && <KRow k="Fim do aviso prévio" v={`${ddmm(noticeEnd)} · ${inDays(at, noticeEnd)}`} />}
              {open && <KRow k="Encerramento desejado" v={`${ddmm(req.desired_end)} · ${inDays(at, req.desired_end)}`} />}
              {!open && <KRow k="Concluída em" v={dateBr((req.closed_at ?? req.updated_at).slice(0, 10))} />}
            </div>
          </Box>

          <TasksCard id={id} tasks={tasks} users={users.map((u) => u.name)} closed={!open} />
        </aside>
      </div>
    </>
  );
}

function MetaIcon({ k, icon, v }: { k: string; icon: IconName; v: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Caps>{k}</Caps>
      <span className="flex items-center gap-1.5 text-[13px] text-ink-100">
        <Icon name={icon} size={14} className="text-ink-400" />
        {v}
      </span>
    </div>
  );
}
