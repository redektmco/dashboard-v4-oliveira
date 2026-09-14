"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import InstagramPreview from "./instagram-preview";
import { MediaView } from "./media";
import { StoryViewer, type StoryItem } from "./story-viewer";
import { FormatIcon, VerticalPreview } from "./vertical-preview";
import { Icon } from "@/components/icon";
import { Segmented } from "@/components/form-controls";
import { toast } from "@/components/toast";
import { matchCaptionsToFiles, parseBatchCaptions } from "@/lib/social/batch";
import {
  FORMAT_ACCEPT_ATTR,
  MULTIPART_FROM_BYTES,
  aspectWarning,
  contentTypeOf,
  kindOfType,
  rejectReason,
  type MediaKind,
} from "@/lib/social/media";
import type { Asset, Post, PostFormat } from "@/lib/social/types";

type Mode = "single" | "batch";

type ItemState = "ready" | "uploading" | "uploaded" | "done" | "error";

type Item = {
  key: string; // id local
  file: File;
  previewUrl: string;
  kind: MediaKind;
  contentType: string;
  width?: number;
  height?: number;
  duration?: number;
  caption: string;
  state: ItemState;
  progress: number; // 0..1
  error?: string;
  url?: string; // no Blob, depois do upload
};

const CONCURRENCY = 3;

const FORMAT_COPY: Record<PostFormat, { single: string; batch: string; drop: string }> = {
  feed: {
    single: "Uma arte vira post; várias viram um carrossel, na ordem da lista.",
    batch: "Cada arte vira um post separado, com a própria legenda.",
    drop: "Imagens (JPG, PNG, WebP) ou vídeo",
  },
  reels: {
    single: "Um vídeo vertical 9:16 com legenda.",
    batch: "Cada vídeo vira um Reels separado, com a própria legenda.",
    drop: "Vídeo vertical 9:16 (MP4, MOV ou WebM)",
  },
  story: {
    single: "Os arquivos formam uma sequência de Stories, avaliada como um conjunto.",
    batch: "Cada arquivo vira um Story separado, avaliado individualmente.",
    drop: "Imagens ou vídeos verticais 9:16",
  },
};

const fmtMB = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Chave estável de um arquivo — base da idempotência no servidor. */
async function sha(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const fileSig = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

/** Largura/altura/duração lidas no navegador, para avisar proporção errada antes de enviar. */
async function readMeta(file: File, url: string, kind: MediaKind) {
  try {
    if (kind === "image") {
      const bmp = await createImageBitmap(file);
      const meta = { width: bmp.width, height: bmp.height };
      bmp.close();
      return meta;
    }
    return await new Promise<{ width?: number; height?: number; duration?: number }>((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.onloadedmetadata = () =>
        resolve({ width: v.videoWidth || undefined, height: v.videoHeight || undefined, duration: isFinite(v.duration) ? v.duration : undefined });
      v.onerror = () => resolve({});
      v.src = url;
    });
  } catch {
    return {};
  }
}

/** Nome seguro para o caminho no Blob (o nome original vai nos metadados do post). */
const safeName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(-80) || "arquivo";

function uploadErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/abort/i.test(msg)) return "Envio cancelado.";
  if (/permiss|unauthor|401/i.test(msg)) return "Sessão expirada. Entre de novo e reenvie.";
  if (/content type|contentType/i.test(msg)) return "Tipo de arquivo recusado pelo armazenamento.";
  if (/too large|maximum|size/i.test(msg)) return "Arquivo acima do limite de tamanho.";
  if (/network|fetch|Failed to fetch|timeout/i.test(msg)) return "Conexão caiu durante o envio. Tente de novo.";
  return msg.length < 140 ? msg : "Falha no envio deste arquivo.";
}

/**
 * Envio de criativos para aprovação.
 *
 * O arquivo sai do navegador direto para o Vercel Blob, três de cada vez,
 * com progresso por arquivo. Um arquivo com problema não derruba os outros:
 * ele fica marcado com o motivo e pode ser reenviado sozinho. Cada criativo
 * leva uma chave de idempotência, então reenviar depois de uma falha nunca
 * duplica o que já entrou. Nada vai para o cliente antes do clique em
 * "Enviar para aprovação" — até lá é só pré-visualização local.
 */
