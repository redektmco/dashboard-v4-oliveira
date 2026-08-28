import {
  adminCreateUser,
  adminGrantAccess,
  adminResetPassword,
  adminToggleActive,
  adminToggleAdmin,
} from "@/actions/auth";
import { listAuthUsers, requireAdmin, SENHA_PADRAO } from "@/lib/auth";
import { Panel } from "@/components/ui";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

const ROLE_LABEL = { gt: "GT", account: "Account Manager", coord: "Coordenação" } as const;

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const me = await requireAdmin();
  const { ok, erro } = await searchParams;
  const users = await listAuthUsers();

  const comAcesso = users.filter((u) => u.login);
  const semAcesso = users.filter((u) => !u.login);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">Usuários</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-400">
          Uso fechado da unidade: ninguém se cadastra sozinho. Todo acesso criado aqui nasce com a
          senha padrão{" "}
          <code className="rounded bg-ink-850 px-1 py-0.5 font-mono text-xs">{SENHA_PADRAO}</code>.
        </p>
      </div>

      {ok && (
        <div className="flex items-center gap-2 rounded-lg bg-verde-dim px-4 py-2.5 text-sm font-semibold text-verde-fg">
          <Icon name="check" size={15} />
          {ok}
        </div>
      )}
      {erro && (
        <div className="flex items-center gap-2 rounded-lg bg-vermelho-dim px-4 py-2.5 text-sm font-semibold text-vermelho-fg">
          <Icon name="alert" size={15} />
          {erro}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
        <Panel
          title="Quem tem acesso"
          subtitle={`${comAcesso.filter((u) => u.active).length} ativos de ${comAcesso.length}`}
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Login</th>
                <th>Papel</th>
                <th>Status</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {comAcesso.map((u) => (
                <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                  <td className="font-medium">
                    {u.name}
                    {u.id === me.id && <span className="ml-2 text-[11px] text-ink-500">você</span>}
                  </td>
                  <td className="font-mono text-xs text-ink-300">{u.login}</td>
                  <td className="text-ink-400">{ROLE_LABEL[u.role]}</td>
                  <td>
                    {u.is_admin ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-v4-red">
                        <Icon name="shield" size={12} />
                        Admin
                      </span>
                    ) : (
                      <span className="text-[11px] text-ink-500">Usuário</span>
                    )}
                    {!u.active && (
                      <span className="ml-2 text-[11px] font-semibold text-vermelho-fg">inativo</span>
                    )}
                  </td>
                  <td className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <form action={adminResetPassword}>
                        <input type="hidden" name="id" value={u.id} />
                        <button className="btn py-1 text-xs">
                          <Icon name="key" size={12} />
                          Resetar senha
                        </button>
                      </form>
                      <form action={adminToggleAdmin}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="is_admin" value={u.is_admin} />
                        <button className="btn py-1 text-xs" disabled={u.id === me.id}>
                          {u.is_admin ? "Tirar admin" : "Tornar admin"}
                        </button>
                      </form>
                      <form action={adminToggleActive}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="active" value={u.active} />
                        <button className="btn py-1 text-xs" disabled={u.id === me.id}>
                          {u.active ? "Desativar" : "Ativar"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Novo usuário" subtitle="Cria o acesso já com a senha padrão da unidade.">
          <form action={adminCreateUser} className="space-y-3 px-5 py-4">
            <label className="block">
              <span className="label">Nome</span>
              <input name="name" required className="field mt-1" placeholder="Nome completo" />
            </label>
            <label className="block">
              <span className="label">Login</span>
              <input
                name="login"
                className="field mt-1 font-mono text-sm"
                placeholder="primeiro nome, sem acento"
              />
              <span className="mt-1 block text-[11px] text-ink-500">
                Em branco: usa o primeiro nome.
              </span>
            </label>
            <label className="block">
              <span className="label">Papel</span>
              <select name="role" className="field mt-1">
                <option value="gt">GT</option>
                <option value="account">Account Manager</option>
                <option value="coord">Coordenação</option>
              </select>
            </label>
            <label className="block">
              <span className="label">Senha</span>
              <input
                name="password"
                className="field mt-1 font-mono text-sm"
                defaultValue={SENHA_PADRAO}
              />
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-300">
              <input type="checkbox" name="is_admin" />
              Pode criar e gerenciar usuários
            </label>
            <button className="btn btn-primary w-full justify-center">
              <Icon name="plus" size={14} />
              Criar acesso
            </button>
          </form>
        </Panel>
      </div>

      {semAcesso.length > 0 && (
        <Panel
          title="Time sem acesso"
          subtitle="Integrantes que já aparecem nos formulários mas ainda não entram no painel."
        >
          <table className="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Papel</th>
                <th className="text-right">Liberar acesso</th>
              </tr>
            </thead>
            <tbody>
              {semAcesso.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}</td>
                  <td className="text-ink-400">{ROLE_LABEL[u.role]}</td>
                  <td>
                    <form action={adminGrantAccess} className="flex items-center justify-end gap-2">
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="name" value={u.name} />
                      <input
                        name="login"
                        className="field w-40 py-1 font-mono text-xs"
                        placeholder={u.name.split(" ")[0].toLowerCase()}
                      />
                      <label className="flex items-center gap-1.5 text-[11px] text-ink-400">
                        <input type="checkbox" name="is_admin" />
                        admin
                      </label>
                      <button className="btn py-1 text-xs">
                        <Icon name="lock" size={12} />
                        Liberar
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
