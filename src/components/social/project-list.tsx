"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ActionMenu, type MenuItem } from "@/components/action-menu";
import { ConfirmDialog, ImpactList } from "@/components/modal";
import { toast } from "@/components/toast";
import { Icon } from "@/components/icon";
import type { Project } from "@/lib/social/types";

export type ProjectRow = Pick<Project, "id" | "title" | "clientName" | "igHandle" | "guestToken" | "createdAt"> & {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  scheduled: number;
};

async function patchProject(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/social/projects/${id}`, {
    method: body.__delete ? "DELETE" : "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body.__delete ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `Erro ${res.status}.`);
  }
}

const dateBR = (s: string) => new Date(s).toLocaleDateString("pt-BR");

/** Lista de projetos ativos com ações no ⋯, e a gaveta de arquivados com restaurar. */
export function ProjectList({
  projects,
  archived,
  canManage,
}: {
  projects: ProjectRow[];
  archived: Pick<Project, "id" | "title" | "clientName" | "createdAt">[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ kind: "archive" | "delete"; p: ProjectRow } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const copyLink = async (p: ProjectRow) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/a/${p.guestToken}`);
      toast("Link do cliente copiado.");
    } catch {
      toast("Não foi possível copiar o link.", { tone: "error" });
    }
  };

  const menu = (p: ProjectRow): MenuItem[] => [
    { label: "Abrir projeto", icon: "arrowUp", href: `/social/projetos/${p.id}` },
    { label: "Copiar link do cliente", icon: "layers", onSelect: () => void copyLink(p) },
    { label: "Abrir link do cliente", icon: "external", href: `/a/${p.guestToken}`, external: true },
    ...(canManage
      ? ([
          "separator",
          { label: "Arquivar", icon: "lock", hint: "Tira da frente sem apagar", onSelect: () => setDialog({ kind: "archive", p }) },
          { label: "Excluir", icon: "x", danger: true, onSelect: () => setDialog({ kind: "delete", p }) },
        ] as MenuItem[])
      : []),
  ];

  const restore = async (id: string) => {
    setRestoring(id);
    try {
      await patchProject(id, { archived: false });
      toast("Projeto restaurado.");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setRestoring(null);
    }
  };

  return (
    <section className="panel">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border-hair)] px-4 py-3.5 sm:px-5">
        <div>
          <h2 className="font-display text-[16px] font-semibold text-ink-100">Projetos</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-400">{projects.length} ativos · um link de aprovação por projeto</p>
        </div>
        {archived.length > 0 && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}>
            <Icon name="lock" size={13} />
            Arquivados ({archived.length})
          </button>
        )}
      </header>

      {projects.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <Icon name="image" size={28} className="mx-auto text-ink-600" />
          <p className="mt-2 text-sm font-semibold text-ink-200">Nenhum projeto ativo</p>
          <p className="mt-1 text-[13px] text-ink-500">
            {canManage ? "Crie o primeiro em “Novo projeto” — o link do cliente sai na hora." : "Assim que o time de social criar um projeto, ele aparece aqui."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border-hair)]">
          {projects.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-850 sm:px-5">
              <Link href={`/social/projetos/${p.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink-100">{p.title}</div>
                  <div className="truncate text-[12.5px] text-ink-400">
                    {p.clientName} · @{p.igHandle} · {dateBR(p.createdAt)}
                  </div>
                </div>
                <div className="hidden shrink-0 items-center gap-1.5 text-[11px] font-semibold sm:flex">
                  {p.total === 0 && <span className="text-ink-500">sem criativos</span>}
                  {p.pending > 0 && <span className="rounded-full bg-ink-800 px-2 py-0.5 text-ink-300">{p.pending} aguardando</span>}
                  {p.rejected > 0 && <span className="rounded-full bg-vermelho-dim px-2 py-0.5 text-vermelho-fg">{p.rejected} a refazer</span>}
                  {p.approved > 0 && <span className="rounded-full bg-verde-dim px-2 py-0.5 text-verde-fg">{p.approved} aprovados</span>}
                  {p.scheduled > 0 && <span className="rounded-full bg-amarelo-dim px-2 py-0.5 text-amarelo-fg">{p.scheduled} no calendário</span>}
                </div>
              </Link>
              <ActionMenu items={menu(p)} label={`Ações de ${p.title}`} />
            </li>
          ))}
        </ul>
      )}

      {showArchived && archived.length > 0 && (
        <div className="border-t border-[var(--border-hair)] bg-ink-950/50">
          <div className="px-4 pb-1 pt-3 sm:px-5">
            <span className="label">Arquivados</span>
          </div>
          <ul className="divide-y divide-[var(--border-hair)]">
            {archived.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-ink-300">{p.title}</div>
                  <div className="truncate text-[12px] text-ink-500">
                    {p.clientName} · {dateBR(p.createdAt)}
                  </div>
                </div>
                {canManage && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => restore(p.id)}
                    disabled={restoring === p.id}
                    aria-busy={restoring === p.id}
                  >
                    {restoring === p.id ? <span className="spinner" aria-hidden /> : <Icon name="refresh" size={13} />}
                    Restaurar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={dialog?.kind === "archive"}
        onClose={() => setDialog(null)}
        title={`Arquivar “${dialog?.p.title ?? ""}”?`}
        confirmLabel="Arquivar"
        tone="default"
        pendingLabel="Arquivando…"
        successMessage="Projeto arquivado."
        onConfirm={async () => {
          if (!dialog) return;
          try {
            await patchProject(dialog.p.id, { archived: true });
            router.refresh();
          } catch (e) {
            return (e as Error).message;
          }
        }}
      >
        <p>O projeto sai das listas e do calendário, e o link do cliente para de abrir. Nada é apagado — dá para restaurar em “Arquivados”.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog?.kind === "delete"}
        onClose={() => setDialog(null)}
        title="Excluir o projeto definitivamente?"
        confirmLabel="Excluir projeto"
        pendingLabel="Excluindo…"
        successMessage="Projeto excluído."
        requireText={dialog?.p.title}
        onConfirm={async () => {
          if (!dialog) return;
          try {
            await patchProject(dialog.p.id, { __delete: true });
            router.refresh();
          } catch (e) {
            return (e as Error).message;
          }
        }}
      >
        <p>Apaga o projeto, os criativos e as mídias no armazenamento. O link do cliente deixa de existir.</p>
        <ImpactList
          items={[
            { label: "criativo(s) com as decisões do cliente", count: dialog?.p.total ?? 0 },
            { label: "aprovado(s)", count: dialog?.p.approved ?? 0 },
          ]}
        />
        <p className="text-[12.5px] text-ink-500">Se a ideia é só tirar da frente, prefira arquivar.</p>
      </ConfirmDialog>
    </section>
  );
}
