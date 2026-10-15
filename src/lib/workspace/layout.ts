/** Presentation preferences only. Presets never change application permissions. */
export type PanelWidth = "full" | "half";
export type PanelDefinition = { id: string; label: string; kind?: string; defaultWidth?: PanelWidth };
export type PanelLayout = { id: string; width: PanelWidth; hidden: boolean };
export type WorkspaceLayout = { version: 1; preset: string; panels: PanelLayout[] };
export const MAX_PANELS = 64;
export const MAX_LAYOUT_BYTES = 16_384;
const SAFE_KEY = /^[a-z][a-z0-9._-]{0,79}$/i;
export function isWorkspaceKey(value: unknown): value is string {
  return typeof value === "string" && SAFE_KEY.test(value) && !["__proto__", "constructor", "prototype"].includes(value);
}
export function workspaceStorageKey(userId: number, screen: string): string {
  if (!Number.isSafeInteger(userId) || userId < 1 || !isWorkspaceKey(screen)) throw new Error("Identificador inválido.");
  return `workspace:v1:user:${userId}:screen:${screen}`;
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
export function presetLayout(modules: PanelDefinition[], preset = "coord", inheritedPreset = preset): WorkspaceLayout {
  const order = Object.hasOwn(PRIORITIES, inheritedPreset) ? PRIORITIES[inheritedPreset] : PRIORITIES.coord;
  const rank = (kind?: string) => { const index = order.indexOf(kind ?? ""); return index < 0 ? order.length : index; };
  return {
    version: 1,
    preset: isWorkspaceKey(preset) ? preset : "coord",
    panels: modules.map((definition, index) => ({ definition, index })).sort((a, b) => rank(a.definition.kind) - rank(b.definition.kind) || a.index - b.index)
      .map(({ definition }) => ({ id: definition.id, width: definition.defaultWidth ?? "full", hidden: false })),
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
  return { ...layout, panels };
}
