"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Post, Project, PublishStatus } from "@/lib/social/types";
import InstagramPreview from "@/components/social/instagram-preview";
import { matchCaptionsToFiles, parseBatchCaptions } from "@/lib/social/batch";

type Mode = "single" | "batch";

const STATUS_LABEL: Record<Post["status"], string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Reprovado",
};

const PUB_LABEL: Record<PublishStatus, string> = {
  draft: "",
  scheduled: "Agendado",
  publishing: "Publicando…",
  published: "Publicado",
  failed: "Falhou",
};

const PUB_BADGE: Record<PublishStatus, string> = {
  draft: "",
  scheduled: "scheduled",
  publishing: "scheduled",
  published: "published",
  failed: "rejected",
};

const BATCH_PLACEHOLDER = `[arte-01.jpg]
Legenda do primeiro post.
Pode ter várias linhas e #hashtags.

---

[arte-02.png]
Legenda do segundo post.`;

/** ISO -> valor de <input type="datetime-local"> na hora local do navegador. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProjectWorkspace({
  project,
  initialPosts,
}: {
  project: Project;
  initialPosts: Post[];
}) {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [mode, setMode] = useState<Mode>("single");
  const [guestUrl, setGuestUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setGuestUrl(`${window.location.origin}/a/${project.guestToken}`);
  }, [project.guestToken]);

  const reload = async () => {
    const res = await fetch(`/api/social/projects/${project.id}`);
    if (res.ok) {
      const data = await res.json();
      setPosts(data.posts);
    }
    router.refresh();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(guestUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const patchPost = async (id: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/social/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const { post } = await res.json();
      setPosts((prev) => prev.map((p) => (p.id === id ? post : p)));
    }
    router.refresh();
  };

  const removePost = async (id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
    await fetch(`/api/social/posts/${id}`, { method: "DELETE" });
    router.refresh();
  };

  const approved = posts.filter((p) => p.status === "approved").length;
  const rejected = posts.filter((p) => p.status === "rejected").length;

  const sorted = useMemo(() => [...posts].sort((a, b) => a.order - b.order), [posts]);

  return (
    <div className="app-shell app-shell--wide">
      <header className="topbar">
        <Link href="/social" className="btn ghost sm" aria-label="Voltar">
          <svg className="icon" viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="grow">
          <div className="topbar__title">{project.title}</div>
          <div className="topbar__sub">
            {project.clientName} · @{project.igHandle}
          </div>
        </div>
      </header>

      <div className="pad stack" style={{ gap: 18 }}>
        {/* Link do cliente */}
        <div className="card pad">
          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Link do cliente (sem login)
          </div>
          <div className="row" style={{ gap: 8 }}>
            <input className="input grow" readOnly value={guestUrl} onFocus={(e) => e.currentTarget.select()} />
            <button className="btn secondary" onClick={copyLink}>
              {copied ? "Copiado!" : "Copiar"}
            </button>
            <a className="btn ghost" href={guestUrl} target="_blank" rel="noreferrer">
              Abrir
            </a>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            Envie este link para o cliente aprovar por swipe. {posts.length} post
            {posts.length === 1 ? "" : "s"} · {approved} aprov. · {rejected} reprov.
          </p>
        </div>

        {/* Composer */}
        <div className="card pad">
          <div className="row between" style={{ marginBottom: 14 }}>
            <h3>Subir artes</h3>
            <div className="segmented" style={{ width: 220 }}>
              <button className={mode === "single" ? "on" : ""} onClick={() => setMode("single")}>
                Post único
              </button>
              <button className={mode === "batch" ? "on" : ""} onClick={() => setMode("batch")}>
                Em lote
              </button>
            </div>
          </div>

          {mode === "single" ? (
            <SingleComposer projectId={project.id} handle={"@" + project.igHandle} onDone={reload} />
          ) : (
            <BatchComposer projectId={project.id} onDone={reload} placeholder={BATCH_PLACEHOLDER} />
          )}
        </div>

        {/* Gestão de posts */}
        <div className="stack" style={{ gap: 8 }}>
          <div className="eyebrow">Posts no projeto ({posts.length})</div>
          {posts.length === 0 && (
            <div className="card pad">
              <p className="muted">Nenhuma arte ainda. Suba acima.</p>
            </div>
          )}
          {sorted.map((p) => (
            <div key={p.id} className="card pad stack" style={{ gap: 10 }}>
              <div className="row" style={{ gap: 12 }}>
                <div className="list-thumb">
                  {p.assets[0] && <img src={p.assets[0].url} alt="" />}
                </div>
                <div className="list-body">
                  <div className="cap">
                    {p.caption ? p.caption.replace(/\n/g, " ") : "— sem legenda —"}
                  </div>
                  <div className="meta">
                    #{p.order + 1} · {p.assets.length} arte{p.assets.length > 1 ? "s" : ""}
                    {p.feedback ? ` · 💬 "${p.feedback}"` : ""}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <span className={`badge ${p.status}`}>
                    <i />
                    {STATUS_LABEL[p.status]}
                  </span>
                  {p.publishStatus !== "draft" && (
                    <span className={`badge ${PUB_BADGE[p.publishStatus]}`}>
                      <i />
                      {PUB_LABEL[p.publishStatus]}
                    </span>
                  )}
                </div>
                <div className="row" style={{ gap: 4 }}>
                  {p.status !== "pending" && (
                    <button
                      className="btn ghost sm"
                      onClick={() => patchPost(p.id, { status: "pending" })}
                    >
                      Resetar
                    </button>
                  )}
                  <button className="btn ghost sm" onClick={() => removePost(p.id)} aria-label="Remover">
                    <svg className="icon" viewBox="0 0 24 24" style={{ stroke: "var(--fg-3)" }}>
                      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Agendamento — só criativos aprovados entram no planejamento */}
              {p.status === "approved" && p.publishStatus !== "published" && (
                <Scheduler post={p} onSchedule={patchPost} />
              )}
              {p.publishStatus === "published" && (
                <p className="hint" style={{ color: "var(--v4-green)" }}>
                  Publicado no Instagram {p.publishedAt ? `em ${fmtWhen(p.publishedAt)}` : ""}.
                </p>
              )}
              {p.publishStatus === "failed" && p.publishError && (
                <p className="hint" style={{ color: "#ff5560" }}>
                  Falha: {p.publishError}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Conta Instagram (publicação automática) */}
        <IgCredentials project={project} />
      </div>
    </div>
  );
}

/* ---------------- Agendamento ---------------- */
function Scheduler({
  post,
  onSchedule,
}: {
  post: Post;
  onSchedule: (id: string, body: Record<string, unknown>) => Promise<void>;
}) {
  const [when, setWhen] = useState(toLocalInput(post.scheduledAt));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    await onSchedule(post.id, { scheduledAt: when ? when : null });
    setBusy(false);
  };
  const clear = async () => {
    setBusy(true);
    setWhen("");
    await onSchedule(post.id, { scheduledAt: null });
    setBusy(false);
  };

  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
      <span className="eyebrow" style={{ minWidth: 0 }}>
        Publicar em
      </span>
      <input
        type="datetime-local"
        className="input"
        style={{ width: 210 }}
        value={when}
        onChange={(e) => setWhen(e.target.value)}
      />
      <button className="btn primary sm" onClick={save} disabled={busy || !when}>
        {post.publishStatus === "scheduled" ? "Reagendar" : "Agendar"}
      </button>
      {post.publishStatus === "scheduled" && (
        <button className="btn ghost sm" onClick={clear} disabled={busy}>
          Cancelar agendamento
        </button>
      )}
      {post.scheduledAt && post.publishStatus === "scheduled" && (
        <span className="hint">agendado p/ {fmtWhen(post.scheduledAt)}</span>
      )}
    </div>
  );
}

