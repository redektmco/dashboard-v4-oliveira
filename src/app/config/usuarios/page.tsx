import { FIXED_ADMIN_LOGINS, listAuthUsers, listJobRoles, requireAdmin, SENHA_PADRAO } from "@/lib/auth";
import { userFootprints } from "@/lib/repo";
import { UsersManager } from "@/components/users-manager";
import { ConfigPage } from "@/components/config-shell";

export const dynamic = "force-dynamic";

const EMPTY = { gtOf: 0, accountOf: 0, perfFilled: 0, checkinsFilled: 0 };

export default async function UsuariosPage() {
  const me = await requireAdmin();
  const [users, footprints, roles] = await Promise.all([listAuthUsers(), userFootprints(), listJobRoles()]);

  return (
    <ConfigPage>
    <UsersManager
      roles={roles}
      meId={me.id}
      senhaPadrao={SENHA_PADRAO}
      users={users.map((u) => ({
        id: u.id,
        name: u.name,
        role: u.role,
        roles: u.roles,
        login: u.login,
        is_admin: u.is_admin,
        active: u.active,
        fixed: Boolean(u.login && FIXED_ADMIN_LOGINS.includes(u.login)),
        footprint: footprints.get(u.id) ?? EMPTY,
      }))}
    />
    </ConfigPage>
  );
}
