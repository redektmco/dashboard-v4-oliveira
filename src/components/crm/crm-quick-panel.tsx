"use client";

import Link from "next/link";
import { useState } from "react";
import { registerInteraction } from "@/actions/crm";
import { agoLabel, type CrmRow } from "@/lib/crm/board";
import { INTERACTION_LABEL, type InteractionKind } from "@/lib/crm/interactions";
import { STAGE_LABEL } from "@/lib/model/types";
import { hasMediaService } from "@/lib/model/services";
import { ActionForm, SubmitButton } from "../form-controls";
import { Modal } from "../modal";
import { Icon, type IconName } from "../icon";
import { GoogleLinkRow, MetaConnectDialog, MetaLinkRow, WebhookBox } from "../config/connections";
import { BAND_STYLE, brl, Sparkline } from "../ui";

/**
 * Visualização rápida: resolve "o que está acontecendo nesta conta?" sem
 * sair da listagem. O que exige edição de verdade (metas, integrações,
 * plano de ação) continua na ficha — aqui só o atalho.
 */

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function CrmQuickPanel({
  row,
  position,
  onPrev,
  onNext,
  onClose,
  isAdmin,
  metaReady,
  linkedAccounts,
}: {
  row: CrmRow;
  /** "3 de 12" da fila atual. */
  position: { i: number; n: number } | null;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  isAdmin: boolean;
  metaReady: boolean;
  linkedAccounts: string[];
}) {
  const [logging, setLogging] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const band = row.band ? BAND_STYLE[row.band] : null;

  return (
    <>
      <header className="flex items-center gap-2 border-b border-[var(--border-hair)] px-4 py-3">
        <span className="eyebrow flex-1">
          Visualização rápida
          {position && <span className="ml-2 text-ink-500">{position.i} de {position.n}</span>}
        </span>
        <IconBtn icon="chevronUp" label="Anterior" onClick={onPrev} />
        <IconBtn icon="chevronDown" label="Próximo" onClick={onNext} />
        <IconBtn icon="x" label="Fechar" onClick={onClose} />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
        {/* identificação */}
        <section className="flex flex-col gap-1.5">
          <div className="flex items-start gap-2">
            <h2 className="font-display text-[20px] font-semibold tracking-[-0.3px] text-ink-100">{row.name}</h2>
            {row.churn && (
              <span className="mt-1 shrink-0 rounded-full bg-vermelho-dim px-2 py-0.5 text-[10px] font-semibold text-vermelho-fg">
                Churn solicitado
              </span>
            )}
          </div>
          <p className="text-[12px] text-ink-400">
            {[
              row.segment,
              row.since && `cliente desde ${ddmmyyyy(row.since)}`,
              STAGE_LABEL[row.stage],
              `${brl(row.mrr)}/mês`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="text-[12px] text-ink-500">
            Account {row.accountName ?? "—"} · GT {row.gtName ?? "—"}
          </p>
        </section>

        {/* saúde */}
        <section className="flex items-center justify-between gap-4 rounded-lg border border-[var(--border-hair)] bg-ink-950 px-3.5 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="eyebrow">Health Score</span>
            <span className="flex items-baseline gap-2">
              <span className="tnum font-display text-[26px] font-semibold text-ink-100">
                {row.score === null ? "—" : Math.round(row.score)}
              </span>
              {band && <span className={`text-[12px] font-medium ${band.fg}`}>{band.label}</span>}
            </span>
            {row.delta7 !== null && Math.abs(row.delta7) >= 0.5 && (
              <span className={`text-[12px] ${row.delta7 < 0 ? "text-vermelho-fg" : "text-verde-fg"}`}>
                {row.delta7 < 0 ? "▼" : "▲"} {Math.abs(Math.round(row.delta7))} pts em 7 dias
              </span>
            )}
          </div>
          <Sparkline points={row.history} />
        </section>

        {/* contato */}
        <Block title="Contato">
          <Line
            icon="messageCircle"
            text={
              row.lastInteraction
                ? `Última: ${INTERACTION_LABEL[row.lastInteraction.kind].toLowerCase()} ${agoLabel(row.lastInteraction.days)} — ${row.lastInteraction.title}`
                : "Nenhuma interação registrada"
            }
            tone={row.lastInteraction && row.lastInteraction.days > 21 ? "atencao" : undefined}
          />
          <Line
            icon="calendarClock"
            text={row.nextAction ? `Próxima: ${row.nextAction.title} · ${row.nextAction.due}` : "Sem próxima ação definida"}
            tone={row.nextAction?.status === "Atrasada" ? "critico" : undefined}
          />
        </Block>

        {/* alertas */}
        <Block title={`Alertas e pendências · ${row.pendencias.length}`}>
          {row.pendencias.length === 0 ? (
            <p className="text-[13px] text-ink-500">Nada pendente nesta conta.</p>
          ) : (
            row.pendencias.map((p) => (
              <Line key={p.id + p.label} icon="alertCircle" text={p.label} tone={p.severity === "bloqueia" ? "critico" : "atencao"} />
            ))
          )}
        </Block>

        {/* metas e fontes */}
        <Block title="Forecast e fontes">
          <Line
            icon="target"
            text={`${row.targets.set} de ${row.targets.total} valores do forecast definidos`}
            tone={row.targets.set === 0 ? "critico" : row.targets.set < row.targets.total ? "atencao" : undefined}
          />
          <Line
            icon="webhook"
            text={row.leadSources.length ? row.leadSources.join(" · ") : "Nenhuma fonte de leads conectada"}
            tone={row.leadSources.length ? undefined : "critico"}
          />
          {/* Canal no contrato mas sem conta vinculada: o número não chega. */}
          {hasMediaService(row.services, "meta") && !row.meta.length && (
            <Line icon="megaphone" text="Meta Ads está no contrato, mas nenhuma conta de anúncio foi vinculada" tone="atencao" />
          )}
          {hasMediaService(row.services, "google") && !row.google.length && (
            <Line icon="search" text="Google Ads está no contrato, mas nenhuma conta foi vinculada" tone="atencao" />
          )}
          {row.charge && (
            <Line
              icon="receipt"
              text={`${brl(row.charge.amount)} · vence ${ddmmyyyy(row.charge.dueDate)}${row.charge.willSend ? "" : " · não sai por nenhum canal"}`}
              tone={row.charge.willSend ? undefined : "atencao"}
            />
          )}
        </Block>

        {/* conexões — gerar e girar o webhook do cliente só existe aqui */}
        {isAdmin && (
          <Block title="Fonte de leads">
            <WebhookBox clientId={row.id} hook={row.hook} />
            {row.meta.map((m) => (
              <MetaLinkRow key={m.adAccountId} link={m} />
            ))}
            {row.google.map((g) => (
              <GoogleLinkRow key={g.customerId} link={g} />
            ))}
            {metaReady ? (
              <button type="button" className="btn btn-sm w-fit" onClick={() => setConnecting(true)}>
                <Icon name="plus" size={14} />
                Vincular conta de anúncio
              </button>
            ) : (
              <p className="text-[12px] text-ink-400">
                Token do usuário do sistema da Meta não configurado — veja Performance › Integrações.
              </p>
            )}
            <MetaConnectDialog open={connecting} onClose={() => setConnecting(false)} clientId={row.id} linked={linkedAccounts} />
            <p className="text-[12px] text-ink-500">
              Contas do Google Ads são vinculadas em{" "}
              <Link href="/gt/integracoes" className="text-ink-300 underline hover:text-ink-100">
                Performance › Integrações
              </Link>
              , que lista a MCC inteira.
            </p>
          </Block>
        )}

        {/* módulos */}
        <Block title="Nos outros módulos">
          <ModuleLink icon="chart" label="Performance e forecast" href={`/gt?c=${row.id}`} />
          <ModuleLink icon="users" label="Check-in" href={`/account/${row.id}`} />
          <ModuleLink
            icon="userMinus"
            label={row.churn ? "Acompanhar churn" : "Abrir solicitação de churn"}
            href={row.churn ? `/churn/${row.churn.id}` : `/churn/nova?cliente=${row.id}`}
            tone={row.churn ? "critico" : undefined}
          />
          <ModuleLink icon="image" label="Social media" href="/social" />
        </Block>
      </div>

      <footer className="flex flex-col gap-2 border-t border-[var(--border-hair)] px-4 py-3">
        <div className="flex gap-2">
          <button type="button" className="btn btn-sm flex-1" onClick={() => setLogging(true)}>
            <Icon name="messageCircle" size={14} />
            Registrar interação
          </button>
          <Link href={`/clientes/${row.id}?plano=novo`} className="btn btn-sm flex-1 justify-center">
            <Icon name="listTodo" size={14} />
            Criar tarefa
          </Link>
        </div>
        <Link href={`/clientes/${row.id}`} className="btn btn-light w-full justify-center">
          Abrir ficha completa
          <Icon name="arrowRight" size={15} />
        </Link>
      </footer>

      <LogInteraction open={logging} onClose={() => setLogging(false)} row={row} />
    </>
  );
}

/* ---------------------------- pedaços ------------------------------ */

function IconBtn({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-7 w-7 place-items-center rounded-md text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-100"
    >
      <Icon name={icon} size={15} />
    </button>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="eyebrow">{title}</h3>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

const TONE: Record<string, string> = { critico: "text-vermelho-fg", atencao: "text-amarelo-fg" };

function Line({ icon, text, tone }: { icon: IconName; text: string; tone?: "critico" | "atencao" }) {
  return (
    <p className={`flex items-start gap-2 text-[13px] ${tone ? TONE[tone] : "text-ink-300"}`}>
      <Icon name={icon} size={14} className="mt-0.5 shrink-0" />
      <span className="min-w-0">{text}</span>
    </p>
  );
}

function ModuleLink({ icon, label, href, tone }: { icon: IconName; label: string; href: string; tone?: "critico" }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors hover:bg-ink-850 ${
        tone ? TONE[tone] : "text-ink-300 hover:text-ink-100"
      }`}
    >
      <Icon name={icon} size={14} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <Icon name="arrowUpRight" size={13} className="shrink-0 text-ink-600" />
    </Link>
  );
}

/* ------------------------ registrar interação ---------------------- */

function LogInteraction({ open, onClose, row }: { open: boolean; onClose: () => void; row: CrmRow }) {
  const kinds = Object.keys(INTERACTION_LABEL) as InteractionKind[];
  return (
    <Modal open={open} onClose={onClose} title="Registrar interação" description={row.name} size="sm">
      <ActionForm action={registerInteraction} onSuccess={onClose}>
        <input type="hidden" name="client_id" value={row.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="label">Tipo</span>
            <select name="kind" defaultValue="reuniao" className="field" required>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {INTERACTION_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label">Quando</span>
            <input type="date" name="at" defaultValue={new Date().toISOString().slice(0, 10)} className="field" />
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="label">Resumo</span>
          <input name="title" className="field" placeholder="Ex.: Reunião de alinhamento do mês" required autoFocus maxLength={160} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label">Observações</span>
          <textarea name="note" rows={3} className="field" placeholder="O que ficou combinado (opcional)" />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <SubmitButton pendingLabel="Registrando…">Registrar</SubmitButton>
        </div>
      </ActionForm>
    </Modal>
  );
}
