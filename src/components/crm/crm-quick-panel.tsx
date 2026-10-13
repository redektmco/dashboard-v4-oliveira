"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { lineTone } from "@/lib/crm/forecast-view";
import { agoLabel, type CrmRow } from "@/lib/crm/board";
import { INTERACTION_LABEL } from "@/lib/crm/interactions";
import { STAGE_LABEL } from "@/lib/model/types";
import { hasMediaService } from "@/lib/model/services";
import { Icon, type IconName } from "../icon";
import { GoogleLinkRow, LeadSourcePicker, MetaConnectDialog, MetaLinkRow, WebhookBox } from "../config/connections";
import { BAND_STYLE, brl, Sparkline } from "../ui";

/**
 * Painel da conta: resolve "o que está acontecendo nesta conta?" sem sair da
 * listagem. Mora em Performance › Metas: lá ganha o forecast editável
 * (`forecast`) e o rodapé de salvar (`footer`). Fontes de dados, webhook do
 * CRM (leads e vendas) e contas de anúncio se configuram aqui mesmo.
 */

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function CrmQuickPanel({
  row,
  eyebrow = "Visualização rápida",
  forecast,
  footer,
  position,
  onPrev,
  onNext,
  onClose,
  isAdmin,
  metaReady,
  linkedAccounts,
  googleReady,
  linkedGoogle,
}: {
  row: CrmRow;
  eyebrow?: string;
  /** Editor do forecast (Performance). Sem ele, o painel mostra forecast × realizado só para leitura. */
  forecast?: ReactNode;
  /** Rodapé próprio (salvar metas). Sem ele, "Abrir ficha completa". */
  footer?: ReactNode;
  /** "3 de 12" da fila atual. */
  position: { i: number; n: number } | null;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  isAdmin: boolean;
  metaReady: boolean;
  linkedAccounts: string[];
  googleReady: boolean;
  linkedGoogle: string[];
}) {
  const [connecting, setConnecting] = useState(false);
  const band = row.band ? BAND_STYLE[row.band] : null;

  return (
    <>
      <header className="flex items-center gap-2 border-b border-[var(--border-hair)] px-4 py-3">
        <span className="eyebrow flex-1">
          {eyebrow}
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
            <Link href={`/clientes/${row.id}`} className="font-display text-[20px] font-semibold tracking-[-0.3px] text-ink-100 hover:underline">
              {row.name}
            </Link>
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

        {/* forecast: editor em Performance, leitura nos demais lugares */}
        {forecast ?? (
          <Block title="Forecast × realizado">
            {row.forecast.every((f) => f.target === null) ? (
              <Line icon="target" text="Sem forecast — o score não é calculado" tone="critico" />
            ) : (
              row.forecast.map((f) => (
                <p key={f.key} className="flex items-baseline gap-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate text-ink-300">{f.label}</span>
                  <span className={`tnum ${FORECAST_TONE[lineTone(f.score)]}`}>{f.actual ?? "—"}</span>
                  <span className="tnum text-ink-500">/ {f.target ?? "—"}</span>
                </p>
              ))
            )}
          </Block>
        )}

        {/* fontes de dados — a mesma lista da ficha e das pílulas de Performance */}
        <Block title="Fontes de dados">
          {row.sources.map((src) => (
            <Line
              key={src.id}
              icon={src.icon}
              text={`${src.name} — ${src.detail}`}
              tone={src.state === "erro" ? "critico" : src.state === "pendente" ? "atencao" : undefined}
            />
          ))}
          {/* Canal no contrato mas sem conta vinculada: o número não chega. */}
          {hasMediaService(row.services, "meta") && !row.meta.length && (
            <Line icon="megaphone" text="Meta Ads está no contrato, mas nenhuma conta de anúncio foi vinculada" tone="atencao" />
          )}
          {hasMediaService(row.services, "google") && !row.google.length && (
            <Line icon="search" text="Google Ads está no contrato, mas nenhuma conta foi vinculada" tone="atencao" />
          )}
        </Block>

        {/* conexões — webhook do CRM (leads e vendas), contas de anúncio e fonte dos leads */}
        {isAdmin && (
          <Block title="Configurar fontes e CRM">
            <LeadSourcePicker key={row.leadSource} clientId={row.id} value={row.leadSource} />
            <WebhookBox clientId={row.id} hook={row.hook} />
            {row.meta.map((m) => (
              <MetaLinkRow key={m.adAccountId} link={m} />
            ))}
            {row.google.map((g) => (
              <GoogleLinkRow key={g.customerId} link={g} />
            ))}
            {metaReady || googleReady ? (
              <button type="button" className="btn btn-sm w-fit" onClick={() => setConnecting(true)}>
                <Icon name="plus" size={14} />
                Vincular conta de anúncio
              </button>
            ) : (
              <p className="text-[12px] text-ink-400">
                Credenciais da Meta e do Google Ads não configuradas — veja Performance › Integrações.
              </p>
            )}
            <MetaConnectDialog
              open={connecting}
              onClose={() => setConnecting(false)}
              clientId={row.id}
              linked={linkedAccounts}
              metaReady={metaReady}
              google={{ ready: googleReady, linked: linkedGoogle }}
              leadSource={row.leadSource}
            />
          </Block>
        )}

        {row.charge && (
          <Block title="Cobrança">
            <Line
              icon="receipt"
              text={`${brl(row.charge.amount)} · vence ${ddmmyyyy(row.charge.dueDate)}${row.charge.willSend ? "" : " · não sai por nenhum canal"}`}
              tone={row.charge.willSend ? undefined : "atencao"}
            />
          </Block>
        )}

        {/* módulos */}
        <Block title="Nos outros módulos">
          {!forecast && <ModuleLink icon="chart" label="Performance e forecast" href={`/gt?c=${row.id}`} />}
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

      {footer ?? (
        <footer className="flex flex-col gap-2 border-t border-[var(--border-hair)] px-4 py-3">
          <Link href={`/clientes/${row.id}`} className="btn btn-light w-full justify-center">
            Abrir ficha completa
            <Icon name="arrowRight" size={15} />
          </Link>
        </footer>
      )}
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

export function Block({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="eyebrow">{title}</h3>
        {action}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

const TONE: Record<string, string> = { critico: "text-vermelho-fg", atencao: "text-amarelo-fg" };
const FORECAST_TONE: Record<string, string> = {
  verde: "text-verde-fg",
  amarelo: "text-amarelo-fg",
  vermelho: "text-vermelho-fg",
  neutro: "text-ink-100",
};

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
