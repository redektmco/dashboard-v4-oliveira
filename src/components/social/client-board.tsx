"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/icon";
import {
  clientKeyOf,
  groupByClient,
  matchesClientQuery,
  type ArchivedCard,
  type ClientGroup,
  type ProjectCard,
} from "@/lib/social/clients";
import { ClientCover, ClientCoverModal } from "./client-cover";
import { ArchivedDrawer, ProjectList, Scoreboard, type BoardView } from "./project-list";

/**
 * A visualização escolhida é preferência de quem usa, não da sessão: fica no
 * navegador. Lida por `useSyncExternalStore` (como a origem do link no
 * workspace) — no servidor vale a grade e o React troca no hydrate, sem
 * efeito nem render em cascata.
 */
const VIEW_KEY = "social:projetos:view";
const viewListeners = new Set<() => void>();
let viewCache: BoardView | null = null;

function readView(): BoardView {
  if (!viewCache) {
    try {
      viewCache = localStorage.getItem(VIEW_KEY) === "lista" ? "lista" : "grade";
    } catch {
      viewCache = "grade"; // navegador sem storage
    }
  }
  return viewCache;
}

function subscribeView(onChange: () => void) {
  viewListeners.add(onChange);
  return () => {
    viewListeners.delete(onChange);
  };
}

function pickView(v: BoardView) {
  viewCache = v;
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* preferência não persistida — não é motivo para falhar */
  }
  for (const fn of viewListeners) fn();
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Grade ou lista — a escolha fica salva no navegador de quem usa. */
function ViewToggle({ view, onChange }: { view: BoardView; onChange: (v: BoardView) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="Visualização">
      <button type="button" className="chip" aria-pressed={view === "grade"} onClick={() => onChange("grade")}>
        <Icon name="grid" size={14} />
        Grade
      </button>
      <button type="button" className="chip" aria-pressed={view === "lista"} onClick={() => onChange("lista")}>
        <Icon name="listCheck" size={14} />
        Lista
      </button>
    </div>
  );
}

/**
 * A aba Projetos em dois degraus: primeiro o CLIENTE, depois os
 * planejamentos dele. Era uma lista única de projetos — com vários clientes
 * na carteira, achar "o que está pendente na Padaria Estrela" virava leitura
 * linha por linha.
 *
 * O primeiro degrau tem grade (com uma capa por cliente) ou lista densa; o
 * segundo reaproveita a lista de projetos, com as mesmas ações no ⋯.
 */
