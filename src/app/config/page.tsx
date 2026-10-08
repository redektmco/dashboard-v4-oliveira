import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { configSnapshot, healthItems, verifiedLabel, type Pendencia, type PendenciaId } from "@/lib/config-status";
import { currentVersion } from "@/lib/calibration";
import { listChanges } from "@/lib/audit";
import { portfolio } from "@/lib/repo";
import { targetKeysFor } from "@/lib/model/catalog";
import { ConfigPage } from "@/components/config-shell";
import { Icon, type IconName } from "@/components/icon";
import { Bar, Card, IconBox, PageTitle, type Tone } from "@/components/kit";

export const dynamic = "force-dynamic";

const ICON: Record<PendenciaId, IconName> = {
  sem_meta: "target",
  sem_fonte: "unplug",
  cobranca_sem_canal: "send",
  verba_sem_leads: "megaphone",
  meta_erro: "alert",
};

const ddmm = (ts: string) => {
  const d = new Date(ts.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
};

export default async function PendenciasPage() {
  await requireUser();
  const [snap, rows, version, changes, verified] = await Promise.all([
    configSnapshot(),
    portfolio(),
    currentVersion(),
    listChanges(3),
    verifiedLabel(),
  ]);
  const health = await healthItems(snap, version?.created_at ?? null);

  const total = snap.clients.length;
  // Score confiável: tem meta e ao menos uma fonte de dado em dia.
  const confiaveis = rows.filter(
    (r) => targetKeysFor(r.client.account_type).some((t) => snap.targets.get(r.client.id)?.[t.key] !== undefined) && r.score.confidence !== "baixa",
  ).length;
  const metas = total - snap.semMeta.length;
  const fontes = total - snap.semFonte.length;
  const canais = Number(snap.emailOn) + Number(snap.waOn);
  const reqs: { label: string; num: number; of: number; tone: Tone }[] = [
    { label: "Metas cadastradas", num: metas, of: total, tone: "vermelho" },
    { label: "Fonte de leads (CRM ou Meta)", num: fontes, of: total, tone: "vermelho" },
    { label: "Contato de cobrança", num: snap.comContato.length, of: snap.charges.length, tone: "amarelo" },
    { label: "Canal de envio ativo", num: canais, of: 2, tone: "amarelo" },
  ];
  const okCount = health.filter((h) => h.ok).length;

  return (
    <ConfigPage wide>
      <PageTitle
        title="Pendências"
        description="O que falta para o score refletir a carteira inteira — em ordem de impacto."
        aside={
          <span className="hidden items-center gap-1.5 text-[12px] text-ink-400 lg:flex">
            <Icon name="refresh" size={13} />
            {verified}
          </span>
        }
      />

      {/* Prontidão da carteira */}
      <Card className="hidden overflow-hidden lg:flex">
        <div className="flex w-[300px] shrink-0 flex-col gap-1.5 border-r border-[var(--border-hair)] p-6">
          <span className="text-[13px] text-ink-300">Score confiável</span>
          <span className="flex items-end gap-1.5">
            <span className="tnum font-display text-[34px] font-semibold leading-[34px] tracking-[-1px] text-ink-100">{confiaveis}</span>
            <span className="text-[14px] text-ink-400">de {total} clientes</span>
          </span>
          <span className="text-[12px] leading-[17px] text-ink-400">Clientes com meta e ao menos uma fonte de dados atualizada.</span>
        </div>
        {reqs.map((r) => {
          const done = r.num >= r.of;
          const pct = r.of ? (r.num / r.of) * 100 : 100;
          const tone: Tone = done ? "verde" : r.tone;
          return (
            <div key={r.label} className="flex min-w-0 flex-auto flex-col justify-center gap-2.5 p-6">
              <span className="whitespace-nowrap text-[12px] text-ink-300">{r.label}</span>
              <span className="flex items-end gap-1">
                <span className={`tnum font-display text-[20px] font-semibold ${done ? "text-ink-100" : tone === "vermelho" ? "text-vermelho-fg" : "text-amarelo-fg"}`}>
                  {r.num}
                </span>
                <span className="text-[13px] text-ink-400">/ {r.of}</span>
              </span>
              <Bar value={Math.max(pct, r.num === 0 ? 2 : 0)} tone={tone} />
            </div>
          );
        })}
      </Card>
      <Card className="flex flex-col gap-2.5 p-4 lg:hidden">
        <span className="flex items-end gap-1.5">
          <span className="tnum font-display text-[28px] font-semibold leading-7 text-ink-100">{confiaveis}</span>
          <span className="text-[13px] text-ink-400">de {total} clientes com score confiável</span>
        </span>
        <Bar value={total ? (confiaveis / total) * 100 : 0} />
      </Card>

      <div className="flex flex-col gap-6 xl:flex-row">
        {/* Pendências */}
        <section className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="hidden items-center justify-between lg:flex">
            <h2 className="font-display text-[15px] font-semibold text-ink-100">
              {snap.pendencias.length} {snap.pendencias.length === 1 ? "pendência" : "pendências"}
            </h2>
            <span className="text-[12px] text-ink-400">Ordenado por impacto no score</span>
          </div>
          {snap.pendencias.map((p, i) => (
            <PendenciaCard key={`${p.id}-${i}`} p={p} highlight={i === 0 && p.severity === "bloqueia"} />
          ))}
          {!snap.pendencias.length && (
            <Card className="flex items-center gap-4 p-5">
              <IconBox icon="checkCircle" tone="verde" />
              <div>
                <div className="text-[15px] font-semibold text-ink-100">Nada pendente</div>
                <p className="mt-1 text-[13px] text-ink-300">Todos os clientes têm meta e fonte de dados, e as cobranças vão sair pelo canal configurado.</p>
              </div>
            </Card>
          )}
        </section>

        {/* Funcionando */}
        <aside className="hidden w-full shrink-0 flex-col gap-3 lg:flex xl:w-[320px]">
          <h2 className="font-display text-[15px] font-semibold text-ink-100">Funcionando</h2>
          <Card className="px-[18px] py-1">
            {health.map((h, i) => (
              <HealthRow key={h.label} h={h} last={i === health.length - 1} />
            ))}
          </Card>
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-hair)] p-[18px]">
            <span className="text-[12px] font-semibold text-ink-300">Últimas alterações</span>
            {changes.map((c) => (
              <div key={c.id} className="flex flex-col gap-0.5">
                <span className="text-[12px] text-ink-100">{c.text}</span>
                <span className="text-[11px] text-ink-400">
                  {c.user_name ? `${c.user_name.split(" ")[0]} · ` : ""}
                  {ddmm(c.at)}
                </span>
              </div>
            ))}
            {!changes.length && <span className="text-[12px] text-ink-400">Nenhuma alteração registrada ainda.</span>}
          </div>
        </aside>

        {/* Funcionando, no celular: uma linha que abre a lista. */}
        <details className="group rounded-xl border border-[var(--border-hair)] lg:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2.5 px-4 py-3">
            <Icon name="checkCircle" size={16} className="shrink-0 text-verde-fg" />
            <span className="min-w-0 flex-1 text-[12px] text-ink-300">
              {okCount} {okCount === 1 ? "item funcionando" : "itens funcionando"} ·{" "}
              {health
                .filter((h) => h.ok)
                .map((h) => h.label.replace(/^Webhook .*/, "webhooks").replace("Recompute do score", "recompute").toLowerCase().replace(/^meta ads$/, "Meta Ads"))
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(", ")}
            </span>
            <Icon name="chevronRight" size={14} className="shrink-0 text-ink-500 transition-transform group-open:rotate-90" />
          </summary>
          <div className="border-t border-[var(--border-hair)] px-4">
            {health.map((h, i) => (
              <HealthRow key={h.label} h={h} last={i === health.length - 1} />
            ))}
          </div>
        </details>
      </div>
    </ConfigPage>
  );
}

