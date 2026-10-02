"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createAuthUser,
  FIXED_ADMIN_LOGINS,
  grantAccess,
  listAuthUsers,
  login,
  loginExists,
  logout,
  normalizeLogin,
  requireAdmin,
  resetPassword,
  SENHA_PADRAO,
  setUserActive,
  setUserAdmin,
  updateUserProfile,
} from "@/lib/auth";
import { deleteUser } from "@/lib/repo";
import { logChange } from "@/lib/audit";
import type { User } from "@/lib/model/types";
import type { ActionResult } from "@/lib/action";

const str = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() ?? "";
const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "1";
const role = (f: FormData, k: string) => {
  const v = str(f, k);
  return (["gt", "account", "coord", "social"].includes(v) ? v : "gt") as User["role"];
};

/* -------------------------- entrar e sair -------------------------- */

export type LoginState = { erro?: string };

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const user = await login(str(formData, "login"), str(formData, "password"));
  if (!user) return { erro: "Usuário ou senha inválidos." };

  const de = str(formData, "de");
  redirect(de && de.startsWith("/") && !de.startsWith("//") ? de : "/");
}

export async function signOut() {
  await logout();
  redirect("/login");
}

/* ----------------------- painel de usuários ------------------------ */

const done = (ok: string): ActionResult => {
  revalidatePath("/config/usuarios");
  revalidatePath("/config");
  return { ok };
};

const withPassword = (senha: string) =>
  senha === SENHA_PADRAO ? " com a senha padrão." : " com a senha definida agora.";

export async function adminCreateUser(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();

  const name = str(formData, "name");
  const l = normalizeLogin(str(formData, "login") || name.split(" ")[0] || "");
  const senha = str(formData, "password") || SENHA_PADRAO;

  if (!name) return { error: "Informe o nome." };
  if (!l) return { error: "Login inválido." };
  if (await loginExists(l)) return { error: `O login "${l}" já existe.` };

  await createAuthUser({ name, login: l, role: role(formData, "role"), password: senha, is_admin: bool(formData, "is_admin") });
  await logChange(me, "usuario", `Usuário criado: ${name}`);
  return done(`${name} criado. Login "${l}"${withPassword(senha)}`);
}

/** Integrante que já existia na tabela do time e ainda não tinha acesso. */
export async function adminGrantAccess(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const me = await requireAdmin();

  const id = Number(str(formData, "id"));
  const name = str(formData, "name");
  const l = normalizeLogin(str(formData, "login") || name.split(" ")[0] || "");
  const senha = str(formData, "password") || SENHA_PADRAO;

  if (!id || !l) return { error: "Login inválido." };
  if (await loginExists(l)) return { error: `O login "${l}" já existe.` };

  await grantAccess(id, l, senha, bool(formData, "is_admin"));
  await logChange(me, "usuario", `Acesso liberado: ${name}`);
  return done(`Acesso liberado para ${name}. Login "${l}"${withPassword(senha)}`);
}

/** Editar nome, papel e login de alguém do time. */
export async function adminUpdateUser(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = Number(str(formData, "id"));
  const name = str(formData, "name");
  if (!id || !name) return { error: "Informe o nome." };

  const users = await listAuthUsers();
  const target = users.find((u) => u.id === id);
  if (!target) return { error: "Usuário não encontrado." };

  const rawLogin = str(formData, "login");
  if (target.login && rawLogin) {
    const l = normalizeLogin(rawLogin);
    if (!l) return { error: "Login inválido." };
    if (l !== target.login) {
      if (FIXED_ADMIN_LOGINS.includes(target.login)) return { error: "O login dos administradores fixos não muda." };
      if (await loginExists(l)) return { error: `O login "${l}" já existe.` };
      await updateUserProfile(id, name, role(formData, "role"), l);
      return done("Cadastro atualizado. O novo login vale a partir do próximo acesso.");
    }
  }
  await updateUserProfile(id, name, role(formData, "role"));
  return done("Cadastro atualizado.");
}

export async function adminResetPassword(id: number): Promise<ActionResult> {
  await requireAdmin();
  if (!id) return { error: "Usuário não encontrado." };
  await resetPassword(id, SENHA_PADRAO);
  return done(`Senha redefinida para a padrão (${SENHA_PADRAO}). As sessões abertas foram encerradas.`);
}

export async function adminSetActive(id: number, active: boolean): Promise<ActionResult> {
  const me = await requireAdmin();
  if (id === me.id) return { error: "Você não pode desativar o próprio acesso." };
  const target = (await listAuthUsers()).find((u) => u.id === id);
  if (!target) return { error: "Usuário não encontrado." };
  if (!active && target.login && FIXED_ADMIN_LOGINS.includes(target.login))
    return { error: "Administradores fixos da unidade não podem ser desativados." };
  await setUserActive(id, active);
  await logChange(me, "usuario", `${active ? "Acesso reativado" : "Acesso desativado"}: ${target.name}`);
  return done(active ? "Acesso reativado." : "Acesso desativado. A pessoa saiu do painel na hora; o histórico continua.");
}

export async function adminSetAdmin(id: number, isAdmin: boolean): Promise<ActionResult> {
  const me = await requireAdmin();
  if (id === me.id) return { error: "Você não pode alterar o próprio acesso de admin." };
  const target = (await listAuthUsers()).find((u) => u.id === id);
  if (!target) return { error: "Usuário não encontrado." };
  if (!isAdmin && target.login && FIXED_ADMIN_LOGINS.includes(target.login))
    return { error: "Administradores fixos da unidade continuam admin." };
  await setUserAdmin(id, isAdmin);
  await logChange(me, "usuario", `${isAdmin ? "Virou administrador" : "Saiu dos administradores"}: ${target.name}`);
  return done(isAdmin ? `${target.name} agora é administrador.` : `${target.name} saiu dos administradores.`);
}

/**
 * Exclusão de alguém do time. Protegido: não exclui a si mesmo, nem os admins
 * fixos (seriam recriados no próximo boot), nem quem assinou inputs (o
 * histórico guarda quem preencheu — para esses, desativar).
 */
export async function adminDeleteUser(id: number): Promise<ActionResult> {
  const me = await requireAdmin();
  if (id === me.id) return { error: "Você não pode excluir o próprio usuário." };
  const target = (await listAuthUsers()).find((u) => u.id === id);
  if (!target) return { error: "Usuário não encontrado." };
  if (target.login && FIXED_ADMIN_LOGINS.includes(target.login))
    return { error: "Administradores fixos da unidade não podem ser excluídos." };
  const r = await deleteUser(id);
  if (r.error) return { error: r.error };
  return done(`${target.name} excluído.`);
}