export function ClientBoard({
  projects,
  archived,
  covers,
  canManage,
}: {
  projects: ProjectCard[];
  archived: ArchivedCard[];
  covers: Record<string, string>;
  canManage: boolean;
}) {
  const view = useSyncExternalStore(subscribeView, readView, (): BoardView => "grade");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [coverOf, setCoverOf] = useState<ClientGroup | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const groups = useMemo(() => groupByClient(projects, covers), [projects, covers]);
  const visible = useMemo(() => groups.filter((g) => matchesClientQuery(g, query)), [groups, query]);

  // O cliente aberto pode ter sumido do recorte (último projeto arquivado ou
  // excluído em outra aba): sem grupo, a tela volta para o primeiro degrau.
  const open = openKey ? groups.find((g) => g.key === openKey) ?? null : null;
  const openArchived = open ? archived.filter((a) => clientKeyOf(a) === open.key) : [];

  const coverModal = coverOf ? (
    <ClientCoverModal
      open
      onClose={() => setCoverOf(null)}
      clientKey={coverOf.key}
      name={coverOf.clientName}
      imageUrl={coverOf.imageUrl}
    />
  ) : null;

  if (open) {
    return (
      <section className="panel">
        <header className="border-b border-[var(--border-hair)] px-4 py-3.5 sm:px-5">
          <button type="button" className="btn btn-sm btn-ghost -ml-2" onClick={() => setOpenKey(null)}>
            <Icon name="chevronLeft" size={14} />
            Todos os clientes
          </button>
          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            {canManage ? (
              <button
                type="button"
                className="shrink-0 rounded-md"
                onClick={() => setCoverOf(open)}
                title={open.imageUrl ? "Trocar a capa" : "Adicionar uma capa"}
                aria-label={`${open.imageUrl ? "Trocar" : "Adicionar"} a capa de ${open.clientName}`}
              >
                <ClientCover name={open.clientName} imageUrl={open.imageUrl} className="sm-thumb--badge" monogramSize={14} />
              </button>
            ) : (
              <ClientCover name={open.clientName} imageUrl={open.imageUrl} className="sm-thumb--badge" monogramSize={14} />
            )}
            <div className="min-w-0">
              <h2 className="truncate font-display text-[16px] font-semibold text-ink-100">{open.clientName}</h2>
              <p className="mt-0.5 truncate text-[12.5px] text-ink-400">
                {plural(open.projects.length, "planejamento", "planejamentos")}
                {open.handles.length > 0 && ` · @${open.handles.join(" · @")}`}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden sm:block">
                <Scoreboard p={open} />
              </div>
              <ViewToggle view={view} onChange={pickView} />
            </div>
          </div>
        </header>

        <ProjectList projects={open.projects} canManage={canManage} view={view} />

        {openArchived.length > 0 && <ArchivedDrawer archived={openArchived} canManage={canManage} />}

        {coverModal}
      </section>
    );
  }

  return (
    <section className="panel">
      <header className="flex flex-col gap-3 border-b border-[var(--border-hair)] px-4 py-3.5 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[16px] font-semibold text-ink-100">Clientes</h2>
            <p className="mt-0.5 text-[12.5px] text-ink-400">
              {plural(groups.length, "cliente", "clientes")} · {plural(projects.length, "planejamento ativo", "planejamentos ativos")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ViewToggle view={view} onChange={pickView} />
            {archived.length > 0 && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}>
                <Icon name="lock" size={13} />
                Arquivados ({archived.length})
              </button>
            )}
          </div>
        </div>

        {groups.length > 1 && (
          <div className="relative">
            <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
            <input
              className="field w-full pl-9"
              type="search"
              placeholder="Buscar cliente, @ ou planejamento"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar cliente"
            />
          </div>
        )}
      </header>

      {groups.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <Icon name="image" size={28} className="mx-auto text-ink-600" />
          <p className="mt-2 text-sm font-semibold text-ink-200">Nenhum projeto ativo</p>
          <p className="mt-1 text-[13px] text-ink-500">
            {canManage
              ? "Crie o primeiro em “Novo projeto” — o link do cliente sai na hora."
              : "Assim que o time de social criar um projeto, ele aparece aqui."}
          </p>
        </div>
      ) : visible.length === 0 ? (
        <p className="px-5 py-12 text-center text-[13px] text-ink-500">Nenhum cliente nessa busca.</p>
      ) : view === "grade" ? (
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:px-5 xl:grid-cols-3">
          {visible.map((g) => (
            <div
              key={g.key}
              className="panel group relative flex flex-col transition-colors duration-[120ms] hover:border-[var(--border-strong)]"
            >
              {/* O cartão todo abre o cliente; o botão da capa fica acima dele. */}
              <button
                type="button"
                className="absolute inset-0 z-[1] cursor-pointer"
                onClick={() => setOpenKey(g.key)}
                aria-label={`Abrir ${g.clientName}`}
              />
              <ClientCover name={g.clientName} imageUrl={g.imageUrl} />
              <div className="flex flex-1 flex-col p-3.5">
                <h3 className="truncate font-display text-[15px] font-semibold text-ink-100">{g.clientName}</h3>
                <p className="mt-0.5 truncate text-[12px] text-ink-400">
                  {g.handles.length > 0 && `@${g.handles[0]} · `}
                  {plural(g.projects.length, "planejamento", "planejamentos")}
                </p>
                <div className="mt-2.5">
                  <Scoreboard p={g} />
                </div>
              </div>
              {canManage && (
                <button
                  type="button"
                  className="absolute right-2 top-2 z-[2] inline-flex h-7 items-center gap-1.5 rounded-md bg-ink-950/80 px-2 text-[11px] font-semibold text-ink-200 opacity-100 transition hover:text-ink-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                  onClick={() => setCoverOf(g)}
                  title={g.imageUrl ? "Trocar a capa" : "Adicionar uma capa"}
                >
                  <Icon name="image" size={13} />
                  {g.imageUrl ? "Trocar capa" : "Capa"}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border-hair)]">
          {visible.map((g) => (
            <li key={g.key} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-850 sm:px-5">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                onClick={() => setOpenKey(g.key)}
              >
                <ClientCover name={g.clientName} imageUrl={g.imageUrl} className="sm-thumb--badge" monogramSize={13} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink-100">{g.clientName}</div>
                  <div className="truncate text-[12.5px] text-ink-400">
                    {g.handles.length > 0 && `@${g.handles[0]} · `}
                    {plural(g.projects.length, "planejamento", "planejamentos")}
                  </div>
                </div>
                <div className="hidden shrink-0 sm:block">
                  <Scoreboard p={g} />
                </div>
              </button>
              {canManage && (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost shrink-0"
                  onClick={() => setCoverOf(g)}
                  aria-label={`${g.imageUrl ? "Trocar" : "Adicionar"} a capa de ${g.clientName}`}
                >
                  <Icon name="image" size={13} />
                </button>
              )}
              <Icon name="chevronRight" size={15} className="shrink-0 text-ink-600" />
            </li>
          ))}
        </ul>
      )}

      {showArchived && archived.length > 0 && <ArchivedDrawer archived={archived} canManage={canManage} />}

      {coverModal}
    </section>
  );
}
