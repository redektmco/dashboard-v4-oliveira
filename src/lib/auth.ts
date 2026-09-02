import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { all, one, run } from "./db";
import type { User } from "./model/types";

/**
 * Acesso fechado da unidade — não existe cadastro público.
 * Felipe e Michelle nascem como admin (semeados em `ensureAdmins`) e são os
 * únicos que criam novos usuários, pelo painel em /usuarios.
 *
 * A sessão vive no banco, não em cookie assinado: desativar alguém no painel
 * derruba o acesso na hora e não depende de segredo em variável de ambiente.
 */

export const SESSION_COOKIE = "v4_sess";
const SESSION_DAYS = 30;

/** Senha padrão da unidade — todo usuário novo nasce com ela. */
export const SENHA_PADRAO = "Oliveira@2026";

/** Quem manda no painel de usuários. Semeado no primeiro boot. */
const ADMINS = [
  { login: "felipe", name: "Felipe" },
  { login: "michelle", name: "Michelle" },
];

export type AuthUser = User & {
  login: string;
  is_admin: number;
  active: number;
};

/* ------------------------------ senha ------------------------------ */

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [scheme, saltHex, keyHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Normaliza o login: minúsculo, sem acento, sem espaço. */
export function normalizeLogin(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9._-]/g, "");
}

/* ------------------------------ sessão ----------------------------- */

export async function login(rawLogin: string, password: string): Promise<AuthUser | null> {
  const l = normalizeLogin(rawLogin);
  if (!l || !password) return null;

  const u = await one<AuthUser & { password_hash: string | null }>(
    `SELECT id, name, role, login, is_admin, active, password_hash
     FROM users WHERE login = ?`,
    [l],
  );
  if (!u || !u.active) return null;
  if (!(await verifyPassword(password, u.password_hash))) return null;

  const token = randomBytes(32).toString("hex");
  await run(
    `INSERT INTO sessions (token, user_id, expires_at)
     VALUES (?, ?, now() + (? || ' days')::interval)`,
    [token, u.id, String(SESSION_DAYS)],
  );

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });

  return {
    id: u.id,
    name: u.name,
    role: u.role,
    login: u.login,
    is_admin: u.is_admin,
    active: u.active,
  };
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await run("DELETE FROM sessions WHERE token = ?", [token]);
  jar.delete(SESSION_COOKIE);
}

/**
 * Usuário da requisição atual. `cache` deduplica: layout, página e actions
 * dividem o mesmo round-trip.
 */
export const getSessionUser = cache(async (): Promise<AuthUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return one<AuthUser>(
    `SELECT u.id, u.name, u.role, u.login, u.is_admin, u.active
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > now() AND u.active = 1`,
    [token],
  );
});

/**
 * Trava de servidor. O proxy só faz a checagem otimista do cookie — Server
 * Actions não passam por ele de forma confiável, então toda mutação chama isto.
 */
export async function requireUser(): Promise<AuthUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<AuthUser> {
  const u = await requireUser();
  if (!u.is_admin) redirect("/?erro=sem-permissao");
  return u;
}

/** Quem opera Social media: o time de social (role) e os admins. */
export function canManageSocial(u: Pick<AuthUser, "role" | "is_admin">): boolean {
  return Boolean(u.is_admin) || u.role === "social";
}

/** Trava de servidor para as mutacoes de Social media. */
export async function requireSocial(): Promise<AuthUser> {
  const u = await requireUser();
  if (!canManageSocial(u)) redirect("/social?erro=sem-permissao");
  return u;
}

/* --------------------------- administração -------------------------- */

export const listAuthUsers = () =>
  all<AuthUser & { created_at: string | null }>(
    `SELECT id, name, role, login, is_admin, active, created_at::text AS created_at
     FROM users ORDER BY is_admin DESC, name`,
  );

export const loginExists = async (l: string) =>
  Boolean(await one("SELECT 1 AS x FROM users WHERE login = ?", [normalizeLogin(l)]));

export async function createAuthUser(u: {
  name: string;
  login: string;
  role: User["role"];
  password: string;
  is_admin: boolean;
}) {
  const hash = await hashPassword(u.password);
  await run(
    `INSERT INTO users (name, role, login, password_hash, is_admin, active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [u.name, u.role, normalizeLogin(u.login), hash, u.is_admin ? 1 : 0],
  );
}

/** Dá acesso a alguém que já existe como integrante do time, ainda sem login. */
export async function grantAccess(userId: number, l: string, password: string, isAdmin: boolean) {
  const hash = await hashPassword(password);
  await run(
    "UPDATE users SET login = ?, password_hash = ?, is_admin = ?, active = 1 WHERE id = ?",
    [normalizeLogin(l), hash, isAdmin ? 1 : 0, userId],
  );
}

export async function resetPassword(userId: number, password: string) {
  const hash = await hashPassword(password);
  await run("UPDATE users SET password_hash = ? WHERE id = ?", [hash, userId]);
  await run("DELETE FROM sessions WHERE user_id = ?", [userId]);
}

export async function setUserActive(userId: number, active: boolean) {
  await run("UPDATE users SET active = ? WHERE id = ?", [active ? 1 : 0, userId]);
  if (!active) await run("DELETE FROM sessions WHERE user_id = ?", [userId]);
}

export async function setUserAdmin(userId: number, isAdmin: boolean) {
  await run("UPDATE users SET is_admin = ? WHERE id = ?", [isAdmin ? 1 : 0, userId]);
}

export async function updateUserProfile(userId: number, name: string, role: User["role"]) {
  await run("UPDATE users SET name = ?, role = ? WHERE id = ?", [name, role, userId]);
}

/**
 * Garante que Felipe e Michelle existam e sejam admin. Roda a cada boot
 * (instrumentation.ts) para que um banco novo já nasça com acesso.
 */
export async function ensureAdmins() {
  for (const a of ADMINS) {
    const existing = await one<{ id: number; password_hash: string | null }>(
      "SELECT id, password_hash FROM users WHERE login = ?",
      [a.login],
    );
    if (existing) {
      if (!existing.password_hash) await resetPassword(existing.id, SENHA_PADRAO);
      await run("UPDATE users SET is_admin = 1, active = 1 WHERE id = ?", [existing.id]);
      continue;
    }
    // Reaproveita o integrante homônimo já cadastrado, se houver.
    const byName = await one<{ id: number }>(
      "SELECT id FROM users WHERE lower(name) = lower(?) AND login IS NULL",
      [a.name],
    );
    if (byName) {
      await grantAccess(byName.id, a.login, SENHA_PADRAO, true);
    } else {
      await createAuthUser({
        name: a.name,
        login: a.login,
        role: "coord",
        password: SENHA_PADRAO,
        is_admin: true,
      });
    }
  }
}
