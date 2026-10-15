import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BUILTIN_ROLES } from "../src/lib/roles";
import {
  CUSTOM_PRESET, defaultLayout, displayWidths, isWorkspaceKey, isWorkspaceScreen, MAX_PANELS, movePanel, normalizeLayout, PAGE_PRESET,
  parseWorkspaceLayout, presetLayout, updatePanel, WORKSPACE_SCREENS, workspaceStorageKey, workspaceStoragePrefix, type PanelDefinition, type PanelLayout,
} from "../src/lib/workspace/layout";

const modules: PanelDefinition[] = [
  { id: "clients", label: "Clientes", kind: "list" },
  { id: "health", label: "Saúde", kind: "metrics", defaultWidth: "half" },
  { id: "payments", label: "Financeiro", kind: "finance", defaultWidth: "half" },
  { id: "week", label: "Agenda", kind: "calendar" },
  { id: "priority", label: "Prioridades", kind: "priorities" },
];

test("role presets prioritize their work and inherit custom role views", () => {
  assert.equal(presetLayout(modules, "finance").panels[0].id, "payments");
  assert.equal(presetLayout(modules, "social").panels[0].id, "priority");
  assert.equal(presetLayout(modules, "gt").panels[0].id, "health");
  const custom = presetLayout(modules, "studio", "designer");
  assert.equal(custom.preset, "studio");
  assert.deepEqual(custom.panels, presetLayout(modules, "designer").panels);
  assert.ok(custom.panels.every((panel) => !panel.hidden));
  assert.equal(custom.panels.find((panel) => panel.id === "health")?.width, "half");
});

test("unknown kinds and presets retain stable fallback ordering", () => {
  const unfamiliar = [{ id: "custom", label: "Custom", kind: "anything/new" }, { id: "other", label: "Other", kind: "__proto__" }];
  assert.deepEqual(presetLayout(unfamiliar, "unknown", "__proto__").panels.map((panel) => panel.id), ["custom", "other"]);
});

test("moving a panel preserves preferences, identity and original layout", () => {
  const source = presetLayout(modules, "finance");
  source.panels[0].hidden = true;
  const original = structuredClone(source);
  const moved = movePanel(source, "payments", 3);
  assert.equal(moved.panels[3], source.panels[0]);
  assert.equal(moved.panels[3].hidden, true);
  assert.equal(moved.panels[3].width, "half");
  assert.deepEqual(source, original);
  assert.equal(moved.preset, CUSTOM_PRESET, "a manual move is no longer the role model");
  assert.deepEqual(moved.panels.map((panel) => panel.id).sort(), source.panels.map((panel) => panel.id).sort());
  assert.equal(movePanel(source, "absent", 1), source);
  assert.equal(movePanel(source, "payments", Number.NaN), source);
  assert.equal(movePanel(source, "payments", -50), source);
  assert.equal(movePanel(source, "payments", 100).panels.at(-1)?.id, "payments");
});

test("normalization drops unavailable modules, preserves edits and adds new modules", () => {
  const saved = presetLayout(modules, "finance");
  saved.panels[0].hidden = true;
  saved.panels[0].width = "full";
  const current = [modules[2], { id: "new", label: "Novo", defaultWidth: "half" as const }];
  const normalized = normalizeLayout(saved, current, presetLayout(current));
  assert.deepEqual(normalized.panels, [{ id: "payments", hidden: true, width: "full" }, { id: "new", hidden: false, width: "half" }]);
  assert.equal(normalized.preset, "finance");
  assert.deepEqual(normalizeLayout(null, modules, presetLayout(modules)), presetLayout(modules));
});

test("valid layouts round trip without retaining input object references", () => {
  const source = presetLayout(modules, "social");
  const parsed = parseWorkspaceLayout(JSON.parse(JSON.stringify(source)));
  assert.deepEqual(parsed, source);
  assert.notEqual(parsed?.panels, source.panels);
  assert.deepEqual(parseWorkspaceLayout({ version: 1, preset: "coord", panels: [] }), { version: 1, preset: "coord", panels: [] });
});

