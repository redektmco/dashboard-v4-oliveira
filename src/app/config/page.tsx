import Link from "next/link";
import { DIMENSIONS } from "@/lib/model/catalog";
import { getAllTargets, getConfig, getWeights, listClients, listUsers } from "@/lib/repo";
import { ACCOUNT_TYPE_LABEL } from "@/lib/model/types";
import { resetWeights, runRecompute, saveWeights, toggleClientActive } from "@/actions";
import { ClientForm } from "@/components/client-form";
import { NumberField } from "@/components/number-field";
import {
  CardList,
  CardMeta,
  CardRow,
  PageHeader,
  Panel,
  TableScroll,
  brl,
  dateBR,
} from "@/components/ui";
import { Icon } from "@/components/icon";
import { RITUAL_LABEL } from "@/lib/week";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ editar?: string; salvo?: string }>;
}) {
  const me = await requireUser();
  const isAdmin = Boolean(me.is_admin);
  const { editar, salvo } = await searchParams;
  const [clients, users, weights, cfg, targetsBy] = await Promise.all([
    listClients(false),
    listUsers(),
    getWeights(),
    getConfig(),
    getAllTargets(),
  ]);
  const editing = editar ? clients.find((c) => c.id === Number(editar)) : undefined;
  const editingTargets = editing ? (targetsBy.get(editing.id) ?? {}) : {};
  const total = DIMENSIONS.reduce((a, d) => a + (weights[d.key] ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuração"
        description="Clientes, metas e calibração. Sem meta cadastrada não há régua A nem B — é o ponto que trava o modelo, então é o primeiro a resolver."
      />

      {salvo && (
        <div className="flex items-center gap-2 rounded-lg bg-verde-dim px-4 py-2.5 text-sm font-semibold text-verde-fg">
          <Icon name="check" size={15} />
          Cliente salvo e score recalculado.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Panel
          title="Carteira cadastrada"
          subtitle={`${clients.filter((c) => c.active).length} ativos de ${clients.length}`}
        >
          {/* Oito colunas não cabem em 375px nem rolando: no celular
              cada cliente vira um cartão com as duas ações no pé. */}
          <CardList>
            {clients.map((c) => {
              const t = targetsBy.get(c.id) ?? {};
              const semMeta = Object.keys(t).length === 0;
              return (
                <CardRow key={c.id} critical={semMeta && Boolean(c.active)}>
                  <div className={c.active ? "" : "opacity-50"}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/clientes/${c.id}`} className="font-semibold text-ink-100">
                          {c.name}
                        </Link>
                        <div className="mt-0.5 text-[11px] text-ink-500">
                          {ACCOUNT_TYPE_LABEL[c.account_type]}
                          {!c.active && " · inativo"}
                        </div>
                      </div>
                      {semMeta ? (
                        <span className="shrink-0 text-[11px] font-semibold text-vermelho-fg">
                          sem meta
                        </span>
                      ) : (
                        <span className="tnum shrink-0 text-[11px] text-verde-fg">
                          {Object.keys(t).length} metas
                        </span>
                      )}
                    </div>

                    <CardMeta
                      items={[
                        { label: "GT", value: c.gt_name ?? "—" },
                        { label: "Account", value: c.account_name ?? "—" },
                        { label: "MRR", value: <span className="tnum">{brl(c.mrr)}</span> },
                        { label: "Renovação", value: dateBR(c.renewal_date) },
                      ]}
                    />

                    <div className="mt-3 flex gap-2">
                      <Link href={`/config?editar=${c.id}`} className="btn flex-1 justify-center">
                        Editar
                      </Link>
                      <form action={toggleClientActive} className="flex-1">
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="active" value={c.active} />
                        <button className="btn w-full justify-center">
                          {c.active ? "Desativar" : "Ativar"}
                        </button>
                      </form>
                    </div>
                  </div>
                </CardRow>
              );
            })}
          </CardList>

          <div className="hidden lg:block">
          <TableScroll>
<table className="data-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>GT</th>
                <th>Account</th>
                <th className="text-right">MRR</th>
                <th>Renovação</th>
                <th>Metas</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const t = targetsBy.get(c.id) ?? {};
                return (
                  <tr key={c.id} className={c.active ? "" : "opacity-50"}>
                    <td>
                      <Link href={`/clientes/${c.id}`} className="font-medium hover:text-v4-red">
                        {c.name}
                      </Link>
                      {!c.active && <span className="ml-2 text-[11px] text-ink-500">inativo</span>}
                    </td>
                    <td className="text-ink-400">{ACCOUNT_TYPE_LABEL[c.account_type]}</td>
                    <td className="text-ink-300">{c.gt_name ?? "—"}</td>
                    <td className="text-ink-300">{c.account_name ?? "—"}</td>
                    <td className="tnum text-right text-ink-300">{brl(c.mrr)}</td>
                    <td className="text-ink-300">{dateBR(c.renewal_date)}</td>
                    <td>
                      {Object.keys(t).length ? (
                        <span className="tnum text-xs text-verde-fg">{Object.keys(t).length} metas</span>
                      ) : (
                        <span className="text-xs font-semibold text-vermelho-fg">sem meta</span>
                      )}
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link href={`/config?editar=${c.id}`} className="btn py-1 text-xs">
                          Editar
                        </Link>
                        <form action={toggleClientActive}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="active" value={c.active} />
                          <button className="btn py-1 text-xs">
                            {c.active ? "Desativar" : "Ativar"}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
</TableScroll>
          </div>
        </Panel>

        <ClientForm
          users={users}
          client={editing ?? null}
          targets={editingTargets}
          key={editing?.id ?? "novo"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Calibração dos pesos"
          subtitle={`Somam ${total}%. Salvar reescreve os últimos 90 dias da série.`}
        >
          <form action={saveWeights} className="space-y-4 px-4 py-4">
            <div className="space-y-3">
              {DIMENSIONS.map((d) => (
                <div key={d.key} className="grid grid-cols-[1fr_90px] items-center gap-3">
                  <div>
                    <div className="text-sm text-ink-100">{d.label}</div>
                    <div className="text-[11px] text-ink-500">
                      {d.source} · padrão {d.defaultWeight}%
                    </div>
                  </div>
                  <NumberField
                    name={`w_${d.key}`}
                    defaultValue={weights[d.key]}
                    min={0}
                    max={100}
                    align="right"
                  />
                </div>
              ))}
            </div>

            <div className="border-t border-[var(--border-hair)] pt-4">
              <h3 className="label mb-2">Limiares</h3>
              <div className="grid grid-cols-2 gap-3">
                <Num name="cfg_greenFloor" label="Piso do verde" value={cfg.greenFloor} />
                <Num name="cfg_yellowFloor" label="Piso do amarelo" value={cfg.yellowFloor} />
                <Num name="cfg_perfMaxAgeDays" label="Frescor performance (dias)" value={cfg.perfMaxAgeDays} />
                <Num name="cfg_checkinMaxAgeDays" label="Frescor check-in (dias)" value={cfg.checkinMaxAgeDays} />
                <Num
                  name="cfg_underMetaThreshold"
                  label="Override: performance abaixo de"
                  value={cfg.underMetaThreshold}
                />
                <Num name="cfg_underMetaCycles" label="…por quantos ciclos" value={cfg.underMetaCycles} />
              </div>
            </div>

            <div className="flex gap-2">
              <button className="btn btn-primary">Salvar e recalcular 90 dias</button>
              <button formAction={resetWeights} className="btn">
                Voltar ao padrão
              </button>
            </div>
          </form>
        </Panel>

        <div className="space-y-4">
          <Panel title="Time" subtitle="Quem preenche o quê. O acesso ao painel se gerencia em Usuários.">
            <TableScroll>
<table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Papel</th>
                  <th className="text-right">Contas</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.name}</td>
                    <td className="text-ink-400">
                      {u.role === "gt" ? "GT" : u.role === "account" ? "Account Manager" : "Coordenador"}
                    </td>
                    <td className="tnum text-right text-ink-400">
                      {
                        clients.filter((c) => c.gt_user_id === u.id || c.account_user_id === u.id)
                          .length
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
</TableScroll>
            {isAdmin && (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <p className="text-[13px] text-ink-400">
                  Criar acesso, resetar senha e desativar alguém fica no painel de usuários.
                </p>
                <Link href="/usuarios" className="btn shrink-0">
                  <Icon name="shield" size={14} />
                  Gerenciar usuários
                </Link>
              </div>
            )}
          </Panel>

          <Panel title="Operação" subtitle="O único job é o recompute diário.">
            <div className="space-y-3 px-4 py-4 text-sm text-ink-300">
              <p>
                Ritual do GT: <strong className="text-ink-100">{RITUAL_LABEL}</strong>. Check-in do
                Account: a cada contato relevante.
              </p>
              <pre className="whitespace-pre-wrap rounded-lg bg-ink-950 px-3 py-2 font-mono text-xs text-ink-400">
                {`# cron do host\n0 6 * * *  cd /srv/healthscore && npm run recompute`}
              </pre>
              <p className="text-xs text-ink-400">
                Ou via HTTP:{" "}
                <code className="rounded bg-ink-850 px-1 py-0.5 font-mono text-[11px]">
                  POST /api/recompute
                </code>{" "}
                com o header <code className="font-mono text-[11px]">x-recompute-token</code>.
              </p>
              <form action={runRecompute}>
                <button className="btn">Rodar recompute agora</button>
              </form>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Num({ name, label, value }: { name: string; label: string; value: number }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="mt-1 block">
        <NumberField name={name} defaultValue={value} />
      </span>
    </label>
  );
}