function PendenciaCard({ p, highlight }: { p: Pendencia; highlight: boolean }) {
  const tone: Tone = p.severity === "bloqueia" ? "vermelho" : "amarelo";
  const shown = p.clients.slice(0, 3);
  const more = p.clients.length - shown.length;
  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border bg-ink-900 p-4 lg:flex-row lg:gap-4 lg:p-5 ${
        highlight ? "border-vermelho/35" : "border-[var(--border-hair)]"
      }`}
    >
      <div className="flex min-w-0 flex-1 gap-3 lg:gap-4">
        <span className="lg:hidden">
          <IconBox icon={ICON[p.id]} tone={tone} size={32} />
        </span>
        <span className="hidden lg:block">
          <IconBox icon={ICON[p.id]} tone={tone} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px] lg:gap-1.5">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="text-[14px] font-semibold text-ink-100 lg:hidden">{p.shortTitle}</span>
            <span className="hidden text-[15px] font-semibold text-ink-100 lg:inline">{p.title}</span>
            <span className={`hidden text-[11px] font-semibold lg:inline ${tone === "vermelho" ? "text-vermelho-fg" : "text-amarelo-fg"}`}>
              {p.severity === "bloqueia" ? "Bloqueia o score" : "Atenção"}
            </span>
          </div>
          <p className="text-[12px] text-ink-300 lg:hidden">{p.shortConsequence}</p>
          <p className="hidden text-[13px] leading-5 text-ink-300 lg:block">{p.consequence}</p>
          {shown.length > 0 && (
            <div className="hidden flex-wrap items-center gap-1.5 pt-1 lg:flex">
              {shown.map((c) => (
                <Link key={c.id} href={`/clientes/${c.id}`} className="rounded-[5px] bg-ink-850 px-2 py-[3px] text-[12px] text-ink-300 hover:text-ink-100">
                  {c.name}
                </Link>
              ))}
              {more > 0 && <span className="text-[12px] text-ink-400">+{more} {more === 1 ? "cliente" : "clientes"}</span>}
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5 lg:w-[200px] lg:items-end">
        <Link href={p.action.href} className={`btn h-10 w-full lg:h-9 lg:w-auto ${p.action.primary ? "btn-primary" : ""}`}>
          {p.action.primary && <Icon name="arrowRight" size={16} />}
          {p.action.label}
        </Link>
        {p.action.hint && <span className="hidden text-right text-[11px] text-ink-400 lg:block">{p.action.hint}</span>}
      </div>
    </div>
  );
}

function HealthRow({ h, last }: { h: { label: string; detail: string; ok: boolean; href: string }; last: boolean }) {
  return (
    <Link href={h.href} className={`group flex items-center gap-3 py-3.5 ${last ? "" : "border-b border-[var(--border-hair)]"}`}>
      <Icon name={h.ok ? "checkCircle" : "alertCircle"} size={16} className={`shrink-0 ${h.ok ? "text-verde-fg" : "text-amarelo-fg"}`} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium text-ink-100">{h.label}</span>
        <span className="truncate text-[12px] text-ink-400">{h.detail}</span>
      </span>
      <Icon name="chevronRight" size={14} className="shrink-0 text-ink-500 group-hover:text-ink-100" />
    </Link>
  );
}