test("invalid layout shapes, duplicate ids, unsafe keys and unsupported widths are rejected", () => {
  const valid = presetLayout(modules);
  const invalid: unknown[] = [null, undefined, "{bad json", JSON.stringify(valid), [], {},
    { ...valid, version: 2 }, { ...valid, userId: 42 }, { ...valid, preset: "../finance" },
    { ...valid, panels: Array(MAX_PANELS + 1).fill(valid.panels[0]) },
    { ...valid, panels: [valid.panels[0], valid.panels[0]] },
    { ...valid, panels: [{ ...valid.panels[0], width: "wide" }] },
    { ...valid, panels: [{ ...valid.panels[0], hidden: "false" }] },
    { ...valid, panels: [{ ...valid.panels[0], id: "__proto__" }] },
    { ...valid, panels: [{ ...valid.panels[0], id: "x".repeat(81) }] },
    { ...valid, panels: [{ ...valid.panels[0], payload: "extra" }] },
    { ...valid, panels: [new Date()] },
    Object.assign(new Date(), valid),
  ];
  for (const value of invalid) assert.equal(parseWorkspaceLayout(value), null, `Rejected ${String(value)}`);
  const cyclic = { ...valid, panels: [] as unknown[] }; cyclic.panels.push(cyclic);
  assert.equal(parseWorkspaceLayout(cyclic), null);
});

test("storage keys isolate users and screens, and reject traversal or invalid user scope", () => {
  assert.equal(workspaceStorageKey(7, "home"), "workspace:v1:user:7:screen:home");
  assert.notEqual(workspaceStorageKey(7, "home"), workspaceStorageKey(8, "home"));
  assert.notEqual(workspaceStorageKey(7, "home"), workspaceStorageKey(7, "crm"));
  for (const screen of ["../config", "a:b", "", "constructor", "prototype", "a/b", "x".repeat(81)]) {
    assert.equal(isWorkspaceKey(screen), false);
    assert.throws(() => workspaceStorageKey(7, screen));
  }
  for (const userId of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => workspaceStorageKey(userId, "home"));
});

test("the default layout is the page as written: module order, default widths, nothing hidden", () => {
  const page = defaultLayout(modules);
  assert.equal(page.preset, PAGE_PRESET);
  assert.deepEqual(page.panels, modules.map((definition) => ({ id: definition.id, width: definition.defaultWidth ?? "full", hidden: false })));
  assert.deepEqual(parseWorkspaceLayout(JSON.parse(JSON.stringify(page))), page);
  // Nothing saved -> the page as written (no role, no kind ranking).
  assert.deepEqual(normalizeLayout(null, modules, page), page);
  for (const role of BUILTIN_ROLES) assert.notEqual(role.id, PAGE_PRESET);
});

test("page/personal preset keys are storable and never collide with job role ids", () => {
  const roleId = /^[a-z][a-z0-9_-]{1,47}$/;
  for (const key of [PAGE_PRESET, CUSTOM_PRESET]) {
    assert.equal(isWorkspaceKey(key), true);
    assert.equal(roleId.test(key), false);
  }
  assert.notEqual(PAGE_PRESET, CUSTOM_PRESET);
});

test("role models never separate a controller from what it controls", () => {
  // Shapes of /clientes and /social/planejamento: tabs + filters + list, and bar + calendar + selected day.
  const screens: PanelDefinition[][] = [[
    { id: "overview", label: "Resumo", kind: "metrics" },
    { id: "views", label: "Abas", kind: "overview", group: "clientes" },
    { id: "filters", label: "Filtros", kind: "filters", group: "clientes" },
    { id: "clients", label: "Lista", kind: "list", group: "clientes" },
  ], [
    { id: "filters", label: "Barra", kind: "filters", group: "agenda" },
    { id: "calendar", label: "Calendário", kind: "calendar", group: "agenda" },
    { id: "selected", label: "Dia", kind: "activity", group: "agenda" },
  ], [
    { id: "pending", label: "Alerta", kind: "priorities" },
    { id: "metrics", label: "Resumo", kind: "finance" },
    { id: "filters", label: "Próximos/Histórico", kind: "filters", group: "cobrancas" },
    { id: "charges", label: "Cobranças", kind: "list", group: "cobrancas" },
  ]];
  for (const screen of screens) {
    for (const role of [...BUILTIN_ROLES, { id: "studio", preset: "unknown" }]) {
      const ids = presetLayout(screen, role.id, role.preset).panels.map((panel) => panel.id);
      for (const group of new Set(screen.map((definition) => definition.group).filter(Boolean))) {
        const written = screen.filter((definition) => definition.group === group).map((definition) => definition.id);
        const start = ids.indexOf(written[0]);
        assert.deepEqual(ids.slice(start, start + written.length), written, `${role.id}: ${ids.join(" > ")}`);
      }
    }
  }
  // The block still moves as a whole: designer puts the list first.
  assert.deepEqual(presetLayout(screens[0], "designer").panels.map((panel) => panel.id), ["views", "filters", "clients", "overview"]);
});

