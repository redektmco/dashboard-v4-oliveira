"use client";

import { useEffect, useRef, useState } from "react";
import {
  adminCreateUser,
  adminCreateJobRole,
  adminDeleteUser,
  adminGrantAccess,
  adminResetPassword,
  adminSetActive,
  adminSetAdmin,
  adminUpdateUser,
} from "@/actions/auth";
import { BUILTIN_ROLES, roleLabel, type JobRole } from "@/lib/roles";
import type { UserFootprint } from "@/lib/repo";
import { ActionMenu, type MenuItem } from "./action-menu";
import { ActionForm, SubmitButton } from "./form-controls";
import { ConfirmDialog, ImpactList, Modal } from "./modal";
import { toast } from "./toast";
import { Icon } from "./icon";
import { CardList, CardRow, Empty, Panel, TableScroll } from "./ui";
import { PageTitle } from "./kit";

export type UserRow = {
  id: number;
  name: string;
  role: string;
  roles?: string[];
  login: string | null;
  is_admin: number;
  active: number;
  fixed: boolean;
  footprint: UserFootprint;
};

type Dialog =
  | { kind: "create" }
  | { kind: "role" }
  | { kind: "edit"; u: UserRow }
  | { kind: "grant"; u: UserRow }
  | { kind: "reset"; u: UserRow }
  | { kind: "deactivate"; u: UserRow }
  | { kind: "delete"; u: UserRow }
  | null;

const contas = (f: UserFootprint) => f.gtOf + f.accountOf;
const inputs = (f: UserFootprint) => f.perfFilled + f.checkinsFilled;

/**
 * Acesso do time. Ação principal: Novo usuário. Por pessoa, no ⋯: editar →
 * senha e permissões → desativar → excluir. Desativar é o caminho normal
 * para quem saiu (tira o acesso na hora, preserva o histórico); excluir é
 * para cadastro errado ou quem nunca assinou um input.
 */
