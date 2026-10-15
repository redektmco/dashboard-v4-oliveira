"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { loadWorkspace, resetWorkspace, saveWorkspace } from "@/actions/workspace";
import { BUILTIN_ROLES } from "@/lib/roles";
import {
  CUSTOM_PRESET, defaultLayout, displayWidths, isWorkspaceKey, isWorkspaceScreen, MAX_PANELS, movePanel, normalizeLayout, PAGE_PRESET,
  presetLayout, updatePanel, type PanelDefinition, type WorkspaceLayout, type WorkspaceScreen,
} from "@/lib/workspace/layout";
import { useWorkspace } from "./workspace-provider";

/** `empty`: nothing to show right now (e.g. a conditional alert); hidden outside edit mode so it takes no grid cell. */
export type ScreenModule = PanelDefinition & { content: ReactNode; empty?: boolean };
export type WorkspaceModule = ScreenModule;
export type ModularScreenProps = { screen: string; title?: string; modules: ScreenModule[] };
const buttonClass = "rounded-md border border-ink-700 px-3 py-2 text-xs font-medium text-ink-200 hover:bg-ink-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v4-red disabled:cursor-not-allowed disabled:opacity-40";
const INVALID_SAVED = "A configuração salva é inválida. Restaure o padrão para recuperá-la.";
const LOAD_ERROR = "Não foi possível carregar sua tela. Tente novamente.";

/** Server-rendered content is passed as slots; this component imports no screen data. */
export function ModularScreen(props: ModularScreenProps) {
  const workspace = useWorkspace();
  const valid = isWorkspaceScreen(props.screen) && props.modules.length <= MAX_PANELS &&
    props.modules.every((definition) => isWorkspaceKey(definition.id)) && new Set(props.modules.map((definition) => definition.id)).size === props.modules.length;
  if (!workspace || !valid) return <div className="space-y-5">{props.modules.map((definition, index) => <div key={`${definition.id}-${index}`} hidden={definition.empty}>{definition.content}</div>)}</div>;
  return <ScreenEditor key={`${workspace.user.id}:${props.screen}`} {...props} screen={props.screen as WorkspaceScreen} workspace={workspace} />;
}

