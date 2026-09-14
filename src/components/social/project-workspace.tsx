"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Post, PostStatus, Project } from "@/lib/social/types";
import InstagramPreview from "@/components/social/instagram-preview";
import { Composer } from "@/components/social/composer";
import { MediaView } from "@/components/social/media";
import { StoryViewer } from "@/components/social/story-viewer";
import { FormatTag } from "@/components/social/vertical-preview";
import { ActionMenu, type MenuItem } from "@/components/action-menu";
import { ConfirmDialog, ImpactList, Modal } from "@/components/modal";
import { Segmented } from "@/components/form-controls";
import { toast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/ui";
import { formatBadge, isVertical } from "@/lib/social/media";

type ClientOpt = { id: number; name: string };
type Filter = "all" | PostStatus;

const STATUS: Record<PostStatus, { label: string; cls: string; dot: string }> = {
  pending: { label: "Aguardando cliente", cls: "bg-ink-800 text-ink-300", dot: "bg-ink-400" },
  approved: { label: "Aprovado", cls: "bg-verde-dim text-verde-fg", dot: "bg-verde" },
  rejected: { label: "Reprovado", cls: "bg-vermelho-dim text-vermelho-fg", dot: "bg-vermelho" },
};

/** ISO -> valor de <input type="datetime-local"> na hora local do navegador. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fmtWhen = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";

const noopSubscribe = () => () => {};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Erro ${res.status}.`);
  return data as T;
}

export default function ProjectWorkspace({
  project: initialProject,
  initialPosts,
  clients,
}: {
  project: Project;
  initialPosts: Post[];
  clients: ClientOpt[];
}) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [filter, setFilter] = useState<Filter>("all");
  const [copied, setCopied] = useState(false);

  // Diálogos
  const [viewing, setViewing] = useState<Post | null>(null);
  const [editing, setEditing] = useState<Post | null>(null);
  const [scheduling, setScheduling] = useState<Post | null>(null);
  const [deleting, setDeleting] = useState<Post | null>(null);
  const [projectDialog, setProjectDialog] = useState<null | "edit" | "archive" | "delete">(null);

  // A origem só existe no navegador; no servidor o link sai vazio e o React
  // troca no hydrate, sem efeito nem render em cascata.
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  const guestUrl = origin ? `${origin}/a/${project.guestToken}` : "";

  const handle = "@" + project.igHandle;
  const sorted = useMemo(() => [...posts].sort((a, b) => a.order - b.order), [posts]);
  const counts = useMemo(
    () => ({
      all: posts.length,
      pending: posts.filter((p) => p.status === "pending").length,
      approved: posts.filter((p) => p.status === "approved").length,
      rejected: posts.filter((p) => p.status === "rejected").length,
    }),
    [posts],
  );
  const visible = filter === "all" ? sorted : sorted.filter((p) => p.status === filter);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(guestUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast("Não foi possível copiar. Selecione o link e copie manualmente.", { tone: "error" });
    }
  };

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(
    `Oi! Separei os criativos de "${project.title}" para você aprovar. É rápido, só arrastar pro lado 👇\n\n${guestUrl}`,
  )}`;

  /** PATCH no criativo: aplica a versão devolvida pelo servidor; em erro, devolve a mensagem. */
  const patchPost = async (post: Post, body: Record<string, unknown>, okMsg?: string) => {
    try {
      const { post: updated } = await api<{ post: Post }>(`/api/social/posts/${post.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setPosts((prev) => prev.map((p) => (p.id === post.id ? updated : p)));
      if (okMsg) toast(okMsg);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

  const postMenu = (p: Post): MenuItem[] => {
    const items: MenuItem[] = [
      { label: "Visualizar", icon: "image", onSelect: () => setViewing(p) },
      { label: p.format === "story" ? "Editar observação" : "Editar legenda", icon: "message", onSelect: () => setEditing(p) },
    ];
    if (p.status === "approved") {
      items.push({
        label: p.scheduledAt ? "Alterar data no calendário" : "Definir data no calendário",
        icon: "calendar",
        onSelect: () => setScheduling(p),
      });
      items.push(
        p.publishStatus === "published"
          ? { label: "Desmarcar publicado", icon: "refresh", onSelect: () => void patchPost(p, { published: false }, "Voltou para o planejamento.").then((e) => e && toast(e, { tone: "error" })) }
          : { label: "Marcar como publicado", icon: "check", onSelect: () => void patchPost(p, { published: true }, "Marcado como publicado.").then((e) => e && toast(e, { tone: "error" })) },
      );
    }
    if (p.status !== "pending") {
      items.push({
        label: "Voltar para pendente",
        icon: "refresh",
        hint: "O cliente avalia de novo",
        onSelect: () => void patchPost(p, { status: "pending" }, "Criativo voltou para avaliação.").then((e) => e && toast(e, { tone: "error" })),
      });
    }
    items.push("separator", { label: "Excluir criativo", icon: "x", danger: true, onSelect: () => setDeleting(p) });
    return items;
  };

  const projectMenu: MenuItem[] = [
    { label: "Editar projeto", icon: "settings", onSelect: () => setProjectDialog("edit") },
    { label: "Abrir link do cliente", icon: "external", href: guestUrl || "#", external: true },
    { label: "Enviar por WhatsApp", icon: "message", href: whatsapp, external: true },
    "separator",
    { label: "Arquivar projeto", icon: "lock", hint: "Some das listas e o link para de abrir", onSelect: () => setProjectDialog("archive") },
    { label: "Excluir projeto", icon: "x", danger: true, onSelect: () => setProjectDialog("delete") },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/social", label: "Social media" }}
        title={project.title}
        description={`${project.clientName} · ${handle}`}
        actions={
          <>
            <a className="btn shrink-0" href={whatsapp} target="_blank" rel="noreferrer">
              <Icon name="message" size={14} />
              WhatsApp
            </a>
            <ActionMenu items={projectMenu} label="Ações do projeto" />
          </>
        }
      />

      {/* Link do cliente: a única coisa que o time precisa daqui é copiar e mandar. */}
      <section className="panel flex flex-col gap-3 px-4 py-3.5 sm:px-5 lg:flex-row lg:items-center">
        <div className="min-w-0 lg:w-[220px] lg:shrink-0">
          <div className="text-[13px] font-semibold text-ink-100">Link de aprovação do cliente</div>
          <div className="text-[12px] text-ink-500">Sem login · o cliente aprova pelo celular</div>
        </div>
        <div className="flex min-w-0 flex-1 gap-2">
          <input
            className="field min-w-0 flex-1 font-mono text-[12px]"
            readOnly
            value={guestUrl}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Link de aprovação"
          />
          <button type="button" className={`btn shrink-0 ${copied ? "" : "btn-primary"}`} onClick={copyLink}>
            <Icon name={copied ? "check" : "layers"} size={14} />
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-[12px] text-ink-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-ink-400" />
            <b className="tnum text-ink-100">{counts.pending}</b> aguardando
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-verde" />
            <b className="tnum text-ink-100">{counts.approved}</b> aprovados
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-vermelho" />
            <b className="tnum text-ink-100">{counts.rejected}</b> reprovados
          </span>
        </div>
      </section>

      <Composer projectId={project.id} handle={handle} onCreated={setPosts} />

      <section className="panel">
        <header className="flex flex-col gap-3 border-b border-[var(--border-hair)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <h2 className="font-display text-[16px] font-semibold text-ink-100">Criativos no projeto</h2>
          {posts.length > 0 && (
            <Segmented
              size="sm"
              label="Filtrar por status"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: `Todos · ${counts.all}` },
                { value: "pending", label: `Aguardando · ${counts.pending}` },
                { value: "approved", label: `Aprovados · ${counts.approved}` },
                { value: "rejected", label: `Reprovados · ${counts.rejected}` },
              ]}
            />
          )}
        </header>

        {posts.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Icon name="image" size={28} className="mx-auto text-ink-600" />
            <p className="mt-2 text-sm font-semibold text-ink-200">Nenhum criativo ainda</p>
            <p className="mt-1 text-[13px] text-ink-500">Envie o primeiro acima — ele aparece no link do cliente na hora.</p>
          </div>
        ) : visible.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-ink-500">Nenhum criativo com esse status.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-hair)]">
            {visible.map((p) => {
              const st = STATUS[p.status];
              const vertical = isVertical(p);
              return (
                <li key={p.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                  <button
                    type="button"
                    onClick={() => setViewing(p)}
                    className={`relative shrink-0 overflow-hidden rounded-md bg-black ring-1 ring-[var(--border-hair)] transition hover:ring-ink-500 ${
                      vertical ? "h-[80px] w-[45px]" : "h-[60px] w-[60px]"
                    }`}
                    aria-label="Visualizar criativo"
                  >
                    {p.assets[0] && <MediaView asset={p.assets[0]} sizes="80px" />}
                    {p.assets.length > 1 && (
                      <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 font-mono text-[9px] text-white">
                        {p.assets.length}
                      </span>
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <FormatTag badge={formatBadge(p)} />
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                      {p.status === "approved" && (
                        <button
                          type="button"
                          onClick={() => setScheduling(p)}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            p.publishStatus === "published"
                              ? "bg-verde-dim text-verde-fg"
                              : p.scheduledAt
                                ? "bg-amarelo-dim text-amarelo-fg"
                                : "bg-ink-850 text-ink-400 hover:text-ink-100"
                          }`}
                        >
                          <Icon name="calendar" size={11} />
                          {p.publishStatus === "published"
                            ? `Publicado ${fmtWhen(p.publishedAt)}`
                            : p.scheduledAt
                              ? fmtWhen(p.scheduledAt)
                              : "Sem data"}
                        </button>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-1 text-[13px] text-ink-300">
                      {p.caption ? p.caption.replace(/\n/g, " ") : <span className="text-ink-600">— sem legenda —</span>}
                    </p>
                    {p.feedback && (
                      <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-ink-950 px-2.5 py-1.5 text-[12.5px] text-ink-200">
                        <Icon name="message" size={12} className="mt-0.5 shrink-0 text-ink-400" />
                        <span>
                          <span className="font-semibold text-ink-400">Cliente: </span>
                          {p.feedback}
                        </span>
                      </p>
                    )}
                  </div>

                  <ActionMenu items={postMenu(p)} label="Ações do criativo" />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------- diálogos ---------- */}
      {viewing && isVertical(viewing) && (
        <StoryViewer
          items={[{ id: viewing.id, format: viewing.format, assets: viewing.assets, caption: viewing.caption || undefined, status: viewing.status }]}
          handle={handle}
          onClose={() => setViewing(null)}
        />
      )}
      <Modal
        open={Boolean(viewing && !isVertical(viewing))}
        onClose={() => setViewing(null)}
        title="Como o cliente vê"
        size="sm"
      >
        {viewing && (
          <div className="mx-auto max-w-[360px]">
            <div className="sm-scope">
              <InstagramPreview handle={handle} assets={viewing.assets} caption={viewing.caption} />
            </div>
          </div>
        )}
      </Modal>

      <CaptionDialog
        post={editing}
        onClose={() => setEditing(null)}
        onSave={(p, caption) => patchPost(p, { caption }, "Legenda atualizada.")}
      />
      <ScheduleDialog
        post={scheduling}
        onClose={() => setScheduling(null)}
        onSave={(p, when) => patchPost(p, { scheduledAt: when }, when ? "Data marcada no calendário." : "Data removida do calendário.")}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Excluir este criativo?"
        confirmLabel="Excluir criativo"
        pendingLabel="Excluindo…"
        successMessage="Criativo excluído."
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await api(`/api/social/posts/${deleting.id}`, { method: "DELETE" });
            setPosts((prev) => prev.filter((x) => x.id !== deleting.id));
          } catch (e) {
            return (e as Error).message;
          }
        }}
      >
        <p>O criativo some do link do cliente e as mídias são apagadas do armazenamento. Não dá para desfazer.</p>
        {deleting?.feedback && <ImpactList items={[{ label: "comentário do cliente será perdido" }]} />}
      </ConfirmDialog>

      <ProjectDialog
        open={projectDialog === "edit"}
        project={project}
        clients={clients}
        onClose={() => setProjectDialog(null)}
        onSaved={(p) => {
          setProject(p);
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={projectDialog === "archive"}
        onClose={() => setProjectDialog(null)}
        title="Arquivar este projeto?"
        confirmLabel="Arquivar"
        tone="default"
        pendingLabel="Arquivando…"
        onConfirm={async () => {
          try {
            await api(`/api/social/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
            toast("Projeto arquivado. Você pode restaurá-lo em Social media › Arquivados.");
            router.push("/social");
          } catch (e) {
            return (e as Error).message;
          }
        }}
      >
        <p>
          O projeto sai das listas e do calendário, e o link do cliente para de abrir. Nada é apagado — dá para
          restaurar depois.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={projectDialog === "delete"}
        onClose={() => setProjectDialog(null)}
        title="Excluir o projeto definitivamente?"
        confirmLabel="Excluir projeto"
        pendingLabel="Excluindo…"
        requireText={project.title}
        onConfirm={async () => {
          try {
            await api(`/api/social/projects/${project.id}`, { method: "DELETE" });
            toast("Projeto excluído.");
            router.push("/social");
          } catch (e) {
            return (e as Error).message;
          }
        }}
      >
        <p>Apaga o projeto, todos os criativos e as mídias no armazenamento. O link do cliente deixa de existir.</p>
        <ImpactList
          items={[
            { label: "criativo(s) e suas decisões", count: counts.all },
            { label: "aprovado(s) — inclusive os já no calendário", count: counts.approved },
          ]}
        />
        <p className="text-[12.5px] text-ink-500">Se a ideia é só tirar da frente, prefira arquivar.</p>
      </ConfirmDialog>
    </div>
  );
}

/* ---------------- Editar legenda ---------------- */
function CaptionDialog({
  post,
  onClose,
  onSave,
}: {
  post: Post | null;
  onClose: () => void;
  onSave: (p: Post, caption: string) => Promise<string | null>;
}) {
  return (
    <Modal
      open={Boolean(post)}
      onClose={onClose}
      title={post?.format === "story" ? "Editar observação" : "Editar legenda"}
      description={post && post.status !== "pending" ? "O criativo já foi avaliado — a decisão do cliente continua valendo." : undefined}
    >
      {post && <CaptionForm key={post.id} post={post} onClose={onClose} onSave={onSave} />}
    </Modal>
  );
}

function CaptionForm({
  post,
  onClose,
  onSave,
}: {
  post: Post;
  onClose: () => void;
  onSave: (p: Post, caption: string) => Promise<string | null>;
}) {
  const [value, setValue] = useState(post.caption);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const err = await onSave(post, value);
        setBusy(false);
        if (err) setError(err);
        else onClose();
      }}
    >
      <textarea className="field min-h-[160px]" value={value} maxLength={2200} onChange={(e) => setValue(e.target.value)} autoFocus />
      <div className="mt-1 flex justify-between text-[11px] text-ink-500">
        <span>{error && <span className="font-semibold text-vermelho-fg">{error}</span>}</span>
        <span className="tnum">{value.length}/2200</span>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || value === post.caption} aria-busy={busy}>
          {busy && <span className="spinner" aria-hidden />}
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

/* ---------------- Data no calendário ---------------- */
function ScheduleDialog({
  post,
  onClose,
  onSave,
}: {
  post: Post | null;
  onClose: () => void;
  onSave: (p: Post, when: string | null) => Promise<string | null>;
}) {
  return (
    <Modal
      open={Boolean(post)}
      onClose={onClose}
      title="Data no calendário"
      description="A data organiza o planejamento — a postagem no Instagram é manual."
      size="sm"
    >
      {post && <ScheduleForm key={post.id} post={post} onClose={onClose} onSave={onSave} />}
    </Modal>
  );
}

function ScheduleForm({
  post,
  onClose,
  onSave,
}: {
  post: Post;
  onClose: () => void;
  onSave: (p: Post, when: string | null) => Promise<string | null>;
}) {
  const [when, setWhen] = useState(() => toLocalInput(post.scheduledAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (value: string | null) => {
    setBusy(true);
    // datetime-local é hora local; o servidor recebe ISO com fuso.
    const err = await onSave(post, value ? new Date(value).toISOString() : null);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(when);
      }}
    >
      <label className="block">
        <span className="label">Publicar em</span>
        <input type="datetime-local" className="field mt-1" value={when} onChange={(e) => setWhen(e.target.value)} autoFocus />
      </label>
      {error && <p className="mt-2 text-[12.5px] font-semibold text-vermelho-fg">{error}</p>}
      <div className="modal-actions">
        {post.scheduledAt && (
          <button type="button" className="btn btn-ghost mr-auto" onClick={() => save(null)} disabled={busy}>
            Remover data
          </button>
        )}
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !when} aria-busy={busy}>
          {busy && <span className="spinner" aria-hidden />}
          {busy ? "Salvando…" : "Salvar data"}
        </button>
      </div>
    </form>
  );
}

/* ---------------- Editar projeto ---------------- */
function ProjectDialog({
  open,
  project,
  clients,
  onClose,
  onSaved,
}: {
  open: boolean;
  project: Project;
  clients: ClientOpt[];
  onClose: () => void;
  onSaved: (p: Project) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open={open} onClose={() => !busy && onClose()} title="Editar projeto">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setBusy(true);
          setError(null);
          try {
            const { project: p } = await api<{ project: Project }>(`/api/social/projects/${project.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                title: String(fd.get("title") ?? ""),
                igHandle: String(fd.get("igHandle") ?? ""),
                clientId: fd.get("clientId") ? Number(fd.get("clientId")) : null,
              }),
            });
            onSaved(p);
            toast("Projeto atualizado.");
            onClose();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block">
          <span className="label">Título</span>
          <input name="title" required defaultValue={project.title} className="field mt-1" />
        </label>
        <label className="block">
          <span className="label">Cliente da carteira</span>
          <select name="clientId" defaultValue={project.clientId ?? ""} className="field mt-1">
            <option value="">— sem vínculo ({project.clientName}) —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">@ do Instagram</span>
          <input name="igHandle" defaultValue={project.igHandle} className="field mt-1 font-mono text-sm" />
        </label>
        {error && <p className="text-[12.5px] font-semibold text-vermelho-fg">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
            {busy && <span className="spinner" aria-hidden />}
            {busy ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