test("manual width/visibility edits mark the layout as personal without mutating it", () => {
  const source = presetLayout(modules, "finance");
  const original = structuredClone(source);
  const narrowed = updatePanel(source, "clients", { width: "half" });
  assert.equal(narrowed.preset, CUSTOM_PRESET);
  assert.equal(narrowed.panels.find((panel) => panel.id === "clients")?.width, "half");
  const hidden = updatePanel(narrowed, "week", { hidden: true });
  assert.equal(hidden.panels.find((panel) => panel.id === "week")?.hidden, true);
  assert.equal(updatePanel(source, "absent", { hidden: true }), source);
  assert.deepEqual(source, original);
});

test("a half-width module without a visible half-width partner is drawn full width", () => {
  const row = (spec: string): PanelLayout[] => [...spec].map((code, index) => ({ id: `m${index}`, width: code.toLowerCase() === "h" ? "half" : "full", hidden: code === "H" || code === "F" }));
  const drawn = (panels: PanelLayout[], visible?: (panel: PanelLayout) => boolean) => panels.map((panel) => displayWidths(panels, visible).get(panel.id)).join(",");
  assert.equal(drawn(row("hh")), "half,half");
  assert.equal(drawn(row("fhf")), "full,full,full");
  assert.equal(drawn(row("hhh")), "half,half,full", "the third half has no partner left in its row");
  assert.equal(drawn(row("hHh")), "half,half,half", "hidden modules take no cell, so the outer halves pair up");
  assert.equal(drawn(row("hhfh")), "half,half,full,full");
  // Saved layouts too; in edit mode hidden modules are shown, so they count again.
  assert.equal(drawn(row("hHh"), () => true), "half,half,full");
  // Empty modules are passed as invisible by the screen.
  assert.equal(drawn(row("hhh"), (panel) => panel.id !== "m1"), "half,half,half");
  const stored = row("fh");
  displayWidths(stored);
  assert.equal(stored[1].width, "half", "the stored preference is never rewritten");
});

test("only the real screens can store a layout", () => {
  assert.deepEqual([...WORKSPACE_SCREENS].sort(), ["carteira", "checkin", "churn", "clientes", "cobranca", "performance", "relatorios", "social", "social-planejamento"]);
  for (const screen of WORKSPACE_SCREENS) {
    assert.equal(isWorkspaceScreen(screen), true);
    assert.equal(isWorkspaceKey(screen), true);
  }
  for (const screen of ["home", "crm", "carteira2", "Carteira", "", "__proto__", "constructor", "x".repeat(81), 7, null]) assert.equal(isWorkspaceScreen(screen), false);
  assert.equal(workspaceStoragePrefix(7), "workspace:v1:user:7:screen:");
  assert.ok(workspaceStorageKey(7, "carteira").startsWith(workspaceStoragePrefix(7)));
  assert.throws(() => workspaceStoragePrefix(0));
});

test("saved layouts are preloaded per user: real screens only, invalid values flagged", async () => {
  const dir = await mkdtemp(join(tmpdir(), "v4-workspace-"));
  // Set before the lazy database driver opens; never use .env.local or shared data.
  process.env.DATABASE_URL = `pglite://${dir}`;
  const { migrate, run } = await import("../src/lib/db");
  const { loadSavedWorkspaces } = await import("../src/lib/workspace/saved");
  try {
    await migrate();
    const saved = { ...presetLayout(modules, "gt"), preset: CUSTOM_PRESET };
    const put = (userId: number, screen: string, value: unknown) =>
      run("INSERT INTO settings (key, value) VALUES (?, ?::jsonb)", [`${workspaceStoragePrefix(userId)}${screen}`, JSON.stringify(value)]);
    await put(7, "carteira", saved);
    await put(7, "churn", { version: 2, preset: "coord", panels: [] });
    await put(7, "home", saved);
    await put(70, "social", saved);
    await put(8, "checkin", saved);
    assert.deepEqual(await loadSavedWorkspaces(7), { carteira: saved, churn: null });
    assert.deepEqual(await loadSavedWorkspaces(70), { social: saved });
    assert.deepEqual(await loadSavedWorkspaces(9), {});
    await assert.rejects(loadSavedWorkspaces(0));
  } finally {
    const db = await (globalThis as typeof globalThis & { __pglite?: Promise<{ close(): Promise<void> }> }).__pglite;
    await db?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
