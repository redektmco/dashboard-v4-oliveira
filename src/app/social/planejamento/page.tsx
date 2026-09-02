import Link from "next/link";
import { requireSocial } from "@/lib/auth";
import { listPlanned } from "@/lib/social/db";
import { Panel } from "@/components/ui";
import { Icon } from "@/components/icon";
import type { PublishStatus } from "@/lib/social/types";

export const dynamic = "force-dynamic";

const PUB: Record<PublishStatus, { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-ink-800 text-ink-300" },
  scheduled: { label: "Agendado", cls: "bg-amarelo-dim text-amarelo-fg" },
  publishing: { label: "Publicando", cls: "bg-amarelo-dim text-amarelo-fg" },
  published: { label: "Publicado", cls: "bg-verde-dim text-verde-fg" },
  failed: { label: "Falhou", cls: "bg-vermelho-dim text-vermelho-fg" },
};

const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
const timeBR = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export default async function PlanejamentoPage() {
  await requireSocial();
  const planned = await listPlanned();

  const groups = new Map<string, typeof planned>();
  for (const p of planned) {
    if (!p.scheduledAt) continue;
    const k = dayKey(p.scheduledAt);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(p);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">
            Planejamento
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-400">
            Criativos aprovados com horário marcado. No horário, o worker publica sozinho no
            Instagram da conta configurada no projeto.
          </p>
        </div>
        <Link href="/social" className="btn btn-sm">
          <Icon name="arrowLeft" size={14} />
          Social media
        </Link>
      </div>

      {planned.length === 0 ? (
        <Panel title="Nada agendado">
          <p className="px-5 py-8 text-center text-sm text-ink-400">
            Aprove criativos e defina o horário de publicação na página do projeto para eles
            aparecerem aqui.
          </p>
        </Panel>
      ) : (
        <div className="space-y-5">
          {[...groups.entries()].map(([day, items]) => (
            <Panel key={day} title={day[0].toUpperCase() + day.slice(1)} subtitle={`${items.length} publicação(ões)`}>
              <div className="divide-y divide-[var(--border-hair)]">
                {items.map((p) => (
                  <Link
                    key={p.id}
                    href={`/social/projetos/${p.projectId}`}
                    className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-ink-850"
                  >
                    <div className="tnum w-14 shrink-0 font-mono text-sm text-ink-200">
                      {timeBR(p.scheduledAt!)}
                    </div>
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-ink-900">
                      {p.assets[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.assets[0].url} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] text-ink-200">
                        {p.caption ? p.caption.replace(/\n/g, " ") : "— sem legenda —"}
                      </div>
                      <div className="truncate text-[12px] text-ink-500">
                        {p.clientName} · @{p.igHandle} · {p.projectTitle}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${PUB[p.publishStatus].cls}`}
                    >
                      {PUB[p.publishStatus].label}
                    </span>
                  </Link>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