function ScreenEditor({ screen, title, modules, workspace }: ModularScreenProps & { screen: WorkspaceScreen; workspace: NonNullable<ReturnType<typeof useWorkspace>> }) {
  const choices = [...workspace.jobRoles, ...BUILTIN_ROLES].filter((role, index, all) =>
    all.findIndex((candidate) => candidate.id === role.id) === index &&
    (BUILTIN_ROLES.some((builtin) => builtin.id === role.id) || role.id === workspace.user.role || workspace.user.roles?.includes(role.id)));
  // Preloaded by the root layout: the first paint already uses the saved layout (no action on mount).
  const [initial] = useState(() => {
    const preloaded = workspace.saved !== null;
    const stored = workspace.saved?.[screen];
    return { screen, preloaded, invalid: stored === null, defaults: defaultLayout(modules), stored: stored ?? null };
  });
  const [draft, setDraft] = useState<WorkspaceLayout>(initial.stored ?? initial.defaults);
  const [baseline, setBaseline] = useState<WorkspaceLayout>(initial.stored ?? initial.defaults);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(!initial.preloaded);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(initial.invalid ? INVALID_SAVED : "");
  const [loadFailed, setLoadFailed] = useState(initial.invalid);
  const [message, setMessage] = useState("");
  const [dragged, setDragged] = useState<string | null>(null);
  const request = useRef(0);
  const mounted = useRef(true);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const instructions = useId();
  const editorId = useId();
  const layout = normalizeLayout(draft, modules, initial.defaults);
  const normalizedBaseline = normalizeLayout(baseline, modules, initial.defaults);
  const dirty = JSON.stringify(layout) !== JSON.stringify(normalizedBaseline);
  const disabled = loading || pending;
  const byId = new Map(modules.map((definition) => [definition.id, definition]));
  const widths = displayWidths(layout.panels, (panel) => editing || (!panel.hidden && !byId.get(panel.id)?.empty));
  const presetValue = layout.preset === PAGE_PRESET || choices.some((role) => role.id === layout.preset) ? layout.preset : CUSTOM_PRESET;

  useEffect(() => {
    mounted.current = true;
    // Only when the preload failed: fall back to asking the server for this screen.
    if (initial.preloaded) return () => { mounted.current = false; };
    const current = ++request.current;
    loadWorkspace(initial.screen).then((result) => {
      if (!mounted.current || current !== request.current) return;
      if (result.ok) {
        setDraft(result.value ?? initial.defaults);
        setBaseline(result.value ?? initial.defaults);
      } else { setError(result.error); setLoadFailed(true); }
      setLoading(false);
    }).catch(() => {
      if (!mounted.current || current !== request.current) return;
      setError(LOAD_ERROR);
      setLoadFailed(true);
      setLoading(false);
    });
    return () => { mounted.current = false; };
  }, [initial]);

  async function retryLoad() {
    const current = ++request.current;
    setLoading(true);
    setError("");
    try {
      const result = await loadWorkspace(screen);
      if (!mounted.current || current !== request.current) return;
      if (result.ok) {
        setDraft(result.value ?? initial.defaults);
        setBaseline(result.value ?? initial.defaults);
        setLoadFailed(false);
        workspace.remember(screen, result.value ?? undefined);
        setMessage("Configuração carregada.");
      } else setError(result.error);
    } catch {
      if (mounted.current && current === request.current) setError(LOAD_ERROR);
    } finally { if (mounted.current && current === request.current) setLoading(false); }
  }

  function update(next: WorkspaceLayout, announcement: string) {
    if (disabled) return;
    setDraft(next);
    // While the saved layout could not be read, keep the warning and the retry button in view.
    if (!loadFailed) setError("");
    setMessage(announcement);
  }
  function move(id: string, target: number) {
    const next = movePanel(layout, id, target);
    if (next === layout) return;
    update(next, `${byId.get(id)?.label ?? id} movido para a posição ${next.panels.findIndex((panel) => panel.id === id) + 1}.`);
    requestAnimationFrame(() => handles.current.get(id)?.focus());
  }
  async function persist(reset = false) {
    if (disabled || (!reset && loadFailed)) return;
    const current = ++request.current;
    const snapshot = layout;
    setPending(true);
    setError("");
    setMessage(reset ? "Restaurando padrão…" : "Salvando…");
    try {
      const result = reset ? await resetWorkspace(screen) : await saveWorkspace(screen, snapshot);
      if (!mounted.current || current !== request.current) return;
      if (!result.ok) { setError(result.error); setMessage(""); return; }
      const saved = reset ? initial.defaults : snapshot;
      setDraft(saved);
      setBaseline(saved);
      setLoadFailed(false);
      workspace.remember(screen, reset ? undefined : snapshot);
      setMessage(reset ? "Padrão restaurado para esta tela." : "Tela salva para sua conta.");
    } catch {
      if (mounted.current && current === request.current) {
        setError("Não foi possível salvar. Suas alterações continuam aqui; tente novamente.");
        setMessage("");
      }
    } finally { if (mounted.current && current === request.current) setPending(false); }
  }

  return (
    <section aria-label={title ? `Organização: ${title}` : "Organização da tela"} className="min-w-0 space-y-4" data-workspace-screen={screen}>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p role="status" aria-live="polite" aria-atomic="true" className="mr-auto text-xs text-ink-400">
          {loading ? "Carregando organização…" : pending ? message : dirty ? `${message ? `${message} ` : ""}Alterações não salvas.` : message}
        </p>
        <button type="button" className={buttonClass} disabled={disabled} aria-expanded={editing} aria-controls={editorId} onClick={() => setEditing(!editing)}>
          {editing ? "Concluir edição" : "Personalizar tela"}
        </button>
      </div>
      {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-vermelho/40 bg-vermelho-dim p-3 text-sm text-vermelho-fg">
        <span>{error}</span>
        {loadFailed && <button type="button" className={buttonClass} disabled={disabled} onClick={retryLoad}>Tentar carregar novamente</button>}
      </div>}
      <div id={editorId} hidden={!editing} className="space-y-3 rounded-xl border border-ink-700 bg-ink-900 p-4">
        <p className="text-sm font-medium text-ink-100">Organize os módulos desta tela</p>
        <p id={instructions} className="text-xs text-ink-400">Arraste pela alça ou use as setas para mover. No teclado, use ↑ e ↓ na alça. No celular, use os botões. Modelos mudam a organização, sem alterar suas permissões.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-40 flex-col gap-1 text-xs text-ink-300">
            Modelo de visualização
            <select className="rounded-md border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100" value={presetValue} disabled={disabled} onChange={(event) => {
              if (event.target.value === PAGE_PRESET) { update(defaultLayout(modules), "Padrão da página aplicado. Salve para manter."); return; }
              const role = choices.find((choice) => choice.id === event.target.value);
              if (role) update(presetLayout(modules, role.id, role.preset), `Modelo ${role.label} aplicado. Salve para manter.`);
            }}>
              <option value={PAGE_PRESET}>Padrão da página</option>
              {choices.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}
              {presetValue === CUSTOM_PRESET && <option value={CUSTOM_PRESET}>Personalizado</option>}
            </select>
          </label>
          <button type="button" className={`${buttonClass} bg-v4-red text-white hover:bg-v4-red-600`} disabled={disabled || !dirty || loadFailed} onClick={() => persist()}>Salvar organização</button>
          <button type="button" className={buttonClass} disabled={disabled} onClick={() => persist(true)}>Restaurar padrão</button>
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-1 items-start gap-5 md:grid-cols-2">
        {layout.panels.map((panel, index) => {
          const definition = byId.get(panel.id)!;
          const width = widths.get(panel.id) ?? panel.width;
          return <div key={panel.id} data-workspace-module={panel.id} hidden={(panel.hidden || Boolean(definition.empty)) && !editing}
            className={`min-w-0 ${width === "full" ? "md:col-span-2" : "md:col-span-1"} ${editing ? "rounded-xl border border-dashed border-ink-600 p-3" : ""} ${dragged === panel.id ? "opacity-50" : ""}`}
            onDragOver={(event) => { if (editing && dragged && !disabled) event.preventDefault(); }}
            onDrop={(event) => {
              if (!editing || !dragged || disabled) return;
              event.preventDefault();
              move(dragged, index);
              setDragged(null);
            }}>
            {editing && <div className="mb-3 flex flex-wrap items-center gap-2">
              <button ref={(element) => { if (element) handles.current.set(panel.id, element); else handles.current.delete(panel.id); }}
                type="button" className={`${buttonClass} cursor-grab touch-auto`} disabled={disabled} draggable={!disabled}
                aria-label={`Mover ${definition.label}`} aria-describedby={instructions}
                onDragStart={(event) => { setDragged(panel.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", panel.id); }}
                onDragEnd={() => setDragged(null)} onKeyDown={(event) => {
                  const target = event.key === "ArrowUp" ? index - 1 : event.key === "ArrowDown" ? index + 1 : event.key === "Home" ? 0 : event.key === "End" ? layout.panels.length - 1 : null;
                  if (target !== null) { event.preventDefault(); move(panel.id, target); }
                }}>⠿</button>
              <span className="mr-auto text-xs font-semibold text-ink-200">
                {definition.label}{panel.hidden ? " (oculto)" : ""}{definition.empty ? " (vazio agora)" : ""}
                {panel.width === "half" && width === "full" && <span className="font-normal text-ink-400"> · sem par ao lado, ocupa a linha</span>}
              </span>
              <button type="button" className={buttonClass} disabled={disabled || index === 0} aria-label={`Mover ${definition.label} para cima`} onClick={() => move(panel.id, index - 1)}>↑</button>
              <button type="button" className={buttonClass} disabled={disabled || index === layout.panels.length - 1} aria-label={`Mover ${definition.label} para baixo`} onClick={() => move(panel.id, index + 1)}>↓</button>
              <select aria-label={`Largura de ${definition.label}`} className="rounded-md border border-ink-700 bg-ink-950 px-2 py-2 text-xs text-ink-200" value={panel.width} disabled={disabled} onChange={(event) => update(updatePanel(layout, panel.id, { width: event.target.value === "half" ? "half" : "full" }), `Largura de ${definition.label} alterada.`)}>
                <option value="full">Largura inteira</option><option value="half">Meia largura</option>
              </select>
              <button type="button" className={buttonClass} disabled={disabled} aria-label={`${panel.hidden ? "Exibir" : "Ocultar"} ${definition.label}`} onClick={() => update(updatePanel(layout, panel.id, { hidden: !panel.hidden }), `${definition.label} ${panel.hidden ? "exibido" : "oculto"}.`)}>{panel.hidden ? "Exibir" : "Ocultar"}</button>
            </div>}
            {/* Keep this keyed slot mounted so input/filter state survives edits. */}
            <div hidden={panel.hidden}>{definition.content}</div>
          </div>;
        })}
      </div>
    </section>
  );
}
