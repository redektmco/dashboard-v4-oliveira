import Link from "next/link";
import { CHANNEL_LABEL, weekOverWeek, type Channel, type MediaSplit } from "@/lib/crm/media-split";
import { weekLabel } from "@/lib/week";
import { Icon, type IconName } from "../icon";
import { Card, ColLabel, SectionHead } from "../kit";
import { brl } from "../ui";

/**
 * Mídia por canal, separada.
 *
 * O score soma Meta e Google de propósito — a régua é do resultado da conta.
 * Esta seção existe para a pergunta seguinte: *de onde* veio o movimento.
 * Por isso nada aqui alimenta o score; é leitura.
 */

const ICON: Record<Channel, IconName> = { meta: "megaphone", google: "search" };
const int = (n: number) => Math.round(n).toLocaleString("pt-BR");
const pct1 = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(n >= 10 || n <= -10 ? 0 : 1)}%`;

export function MediaChannels({ split, clientId }: { split: MediaSplit; clientId: number }) {
  const channels: Channel[] = ["meta", "google"];
  const anyLinked = channels.some((c) => split.byChannel[c].totals.linked);

  return (
    <section className="flex flex-col gap-4">
      <SectionHead
        title="Mídia por canal"
        subtitle={`Meta e Google separados nas últimas ${split.weeks.length} semanas. O score usa os dois somados — aqui é para enxergar de onde veio o movimento.`}
        action={
          <Link href="/gt/integracoes" className="flex items-center gap-1.5 text-[13px] text-ink-300 hover:text-ink-100">
            <Icon name="plug" size={14} />
            Integrações
          </Link>
        }
      />

      {!anyLinked ? (
        <Card className="px-5 py-8 text-center">
          <p className="text-[13px] text-ink-400">
            Nenhuma conta de mídia vinculada a este cliente. Vincule em{" "}
            <Link href={`/clientes?c=${clientId}`} className="text-ink-200 underline hover:text-ink-100">
              Clientes
            </Link>{" "}
            para ver Meta e Google separados.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            {channels.map((c) => (
              <ChannelCard key={c} channel={c} split={split} />
            ))}
          </div>

          {split.hasData && (
            <Card className="flex flex-col gap-2.5 px-5 py-4">
              <ColLabel>Verba por semana</ColLabel>
              <WeeklyBars split={split} />
            </Card>
          )}
        </>
      )}
    </section>
  );
}

function ChannelCard({ channel, split }: { channel: Channel; split: MediaSplit }) {
  const { weeks, totals } = split.byChannel[channel];
  const wow = weekOverWeek(weeks);

  if (!totals.linked)
    return (
      <Card className="flex flex-col gap-1.5 px-5 py-4">
        <span className="flex items-center gap-2">
          <Icon name={ICON[channel]} size={15} className="text-ink-600" />
          <span className="text-[14px] font-medium text-ink-400">{CHANNEL_LABEL[channel]}</span>
        </span>
        <p className="text-[12px] text-ink-500">Sem conta vinculada neste canal.</p>
      </Card>
    );

  return (
    <Card className="flex flex-col gap-3 px-5 py-4">
      <header className="flex items-center gap-2">
        <Icon name={ICON[channel]} size={15} className="text-ink-300" />
        <span className="flex-1 text-[14px] font-medium text-ink-100">{CHANNEL_LABEL[channel]}</span>
        <span className="tnum text-[12px] text-ink-500">{Math.round(totals.share * 100)}% da verba</span>
      </header>

      {totals.spend === 0 ? (
        <p className="text-[13px] text-amarelo-fg">Conta vinculada, mas sem verba no período.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Metric label="Verba" value={brl(totals.spend)} delta={wow.spend} />
            <Metric label={channel === "meta" ? "Leads" : "Conversões"} value={int(totals.results)} delta={wow.results} />
            <Metric label="Custo por resultado" value={totals.cpr === null ? "—" : brl(totals.cpr)} invert />
            <Metric label="ROAS" value={totals.roas === null ? "—" : `${totals.roas.toFixed(2)}x`} />
          </dl>
          <p className="tnum text-[11px] text-ink-500">
            {int(totals.impressions)} impressões · {int(totals.clicks)} cliques
            {totals.revenue > 0 && ` · ${brl(totals.revenue)} de receita`}
          </p>
        </>
      )}
    </Card>
  );
}

function Metric({
  label,
  value,
  delta,
  invert,
}: {
  label: string;
  value: string;
  /** Variação da última semana fechada vs a anterior, em %. */
  delta?: number | null;
  /** Métrica em que subir é ruim (custo). */
  invert?: boolean;
}) {
  const good = delta === null || delta === undefined ? null : invert ? delta < 0 : delta > 0;
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <ColLabel>{label}</ColLabel>
      <span className="tnum truncate text-[15px] font-semibold text-ink-100">{value}</span>
      {delta !== null && delta !== undefined && Math.abs(delta) >= 1 && (
        <span className={`tnum text-[11px] ${good ? "text-verde-fg" : "text-vermelho-fg"}`}>{pct1(delta)} vs. semana anterior</span>
      )}
    </div>
  );
}

/**
 * Verba semanal empilhada por canal. Barras em layout puro — a altura sai da
 * proporção com a semana de maior verba, sem posicionamento absoluto.
 */
function WeeklyBars({ split }: { split: MediaSplit }) {
  const totals = split.weeks.map((ref) => {
    const m = split.byChannel.meta.weeks.find((w) => w.ref === ref)?.spend ?? 0;
    const g = split.byChannel.google.weeks.find((w) => w.ref === ref)?.spend ?? 0;
    return { ref, meta: m, google: g, total: m + g };
  });
  const max = Math.max(...totals.map((t) => t.total), 1);

  return (
    <>
      <div className="flex items-end gap-1.5" style={{ height: 96 }}>
        {totals.map((t) => (
          <div key={t.ref} className="flex min-w-0 flex-1 flex-col justify-end gap-px" title={`${weekLabel(t.ref)} · ${brl(t.total)}`}>
            <span className="rounded-t-sm bg-azul" style={{ height: `${(t.google / max) * 88}px` }} />
            <span className="bg-v4-red" style={{ height: `${(t.meta / max) * 88}px` }} />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 text-[11px] text-ink-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-v4-red" />
          Meta Ads
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-azul" />
          Google Ads
        </span>
        <span className="flex-1" />
        <span className="tnum">
          {weekLabel(split.weeks[0])} → {weekLabel(split.weeks[split.weeks.length - 1])}
        </span>
      </div>
    </>
  );
}
