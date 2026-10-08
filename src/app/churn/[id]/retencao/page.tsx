import Link from "next/link";
import { notFound } from "next/navigation";
import { getRequest, listAttempts, listEvents, listTasks, pendingAttempts } from "@/lib/churn/db";
import { OUTCOME, RESULT, STATUS, dateBr, daysUntil, ddmm, inDays, isOpen, money, reasonLabel, strategyLabel, tenure } from "@/lib/churn/types";
import { getClient, listUsers, today } from "@/lib/repo";
import { requireUser } from "@/lib/auth";
import { Icon, type IconName } from "@/components/icon";
import { Box, Caps, ChurnHeader, ClientBadge, ContextStrip, Meta, TonePill } from "@/components/churn/ui";
import { AnswerAttempt, NewAttemptForm } from "@/components/churn/attempt-forms";

export const dynamic = "force-dynamic";

const STRATEGY_ICON: Record<string, IconName> = {
  desconto: "percent",
  escopo: "sliders",
  pausa: "hourglass",
  upgrade: "sparkles",
  troca_time: "users",
  recuperacao: "trendingUp",
};

/** Churn 04 — Tentativas de retenção. */
export default async function RetentionPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id: raw } = await params;
  const id = Number(raw);
  const req = await getRequest(id);
  if (!req) notFound();
  const at = today();
  const [attempts, tasks, events, pending, client, users] = await Promise.all([
    listAttempts(id),
    listTasks(id),
    listEvents(id),
    pendingAttempts(),
    getClient(req.client_id),
    listUsers(),
  ]);
  const open = isOpen(req.status);
  const refused = attempts.filter((a) => a.result === "recusada" || a.result === "contraproposta_recusada").length;
  const waiting = attempts.filter((a) => a.result === "aguardando").length;
  const lastUpdate = events[0];
  const since = client?.contract_start ?? client?.created_at.slice(0, 10) ?? null;

  return (
    <>
      <ChurnHeader
        crumbs={[{ href: "/churn", label: "Churn" }, { href: `/churn/${id}`, label: `${req.code} · ${req.client_name}` }, { label: "Retenção" }]}
        title="Tentativas de retenção"
        pill={<TonePill tone={req.outcome ? OUTCOME[req.outcome].tone : STATUS[req.status].tone}>{req.outcome ? OUTCOME[req.outcome].short : STATUS[req.status].label}</TonePill>}
        description={`${attempts.length} ${attempts.length === 1 ? "tentativa registrada" : "tentativas registradas"} para esta solicitação${
          lastUpdate ? ` · última atualização em ${ddmm(lastUpdate.at.slice(0, 10))}${lastUpdate.user_name ? ` por ${lastUpdate.user_name.split(" ")[0]}` : ""}` : ""
        }`}
        actions={
          <>
            <Link href={`/churn/${id}`} className="btn btn-ghost">
              <Icon name="fileText" size={15} />
              Ver solicitação
            </Link>
            {open && (
              <Link href={`/churn/${id}/concluir`} className="btn">
                <Icon name="flag" size={15} />
                Concluir solicitação
              </Link>
            )}
            {open && (
              <a href="#nova-tentativa" className="btn btn-light">
                <Icon name="plus" size={15} />
                Nova tentativa
              </a>
            )}
          </>
        }
      />

      <ContextStrip
        items={[
          <ClientBadge
            key="c"
            name={req.client_name}
            sub={[req.contract_code, req.services.join(" + "), since ? `cliente há ${tenure(since, at)}` : null].filter(Boolean).join(" · ")}
          />,
          <Meta key="m" k="Receita mensal" v={`${money(req.mrr)}/mês`} />,
          <Meta key="r" k="Motivo principal" v={reasonLabel(req.main_reason)} />,
          <Meta
            key="e"
            k="Encerramento desejado"
            v={req.desired_end ? `${dateBr(req.desired_end)} · ${inDays(at, req.desired_end)}` : "—"}
            cls={open ? "text-amarelo-fg" : "text-ink-100"}
          />,
          <Meta key="o" k="Responsável" v={req.owner_name ?? "—"} />,
        ]}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-[3px]">
              <h2 className="text-[15px] font-semibold text-ink-100">Histórico de tentativas</h2>
              <p className="text-[12px] text-ink-500">Cada tentativa mantém proposta, resposta do cliente e resultado — nada é sobrescrito</p>
            </div>
            <div className="flex gap-4 text-[12px]">
              {[
                [attempts.length, "Tentativas"],
                [refused, "Recusadas"],
                [waiting, "Em aberto"],
              ].map(([v, k]) => (
                <span key={k} className="flex items-baseline gap-1.5">
                  <span className="tnum text-[13px] text-ink-100">{v}</span>
                  <span className="text-ink-500">{k}</span>
                </span>
              ))}
            </div>
          </div>

          {attempts.length === 0 && (
            <Box className="px-5 py-10 text-center text-[13px] text-ink-400">
              Nenhuma tentativa ainda. Registre a primeira proposta no painel ao lado.
            </Box>
          )}

          {attempts.map((a, i) => {
            const linked = tasks.filter((t) => t.attempt_id === a.id);
            const doneTasks = linked.filter((t) => t.done).length;
            const waitingA = a.result === "aguardando";
            return (
              <div key={a.id} className="flex gap-3.5">
                <div className="hidden w-7 shrink-0 flex-col items-center gap-1.5 sm:flex">
                  <span
                    className={`tnum grid h-7 w-7 place-items-center rounded-full text-[12px] ${waitingA ? "bg-amarelo-dim text-amarelo-fg" : "bg-ink-850 text-ink-300"}`}
                  >
                    {a.n}
                  </span>
                  {i < attempts.length - 1 && <span className="w-px flex-1 bg-ink-700" />}
                </div>
                <Box className="min-w-0 flex-1 overflow-hidden">
                  <header className="flex flex-wrap items-center gap-2.5 border-b border-[var(--border-hair)] px-[18px] py-3.5">
                    <Icon name={STRATEGY_ICON[a.strategy] ?? "handshake"} size={16} className="text-ink-400" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[14px] text-ink-100">
                        Tentativa {a.n} · {strategyLabel(a.strategy)}
                      </span>
                      <span className="text-[12px] text-ink-500">
                        {a.responded_at ? `${ddmm(a.sent_at)} → ${dateBr(a.responded_at)}` : `Enviada em ${dateBr(a.sent_at)}`}
                      </span>
                    </span>
                    <TonePill tone={RESULT[a.result].tone}>{RESULT[a.result].label}</TonePill>
                  </header>
                  <div className="flex flex-col gap-3.5 px-[18px] py-4">
                    <div className="flex flex-col gap-[5px]">
                      <Caps>Proposta</Caps>
                      <p className="whitespace-pre-line text-[13px] leading-[19px] text-ink-100">{a.proposal}</p>
                    </div>
                    {a.changes.length > 0 && (
                      <div className="overflow-x-auto rounded-lg border border-[var(--border-hair)]">
                        <table className="w-full min-w-[440px] text-[12px]">
                          <thead className="bg-ink-850 text-[11px] text-ink-500">
                            <tr>
                              <th className="px-3 py-[7px] text-left font-normal">Alteração proposta</th>
                              <th className="w-[130px] px-3 py-[7px] text-left font-normal">Atual</th>
                              <th className="w-[150px] px-3 py-[7px] text-left font-normal">Proposto</th>
                              <th className="w-[60px] px-3 py-[7px] text-left font-normal">Δ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {a.changes.map((c, k) => (
                              <tr key={k} className="border-t border-[var(--border-hair)]">
                                <td className="px-3 py-[9px] text-ink-300">{c.label}</td>
                                <td className="px-3 py-[9px] text-ink-500">{c.current}</td>
                                <td className="px-3 py-[9px] text-ink-100">{c.proposed}</td>
                                <td className={`px-3 py-[9px] ${c.delta === "—" ? "text-ink-500" : "text-amarelo-fg"}`}>{c.delta}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {a.response ? (
                      <div className="flex flex-col gap-[5px] rounded-lg bg-ink-850 px-3 py-2.5">
                        <span className="flex items-center gap-1.5 text-[12px] text-ink-300">
                          <Icon name="messageReply" size={13} />
                          {a.response_kind === "contraproposta" ? "Contraproposta do cliente" : "Resposta do cliente"}
                        </span>
                        <p className="whitespace-pre-line text-[13px] text-ink-100">{a.response}</p>
                      </div>
                    ) : (
                      waitingA && (
                        <div className="flex flex-col gap-2.5 rounded-lg border border-dashed border-[var(--border-strong)] px-3 py-2.5 sm:flex-row sm:items-center">
                          <Icon name="hourglass" size={15} className="hidden shrink-0 text-ink-400 sm:block" />
                          <p className="flex-1 text-[12px] text-ink-300">
                            Sem resposta do cliente ainda. Registre a resposta ou contraproposta assim que houver retorno.
                          </p>
                          {open && <AnswerAttempt attemptId={a.id} n={a.n} today={at} />}
                        </div>
                      )
                    )}
                  </div>
                  <footer className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-[var(--border-hair)] bg-ink-950/60 px-[18px] py-[11px] text-[12px]">
                    <span className="flex items-center gap-1.5 text-ink-300">
                      <Icon name="user" size={13} className="text-ink-500" />
                      {a.owner_name ?? "—"}
                    </span>
                    <span className={`flex items-center gap-1.5 ${waitingA && a.due_date ? (daysUntil(at, a.due_date) < 0 ? "text-vermelho-fg" : "text-amarelo-fg") : "text-ink-300"}`}>
                      <Icon name="calendarClock" size={13} className="text-ink-500" />
                      {a.responded_at
                        ? `Respondida em ${ddmm(a.responded_at)}`
                        : a.due_date
                          ? `Retorno até ${ddmm(a.due_date)} · ${inDays(at, a.due_date)}`
                          : "Sem prazo de retorno"}
                    </span>
                    <span className="flex-1" />
                    <span className="flex items-center gap-1.5 text-ink-300">
                      <Icon name="squareCheck" size={13} className="text-ink-500" />
                      {linked.length
                        ? `${linked.length} ${linked.length === 1 ? "tarefa" : "tarefas"} · ${doneTasks}/${linked.length} concluída${linked.length === 1 ? "" : "s"}`
                        : "Nenhuma tarefa vinculada"}
                    </span>
                  </footer>
                </Box>
              </div>
            );
          })}
        </div>

        <aside className="flex flex-col gap-4">
          {open ? (
            <NewAttemptForm
              id={id}
              code={req.code}
              n={attempts.length + 1}
              mrr={req.mrr}
              users={users.map((u) => ({ id: u.id, name: u.name }))}
              defaultOwner={req.owner_user_id ?? me.id}
              today={at}
            />
          ) : (
            <Box className="p-5 text-[13px] text-ink-300">Solicitação concluída — não aceita novas tentativas.</Box>
          )}

          <Box>
            <header className="flex items-center justify-between gap-3 px-[18px] py-3.5">
              <div className="space-y-0.5">
                <h2 className="text-[14px] font-semibold text-ink-100">Negociações pendentes</h2>
                <p className="text-[12px] text-ink-500">Aguardando retorno do cliente · todas as contas</p>
              </div>
              <Link href="/churn" className="text-[12px] text-ink-300 hover:text-ink-100">
                Ver todas
              </Link>
            </header>
            {pending.length === 0 && <p className="border-t border-[var(--border-hair)] px-[18px] py-3.5 text-[12px] text-ink-500">Nenhuma negociação pendente.</p>}
            {pending.map((p) => {
              const d = p.due_date ? daysUntil(at, p.due_date) : null;
              const late = d !== null && d <= 1;
              return (
                <Link
                  key={p.id}
                  href={`/churn/${p.request_id}/retencao`}
                  className={`flex items-center gap-2.5 border-t border-[var(--border-hair)] px-[18px] py-[11px] hover:bg-ink-850 ${p.request_id === id ? "bg-ink-850" : ""}`}
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${late ? "bg-vermelho" : "bg-amarelo"}`} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[13px] text-ink-100">{p.client_name}</span>
                    <span className="truncate text-[12px] text-ink-500">
                      Tentativa {p.n} · {strategyLabel(p.strategy)}
                    </span>
                  </span>
                  <span className={`shrink-0 text-[12px] ${late ? "text-vermelho-fg" : "text-amarelo-fg"}`}>{p.due_date ? inDays(at, p.due_date) : "sem prazo"}</span>
                </Link>
              );
            })}
          </Box>
        </aside>
      </div>
    </>
  );
}
