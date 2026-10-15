/** Presentation preferences only. Presets never change application permissions. */
export type PanelWidth = "full" | "half";
/** `group`: modules that control each other (filters + the list they filter) move together in presets. */
export type PanelDefinition = { id: string; label: string; kind?: string; defaultWidth?: PanelWidth; group?: string };
export type PanelLayout = { id: string; width: PanelWidth; hidden: boolean };
export type WorkspaceLayout = { version: 1; preset: string; panels: PanelLayout[] };
export const MAX_PANELS = 64;
export const MAX_LAYOUT_BYTES = 16_384;
const SAFE_KEY = /^[a-z][a-z0-9._-]{0,79}$/i;
export function isWorkspaceKey(value: unknown): value is string {
  return typeof value === "string" && SAFE_KEY.test(value) && !["__proto__", "constructor", "prototype"].includes(value);
}
/** The only screens that may store a layout; anything else is rejected before touching the database. */
export const WORKSPACE_SCREENS = ["carteira", "churn", "checkin", "cobranca", "clientes", "performance", "relatorios", "social", "social-planejamento"] as const;
export type WorkspaceScreen = (typeof WORKSPACE_SCREENS)[number];
export function isWorkspaceScreen(value: unknown): value is WorkspaceScreen {
  return typeof value === "string" && (WORKSPACE_SCREENS as readonly string[]).includes(value);
}
/** Dotted keys never collide with job role ids (^[a-z][a-z0-9_-]{1,47}$). */
export const PAGE_PRESET = "page.default";
export const CUSTOM_PRESET = "user.custom";
export function workspaceStoragePrefix(userId: number): string {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("Identificador inválido.");
  return `workspace:v1:user:${userId}:screen:`;
}
export function workspaceStorageKey(userId: number, screen: string): string {
  if (!isWorkspaceKey(screen)) throw new Error("Identificador inválido.");
  return `${workspaceStoragePrefix(userId)}${screen}`;
}
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
/** Reject malformed input instead of silently persisting a partially valid request. */
export function parseWorkspaceLayout(value: unknown): WorkspaceLayout | null {
  try {
    if (!isRecord(value) || !exactKeys(value, ["version", "preset", "panels"]) || value.version !== 1 ||
      !isWorkspaceKey(value.preset) || !Array.isArray(value.panels) || value.panels.length > MAX_PANELS ||
      JSON.stringify(value).length > MAX_LAYOUT_BYTES) return null;
    const seen = new Set<string>();
    const panels: PanelLayout[] = [];
    for (const item of value.panels) {
      if (!isRecord(item) || !exactKeys(item, ["id", "width", "hidden"]) || !isWorkspaceKey(item.id) ||
        seen.has(item.id) || (item.width !== "full" && item.width !== "half") || typeof item.hidden !== "boolean") return null;
      seen.add(item.id);
      panels.push({ id: item.id, width: item.width, hidden: item.hidden });
    }
    return { version: 1, preset: value.preset, panels };
  } catch { return null; }
}
const PRIORITIES: Record<string, string[]> = {
  coord: ["overview", "metrics", "priorities", "filters", "list", "calendar", "finance", "activity"],
  social: ["priorities", "calendar", "filters", "list", "overview", "metrics", "activity", "finance"],
  gt: ["metrics", "filters", "priorities", "list", "overview", "activity", "calendar", "finance"],
  account: ["priorities", "overview", "filters", "list", "calendar", "activity", "metrics", "finance"],
  designer: ["priorities", "list", "calendar", "filters", "overview", "activity", "metrics", "finance"],
  crm: ["metrics", "priorities", "filters", "list", "activity", "overview", "calendar", "finance"],
  finance: ["finance", "metrics", "filters", "list", "priorities", "overview", "calendar", "activity"],
};
const initialPanels = (modules: PanelDefinition[]): PanelLayout[] =>
  modules.map((definition) => ({ id: definition.id, width: definition.defaultWidth ?? "full", hidden: false }));
