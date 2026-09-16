"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import InstagramPreview from "./instagram-preview";
import { MediaView } from "./media";
import { StoryViewer, type StoryItem } from "./story-viewer";
import { FormatIcon, VerticalPreview } from "./vertical-preview";
import { Icon } from "@/components/icon";
import { matchCaptionsToFiles, parseBatchCaptions } from "@/lib/social/batch";
import { toast } from "@/components/toast";
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
  state: ItemState;
  progress: number; // 0..1
  error?: string;
  url?: string; // no Blob, depois do upload
};

/** Um criativo do modo lote: arquivos agrupados à mão, com legenda própria. */
type Group = { id: string; caption: string; keys: string[] };

/** De onde uma miniatura está sendo arrastada. */
type Zone = "single" | "loose" | string; // string = id de um grupo

const CONCURRENCY = 3;
const CAPTION_MAX = 2200; // limite do Instagram

const FORMAT_CARDS: { value: PostFormat; label: string; hint: string }[] = [
  { value: "feed", label: "Post/Carrossel", hint: "4:5 · até 20" },
  { value: "reels", label: "Reels", hint: "9:16 · vídeo" },
  { value: "story", label: "Stories", hint: "9:16 · sequência" },
];

const FORMAT_COPY: Record<PostFormat, { single: string; batch: string; drop: string }> = {
  feed: {
    single: "Uma arte vira post; várias viram um carrossel, na ordem da lista.",
    batch: "Cada grupo vira um post ou carrossel, com a própria legenda.",
    drop: "Imagens (JPG, PNG, WebP) ou vídeo",
  },
  reels: {
    single: "Um vídeo vertical 9:16 com legenda.",
    batch: "Cada grupo vira um Reels — um vídeo por grupo.",
    drop: "Vídeo vertical 9:16 (MP4, MOV ou WebM)",
  },
  story: {
    single: "Os arquivos formam uma sequência de Stories, avaliada como um conjunto.",
    batch: "Cada grupo vira uma sequência de Stories separada.",
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

const newGroup = (): Group => ({ id: crypto.randomUUID(), caption: "", keys: [] });

/**
 * Envio de criativos para aprovação.
 *
 * O arquivo sai do navegador direto para o Vercel Blob, três de cada vez,
 * com progresso por arquivo. Um arquivo com problema não derruba os outros:
 * ele fica marcado com o motivo e pode ser reenviado sozinho. Cada criativo
 * leva uma chave de idempotência, então reenviar depois de uma falha nunca
 * duplica o que já entrou.
 *
 * Dois modos: "Individual" monta um criativo só (a ordem das miniaturas é a
 * ordem do carrossel / da sequência); "Em lote" deixa arrastar os arquivos
 * para grupos, e cada grupo vira um criativo com a própria legenda.
 *
 * Nada vai para o cliente antes do clique em "Criar e enviar" — "Salvar
 * rascunho" grava no painel sem publicar no link.
 */
export function Composer({
  projectId,
  handle,
  onCreated,
  onSent,
}: {
  projectId: string;
  handle: string;
  /** Lista de criativos devolvida pelo servidor depois de gravar. */
  onCreated: (posts: Post[]) => void;
  /** Quantos criativos foram efetivamente enviados ao link do cliente. */
  onSent?: (count: number) => void;
}) {
  const [format, setFormat] = useState<PostFormat>("feed");
  const [mode, setMode] = useState<Mode>("single");
  const [items, setItems] = useState<Item[]>([]);
  const [groups, setGroups] = useState<Group[]>([newGroup(), newGroup()]);
  const [caption, setCaption] = useState("");
  const [sending, setSending] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const [laneOver, setLaneOver] = useState<string | null>(null);
  const [bulk, setBulk] = useState("");
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
    setGroups((gs) => gs.map((g) => ({ ...g, keys: g.keys.filter((k) => k !== key) })));
  };

  const reset = () => {
    items.forEach((i) => URL.revokeObjectURL(i.previewUrl));
    setItems([]);
    setGroups([newGroup(), newGroup()]);
    setCaption("");
    setBulk("");
    setSummary(null);
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

  /* ------------------------- arrastar e soltar ------------------------- */

  const dragged = useRef<{ key: string; from: Zone } | null>(null);

  const onDragStart = (key: string, from: Zone) => (e: React.DragEvent) => {
    dragged.current = { key, from };
    e.dataTransfer.effectAllowed = "move";
    // Firefox só inicia o arrasto se houver algum dado no transfer.
    e.dataTransfer.setData("text/plain", key);
  };

  /**
   * Move a miniatura para `to`, opcionalmente antes de `beforeKey`. No modo
   * individual reordena a própria lista; no lote troca de grupo.
   */
  const moveTo = (to: Zone, beforeKey?: string) => {
    const drag = dragged.current;
    dragged.current = null;
    setLaneOver(null);
    if (!drag || (drag.key === beforeKey && drag.from === to)) return;

    if (to === "single") {
      setItems((list) => {
        const from = list.findIndex((i) => i.key === drag.key);
        if (from < 0) return list;
        const next = list.slice();
        const [moved] = next.splice(from, 1);
        const at = beforeKey ? next.findIndex((i) => i.key === beforeKey) : -1;
        next.splice(at < 0 ? next.length : at, 0, moved);
        return next;
      });
      return;
    }

    setGroups((gs) =>
      gs.map((g) => {
        // Sai de onde estava…
        const keys = g.keys.filter((k) => k !== drag.key);
        if (g.id !== to) return keys.length === g.keys.length ? g : { ...g, keys };
        // …e entra no destino, na posição solta.
        const at = beforeKey ? keys.indexOf(beforeKey) : -1;
        const next = keys.slice();
        next.splice(at < 0 ? next.length : at, 0, drag.key);
        return { ...g, keys: next };
      }),
    );
  };

  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const grouped = useMemo(() => new Set(groups.flatMap((g) => g.keys)), [groups]);
  const loose = useMemo(() => items.filter((i) => !grouped.has(i.key)), [items, grouped]);

  /* ----------------------------- envio ----------------------------- */

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

  const createPosts = async (
    payload: { clientKey: string; format: PostFormat; caption: string; status: "draft" | "pending"; assets: Omit<Asset, "id">[] }[],
  ) => {
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

  /**
   * Os criativos que este composer vai gravar, já na forma final: um por
   * criativo no individual, um por grupo não-vazio no lote.
   */
  const plan = useMemo((): { items: Item[]; caption: string }[] => {
    const usable = (list: Item[]) => list.filter((i) => i.state !== "done" && !rejectReason(i.file, format));
    if (mode === "single") {
      const list = usable(items);
      return list.length ? [{ items: list, caption }] : [];
    }
    return groups
      .map((g) => ({ items: usable(g.keys.map((k) => byKey.get(k)!).filter(Boolean)), caption: g.caption }))
      .filter((g) => g.items.length > 0);
  }, [mode, items, groups, caption, byKey, format]);

  /** Envia (ou guarda) o que está montado. `asDraft` não toca no link do cliente. */
  const submit = async (asDraft: boolean) => {
    if (!plan.length) {
      setSummary(mode === "batch" ? "Monte ao menos um grupo com arquivos." : "Adicione ao menos um arquivo.");
      return;
    }
    if (format === "reels" && plan.some((p) => p.items.length !== 1)) {
      setSummary("Reels é um vídeo por criativo. Deixe um arquivo em cada grupo.");
      return;
    }

    setSending(true);
    setSummary(null);
    try {
      // Uma chave por criativo: o conjunto de arquivos, no formato escolhido.
      const keys = await Promise.all(
        plan.map((p) => sha(`${format}|${p.items.map((i) => fileSig(i.file)).join("||")}`)),
      );
      const already = await existingKeys(keys);
      const fresh = plan.map((p, i) => ({ ...p, clientKey: keys[i] })).filter((p) => !already.has(p.clientKey));
      const skipped = plan.length - fresh.length;
      if (skipped) toast(`${skipped} criativo(s) já estavam no projeto e foram ignorados.`, { tone: "info" });
      if (!fresh.length) {
        reset();
        return;
      }

      const urls = await uploadAll(fresh.flatMap((p) => p.items));

      // Um criativo só sai inteiro: se faltou mídia, ele fica para o reenvio.
      const ready = fresh.filter((p) => p.items.every((i) => urls.has(i.key)));
      const incomplete = fresh.length - ready.length;
      if (!ready.length) {
        setSummary(
          "Nenhum criativo ficou completo — veja o motivo em cada arquivo e reenvie. O que já subiu não sobe de novo.",
        );
        return;
      }

      const { results, posts } = await createPosts(
        ready.map((p) => ({
          clientKey: p.clientKey,
          format,
          caption: p.caption,
          status: asDraft ? ("draft" as const) : ("pending" as const),
          assets: p.items.map((i) => toAsset(i, urls.get(i.key)!)),
        })),
      );
      onCreated(posts);

      let created = 0;
      let dup = 0;
      const failures: string[] = [];
      results.forEach((r, idx) => {
        if (r.status === "created") created++;
        else if (r.status === "duplicate") {
          dup++;
          void cleanup(ready[idx].items.map((i) => urls.get(i.key)!).filter(Boolean));
        } else if (r.error) failures.push(r.error);
      });

      if (failures.length || incomplete) {
        setSummary(
          `${created + dup} de ${plan.length} gravados. ${failures[0] ?? "Alguns arquivos não subiram."} ` +
            "Os que já subiram não sobem de novo — clique de novo para reenviar só o que falta.",
        );
      } else {
        const label = created === 1 ? "criativo" : "criativos";
        toast(
          asDraft
            ? `${created} ${label} salvos como rascunho.`
            : `${created} ${label} enviados para aprovação${dup ? ` · ${dup} já existia(m)` : ""}.`,
        );
        if (!asDraft && created) onSent?.(created);
        reset();
      }
    } catch (e) {
      // Falha ao criar (rede/servidor): as mídias já estão no Blob e o
      // reenvio não sobe de novo nem duplica — a chave de idempotência cobre.
      setSummary(`${(e as Error).message || "Falha de conexão."} As mídias já enviadas foram mantidas; clique em reenviar.`);
    } finally {
      setSending(false);
    }
  };

  const cancel = () => aborters.current.forEach((a) => a.abort());

  /**
   * Preenche as legendas dos grupos a partir de um texto colado. `[arquivo]`
   * casa pelo nome do primeiro arquivo do grupo; o resto entra na ordem dos
   * grupos. Escrever dez legendas no editor e colar de uma vez é mais rápido
   * do que digitar campo a campo.
   */
  const applyBulk = () => {
    const firstNames = groups.map((g) => byKey.get(g.keys[0])?.file.name ?? "");
    const matched = matchCaptionsToFiles(parseBatchCaptions(bulk), firstNames);
    setGroups((gs) => gs.map((g, i) => (matched[i] ? { ...g, caption: matched[i] } : g)));
    const n = matched.filter(Boolean).length;
    toast(n ? `${n} legenda(s) aplicada(s).` : "Nenhuma legenda casou com os grupos.", { tone: n ? "info" : "error" });
  };

  /* ----------------------------- derivados ----------------------------- */

  const active = useMemo(() => items.filter((i) => !rejectReason(i.file, format)), [items, format]);
  const invalid = items.length - active.length;
  const totalBytes = active.reduce((a, i) => a + i.file.size, 0);
  const sentBytes = active.reduce((a, i) => a + i.file.size * (i.state === "uploaded" || i.state === "done" ? 1 : i.progress), 0);
  const overall = totalBytes ? sentBytes / totalBytes : 0;
  const vertical = format !== "feed";
  const nCreatives = plan.length;

  const aspectWarnings = useMemo(
    () => active.map((i) => aspectWarning(format, i)).filter((w): w is string => Boolean(w)),
    [active, format],
  );

  const previewAssets: Asset[] = useMemo(
    () =>
      (mode === "single" ? active : (plan[0]?.items ?? [])).map((i) => ({
        id: i.key,
        url: i.previewUrl,
        name: i.file.name,
        kind: i.kind,
        contentType: i.contentType,
        width: i.width,
        height: i.height,
      })),
    [mode, active, plan],
  );

  const previewCaption = mode === "single" ? caption : (plan[0]?.caption ?? "");

  const viewerItems: StoryItem[] = useMemo(
    () => [{ id: "draft", format, assets: previewAssets, caption: format === "reels" ? previewCaption : undefined }],
    [format, previewAssets, previewCaption],
  );

  const copy = FORMAT_COPY[format];
  const ctaLabel = sending
    ? `Enviando… ${Math.round(overall * 100)}%`
    : nCreatives > 1
      ? `Criar ${nCreatives} e enviar`
      : "Criar e enviar para aprovação";

  /* ------------------------------ miniatura ------------------------------ */

  /** Miniatura arrastável: a ordem que se vê aqui é a ordem publicada. */
  const Thumb = ({
    it,
    index,
    zone,
    size = "md",
  }: {
    it: Item;
    index: number;
    zone: Zone;
    size?: "sm" | "md";
  }) => {
    const rejected = Boolean(rejectReason(it.file, format));
    const box = size === "sm" ? "h-[52px] w-[42px]" : "h-[78px] w-[62px]";
    return (
      <div
        draggable={!sending}
        onDragStart={onDragStart(it.key, zone)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          moveTo(zone, it.key);
        }}
        className={`group relative shrink-0 overflow-hidden rounded-md bg-black ring-1 ring-[var(--border-strong)] ${box} ${
          sending ? "" : "cursor-grab active:cursor-grabbing"
        } ${rejected ? "ring-vermelho" : "hover:ring-ink-500"}`}
        title={it.error ? `${it.file.name} — ${it.error}` : it.file.name}
      >
        {rejected ? (
          <span className="absolute inset-0 grid place-items-center text-vermelho-fg">
            <Icon name="alert" size={14} />
          </span>
        ) : (
          <MediaView asset={{ url: it.previewUrl, name: it.file.name, kind: it.kind }} />
        )}

        <span className="tnum absolute left-1 top-1 rounded bg-black/75 px-1 font-mono text-[9px] leading-[14px] text-white">
          {index + 1}
        </span>

        {!sending && (
          <button
            type="button"
            onClick={() => remove(it.key)}
            className="absolute right-0.5 top-0.5 grid h-[18px] w-[18px] place-items-center rounded bg-black/75 text-ink-300 opacity-0 transition hover:bg-v4-red hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={`Remover ${it.file.name}`}
          >
            <Icon name="x" size={11} />
          </button>
        )}

        {(it.state === "uploading" || it.state === "uploaded") && (
          <span className="absolute inset-x-0 bottom-0 h-[3px] bg-black/60">
            <i className="block h-full bg-v4-red transition-[width]" style={{ width: `${Math.round(it.progress * 100)}%` }} />
          </span>
        )}
      </div>
    );
  };

  /* ------------------------------- render ------------------------------- */

  return (
    <section className="panel flex flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border-hair)] px-4 py-3.5 sm:px-5">
        <h2 className="font-display text-[16px] font-semibold text-ink-100">Novo criativo</h2>
        <div className="flex rounded-full border border-[var(--border-hair)] bg-ink-950 p-0.5">
          {(["single", "batch"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => !sending && setMode(m)}
              aria-pressed={mode === m}
              className={`h-[26px] rounded-full px-3 text-[12px] font-semibold transition ${
                mode === m ? "bg-v4-red text-white" : "text-ink-400 hover:text-ink-100"
              }`}
            >
              {m === "single" ? "Individual" : "Em lote"}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
        {/* Formato primeiro: ele decide o que o dropzone aceita. */}
        <div>
          <span className="label">Formato</span>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {FORMAT_CARDS.map((f) => {
              const on = format === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => changeFormat(f.value)}
                  aria-pressed={on}
                  className={`flex flex-col items-start gap-1 rounded-lg border px-2.5 py-2.5 text-left transition ${
                    on
                      ? "border-v4-red bg-v4-red/10 text-ink-100"
                      : "border-[var(--border-strong)] bg-ink-850 text-ink-300 hover:bg-ink-800 hover:text-ink-100"
                  }`}
                >
                  <FormatIcon badge={f.value === "feed" ? "post" : f.value === "reels" ? "reels" : "story"} />
                  <span className="text-[12.5px] font-semibold leading-tight">{f.label}</span>
                  <span className="text-[11px] text-ink-400">{f.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        <label
          className="dropzone"
          data-over={over ? "" : undefined}
          onDragOver={(e) => {
            e.preventDefault();
            if (!dragged.current) setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (dragged.current) return; // reordenação, não arquivo novo
            void addFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <Icon name="upload" size={24} className="text-ink-400" />
          <span className="text-[13.5px] font-semibold text-ink-100">
            Arraste os arquivos aqui ou <span className="text-v4-red">selecione do computador</span>
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

        {invalid > 0 && (
          <p className="flex items-start gap-2 text-[12px] font-medium text-vermelho-fg">
            <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
            {invalid} arquivo(s) fora das regras deste formato. Remova ou troque o formato para continuar.
          </p>
        )}

        {/* Proporção fora do formato não impede o envio — mas o cliente vai
            ver o corte, então o aviso aparece antes, não depois. */}
        {aspectWarnings.length > 0 && (
          <p className="flex items-start gap-2 text-[12px] text-amarelo-fg">
            <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
            <span>
              {aspectWarnings[0]}
              {aspectWarnings.length > 1 && ` (+${aspectWarnings.length - 1} com o mesmo problema)`}
            </span>
          </p>
        )}

        {/* ---------------------- modo individual ---------------------- */}
        {mode === "single" && (
          <>
            {items.length > 0 && (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  moveTo("single");
                }}
              >
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="label">
                    {format === "story" ? "Ordem da sequência" : format === "reels" ? "Vídeo" : "Ordem do carrossel"}
                  </span>
                  <button type="button" className="text-[11.5px] text-ink-400 hover:text-ink-100" onClick={reset} disabled={sending}>
                    Limpar
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {items.map((it, i) => (
                    <Thumb key={it.key} it={it} index={i} zone="single" />
                  ))}
                </div>
                {items.length > 1 && (
                  <p className="mt-2 text-[11.5px] text-ink-500">
                    Arraste as miniaturas para reordenar. A ordem vira a sequência publicada.
                  </p>
                )}
              </div>
            )}

            <label className="block">
              <span className="flex items-baseline justify-between">
                <span className="label">{format === "story" ? "Observação para o cliente (opcional)" : "Legenda"}</span>
                <span className="tnum font-mono text-[11px] text-ink-500">
                  {caption.length}/{CAPTION_MAX.toLocaleString("pt-BR")}
                </span>
              </span>
              <textarea
                className="field mt-1 min-h-[96px]"
                placeholder={
                  format === "story"
                    ? "Ex.: o link do sticker vai para a página da promoção."
                    : "Escreva a legenda que vai junto com o criativo. Hashtags no fim."
                }
                value={caption}
                maxLength={CAPTION_MAX}
                disabled={sending}
                onChange={(e) => setCaption(e.target.value)}
              />
            </label>
          </>
        )}

        {/* ------------------------- modo lote ------------------------- */}
        {mode === "batch" && (
          <div className="flex flex-col gap-3">
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="label">Arquivos soltos · {loose.length}</span>
                <button type="button" className="text-[11.5px] text-ink-400 hover:text-ink-100" onClick={reset} disabled={sending}>
                  Limpar
                </button>
              </div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  // Sair de todos os grupos = voltar a ficar solto.
                  const drag = dragged.current;
                  dragged.current = null;
                  setLaneOver(null);
                  if (drag) setGroups((gs) => gs.map((g) => ({ ...g, keys: g.keys.filter((k) => k !== drag.key) })));
                }}
                className="flex min-h-[58px] flex-wrap content-start gap-1.5 rounded-lg border border-dashed border-[var(--border-strong)] bg-ink-950 p-2"
              >
                {loose.map((it, i) => (
                  <Thumb key={it.key} it={it} index={i} zone="loose" size="sm" />
                ))}
                {!loose.length && (
                  <p className="px-1 py-3.5 text-[11.5px] text-ink-500">
                    {items.length ? "Todos os arquivos já estão agrupados." : "Solte arquivos acima para começar."}
                  </p>
                )}
              </div>
            </div>

            {groups.map((g, gi) => {
              const list = g.keys.map((k) => byKey.get(k)!).filter(Boolean);
              return (
                <div
                  key={g.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (laneOver !== g.id) setLaneOver(g.id);
                  }}
                  onDragLeave={() => setLaneOver((v) => (v === g.id ? null : v))}
                  onDrop={(e) => {
                    e.preventDefault();
                    moveTo(g.id);
                  }}
                  className={`rounded-lg border p-3 transition ${
                    laneOver === g.id ? "border-v4-red bg-v4-red/5" : "border-[var(--border-strong)] bg-ink-850"
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Icon name="grip" size={14} className="text-ink-500" />
                    <span className="text-[12.5px] font-semibold text-ink-100">Criativo {gi + 1}</span>
                    <span className="tnum font-mono text-[11px] text-ink-400">
                      {list.length ? `${list.length} ${format === "reels" ? "vídeo" : "arquivo"}${list.length > 1 ? "s" : ""}` : "vazio"}
                    </span>
                    {groups.length > 1 && (
                      <button
                        type="button"
                        className="ml-auto text-ink-500 transition hover:text-v4-red"
                        onClick={() => setGroups((gs) => gs.filter((x) => x.id !== g.id))}
                        aria-label={`Remover criativo ${gi + 1}`}
                        disabled={sending}
                      >
                        <Icon name="x" size={14} />
                      </button>
                    )}
                  </div>
                  <div className="flex min-h-[52px] flex-wrap content-start gap-1.5">
                    {list.map((it, i) => (
                      <Thumb key={it.key} it={it} index={i} zone={g.id} size="sm" />
                    ))}
                    {!list.length && <p className="px-1 py-4 text-[11.5px] text-ink-500">Solte arquivos aqui</p>}
                  </div>
                  <input
                    type="text"
                    className="field mt-2 py-1.5 text-[12.5px]"
                    placeholder="Legenda deste criativo"
                    value={g.caption}
                    maxLength={CAPTION_MAX}
                    disabled={sending}
                    onChange={(e) =>
                      setGroups((gs) => gs.map((x) => (x.id === g.id ? { ...x, caption: e.target.value } : x)))
                    }
                  />
                </div>
              );
            })}

            <button
              type="button"
              className="flex h-9 items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border-strong)] text-[12.5px] font-semibold text-ink-300 transition hover:bg-ink-850 hover:text-ink-100"
              onClick={() => setGroups((gs) => [...gs, newGroup()])}
              disabled={sending}
            >
              <Icon name="plus" size={14} />
              Novo grupo
            </button>

            {groups.filter((g) => g.keys.length).length > 1 && (
              <details className="rounded-lg border border-[var(--border-hair)] px-3 py-2 text-[13px]">
                <summary className="cursor-pointer font-semibold text-ink-300">Colar legendas em bloco</summary>
                <p className="mt-2 text-[12px] text-ink-500">
                  Use <code className="font-mono">[arquivo.jpg]</code> antes da legenda para casar pelo primeiro
                  arquivo do grupo, ou separe com <code className="font-mono">---</code> para casar na ordem dos
                  grupos.
                </p>
                <textarea
                  className="field mt-2 min-h-[110px] font-mono text-[12px]"
                  value={bulk}
                  onChange={(e) => setBulk(e.target.value)}
                  placeholder={"[arte-01.jpg]\nLegenda do primeiro criativo.\n\n---\n\nLegenda do segundo."}
                />
                <button type="button" className="btn btn-sm mt-2" onClick={applyBulk} disabled={!bulk.trim()}>
                  Aplicar aos grupos
                </button>
              </details>
            )}
          </div>
        )}

        {/* Prévia: exatamente o que o cliente vai ver. */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label">Prévia</span>
            {vertical && previewAssets.length > 0 && (
              <button type="button" className="text-[12px] font-semibold text-v4-red hover:underline" onClick={() => setViewer(0)}>
                Assistir em tela cheia
              </button>
            )}
          </div>
          {previewAssets.length === 0 ? (
            <div className="grid place-items-center rounded-lg border border-dashed border-[var(--border-strong)] bg-ink-950 px-6 py-8 text-center text-[12px] text-ink-500">
              A prévia aparece aqui assim que você escolher os arquivos.
            </div>
          ) : (
            <div className="mx-auto max-w-[300px]">
              <div className="sm-scope">
                {vertical ? (
                  <VerticalPreview
                    key={`${format}-${mode}`}
                    format={format}
                    assets={previewAssets}
                    caption={previewCaption}
                    handle={handle}
                    onExpand={() => setViewer(0)}
                  />
                ) : (
                  <InstagramPreview handle={handle} assets={previewAssets} caption={previewCaption} />
                )}
              </div>
              {nCreatives > 1 && (
                <p className="mt-2 text-center text-[11.5px] text-ink-500">Mostrando o 1º de {nCreatives} criativos.</p>
              )}
            </div>
          )}
        </div>

        {summary && (
          <p className="flex items-start gap-2 rounded-lg bg-amarelo-dim px-3 py-2 text-[13px] font-medium text-amarelo-fg" role="status">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
            {summary}
          </p>
        )}

        {sending && (
          <div className="progress-bar" aria-label="Progresso do envio">
            <i style={{ width: `${Math.round(overall * 100)}%` }} />
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-2 rounded-b-xl border-t border-[var(--border-hair)] bg-ink-850 px-4 py-3.5 sm:px-5">
        <button
          type="button"
          className="btn btn-primary flex-1"
          onClick={() => void submit(false)}
          disabled={sending || !nCreatives}
          aria-busy={sending}
        >
          {sending ? <span className="spinner" aria-hidden /> : <Icon name="check" size={15} />}
          {ctaLabel}
        </button>
        {sending ? (
          <button type="button" className="btn btn-ghost" onClick={cancel}>
            Cancelar envio
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => void submit(true)} disabled={!nCreatives}>
            Salvar rascunho
          </button>
        )}
        {!sending && active.length > 0 && (
          <span className="text-[11.5px] text-ink-500">
            {active.length} arquivo(s) · {fmtMB(totalBytes)}
          </span>
        )}
      </footer>

      {viewer !== null && viewerItems[0]?.assets.length ? (
        <StoryViewer items={viewerItems} startIndex={viewer} handle={handle} onClose={() => setViewer(null)} />
      ) : null}
    </section>
  );
}
