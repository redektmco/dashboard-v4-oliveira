"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createAuthUser,
  grantAccess,
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
import type { User } from "@/lib/model/types";

const str = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() ?? "";
const bool = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "1";
const role = (f: FormData, k: string) => {
  const v = str(f, k);
  return (["gt", "account", "coord"].includes(v) ? v : "gt") as User["role"];
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

const back = (msg: string, ok = true) => {
  revalidatePath("/usuarios");
  redirect(`/usuarios?${ok ? "ok" : "erro"}=${encodeURIComponent(msg)}`);
};

export async function adminCreateUser(formData: FormData) {
  await requireAdmin();

  const name = str(formData, "name");
  const l = normalizeLogin(str(formData, "login") || name.split(" ")[0] || "");
  const senha = str(formData, "password") || SENHA_PADRAO;

  if (!name) back("Informe o nome.", false);
  if (!l) back("Login inválido.", false);
  if (await loginExists(l)) back(`O login "${l}" já existe.`, false);

  await createAuthUser({
    name,
    login: l,
    role: role(formData, "role"),
    password: senha,
    is_admin: bool(formData, "is_admin"),
  });

  revalidatePath("/config");
  back(`${name} criado. Login "${l}"` + (senha === SENHA_PADRAO ? " com a senha padrão." : " com a senha definida agora."));
}

/** Integrante que já existia na tabela do time e ainda não tinha acesso. */
export async function adminGrantAccess(formData: FormData) {
  await requireAdmin();

  const id = Number(str(formData, "id"));
  const name = str(formData, "name");
  const l = normalizeLogin(str(formData, "login") || name.split(" ")[0] || "");
  const senha = str(formData, "password") || SENHA_PADRAO;

  if (!id || !l) back("Login inválido.", false);
  if (await loginExists(l)) back(`O login "${l}" já existe.`, false);

  await grantAccess(id, l, senha, bool(formData, "is_admin"));
  back(`Acesso liberado. Login "${l}"` + (senha === SENHA_PADRAO ? " com a senha padrão." : " com a senha definida agora."));
}

export async function adminResetPassword(formData: FormData) {
  await requireAdmin();
  const id = Number(str(formData, "id"));
  const senha = str(formData, "password") || SENHA_PADRAO;
  if (!id) back("Usuário não encontrado.", false);
  await resetPassword(id, senha);
  back(senha === SENHA_PADRAO ? "Senha redefinida para a padrão da unidade." : "Senha redefinida.");
}

export async function adminToggleActive(formData: FormData) {
  const me = await requireAdmin();
  const id = Number(str(formData, "id"));
  const ativo = str(formData, "active") === "1";
  if (id === me.id) back("Você não pode desativar o próprio acesso.", false);
  await setUserActive(id, !ativo);
  back(ativo ? "Acesso desativado." : "Acesso reativado.");
}

export async function adminToggleAdmin(formData: FormData) {
  const me = await requireAdmin();
  const id = Number(str(formData, "id"));
  const isAdmin = str(formData, "is_admin") === "1";
  if (id === me.id) back("Você não pode remover o próprio acesso de admin.", false);
  await setUserAdmin(id, !isAdmin);
  back(isAdmin ? "Removido dos administradores." : "Promovido a administrador.");
}

export async function adminUpdateProfile(formData: FormData) {
  await requireAdmin();
  const id = Number(str(formData, "id"));
  const name = str(formData, "name");
  if (!id || !name) back("Informe o nome.", false);
  await updateUserProfile(id, name, role(formData, "role"));
  revalidatePath("/config");
  back("Cadastro atualizado.");
}