export function Composer({
  projectId,
  handle,
  onCreated,
}: {
  projectId: string;
  handle: string;
  onCreated: (posts: Post[]) => void;
}) {
  const [format, setFormat] = useState<PostFormat>("feed");
  const [mode, setMode] = useState<Mode>("single");
  const [items, setItems] = useState<Item[]>([]);
  const [caption, setCaption] = useState("");
  const [bulk, setBulk] = useState("");
  const [sending, setSending] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const aborters = useRef(new Map<string, AbortController>());
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const patch = useCallback((key: string, p: Partial<Item>) => {
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...p } : i)));
  }, []);

  // Libera as URLs locais e limpa do Blob o que subiu mas não virou post
  // quando o composer sai de cena (troca de página, fechar aba).
  useEffect(() => {
    const aborts = aborters.current;
    return () => {
      aborts.forEach((a) => a.abort());
      const list = itemsRef.current;
      list.forEach((i) => URL.revokeObjectURL(i.previewUrl));
      const orphans = list.filter((i) => i.state === "uploaded" && i.url).map((i) => i.url!);
      if (orphans.length)
        void fetch("/api/social/upload", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: orphans }),
          keepalive: true,
        }).catch(() => undefined);
    };
  }, []);

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    setSummary(null);
    const existing = new Set(items.map((i) => fileSig(i.file)));
    const fresh = files.filter((f) => !existing.has(fileSig(f)));
    if (fresh.length < files.length) toast(`${files.length - fresh.length} arquivo(s) repetido(s) ignorado(s).`, { tone: "info" });
    if (format === "reels" && mode === "single" && items.length + fresh.length > 1) {
      toast("Reels é um vídeo só. Use “Em lote” para vários Reels.", { tone: "info" });
      fresh.splice(Math.max(0, 1 - items.length));
    }
    const created: Item[] = fresh.map((file) => {
      const contentType = contentTypeOf(file);
      const err = rejectReason(file, format);
      return {
        key: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        kind: kindOfType(contentType) ?? "image",
        contentType,
        caption: "",
        state: err ? "error" : "ready",
        progress: 0,
        error: err ?? undefined,
      };
    });
    setItems((list) => [...list, ...created]);
    for (const it of created) {
      if (it.state === "error") continue;
      const meta = await readMeta(it.file, it.previewUrl, it.kind);
      patch(it.key, meta);
    }
  };

  const remove = (key: string) => {
    const it = items.find((i) => i.key === key);
    if (!it) return;
    aborters.current.get(key)?.abort();
    URL.revokeObjectURL(it.previewUrl);
    if (it.state === "uploaded" && it.url) void cleanup([it.url]);
    setItems((list) => list.filter((i) => i.key !== key));
  };

  const move = (key: string, delta: -1 | 1) => {
    setItems((list) => {
      const i = list.findIndex((x) => x.key === key);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const reset = () => {
    items.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    setItems([]);
    setCaption("");
    setBulk("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const changeFormat = (f: PostFormat) => {
    if (sending) return;
    setFormat(f);
    // Revalida o que já está na lista contra as regras do novo formato.
    setItems((list) =>
      list.map((i) => {
        if (i.state === "done") return i;
        const err = rejectReason(i.file, f);
        return err ? { ...i, state: "error", error: err } : i.state === "error" && !i.url ? { ...i, state: "ready", error: undefined } : i;
      }),
    );
  };

  const applyBulk = () => {
    const blocks = parseBatchCaptions(bulk);
    const matched = matchCaptionsToFiles(blocks, items.map((i) => i.file.name));
    setItems((list) => list.map((i, idx) => ({ ...i, caption: matched[idx] || i.caption })));
    toast(`${matched.filter(Boolean).length} legenda(s) aplicada(s).`, { tone: "info" });
  };

  async function cleanup(urls: string[]) {
    await fetch("/api/social/upload", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    }).catch(() => undefined);
  }

  /** Sobe um arquivo ao Blob. Resolve com a URL, ou marca o erro no item. */
  const uploadOne = async (it: Item): Promise<string | null> => {
    const ctrl = new AbortController();
    aborters.current.set(it.key, ctrl);
    patch(it.key, { state: "uploading", progress: 0, error: undefined });
    try {
      const blob = await upload(`social/${projectId}/${Date.now()}-${safeName(it.file.name)}`, it.file, {
        access: "public",
        handleUploadUrl: "/api/social/upload",
        clientPayload: JSON.stringify({ projectId }),
        contentType: it.contentType,
        multipart: it.file.size > MULTIPART_FROM_BYTES,
        abortSignal: ctrl.signal,
        onUploadProgress: ({ percentage }) => patch(it.key, { progress: percentage / 100 }),
      });
      patch(it.key, { state: "uploaded", progress: 1, url: blob.url });
      return blob.url;
    } catch (e) {
      patch(it.key, { state: "error", error: uploadErrorMessage(e) });
      return null;
    } finally {
      aborters.current.delete(it.key);
    }
  };

  /** Pool de envio: no máximo CONCURRENCY uploads simultâneos. */
  const uploadAll = async (list: Item[]) => {
    const urls = new Map<string, string>();
    let cursor = 0;
    const worker = async () => {
      while (cursor < list.length) {
        const it = list[cursor++];
        if (it.url) {
          urls.set(it.key, it.url);
          continue;
        }
        const url = await uploadOne(it);
        if (url) urls.set(it.key, url);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
    return urls;
  };

  const toAsset = (it: Item, url: string): Omit<Asset, "id"> => ({
    url,
    name: it.file.name,
    kind: it.kind,
    contentType: it.contentType,
    width: it.width,
    height: it.height,
    duration: it.duration,
    size: it.file.size,
  });

  type Result = { clientKey: string | null; status: "created" | "duplicate" | "error"; error?: string };

  const createPosts = async (payload: { clientKey: string; format: PostFormat; caption: string; assets: Omit<Asset, "id">[] }[]) => {
    const res = await fetch(`/api/social/projects/${projectId}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ posts: payload }),
    });
    const data = (await res.json().catch(() => null)) as { results?: Result[]; posts?: Post[]; error?: string } | null;
    if (!data?.results) throw new Error(data?.error || `Servidor respondeu ${res.status}.`);
    return { results: data.results, posts: data.posts ?? [] };
  };

  /** Chaves que já viraram criativo — perguntado antes de gastar banda. */
  const existingKeys = async (keys: string[]): Promise<Set<string>> => {
    try {
      const res = await fetch(`/api/social/projects/${projectId}/posts?keys=${keys.join(",")}`);
      const data = (await res.json()) as { existing?: string[] };
      return new Set(data.existing ?? []);
    } catch {
      return new Set(); // sem a checagem, a chave ainda barra no servidor
    }
  };

  const send = async () => {
    let pendingItems = items.filter((i) => i.state !== "done" && !(i.state === "error" && !i.url && rejectReason(i.file, format)));
    if (!pendingItems.length) return;
    setSending(true);
    setSummary(null);
    try {
      if (mode === "single") {
        const groupKey = await sha(`${format}|${pendingItems.map((i) => fileSig(i.file)).join("||")}`);
        if ((await existingKeys([groupKey])).has(groupKey)) {
          toast("Esse criativo já está no projeto — nada foi enviado de novo.", { tone: "info" });
          pendingItems.forEach((i) => URL.revokeObjectURL(i.previewUrl));
          setItems([]);
          setCaption("");
          return;
        }
      } else {
        const keyed = await Promise.all(pendingItems.map(async (i) => [i.key, await sha(`${format}|${fileSig(i.file)}`)] as const));
        const already = await existingKeys(keyed.map(([, k]) => k));
        const skip = new Set(keyed.filter(([, k]) => already.has(k)).map(([key]) => key));
        if (skip.size) {
          toast(`${skip.size} arquivo(s) já estavam no projeto e foram ignorados.`, { tone: "info" });
          setItems((list) => list.filter((i) => !skip.has(i.key)));
          pendingItems = pendingItems.filter((i) => !skip.has(i.key));
          if (!pendingItems.length) return;
        }
      }

      const urls = await uploadAll(pendingItems);

      if (mode === "single") {
        // Um criativo com todas as mídias: só cria se todas subiram.
        const failed = pendingItems.filter((i) => !urls.has(i.key));
        if (failed.length) {
          setSummary(`${failed.length} arquivo(s) não subiram. Reenvie ou remova para continuar — os que já subiram não sobem de novo.`);
          return;
        }
        const clientKey = await sha(`${format}|${pendingItems.map((i) => fileSig(i.file)).join("||")}`);
        const { results, posts } = await createPosts([
          { clientKey, format, caption, assets: pendingItems.map((i) => toAsset(i, urls.get(i.key)!)) },
        ]);
        const r = results[0];
        if (r?.status === "error") {
          setSummary(r.error ?? "Não foi possível criar o criativo.");
          return;
        }
        onCreated(posts);
        if (r?.status === "duplicate") {
          // Corrida: outro envio criou o mesmo criativo enquanto este subia.
          void cleanup(pendingItems.map((i) => urls.get(i.key)!).filter(Boolean));
          toast("Esse criativo já estava no projeto — nada foi duplicado.", { tone: "info" });
        } else toast("Enviado para aprovação.");
        pendingItems.forEach((i) => URL.revokeObjectURL(i.previewUrl));
        setItems([]);
        setCaption("");
        if (inputRef.current) inputRef.current.value = "";
        return;
      }

      // Lote: cada arquivo que subiu vira um criativo, na ordem da lista.
      const ready = pendingItems.filter((i) => urls.has(i.key));
      const keyed = await Promise.all(ready.map(async (i) => ({ item: i, clientKey: await sha(`${format}|${fileSig(i.file)}`) })));
      let created = 0;
      let dup = 0;
      if (keyed.length) {
        const { results, posts } = await createPosts(
          keyed.map(({ item, clientKey }) => ({ clientKey, format, caption: item.caption, assets: [toAsset(item, urls.get(item.key)!)] })),
        );
        results.forEach((r, idx) => {
          const it = keyed[idx]?.item;
          if (!it) return;
          if (r.status === "error") patch(it.key, { state: "error", error: r.error });
          else {
            if (r.status === "created") created++;
            else {
              dup++;
              void cleanup([urls.get(it.key)!]);
            }
            patch(it.key, { state: "done" });
          }
        });
        onCreated(posts);
      }
      const failed = pendingItems.length - created - dup;
      if (!failed) {
        toast(`${created} criativo(s) enviado(s) para aprovação${dup ? ` · ${dup} já existia(m)` : ""}.`);
        pendingItems.forEach((i) => URL.revokeObjectURL(i.previewUrl));
        setItems((list) => list.filter((i) => i.state !== "done"));
      } else {
        setSummary(`${created + dup} de ${pendingItems.length} enviados. ${failed} com problema — veja o motivo em cada um e reenvie só esses.`);
        setItems((list) => list.filter((i) => i.state !== "done"));
      }
    } catch (e) {
      // Falha ao criar (rede/servidor): as mídias já estão no Blob e o
      // reenvio não sobe de novo nem duplica — a chave de idempotência cobre.
      setSummary(`${(e as Error).message || "Falha de conexão."} As mídias já enviadas foram mantidas; clique em reenviar.`);
    } finally {
      setSending(false);
    }
  };

  const cancel = () => {
    aborters.current.forEach((a) => a.abort());
  };

  const active = useMemo(() => items.filter((i) => !rejectReason(i.file, format)), [items, format]);
  const invalid = items.length - active.length;
  // Um criativo único não sai com arquivo faltando: o carrossel/sequência
  // precisa ser exatamente o que o time montou.
  const blockedByInvalid = mode === "single" && invalid > 0;
  const totalBytes = active.reduce((a, i) => a + i.file.size, 0);
  const sentBytes = active.reduce((a, i) => a + i.file.size * (i.state === "uploaded" || i.state === "done" ? 1 : i.progress), 0);
  const overall = totalBytes ? sentBytes / totalBytes : 0;
  const retryable = items.some((i) => i.state === "error" && !rejectReason(i.file, format));
  const sendable = active.filter((i) => i.state !== "done").length;
  const vertical = format !== "feed";

  const previewAssets: Asset[] = useMemo(
    () =>
      active.map((i) => ({
        id: i.key,
        url: i.previewUrl,
        name: i.file.name,
        kind: i.kind,
        contentType: i.contentType,
        width: i.width,
        height: i.height,
      })),
    [active],
  );

  const viewerItems: StoryItem[] = useMemo(() => {
    if (mode === "single") return [{ id: "draft", format, assets: previewAssets, caption: format === "reels" ? caption : undefined }];
    return previewAssets.map((a, idx) => ({
      id: a.id,
      format,
      assets: [a],
      caption: format === "reels" ? active[idx]?.caption : undefined,
    }));
  }, [mode, format, previewAssets, caption, active]);

  const copy = FORMAT_COPY[format];
  const buttonLabel =
    mode === "single"
      ? "Enviar para aprovação"
      : `Enviar ${sendable || ""} ${format === "story" ? "Story" : format === "reels" ? "Reels" : "post"}${sendable === 1 || format === "reels" ? "" : "s"} para aprovação`;

  return (
    <section className="panel">
      <header className="flex flex-col gap-3 border-b border-[var(--border-hair)] px-4 py-3.5 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-display text-[16px] font-semibold text-ink-100">Novo criativo</h2>
          <p className="mt-0.5 text-[12.5px] text-ink-400">{copy[mode]}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented
            label="Formato"
            value={format}
            onChange={changeFormat}
            options={[
              { value: "feed", label: <><FormatIcon badge="post" /> Post / Carrossel</> },
              { value: "reels", label: <><FormatIcon badge="reels" /> Reels</> },
              { value: "story", label: <><FormatIcon badge="story" /> Stories</> },
            ]}
          />
          <Segmented
            label="Quantidade"
            value={mode}
            onChange={(m) => !sending && setMode(m)}
            options={[
              { value: "single", label: "Um criativo" },
              { value: "batch", label: "Em lote" },
            ]}
          />
        </div>
      </header>

      <div className="grid gap-5 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-3">
          <label
            className="dropzone"
            data-over={over ? "" : undefined}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              void addFiles(Array.from(e.dataTransfer.files));
            }}
          >
            <Icon name="image" size={22} className="text-ink-400" />
            <span className="text-[13.5px] font-semibold text-ink-100">
              Arraste os arquivos ou <span className="text-v4-red">escolha no computador</span>
            </span>
            <span className="text-[12px] text-ink-500">{copy.drop} · imagem até 30 MB, vídeo até 500 MB</span>
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              multiple={!(format === "reels" && mode === "single")}
              accept={FORMAT_ACCEPT_ATTR[format]}
              disabled={sending}
              onChange={(e) => {
                void addFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </label>

          {items.length > 0 && (
            <ul className="divide-y divide-[var(--border-hair)] overflow-hidden rounded-lg border border-[var(--border-hair)]">
              {items.map((it, idx) => {
                const warn = !it.error ? aspectWarning(format, it) : null;
                const rejected = Boolean(rejectReason(it.file, format));
                return (
                  <li key={it.key} className="flex gap-3 bg-ink-950/40 px-3 py-2.5">
                    <div
                      className={`relative shrink-0 overflow-hidden rounded-md bg-black ${vertical ? "h-[72px] w-[41px]" : "h-14 w-14"}`}
                    >
                      {rejected ? (
                        <span className="absolute inset-0 grid place-items-center text-vermelho-fg">
                          <Icon name="alert" size={16} />
                        </span>
                      ) : (
                        <MediaView asset={{ url: it.previewUrl, name: it.file.name, kind: it.kind }} />
                      )}
                      {!rejected && it.kind === "video" && (
                        <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 font-mono text-[9px] text-white">
                          {it.duration ? `${Math.round(it.duration)}s` : "vídeo"}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="tnum shrink-0 font-mono text-[11px] text-ink-500">{idx + 1}</span>
                        <span className="min-w-0 truncate text-[13px] font-medium text-ink-100" title={it.file.name}>
                          {it.file.name}
                        </span>
                        <span className="tnum shrink-0 text-[11px] text-ink-500">{fmtMB(it.file.size)}</span>
                      </div>
                      {it.state === "error" ? (
                        <p className="mt-1 flex items-start gap-1.5 text-[12px] font-medium text-vermelho-fg">
                          <Icon name="alert" size={12} className="mt-0.5 shrink-0" />
                          {it.error}
                        </p>
                      ) : it.state === "uploading" || it.state === "uploaded" || it.state === "done" ? (
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className={`progress-bar flex-1 ${it.state !== "uploading" ? "is-done" : ""}`}>
                            <i style={{ width: `${Math.round(it.progress * 100)}%` }} />
                          </div>
                          <span className="tnum w-16 text-right text-[11px] text-ink-400">
                            {it.state === "uploading" ? `${Math.round(it.progress * 100)}%` : it.state === "done" ? "enviado" : "na nuvem"}
                          </span>
                        </div>
                      ) : warn ? (
                        <p className="mt-1 text-[12px] text-amarelo-fg">{warn}</p>
                      ) : (
                        <p className="mt-1 text-[12px] text-ink-500">
                          {it.width && it.height ? `${it.width}×${it.height}` : it.kind === "video" ? "vídeo" : "imagem"} · pronto
                        </p>
                      )}
                      {mode === "batch" && format !== "story" && !rejected && (
                        <textarea
                          className="field mt-2 min-h-[38px] resize-y py-1.5 text-[12.5px]"
                          rows={1}
                          placeholder="Legenda deste post…"
                          value={it.caption}
                          disabled={sending || it.state === "done"}
                          onChange={(e) => patch(it.key, { caption: e.target.value })}
                        />
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-center gap-0.5">
                      {mode === "single" && items.length > 1 && (
                        <>
                          <button type="button" className="menu-trigger menu-trigger--sm" onClick={() => move(it.key, -1)} disabled={sending || idx === 0} aria-label="Mover para cima">
                            <Icon name="chevronDown" size={14} className="rotate-180" />
                          </button>
                          <button type="button" className="menu-trigger menu-trigger--sm" onClick={() => move(it.key, 1)} disabled={sending || idx === items.length - 1} aria-label="Mover para baixo">
                            <Icon name="chevronDown" size={14} />
                          </button>
                        </>
                      )}
                      <button type="button" className="menu-trigger menu-trigger--sm" onClick={() => remove(it.key)} aria-label={`Remover ${it.file.name}`}>
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {mode === "single" && format !== "story" && (
            <label className="block">
              <span className="label">Legenda</span>
              <textarea
                className="field mt-1 min-h-[96px]"
                placeholder="Escreva a legenda do post…"
                value={caption}
                maxLength={2200}
                disabled={sending}
                onChange={(e) => setCaption(e.target.value)}
              />
            </label>
          )}
          {mode === "single" && format === "story" && (
            <label className="block">
              <span className="label">Observação para o cliente (opcional)</span>
              <textarea
                className="field mt-1 min-h-[60px]"
                placeholder="Ex.: o link do sticker vai para a página da promoção."
                value={caption}
                maxLength={2200}
                disabled={sending}
                onChange={(e) => setCaption(e.target.value)}
              />
            </label>
          )}

          {mode === "batch" && format !== "story" && items.length > 1 && (
            <details className="rounded-lg border border-[var(--border-hair)] px-3 py-2 text-[13px]">
              <summary className="cursor-pointer font-semibold text-ink-300">Colar legendas em bloco</summary>
              <p className="mt-2 text-[12px] text-ink-500">
                Use <code className="font-mono">[arquivo.jpg]</code> antes da legenda para casar pelo nome, ou separe
                com <code className="font-mono">---</code> para casar na ordem da lista.
              </p>
              <textarea
                className="field mt-2 min-h-[110px] font-mono text-[12px]"
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
                placeholder={"[arte-01.jpg]\nLegenda do primeiro post.\n\n---\n\n[arte-02.png]\nLegenda do segundo."}
              />
              <button type="button" className="btn btn-sm mt-2" onClick={applyBulk} disabled={!bulk.trim()}>
                Aplicar às artes
              </button>
            </details>
          )}

          {summary && (
            <p className="flex items-start gap-2 rounded-lg bg-amarelo-dim px-3 py-2 text-[13px] font-medium text-amarelo-fg" role="status">
              <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
              {summary}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              className="btn btn-primary"
              onClick={send}
              disabled={sending || sendable === 0 || blockedByInvalid}
              title={blockedByInvalid ? "Remova os arquivos com problema para enviar." : undefined}
              aria-busy={sending}
            >
              {sending && <span className="spinner" aria-hidden />}
              {sending ? `Enviando… ${Math.round(overall * 100)}%` : retryable ? "Reenviar os que falharam" : buttonLabel}
            </button>
            {sending ? (
              <button type="button" className="btn btn-ghost" onClick={cancel}>
                Cancelar envio
              </button>
            ) : (
              items.length > 0 && (
                <button type="button" className="btn btn-ghost" onClick={reset}>
                  Descartar
                </button>
              )
            )}
            {blockedByInvalid && !sending && (
              <span className="text-[12px] font-medium text-vermelho-fg">Remova os arquivos com problema para enviar.</span>
            )}
            {active.length > 0 && !sending && !blockedByInvalid && (
              <span className="text-[12px] text-ink-500">
                {active.length} arquivo(s) · {fmtMB(totalBytes)}
              </span>
            )}
          </div>
          {sending && (
            <div className="progress-bar" aria-label="Progresso do envio">
              <i style={{ width: `${Math.round(overall * 100)}%` }} />
            </div>
          )}
        </div>

        {/* Pré-visualização: exatamente o que o cliente vai ver. */}
        <aside className="min-w-0">
          <div className="mb-2 flex items-center justify-between">
            <span className="label">Pré-visualização</span>
            {vertical && previewAssets.length > 0 && (
              <button type="button" className="text-[12px] font-semibold text-v4-red hover:underline" onClick={() => setViewer(0)}>
                Assistir em tela cheia
              </button>
            )}
          </div>
          {previewAssets.length === 0 ? (
            <div className={`grid place-items-center rounded-xl border border-dashed border-[var(--border-strong)] text-center text-[12px] text-ink-500 ${vertical ? "aspect-[9/16]" : "aspect-[4/5]"}`}>
              <span className="px-6">A prévia aparece aqui assim que você escolher os arquivos.</span>
            </div>
          ) : (
            <div className="mx-auto max-w-[300px]">
            <div className="sm-scope">
              {vertical ? (
                <VerticalPreview
                  key={`${format}-${mode}`}
                  format={format}
                  assets={mode === "single" ? previewAssets : previewAssets.slice(0, 1)}
                  caption={mode === "single" ? caption : active[0]?.caption}
                  handle={handle}
                  onExpand={() => setViewer(0)}
                />
              ) : (
                <InstagramPreview
                  handle={handle}
                  assets={mode === "single" ? previewAssets : previewAssets.slice(0, 1)}
                  caption={mode === "single" ? caption : (active[0]?.caption ?? "")}
                />
              )}
              {mode === "batch" && previewAssets.length > 1 && (
                <p className="mt-2 text-center text-[11.5px] text-ink-500">
                  Mostrando o 1º de {previewAssets.length}.{" "}
                  {vertical ? "Em tela cheia você passa por todos." : "Cada arte vira um post."}
                </p>
              )}
            </div>
            </div>
          )}
        </aside>
      </div>

      {viewer !== null && viewerItems[0]?.assets.length ? (
        <StoryViewer items={viewerItems} startIndex={viewer} handle={handle} onClose={() => setViewer(null)} />
      ) : null}
    </section>
  );
}
