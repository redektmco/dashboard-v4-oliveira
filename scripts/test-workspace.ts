import assert from "node:assert/strict";
import { test } from "node:test";
import { isWorkspaceKey, MAX_PANELS, movePanel, normalizeLayout, parseWorkspaceLayout, presetLayout, workspaceStorageKey, type PanelDefinition } from "../src/lib/workspace/layout";

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
