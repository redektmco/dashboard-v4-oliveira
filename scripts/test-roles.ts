/** Isolated role and migration regressions: npx tsx --test scripts/test-roles.ts. */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BUILTIN_ROLES, hasRole, roleLabel } from "../src/lib/roles";

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

test("legacy migration preserves users and references; multiple/custom jobs persist safely", async () => {
  const dir = await mkdtemp(join(tmpdir(), "v4-job-roles-"));
  // Set before the lazy database driver opens; never use .env.local or shared data.
  process.env.DATABASE_URL = `pglite://${dir}`;
  const { all, one, run, migrate, SCHEMA_VERSION } = await import("../src/lib/db");
  const {
    canManageSocial, createAuthUser, createJobRole, listAuthUsers, listJobRoles,
    updateUserProfile, validateUserRoles, verifyPassword,
  } = await import("../src/lib/auth");
  const { listUsers } = await import("../src/lib/repo");
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
    console.log("Verified fresh migration, legacy user preservation, 2 forced reruns, custom catalog, membership filters, password data and Social authorization.");
  } finally {
    const db = await (globalThis as typeof globalThis & { __pglite?: Promise<{ close(): Promise<void> }> }).__pglite;
    await db?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