/* ---------------- Conta Instagram ---------------- */
function IgCredentials({ project }: { project: Project }) {
  const router = useRouter();
  const [igUserId, setIgUserId] = useState(project.igUserId ?? "");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    const body: Record<string, unknown> = { igUserId };
    if (token.trim()) body.igAccessToken = token.trim();
    const res = await fetch(`/api/social/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.ok) {
      setToken("");
      setMsg("Credenciais salvas.");
      router.refresh();
    } else {
      setMsg("Erro ao salvar.");
    }
  };

  return (
    <div className="card pad stack" style={{ gap: 10 }}>
      <div className="eyebrow">Conta Instagram · publicação automática</div>
      <p className="hint">
        Para publicar sozinho no horário agendado, informe o ID da conta Instagram
        Business e um token de longa duração da Graph API.{" "}
        {project.hasIgToken ? "Token salvo ✓" : "Token ainda não configurado."}
      </p>
      <div className="field" style={{ margin: 0 }}>
        <label>IG Business Account ID</label>
        <input
          className="input"
          value={igUserId}
          onChange={(e) => setIgUserId(e.target.value)}
          placeholder="ex.: 17841400000000000"
        />
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label>Access token de longa duração</label>
        <input
          className="input"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={project.hasIgToken ? "•••••••• (deixe em branco p/ manter)" : "cole o token"}
        />
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary sm" onClick={save} disabled={busy}>
          {busy ? "Salvando…" : "Salvar credenciais"}
        </button>
        {msg && <span className="hint">{msg}</span>}
      </div>
    </div>
  );
}

/* ---------------- Single composer ---------------- */
function SingleComposer({
  projectId,
  handle,
  onDone,
}: {
  projectId: string;
  handle: string;
  onDone: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const previews = useMemo(
    () => files.map((f, i) => ({ id: `local-${i}`, url: URL.createObjectURL(f), name: f.name })),
    [files],
  );
  useEffect(() => {
    return () => previews.forEach((p) => URL.revokeObjectURL(p.url));
  }, [previews]);

  const submit = async () => {
    if (files.length === 0) {
      setError("Selecione ao menos uma arte.");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("mode", "single");
    fd.append("caption", caption);
    files.forEach((f) => fd.append("files", f));
    const res = await fetch(`/api/social/projects/${projectId}/posts`, { method: "POST", body: fd });
    setBusy(false);
    if (res.ok) {
      setFiles([]);
      setCaption("");
      if (inputRef.current) inputRef.current.value = "";
      onDone();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Erro ao subir.");
    }
  };

  return (
    <div className="row" style={{ gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div className="grow" style={{ minWidth: 260 }}>
        <div className="field">
          <label>Artes (1 = post simples · várias = carrossel)</label>
          <input
            ref={inputRef}
            className="input"
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </div>
        <div className="field">
          <label>Legenda</label>
          <textarea
            className="textarea"
            placeholder="Escreva a legenda do post…"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </div>
        {error && <p style={{ color: "var(--accent)", font: "var(--t-body-sm)", marginBottom: 12 }}>{error}</p>}
        <button className="btn primary" onClick={submit} disabled={busy}>
          {busy ? "Subindo…" : "Adicionar post"}
        </button>
      </div>

      <div style={{ width: 260 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Preview
        </div>
        <InstagramPreview handle={handle} assets={previews} caption={caption} />
      </div>
    </div>
  );
}

/* ---------------- Batch composer ---------------- */
function BatchComposer({
  projectId,
  onDone,
  placeholder,
}: {
  projectId: string;
  onDone: () => void;
  placeholder: string;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [captionsRaw, setCaptionsRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fileNames = files.map((f) => f.name);
  const mapped = useMemo(() => {
    const blocks = parseBatchCaptions(captionsRaw);
    return matchCaptionsToFiles(blocks, fileNames);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionsRaw, fileNames.join("|")]);

  const submit = async () => {
    if (files.length === 0) {
      setError("Selecione as artes do lote.");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("mode", "batch");
    fd.append("captionsRaw", captionsRaw);
    files.forEach((f) => fd.append("files", f));
    const res = await fetch(`/api/social/projects/${projectId}/posts`, { method: "POST", body: fd });
    setBusy(false);
    if (res.ok) {
      setFiles([]);
      setCaptionsRaw("");
      if (inputRef.current) inputRef.current.value = "";
      onDone();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Erro ao subir o lote.");
    }
  };

  return (
    <div>
      <div className="field">
        <label>Artes do lote (cada arte vira um post)</label>
        <input
          ref={inputRef}
          className="input"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </div>

      <div className="field">
        <label>
          Legendas (formato para parse — <code className="mono">[nome-do-arquivo]</code> ou separadas por{" "}
          <code className="mono">---</code>)
        </label>
        <textarea
          className="textarea"
          style={{ minHeight: 160, fontFamily: "var(--font-mono)", fontSize: 13 }}
          placeholder={placeholder}
          value={captionsRaw}
          onChange={(e) => setCaptionsRaw(e.target.value)}
        />
        <p className="hint">
          Use <code className="mono">[arquivo.jpg]</code> para casar a legenda com a arte pelo nome, ou
          separe os blocos com <code className="mono">---</code> para casar na ordem do upload.
        </p>
      </div>

      {files.length > 0 && (
        <div className="stack" style={{ gap: 6, marginBottom: 14 }}>
          <div className="eyebrow">Pré-visualização do casamento</div>
          {files.map((f, i) => (
            <div key={f.name + i} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
              <span className="mono" style={{ color: "var(--fg-3)", minWidth: 20 }}>
                {i + 1}
              </span>
              <span className="mono" style={{ color: "var(--fg-2)", minWidth: 140, wordBreak: "break-all" }}>
                {f.name}
              </span>
              <span className="grow" style={{ font: "var(--t-body-sm)", color: mapped[i] ? "var(--fg)" : "var(--fg-4)" }}>
                {mapped[i] ? mapped[i].replace(/\n/g, " ") : "— sem legenda —"}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && <p style={{ color: "var(--accent)", font: "var(--t-body-sm)", marginBottom: 12 }}>{error}</p>}
      <button className="btn primary" onClick={submit} disabled={busy}>
        {busy ? "Subindo lote…" : `Subir ${files.length || ""} post${files.length === 1 ? "" : "s"} em lote`}
      </button>
    </div>
  );
}
