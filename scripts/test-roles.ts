/** Isolated role and migration regressions: npx tsx --test scripts/test-roles.ts. */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { SheetClient } from "../src/lib/import/clients-sheet";
import { BUILTIN_ROLES, hasRole, roleLabel } from "../src/lib/roles";
import { workspaceStorageKey } from "../src/lib/workspace/layout";

test("legacy primary roles and additional memberships both match", () => {
  assert.equal(hasRole({ role: "gt" }, "gt"), true);
  assert.equal(hasRole({ role: "gt", roles: ["social", "designer"] }, "social"), true);
  assert.equal(hasRole({ role: "gt", roles: ["designer"] }, "finance"), false);
  assert.equal(hasRole({ role: "gt", roles: [] }, "gt"), true);
});

test("builtin catalog and custom labels remain independent of presets", () => {
  assert.deepEqual(BUILTIN_ROLES.map((r) => r.id), ["coord", "gt", "account", "social", "designer", "crm", "finance"]);
  assert.equal(roleLabel("finance"), "Financeiro");
  assert.equal(roleLabel("redator", [{ id: "redator", label: "Redação", preset: "social" }]), "Redação");
  assert.equal(roleLabel("unknown"), "unknown");
  assert.equal(hasRole({ role: "redator" }, "social"), false);
});

