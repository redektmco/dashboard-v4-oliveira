"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { encodeQR, qrPath } from "@/lib/qr";

/**
 * QR de verdade (não um desenho): o cliente aponta a câmera e o link abre.
 * Fundo branco com margem própria — leitor nenhum lê QR escuro e colado na
 * borda. Um `<path>` só, em vez de um elemento por módulo.
 */
function QRCode({ value, size = 132 }: { value: string; size?: number }) {
  const matrix = useMemo(() => (value ? encodeQR(value) : null), [value]);
  if (!matrix) return null;
  const n = matrix.length;
  const quiet = 4; // zona de silêncio exigida pela especificação
  const box = n + quiet * 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${box} ${box}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code do link de aprovação"
    >
      <rect width={box} height={box} fill="#fff" />
      <g transform={`translate(${quiet} ${quiet})`}>
        <path d={qrPath(matrix)} fill="#000" />
      </g>
    </svg>
  );
}

/**
 * Confirmação de envio: o criativo saiu do painel e agora existe um link
 * para mandar. A tela inteira tem um trabalho — fazer o link chegar ao
 * cliente — então copiar e WhatsApp ficam do lado do QR, não escondidos.
 */
export function ApprovalLinkModal({
  open,
  onClose,
  url,
  count,
  clientName,
  title = "Criativo enviado para aprovação",
}: {
  open: boolean;
  onClose: () => void;
  url: string;
  /** Quantos criativos este envio colocou no link. */
  count: number;
  clientName: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast("Não foi possível copiar. Selecione o link e copie manualmente.", { tone: "error" });
    }
  };

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(
    `Oi! Separei ${count > 1 ? `${count} criativos` : "um criativo"} para você aprovar. É rápido, dá pra fazer pelo celular 👇\n\n${url}`,
  )}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={count > 1 ? `${count} criativos enviados para aprovação` : title}
      description={`${clientName} recebe o link e responde por criativo.`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="mx-auto shrink-0 rounded-xl bg-white p-2 sm:mx-0">
          <QRCode value={url} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">
              Link de aprovação
            </div>
            <div className="flex gap-2">
              <input
                className="field min-w-0 flex-1 font-mono text-[12px]"
                readOnly
                value={url}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Link de aprovação"
              />
              <button type="button" className={`btn shrink-0 ${copied ? "" : "btn-primary"}`} onClick={copy}>
                <Icon name={copied ? "check" : "copy"} size={14} />
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>

          <p className="text-[13px] leading-relaxed text-ink-300">
            O cliente abre pelo celular, sem login. Aprova, reprova ou pede ajuste por criativo — e a resposta
            volta direto para esta lista.
          </p>

          <div className="flex flex-wrap gap-2">
            <a className="btn" href={whatsapp} target="_blank" rel="noreferrer">
              <Icon name="message" size={14} />
              Enviar no WhatsApp
            </a>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
