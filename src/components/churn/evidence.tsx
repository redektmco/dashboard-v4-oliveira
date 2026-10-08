"use client";

import { upload } from "@vercel/blob/client";
import { useRef, useState } from "react";
import type { Evidence } from "@/lib/churn/types";
import { CHURN_FOLDER, EVIDENCE_ACCEPT, MAX_EVIDENCE_BYTES } from "@/lib/churn/storage";
import { Icon } from "../icon";

export const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const isImage = (name: string) => /\.(png|jpe?g)$/i.test(name);

/**
 * Área de soltar das evidências: envia cada arquivo direto ao Blob e devolve
 * a lista (nome, URL, tamanho) para o formulário guardar num campo oculto.
 */
export function EvidenceDrop({
  files,
  onChange,
  folder,
  compact = false,
}: {
  files: Evidence[];
  onChange: (f: Evidence[]) => void;
  folder: string;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (list: FileList | File[]) => {
    setError(null);
    const arr = Array.from(list);
    const added: Evidence[] = [];
    for (const file of arr) {
      if (file.size > MAX_EVIDENCE_BYTES) {
        setError(`${file.name}: arquivo maior que 10 MB.`);
        continue;
      }
      if (!/\.(pdf|png|jpe?g|eml)$/i.test(file.name)) {
        setError(`${file.name}: formato não aceito. Use PDF, PNG, JPG ou EML.`);
        continue;
      }
      setBusy((b) => b + 1);
      try {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        const blob = await upload(`${CHURN_FOLDER}/${folder}/${Date.now()}-${safe}`, file, {
          access: "public",
          handleUploadUrl: "/api/churn/upload",
          contentType: file.type || "application/octet-stream",
        });
        added.push({ name: file.name, url: blob.url, size: file.size, at: new Date().toISOString() });
      } catch (e) {
        setError((e as Error).message || `Falha ao enviar ${file.name}.`);
      } finally {
        setBusy((b) => b - 1);
      }
    }
    if (added.length) onChange([...files, ...added]);
    if (input.current) input.current.value = "";
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div
        role="button"
        tabIndex={0}
        data-over={over ? "" : undefined}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void send(e.dataTransfer.files);
        }}
        className={`dropzone ${compact ? "!py-3" : ""}`}
      >
        {busy > 0 ? <span className="spinner" aria-hidden /> : <Icon name="upload" size={18} className="text-ink-400" />}
        <span className="text-[13px] text-ink-100">{busy > 0 ? "Enviando…" : "Arraste arquivos ou clique para selecionar"}</span>
        {!compact && <span className="text-[12px] text-ink-500">PDF, PNG, JPG ou EML · até 10 MB</span>}
        <input ref={input} type="file" multiple accept={EVIDENCE_ACCEPT} className="hidden" onChange={(e) => e.target.files && send(e.target.files)} />
      </div>
      {error && <p className="text-[12px] text-vermelho-fg">{error}</p>}
      {files.map((f) => (
        <div key={f.url} className="flex items-center gap-2.5 rounded-lg bg-ink-850 px-3 py-2.5">
          <Icon name={isImage(f.name) ? "image" : "fileText"} size={16} className="shrink-0 text-ink-400" />
          <span className="min-w-0 flex-1">
            <a href={f.url} target="_blank" rel="noreferrer" className="block truncate text-[13px] text-ink-100 hover:underline">
              {f.name}
            </a>
            <span className="text-[11px] text-ink-500">{kb(f.size)} · enviado agora</span>
          </span>
          <button type="button" className="modal-x" aria-label={`Remover ${f.name}`} onClick={() => onChange(files.filter((x) => x.url !== f.url))}>
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Arquivo já anexado (somente leitura). */
export function EvidenceFile({ f }: { f: Evidence }) {
  return (
    <a
      href={f.url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 rounded-md border border-[var(--border-hair)] px-2.5 py-2 hover:bg-ink-850"
    >
      <Icon name={isImage(f.name) ? "image" : "fileText"} size={14} className="shrink-0 text-ink-400" />
      <span className="min-w-0 flex-1 truncate text-[12px] text-ink-100">{f.name}</span>
      <span className="shrink-0 text-[11px] text-ink-500">{kb(f.size)}</span>
    </a>
  );
}
