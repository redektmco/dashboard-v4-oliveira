"use client";

import { useState } from "react";
import Link from "next/link";
import { removeClient, setClientArchived } from "@/actions";
import { ACCOUNT_TYPE_LABEL, type User } from "@/lib/model/types";
import type { ClientFootprint } from "@/lib/repo";
import { ActionMenu, type MenuItem } from "./action-menu";
import { ClientDialog, type ClientFormClient } from "./client-form";
import { ConfirmDialog, ImpactList } from "./modal";
import { Segmented } from "./form-controls";
import { toast } from "./toast";
import { Icon } from "./icon";
import { CardList, CardMeta, CardRow, Empty, SectionHeader, TableScroll, brl, dateBR } from "./ui";

type Row = ClientFormClient & { targets: Record<string, number>; footprint: ClientFootprint };

/**
 * Cadastro da carteira. Uma ação principal (Novo cliente), o resto por linha
 * no ⋯: editar → ver ficha → arquivar → excluir. Arquivar é o caminho
 * normal para cliente que saiu; excluir é para erro de cadastro e fica com
 * os administradores.
 */
export function ClientsManager({ rows, users, isAdmin }: { rows: Row[]; users: User[]; isAdmin: boolean }) {
  const [filter, setFilter] = useState<"ativos" | "arquivados">("ativos");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [archiving, setArchiving] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const ativos = rows.filter((r) => r.active);
  const arquivados = rows.filter((r) => !r.active);
  const list = filter === "ativos" ? ativos : arquivados;

  const restore = async (r: Row) => {
    const res = await setClientArchived(r.id, false);
    if (res?.error) toast(res.error, { tone: "error" });
    else if (res?.ok) toast(res.ok);
  };

  const menu = (r: Row): MenuItem[] => [
    { label: "Editar cadastro e metas", icon: "settings", onSelect: () => setEditing(r) },
    { label: "Ver ficha do cliente", icon: "chart", href: `/clientes/${r.id}` },
    "separator",
    r.active
      ? { label: "Arquivar", icon: "lock", hint: "Sai da carteira, mantém o histórico", onSelect: () => setArchiving(r) }
      : { label: "Restaurar para a carteira", icon: "refresh", onSelect: () => void restore(r) },
    {
      label: "Excluir definitivamente",
      icon: "x",
      danger: true,
      disabled: !isAdmin,
      hint: isAdmin ? undefined : "Somente administradores",
      onSelect: () => setDeleting(r),
    },
  ];

  const metas = (r: Row) => {
    const n = Object.keys(r.targets).length;
    return n ? (
      <span className="tnum text-xs text-verde-fg">{n} metas</span>
    ) : (
      <span className="text-xs font-semibold text-vermelho-fg">sem meta</span>
    );
  };

  return (
    <>
      <SectionHeader
        title="Clientes"
        description="Cadastro da carteira e metas. Sem meta cadastrada não há régua — é o primeiro ponto a resolver."
        actions={
          <button className="btn btn-primary" onClick={() => setEditing("new")}>
            <Icon name="plus" size={14} />
            Novo cliente
          </button>
        }
      />

      <section className="panel">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border-hair)] px-4 py-3 sm:px-5">
          <Segmented
            size="sm"
            label="Mostrar"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "ativos", label: `Ativos · ${ativos.length}` },
              { value: "arquivados", label: `Arquivados · ${arquivados.length}` },
            ]}
          />
          {filter === "ativos" && ativos.some((r) => !Object.keys(r.targets).length) && (
            <span className="hidden text-[12px] font-semibold text-vermelho-fg sm:inline">
              {ativos.filter((r) => !Object.keys(r.targets).length).length} sem meta
            </span>
          )}
        </header>

        {list.length === 0 ? (
          filter === "ativos" ? (
            <Empty
              action={
                <button className="btn btn-primary" onClick={() => setEditing("new")}>
                  <Icon name="plus" size={14} />
                  Cadastrar o primeiro cliente
                </button>
              }
            >
              Nenhum cliente ativo na carteira.
            </Empty>
          ) : (
            <Empty>Nenhum cliente arquivado. Arquivar tira o cliente da carteira sem apagar o histórico.</Empty>
          )
        ) : (
          <>
            <CardList>
              {list.map((r) => (
                <CardRow key={r.id} critical={r.active === 1 && !Object.keys(r.targets).length}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/clientes/${r.id}`} className="font-semibold text-ink-100">
                        {r.name}
                      </Link>
                      <div className="mt-0.5 text-[11px] text-ink-500">{ACCOUNT_TYPE_LABEL[r.account_type]}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      {metas(r)}
                      <ActionMenu items={menu(r)} label={`Ações de ${r.name}`} />
                    </div>
                  </div>
                  <CardMeta
                    items={[
                      { label: "GT", value: r.gt_name ?? "—" },
                      { label: "Account", value: r.account_name ?? "—" },
                      { label: "MRR", value: <span className="tnum">{brl(r.mrr)}</span> },
                      { label: "Renovação", value: dateBR(r.renewal_date) },
                    ]}
                  />
                </CardRow>
              ))}
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
                      <th className="w-10" aria-label="Ações" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <Link href={`/clientes/${r.id}`} className="font-medium text-ink-100 hover:text-v4-red">
                            {r.name}
                          </Link>
                        </td>
                        <td className="text-ink-400">{ACCOUNT_TYPE_LABEL[r.account_type]}</td>
                        <td className="text-ink-300">{r.gt_name ?? "—"}</td>
                        <td className="text-ink-300">{r.account_name ?? "—"}</td>
                        <td className="tnum text-right text-ink-300">{brl(r.mrr)}</td>
                        <td className="text-ink-300">{dateBR(r.renewal_date)}</td>
                        <td>{metas(r)}</td>
                        <td className="text-right">
                          <ActionMenu items={menu(r)} label={`Ações de ${r.name}`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </div>
          </>
        )}
      </section>

      <ClientDialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        users={users}
        client={editing && editing !== "new" ? editing : null}
        targets={editing && editing !== "new" ? editing.targets : {}}
      />

      <ConfirmDialog
        open={Boolean(archiving)}
        onClose={() => setArchiving(null)}
        title={`Arquivar ${archiving?.name ?? ""}?`}
        confirmLabel="Arquivar"
        tone="default"
        pendingLabel="Arquivando…"
        onConfirm={() => setClientArchived(archiving!.id, true)}
      >
        <p>
          O cliente sai da carteira, da triagem e dos formulários de GT e Account. Todo o histórico fica guardado e
          você pode restaurar a qualquer momento em “Arquivados”.
        </p>
        {archiving?.footprint.integration && (
          <p className="text-[12.5px] text-amarelo-fg">A integração de CRM continua recebendo leads enquanto não for pausada.</p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Excluir ${deleting?.name ?? ""} definitivamente?`}
        confirmLabel="Excluir cliente"
        pendingLabel="Excluindo…"
        requireText={deleting?.name}
        onConfirm={() => removeClient(deleting!.id, deleting!.name)}
      >
        <p>Some da carteira com todo o histórico. Não dá para desfazer.</p>
        {deleting && (
          <ImpactList
            items={[
              { label: "snapshot(s) de performance", count: deleting.footprint.perf },
              { label: "check-in(s) do Account", count: deleting.footprint.checkins },
              { label: "plano(s) de ação", count: deleting.footprint.plans },
              { label: "lead(s) recebidos do CRM", count: deleting.footprint.leads },
              ...(deleting.footprint.integration ? [{ label: "integração de CRM (o webhook para de contar)" }] : []),
              {
                label: "projeto(s) de Social media — continuam existindo, só perdem o vínculo",
                count: deleting.footprint.projects,
                tone: "muted" as const,
              },
            ]}
          />
        )}
        <p className="text-[12.5px] text-ink-500">Cliente que só saiu da carteira? Prefira arquivar.</p>
      </ConfirmDialog>
    </>
  );
}