export function UsersManager({ users, roles, meId, senhaPadrao }: { users: UserRow[]; roles: JobRole[]; meId: number; senhaPadrao: string }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  const labels = (u: UserRow) => [...new Set([u.role, ...(u.roles ?? [])])].map((id) => roleLabel(id, roles)).join(" · ");

  const comAcesso = users.filter((u) => u.login);
  const semAcesso = users.filter((u) => !u.login);

  const run = async (p: Promise<{ ok?: string; error?: string } | null>) => {
    const r = await p;
    if (r?.error) toast(r.error, { tone: "error" });
    else if (r?.ok) toast(r.ok);
  };

  const menu = (u: UserRow): MenuItem[] => {
    const self = u.id === meId;
    const items: MenuItem[] = [{ label: "Editar nome, papel e login", icon: "settings", onSelect: () => setDialog({ kind: "edit", u }) }];
    if (u.login) {
      items.push({ label: "Resetar senha", icon: "key", onSelect: () => setDialog({ kind: "reset", u }) });
      items.push(
        u.is_admin
          ? {
              label: "Tirar de administrador",
              icon: "shield",
              disabled: self || u.fixed,
              hint: self ? "Não vale para você mesmo" : u.fixed ? "Administrador fixo da unidade" : undefined,
              onSelect: () => void run(adminSetAdmin(u.id, false)),
            }
          : { label: "Tornar administrador", icon: "shield", hint: "Pode criar e gerenciar usuários", onSelect: () => void run(adminSetAdmin(u.id, true)) },
      );
      items.push("separator");
      items.push(
        u.active
          ? {
              label: "Desativar acesso",
              icon: "lock",
              disabled: self || u.fixed,
              hint: self ? "Não vale para você mesmo" : u.fixed ? "Administrador fixo da unidade" : "Sai do painel na hora",
              onSelect: () => setDialog({ kind: "deactivate", u }),
            }
          : { label: "Reativar acesso", icon: "refresh", onSelect: () => void run(adminSetActive(u.id, true)) },
      );
    } else {
      items.push({ label: "Liberar acesso ao painel", icon: "lock", onSelect: () => setDialog({ kind: "grant", u }) });
      items.push("separator");
    }
    items.push({
      label: "Excluir",
      icon: "x",
      danger: true,
      disabled: self || u.fixed,
      hint: self ? "Não vale para você mesmo" : u.fixed ? "Administrador fixo da unidade" : undefined,
      onSelect: () => setDialog({ kind: "delete", u }),
    });
    return items;
  };

  const status = (u: UserRow) => (
    <span className="inline-flex flex-wrap items-center gap-2">
      {u.is_admin ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-v4-red">
          <Icon name="shield" size={12} />
          Admin
        </span>
      ) : (
        <span className="text-[11px] text-ink-500">Usuário</span>
      )}
      {!u.active && <span className="rounded-full bg-ink-800 px-2 py-0.5 text-[11px] font-semibold text-ink-400">inativo</span>}
    </span>
  );

  const target = dialog && "u" in dialog ? dialog.u : null;

  return (
    <>
      <PageTitle
        title="Usuários e acesso"
        description={
          <>
            Uso fechado da unidade: ninguém se cadastra sozinho. Todo acesso nasce com a senha padrão{" "}
            <code className="rounded bg-ink-850 px-1 py-0.5 font-mono text-xs">{senhaPadrao}</code>.
          </>
        }
        aside={
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => setDialog({ kind: "role" })}>Novo cargo</button>
            <button className="btn" onClick={() => setDialog({ kind: "create" })}>
              <Icon name="plus" size={16} />Novo usuário
            </button>
          </div>
        }
      />

      <Panel title="Com acesso ao painel" subtitle={`${comAcesso.filter((u) => u.active).length} ativos de ${comAcesso.length}`}>
        {comAcesso.length === 0 ? (
          <Empty>Ninguém com acesso ainda.</Empty>
        ) : (
          <>
            <CardList>
              {comAcesso.map((u) => (
                <CardRow key={u.id}>
                  <div className={`flex items-start justify-between gap-3 ${u.active ? "" : "opacity-60"}`}>
                    <div className="min-w-0">
                      <span className="font-semibold text-ink-100">{u.name}</span>
                      {u.id === meId && <span className="ml-2 text-[11px] text-ink-500">você</span>}
                      <div className="mt-0.5 font-mono text-[11px] text-ink-400">
                        {u.login} · {labels(u)}
                      </div>
                      <div className="mt-1.5">{status(u)}</div>
                    </div>
                    <ActionMenu items={menu(u)} label={`Ações de ${u.name}`} />
                  </div>
                </CardRow>
              ))}
            </CardList>
            <div className="hidden lg:block">
              <TableScroll>
                <table className="data-table is-dense">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Login</th>
                      <th>Papel</th>
                      <th className="text-right">Contas</th>
                      <th>Status</th>
                      <th className="w-10" aria-label="Ações" />
                    </tr>
                  </thead>
                  <tbody>
                    {comAcesso.map((u) => (
                      <tr key={u.id} className={u.active ? "" : "opacity-60"}>
                        <td className="font-medium">
                          {u.name}
                          {u.id === meId && <span className="ml-2 text-[11px] text-ink-500">você</span>}
                        </td>
                        <td className="font-mono text-xs text-ink-300">{u.login}</td>
                        <td className="text-ink-400">{labels(u)}</td>
                        <td className="tnum text-right text-ink-400">{contas(u.footprint) || "—"}</td>
                        <td>{status(u)}</td>
                        <td className="text-right">
                          <ActionMenu items={menu(u)} label={`Ações de ${u.name}`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </div>
          </>
        )}
      </Panel>

      {semAcesso.length > 0 && (
        <Panel title="Time sem acesso" subtitle="Aparecem nos formulários (GT, Account) mas ainda não entram no painel.">
          <ul className="divide-y divide-[var(--border-hair)]">
            {semAcesso.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink-100">{u.name}</div>
                  <div className="text-[12px] text-ink-500">
                    {labels(u)}
                    {contas(u.footprint) ? ` · ${contas(u.footprint)} conta(s)` : ""}
                  </div>
                </div>
                <button className="btn btn-sm" onClick={() => setDialog({ kind: "grant", u })}>
                  <Icon name="lock" size={12} />
                  Liberar acesso
                </button>
                <ActionMenu items={menu(u)} label={`Ações de ${u.name}`} />
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Cargos" subtitle="Cada cargo usa um modelo de tela. Cargos personalizados não concedem permissões de administrador ou de Social.">
        <ul className="flex flex-wrap gap-2 p-4">
          {roles.map((r) => <li key={r.id} className="rounded border border-ink-700 px-3 py-2 text-sm">
            {r.label} <span className="text-ink-500">· {roleLabel(r.preset)}</span>
          </li>)}
        </ul>
      </Panel>

      {/* ---------- diálogos ---------- */}
      <Modal open={dialog?.kind === "role"} onClose={close} title="Novo cargo">
        <ActionForm action={adminCreateJobRole} onSuccess={close}>
          <label className="block"><span className="label">Nome do cargo</span>
            <input name="label" required maxLength={80} autoFocus className="field mt-1" />
          </label>
          <label className="block"><span className="label">Identificador</span>
            <input name="id" required pattern="[a-z][a-z0-9_-]{1,47}" maxLength={48} placeholder="ex.: redator" className="field mt-1" />
            <span className="text-xs text-ink-500">Letras minúsculas, números, _ ou -; começa por letra.</span>
          </label>
          <label className="block"><span className="label">Modelo de tela</span>
            <select name="preset" required className="field mt-1" defaultValue="">
              <option value="" disabled>Selecione um modelo</option>
              {BUILTIN_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </label>
          <p className="text-xs text-ink-500">O modelo organiza a tela. Permissões de Social exigem o cargo Social Media; permissões de administrador são separadas.</p>
          <div className="modal-actions"><button type="button" className="btn" onClick={close}>Cancelar</button><SubmitButton>Criar cargo</SubmitButton></div>
        </ActionForm>
      </Modal>
      <Modal open={dialog?.kind === "create"} onClose={close} title="Novo usuário" description="Cria o acesso com a senha padrão da unidade.">
        <ActionForm action={adminCreateUser} onSuccess={close}>
          <label className="block">
            <span className="label">Nome</span>
            <input name="name" required autoFocus className="field mt-1" placeholder="Nome completo" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Login</span>
              <input name="login" className="field mt-1 font-mono text-sm" placeholder="primeiro nome" />
              <span className="mt-1 block text-[11px] text-ink-500">Em branco: usa o primeiro nome.</span>
            </label>
            <RoleSelect catalog={roles} />
          </div>
          <label className="block">
            <span className="label">Senha inicial</span>
            <input name="password" className="field mt-1 font-mono text-sm" defaultValue={senhaPadrao} />
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink-300">
            <input type="checkbox" name="is_admin" />
            Pode criar e gerenciar usuários (administrador)
          </label>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={close}>
              Cancelar
            </button>
            <SubmitButton pendingLabel="Criando…">
              <Icon name="plus" size={14} />
              Criar acesso
            </SubmitButton>
          </div>
        </ActionForm>
      </Modal>

      <Modal open={dialog?.kind === "edit"} onClose={close} title={`Editar ${target?.name ?? ""}`}>
        {target && (
          <ActionForm action={adminUpdateUser} onSuccess={close}>
            <input type="hidden" name="id" value={target.id} />
            <label className="block">
              <span className="label">Nome</span>
              <input name="name" required defaultValue={target.name} className="field mt-1" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <RoleSelect catalog={roles} defaultValue={target.role} memberships={target.roles} />
              {target.login && (
                <label className="block">
                  <span className="label">Login</span>
                  <input
                    name="login"
                    defaultValue={target.login}
                    disabled={target.fixed}
                    className="field mt-1 font-mono text-sm disabled:opacity-60"
                  />
                </label>
              )}
            </div>
            <p className="text-[12px] text-ink-500">Os cargos definem as telas e os formulários da pessoa. O acesso de administrador é gerenciado separadamente.</p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={close}>
                Cancelar
              </button>
              <SubmitButton>Salvar</SubmitButton>
            </div>
          </ActionForm>
        )}
      </Modal>

      <Modal open={dialog?.kind === "grant"} onClose={close} title={`Liberar acesso para ${target?.name ?? ""}`} description={`Entra com a senha padrão ${senhaPadrao}.`}>
        {target && (
          <ActionForm action={adminGrantAccess} onSuccess={close}>
            <input type="hidden" name="id" value={target.id} />
            <input type="hidden" name="name" value={target.name} />
            <label className="block">
              <span className="label">Login</span>
              <input name="login" autoFocus className="field mt-1 font-mono text-sm" placeholder={target.name.split(" ")[0].toLowerCase()} />
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-300">
              <input type="checkbox" name="is_admin" />
              Administrador
            </label>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={close}>
                Cancelar
              </button>
              <SubmitButton pendingLabel="Liberando…">Liberar acesso</SubmitButton>
            </div>
          </ActionForm>
        )}
      </Modal>

      <ConfirmDialog
        open={dialog?.kind === "reset"}
        onClose={close}
        title={`Resetar a senha de ${target?.name ?? ""}?`}
        confirmLabel="Resetar senha"
        tone="default"
        pendingLabel="Resetando…"
        onConfirm={() => adminResetPassword(target!.id)}
      >
        <p>
          A senha volta para <code className="font-mono text-ink-100">{senhaPadrao}</code> e as sessões abertas da pessoa
          são encerradas.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.kind === "deactivate"}
        onClose={close}
        title={`Desativar o acesso de ${target?.name ?? ""}?`}
        confirmLabel="Desativar"
        pendingLabel="Desativando…"
        onConfirm={() => adminSetActive(target!.id, false)}
      >
        <p>A pessoa sai do painel na hora e não consegue mais entrar. O histórico e as contas atribuídas continuam — dá para reativar depois.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onClose={close}
        title={`Excluir ${target?.name ?? ""}?`}
        confirmLabel="Excluir"
        pendingLabel="Excluindo…"
        onConfirm={async () => {
          if (target && inputs(target.footprint) > 0) return "Quem já assinou inputs não pode ser excluído. Desative o acesso.";
          return adminDeleteUser(target!.id);
        }}
      >
        {target && inputs(target.footprint) > 0 ? (
          <>
            <p>
              {target.name} assinou <strong className="text-ink-100">{inputs(target.footprint)} preenchimento(s)</strong> no histórico.
              O histórico guarda quem preencheu cada snapshot — excluir apagaria essa assinatura.
            </p>
            {target.login && target.active ? (
              <button
                type="button"
                className="btn w-full justify-center"
                onClick={() => setDialog({ kind: "deactivate", u: target })}
              >
                <Icon name="lock" size={14} />
                Desativar o acesso em vez disso
              </button>
            ) : null}
          </>
        ) : (
          <>
            <p>O cadastro some do time e dos formulários. Não dá para desfazer.</p>
            {target && (
              <ImpactList
                items={[
                  { label: "conta(s) ficam sem GT atribuído", count: target.footprint.gtOf },
                  { label: "conta(s) ficam sem Account atribuído", count: target.footprint.accountOf },
                ]}
              />
            )}
          </>
        )}
      </ConfirmDialog>
    </>
  );
}

type RoleSelectProps = { catalog: JobRole[]; defaultValue?: string; memberships?: string[] };

function RoleSelect(props: RoleSelectProps) {
  // O React 19 reseta o formulário depois de cada envio, inclusive quando a
  // action devolve erro. Os cargos vivem em estado: remontar os campos faz a
  // tela voltar ao início junto com o resto do formulário, em vez de mostrar
  // um cargo e enviar outro.
  const ref = useRef<HTMLFieldSetElement>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const reset = () => setRound((n) => n + 1);
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, []);
  return (
    <fieldset ref={ref} className="block space-y-2">
      <RoleFields key={round} {...props} />
    </fieldset>
  );
}

/**
 * Os adicionais ficam à parte do principal. O principal escolhido aparece
 * marcado e travado (o servidor sempre o inclui); ao trocá-lo, o antigo vira
 * uma opção comum desmarcada — antes ele seguia salvo, com as permissões dele.
 */
function RoleFields({ catalog, defaultValue = "", memberships = [] }: RoleSelectProps) {
  const [primary, setPrimary] = useState(defaultValue);
  const [extras, setExtras] = useState(() => memberships.filter((id) => id !== defaultValue));
  const toggle = (id: string, on: boolean) => setExtras((cur) => (on ? [...cur, id] : cur.filter((x) => x !== id)));
  return (
    <>
      <legend className="label">Cargos</legend>
      <label className="block">
        <span className="label">Cargo principal</span>
        <select name="role" required className="field mt-1" value={primary} onChange={(e) => setPrimary(e.target.value)}>
          <option value="" disabled>Selecione um cargo</option>
          {catalog.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </label>
      <span className="label">Cargos adicionais</span>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {catalog.map((r) => <label key={r.id} className="flex items-center gap-2 text-xs text-ink-300">
          <input
            type="checkbox"
            name="roles"
            value={r.id}
            checked={r.id === primary || extras.includes(r.id)}
            disabled={r.id === primary}
            onChange={(e) => toggle(r.id, e.target.checked)}
          />
          {r.label}
        </label>)}
      </div>
      <p className="text-xs text-ink-500">O cargo principal sempre faz parte dos cargos da pessoa.</p>
    </>
  );
}