test("legacy migration preserves users and references; multiple/custom jobs persist safely", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "v4-job-roles-"));
  // Set before the lazy database driver opens; never use .env.local or shared data.
  process.env.DATABASE_URL = `pglite://${dir}`;
  const { all, one, run, migrate, SCHEMA_VERSION } = await import("../src/lib/db");
  const {
    canManageSocial, createAuthUser, createJobRole, listAuthUsers, listJobRoles,
    updateUserProfile, validateUserRoles, verifyPassword,
  } = await import("../src/lib/auth");
  const { deleteUser, importClients, listUsers } = await import("../src/lib/repo");
  try {
    await run(`CREATE TABLE users (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('gt','account','coord','social')),
      login TEXT, password_hash TEXT, is_admin SMALLINT NOT NULL DEFAULT 0,
      active SMALLINT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    for (const [i, role] of ["gt", "account", "coord", "social"].entries()) {
      await run(`INSERT INTO users (name, role, login, password_hash, is_admin, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, '2025-01-01T12:00:00Z')`,
      [`Original ${role}`, role, `original-${role}`, `hash-${role}`, i === 2 ? 1 : 0, i === 3 ? 0 : 1]);
    }
    const before = await all("SELECT * FROM users ORDER BY id");
    await migrate();
    const after = await all<Record<string, unknown>>("SELECT * FROM users ORDER BY id");
    assert.deepEqual(after.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "roles"))), before);
    assert.deepEqual(after.map((u) => u.roles), [["gt"], ["account"], ["coord"], ["social"]]);
    assert.equal((await one<{ value: string }>("SELECT value FROM settings WHERE key = 'schema_version'"))?.value, SCHEMA_VERSION);
    assert.equal((await listJobRoles()).length, 7);

    await run("INSERT INTO sessions (token, user_id, expires_at) VALUES ('original-session', 1, now() + interval '1 day')");
    await run("INSERT INTO clients (name, account_type, gt_user_id, account_user_id) VALUES ('Original client', 'lead_gen', 1, 2)");
    await run("INSERT INTO performance_snapshots (client_id, ref_date, filled_by, data) VALUES (1, '2026-10-01', 1, '{\"leads_real\":42}')");

    const custom = { id: "redator", label: "Redação", preset: "social" };
    assert.deepEqual(await createJobRole(custom), custom);
    assert.equal(await createJobRole(custom), null);
    await assert.rejects(createJobRole({ ...custom, id: "invalid id" }));
    await assert.rejects(createJobRole({ ...custom, id: "other", preset: "redator" }));
    await assert.rejects(validateUserRoles("missing", ["gt"]));
    await assert.rejects(createAuthUser({ name: "Invalid", login: "invalid", role: "missing", password: "test", is_admin: false }));
    assert.equal((await listAuthUsers()).length, 4);

    await createAuthUser({ name: "Multi", login: "multi", role: "designer", roles: ["gt", "account", "social", "finance", "gt"], password: "Local-test-only", is_admin: false });
    const multi = (await listAuthUsers()).find((u) => u.login === "multi")!;
    assert.equal(multi.role, "designer");
    assert.deepEqual(multi.roles, ["designer", "gt", "account", "social", "finance"]);
    assert.equal(multi.is_admin, 0);
    assert.equal(canManageSocial(multi), true);
    for (const role of ["gt", "account", "designer", "social", "finance"]) {
      assert.equal((await listUsers(role)).some((u) => u.id === multi.id), true);
    }
    assert.equal((await listUsers("social")).some((u) => u.id === 4), false);
    assert.equal((await listUsers("social", { includeInactive: true })).some((u) => u.id === 4), true);
    const hash = await one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", [multi.id]);
    assert.equal(await verifyPassword("Local-test-only", hash!.password_hash), true);

    await updateUserProfile(multi.id, "Multi updated", "redator", undefined, ["finance", "designer"]);
    const updated = (await listAuthUsers()).find((u) => u.id === multi.id)!;
    assert.equal(updated.role, "redator");
    assert.deepEqual(updated.roles, ["redator", "finance", "designer"]);
    assert.equal(updated.is_admin, 0);
    assert.equal(canManageSocial(updated), false, "a Social screen preset must not grant Social permission");
    assert.equal(canManageSocial({ role: "finance", roles: ["designer"], is_admin: 0 }), false);
    assert.equal(canManageSocial({ role: "finance", is_admin: 1 }), true);
    assert.equal(canManageSocial({ role: "social", is_admin: 0 }), true);
    assert.equal((await listUsers("gt")).some((u) => u.id === multi.id), false);

    const persisted = await all("SELECT * FROM users ORDER BY id");
    await migrate({ force: true });
    await migrate({ force: true });
    assert.deepEqual(await all("SELECT * FROM users ORDER BY id"), persisted);
    assert.equal((await listJobRoles()).length, 8);
    assert.equal((await one<{ token: string }>("SELECT token FROM sessions WHERE user_id = 1"))?.token, "original-session");
    assert.deepEqual(await one("SELECT gt_user_id, account_user_id FROM clients WHERE id = 1"), { gt_user_id: 1, account_user_id: 2 });
    assert.deepEqual(await one("SELECT filled_by, data FROM performance_snapshots WHERE id = 1"), { filled_by: 1, data: { leads_real: 42 } });

    await t.test("spreadsheet import reuses a person through any of their job roles", async () => {
      const password = "Local-test-only";
      await createAuthUser({ name: "Bruno Coord", login: "bruno-coord", role: "coord", roles: ["gt"], password, is_admin: false });
      await createAuthUser({ name: "Bruno Gt", login: "bruno-gt", role: "gt", password, is_admin: false });
      await createAuthUser({ name: "Carla Ribeiro", login: "carla", role: "coord", roles: ["gt", "account"], password, is_admin: false });
      const ids = new Map((await listAuthUsers()).map((u) => [u.login, u.id]));
      const row = (name: string, gt: string | null, account: string | null): SheetClient =>
        ({ name, accountType: "lead_gen", mrr: 1000, gt, account, email: null, phone: null, mediaMonthly: null, start: null });
      const sheet = [row("Cliente Carla", "Carla", "Carla Ribeiro"), row("Cliente Bruno", "Bruno", "Diego Novo"), row("Cliente Diego", null, "Diego")];
      const count = async () => (await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM users"))!.n;
      const before = await count();

      const first = await importClients(sheet);
      assert.deepEqual(first.people, ["Diego Novo (Account)"], "only the genuinely new name becomes a team member");
      assert.equal(await count(), before + 1);
      const { id: diego, ...ghost } = (await one<{ id: number; role: string; roles: string[]; login: string | null }>(
        "SELECT id, role, roles, login FROM users WHERE name = 'Diego Novo'"))!;
      assert.deepEqual(ghost, { role: "account", roles: ["account"], login: null });
      const team = async (name: string) => one("SELECT gt_user_id, account_user_id FROM clients WHERE name = ?", [name]);
      assert.deepEqual(await team("Cliente Carla"), { gt_user_id: ids.get("carla"), account_user_id: ids.get("carla") });
      assert.deepEqual(await team("Cliente Bruno"), { gt_user_id: ids.get("bruno-gt"), account_user_id: diego }, "a primary match wins");
      assert.deepEqual(await team("Cliente Diego"), { gt_user_id: null, account_user_id: diego });

      const again = await importClients(sheet);
      assert.deepEqual(again.people, []);
      assert.equal(again.updated.length, 3);
      assert.equal(await count(), before + 1);
    });

    await t.test("deleting a person drops their saved screens and nobody else's", async () => {
      const victim = (await one<{ id: number }>("SELECT id FROM users WHERE name = 'Diego Novo'"))!.id;
      const layout = JSON.stringify({ version: 1, preset: "account", panels: [] });
      const mine = [workspaceStorageKey(victim, "carteira"), workspaceStorageKey(victim, "social-planejamento")];
      // Same digits as a prefix ("9" vs "90") must not match the LIKE pattern.
      const others = [workspaceStorageKey(1, "carteira"), workspaceStorageKey(Number(`${victim}0`), "carteira")];
      for (const key of [...mine, ...others]) {
        await run("INSERT INTO settings (key, value) VALUES (?, ?::jsonb)", [key, layout]);
      }
      assert.deepEqual(await deleteUser(victim), {});
      assert.equal(await one("SELECT id FROM users WHERE id = ?", [victim]), null);
      const left = await all<{ key: string }>("SELECT key FROM settings WHERE key LIKE 'workspace:%' ORDER BY key");
      assert.deepEqual(left.map((r) => r.key), [...others].sort());
      assert.equal((await one<{ value: string }>("SELECT value FROM settings WHERE key = 'schema_version'"))?.value, SCHEMA_VERSION);
    });

    await t.test("onboarding team progress carries every job of each person", async () => {
      const { teamProgress } = await import("../src/lib/onboarding/db");
      const carla = (await teamProgress()).find((u) => u.name === "Carla Ribeiro");
      assert.deepEqual(carla && { role: carla.role, roles: carla.roles }, { role: "coord", roles: ["coord", "gt", "account"] });
    });

    await t.test("demo seed hands its clients to whoever holds GT/Account, primary or additional", async () => {
      // Nobody keeps GT/Account as primary; Bruno Coord (GT) and Carla (GT, Account) hold them as additional jobs.
      await run("UPDATE users SET role = 'coord', roles = ARRAY['coord'] WHERE role IN ('gt', 'account')");
      const ids = new Map((await listAuthUsers()).map((u) => [u.login, u.id]));
      const { insertDemoData } = await import("../src/lib/seed");
      assert.equal(await insertDemoData(), 2);
      assert.deepEqual(await one("SELECT gt_user_id, account_user_id FROM clients WHERE name = 'Construtora Horizonte'"),
        { gt_user_id: ids.get("bruno-coord"), account_user_id: ids.get("carla") });
    });
    console.log("Verified fresh migration, legacy user preservation, 2 forced reruns, custom catalog, membership filters, password data and Social authorization.");
  } finally {
    const db = await (globalThis as typeof globalThis & { __pglite?: Promise<{ close(): Promise<void> }> }).__pglite;
    await db?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