/** The page as written: module order of the screen, default widths, nothing hidden. */
export function defaultLayout(modules: PanelDefinition[]): WorkspaceLayout {
  return { version: 1, preset: PAGE_PRESET, panels: initialPanels(modules) };
}
/** A role model reorders by kind, but a group (controller + what it controls) moves as one block in written order. */
export function presetLayout(modules: PanelDefinition[], preset = "coord", inheritedPreset = preset): WorkspaceLayout {
  const order = Object.hasOwn(PRIORITIES, inheritedPreset) ? PRIORITIES[inheritedPreset] : PRIORITIES.coord;
  const rank = (kind?: string) => { const index = order.indexOf(kind ?? ""); return index < 0 ? order.length : index; };
  const blocks: { rank: number; index: number; members: PanelDefinition[] }[] = [];
  const byGroup = new Map<string, (typeof blocks)[number]>();
  modules.forEach((definition, index) => {
    const block = definition.group ? byGroup.get(definition.group) : undefined;
    if (block) { block.members.push(definition); block.rank = Math.min(block.rank, rank(definition.kind)); return; }
    const created = { rank: rank(definition.kind), index, members: [definition] };
    blocks.push(created);
    if (definition.group) byGroup.set(definition.group, created);
  });
  return {
    version: 1,
    preset: isWorkspaceKey(preset) ? preset : "coord",
    panels: initialPanels(blocks.sort((a, b) => a.rank - b.rank || a.index - b.index).flatMap((block) => block.members)),
  };
}
/** New modules appear; removed/unauthorized modules can never be restored from storage. */
export function normalizeLayout(value: WorkspaceLayout | null, modules: PanelDefinition[], fallback: WorkspaceLayout): WorkspaceLayout {
  const allowed = new Map(modules.map((definition) => [definition.id, definition]));
  const source = parseWorkspaceLayout(value) ?? fallback;
  const panels = source.panels.filter((panel) => allowed.has(panel.id)).map((panel) => ({ ...panel }));
  const seen = new Set(panels.map((panel) => panel.id));
  for (const definition of modules) if (!seen.has(definition.id)) panels.push({ id: definition.id, width: definition.defaultWidth ?? "full", hidden: false });
  return { version: 1, preset: source.preset, panels };
}
export function movePanel(layout: WorkspaceLayout, id: string, targetIndex: number): WorkspaceLayout {
  const index = layout.panels.findIndex((panel) => panel.id === id);
  if (index < 0 || !Number.isInteger(targetIndex)) return layout;
  const destination = Math.max(0, Math.min(layout.panels.length - 1, targetIndex));
  if (index === destination) return layout;
  const panels = [...layout.panels];
  const [panel] = panels.splice(index, 1);
  panels.splice(destination, 0, panel);
  return { ...layout, preset: CUSTOM_PRESET, panels };
}
/** Manual width/visibility edits; like moving, they turn the layout into a personal one. */
export function updatePanel(layout: WorkspaceLayout, id: string, patch: Partial<Pick<PanelLayout, "width" | "hidden">>): WorkspaceLayout {
  if (!layout.panels.some((panel) => panel.id === id)) return layout;
  return { ...layout, preset: CUSTOM_PRESET, panels: layout.panels.map((panel) => panel.id === id ? { ...panel, ...patch } : panel) };
}
/**
 * Width actually drawn in the two-column grid. A half-width module only stays half when the next visible
 * module is also half (they share a row); otherwise it would sit alone next to a blank cell, so it takes
 * the whole row. Applies to saved layouts too; the stored width is never changed.
 */
export function displayWidths(panels: PanelLayout[], visible: (panel: PanelLayout) => boolean = (panel) => !panel.hidden): Map<string, PanelWidth> {
  const shown = panels.filter(visible);
  const widths = new Map<string, PanelWidth>(panels.map((panel) => [panel.id, panel.width]));
  for (let index = 0; index < shown.length; index++) {
    if (shown[index].width !== "half") continue;
    if (shown[index + 1]?.width === "half") { index++; continue; }
    widths.set(shown[index].id, "full");
  }
  return widths;
}
