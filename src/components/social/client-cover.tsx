"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { COVER_FOLDER, MAX_COVER_BYTES, initials } from "@/lib/social/clients";
import { IMAGE_TYPES } from "@/lib/social/media";

/**
 * Capa do cliente na grade. Arte externa (Vercel Blob, domínio dinâmico),
 * então `<img loading="lazy">` com `object-fit: cover` — nunca distorce e não
 * acopla o next/image a um domínio. Sem arte, monograma com as iniciais sobre
 * superfície sólida (a marca não usa gradiente).
 */
export function ClientCover({
  name,
  imageUrl,
  className = "",
  monogramSize = 26,
}: {
  name: string;
  imageUrl: string | null;
  className?: string;
  monogramSize?: number;
}) {
  return (
    <div className={`sm-thumb ${className}`}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- capa externa (Vercel Blob), domínio dinâmico
        <img src={imageUrl} alt="" loading="lazy" />
      ) : (
        <span className="sm-thumb-fallback" style={{ fontSize: monogramSize }} aria-hidden>
          {initials(name)}
        </span>
      )}
    </div>
  );
}

async function saveCover(key: string, imageUrl: string | null) {
  const res = await fetch("/api/social/clients/cover", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, imageUrl }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `Erro ${res.status}.`);
  }
}

const MB = (n: number) => `${Math.round(n / (1024 * 1024))} MB`;

/**
 * Folha de troca da capa: envia direto ao Blob (o arquivo não passa pela
 * função nem pelo proxy) e só então grava a URL. Remover apaga a arte —
 * o cartão volta ao monograma.
 */
export function ClientCoverModal({
  open,
  onClose,
  clientKey,
  name,
  imageUrl,
}: {
  open: boolean;
  onClose: () => void;
  clientKey: string;
  name: string;
  imageUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File) => {
    setError(null);
    if (!IMAGE_TYPES.includes(file.type))
      return setError("Formato não aceito. Use JPG, PNG, WebP, AVIF ou GIF.");
    if (file.size > MAX_COVER_BYTES)
      return setError(`Imagem muito grande (máximo ${MB(MAX_COVER_BYTES)}).`);

    setBusy(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const { url } = await upload(`social/${COVER_FOLDER}/${Date.now()}-${safe}`, file, {
        access: "public",
        handleUploadUrl: "/api/social/upload",
        clientPayload: JSON.stringify({ cover: true }),
      });
      await saveCover(clientKey, url);
      toast("Capa atualizada.");
      router.refresh();
      onClose();
    } catch (e) {
      setError((e as Error).message || "Falha ao enviar a imagem.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    setError(null);
    setBusy(true);
    try {
      await saveCover(clientKey, null);
      toast("Capa removida.");
      router.refresh();
      onClose();
    } catch (e) {
      setError((e as Error).message || "Falha ao remover a capa.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Capa de “${name}”`}
      description="A imagem identifica o cliente na grade. Corta no centro em 16:9 — logo ou foto da marca funcionam bem."
      size="sm"
    >
      <div className="panel">
        <ClientCover name={name} imageUrl={imageUrl} monogramSize={40} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-sm" onClick={() => inputRef.current?.click()} disabled={busy} aria-busy={busy}>
          {busy ? <span className="spinner" aria-hidden /> : <Icon name="upload" size={14} />}
          {imageUrl ? "Trocar imagem" : "Enviar imagem"}
        </button>
        {imageUrl && (
          <button type="button" className="btn btn-sm" onClick={() => void remove()} disabled={busy}>
            <Icon name="trash" size={14} />
            Remover
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
          }}
        />
      </div>

      <p className="mt-2 text-[11.5px] text-ink-500">JPG, PNG, WebP, AVIF ou GIF até {MB(MAX_COVER_BYTES)}.</p>
      {error && <p className="mt-1.5 text-[12px] text-vermelho-fg">{error}</p>}
    </Modal>
  );
}
