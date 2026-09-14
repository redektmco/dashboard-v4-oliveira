"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Icon } from "@/components/icon";

/**
 * Upload de imagem (banner/thumbnail) direto ao Vercel Blob pelo navegador —
 * o arquivo não passa pela função nem pelo proxy. Campo controlado: devolve a
 * URL pública em `onChange`. Mostra preview e permite trocar/remover.
 */
export function ImageUpload({
  value,
  onChange,
  kind,
  aspect = "16/6",
  hint,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  kind: "banner" | "thumb";
  aspect?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File) {
    setError(null);
    setBusy(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const result = await upload(`onboarding/${kind}/${Date.now()}-${safe}`, file, {
        access: "public",
        handleUploadUrl: "/api/onboarding/upload",
      });
      onChange(result.url);
    } catch (e) {
      setError((e as Error).message || "Falha no upload.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-lg border border-dashed border-[var(--border-strong)] bg-ink-850"
        style={{ aspectRatio: aspect }}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview de imagem externa (Blob)
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-ink-500">
            <Icon name="image" size={28} stroke={1.25} />
            <span className="text-[12px]">{hint ?? "Nenhuma imagem enviada"}</span>
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <span className="spinner" aria-hidden />
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button type="button" className="btn btn-sm" onClick={() => inputRef.current?.click()} disabled={busy}>
          <Icon name="upload" size={14} />
          {value ? "Trocar imagem" : "Enviar imagem"}
        </button>
        {value && (
          <button type="button" className="btn btn-sm" onClick={() => onChange(null)} disabled={busy}>
            Remover
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
          }}
        />
      </div>
      {error && <p className="mt-1.5 text-[12px] text-vermelho-fg">{error}</p>}
    </div>
  );
}
