"use client";

import "./reports.css";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { Icon } from "@/components/icon";
import { periodLabel } from "@/lib/reports/metrics";
import { PAGE, type Page } from "@/lib/reports/types";
import { PageView, type RenderCtx } from "./blocks";

/** Largura do elemento, acompanhando o redimensionamento. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Página no tamanho pedido: o conteúdo é o da página em px, escalado por fora. */
export function ScaledPage({
  page,
  ctx,
  scale,
  className = "",
  children,
}: {
  page: Page;
  ctx: RenderCtx;
  scale: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const { w, h } = PAGE[ctx.format];
  return (
    <div className={`rp-scaled ${className}`} style={{ width: w * scale, height: h * scale }}>
      <PageView page={page} ctx={ctx} style={{ transform: `scale(${scale})` }}>
        {children}
      </PageView>
    </div>
  );
}

/* ------------------------------ impressão ------------------------------ */

/**
 * Raiz de impressão: todas as páginas em tamanho real, fora da tela. O PDF
 * sai do "Salvar como PDF" do navegador — sem serviço pago, igual ao que se
 * vê. O `@page` acompanha o formato (A4 em pé ou slide 16:9).
 */
export function PrintRoot({ pages, ctx }: { pages: Page[]; ctx: RenderCtx }) {
  const [mounted, setMounted] = useState(false);
  // O portal só existe no navegador: no servidor não há document.body.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- montagem do portal
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const { w, h } = PAGE[ctx.format];
  return createPortal(
    <div className="rp-print-root">
      <style>{`@page { size: ${w}px ${h}px; margin: 0; }`}</style>
      {pages.map((p) => (
        <PageView key={p.id} page={p} ctx={ctx} />
      ))}
    </div>,
    document.body,
  );
}

/** Abre o "Imprimir / Salvar como PDF" só com o relatório. */
export function printReport(title?: string) {
  const html = document.documentElement;
  const prevTitle = document.title;
  // O nome do arquivo sugerido pelo navegador é o título da página.
  if (title) document.title = title;
  html.classList.add("rp-printing");
  const done = () => {
    html.classList.remove("rp-printing");
    document.title = prevTitle;
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  // Um quadro para as imagens e fontes da raiz de impressão assentarem.
  requestAnimationFrame(() => setTimeout(() => window.print(), 60));
}

/* ----------------------------- apresentação ----------------------------- */

/**
 * Modo apresentação: tela cheia, uma página por vez, ajustada à tela.
 * Setas, espaço e PageUp/PageDown navegam; Esc sai. Clique na metade
 * direita avança, na esquerda volta. Sem tela cheia (iPhone), vira camada
 * fixa sobre a página — funciona igual.
 */
export function Presenter({
  pages,
  ctx,
  start = 0,
  onClose,
}: {
  pages: Page[];
  ctx: RenderCtx;
  start?: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(Math.min(start, pages.length - 1));
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const { w, h } = PAGE[ctx.format];

  const go = useCallback((d: number) => setI((x) => Math.max(0, Math.min(pages.length - 1, x + d))), [pages.length]);

  useEffect(() => {
    const el = ref.current;
    el?.requestFullscreen?.().catch(() => {});
    const measure = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) {
        e.preventDefault();
        go(1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Home") setI(0);
      else if (e.key === "End") setI(pages.length - 1);
      else if (e.key === "Escape" && !document.fullscreenElement) onClose();
    };
    // Sair da tela cheia pelo Esc do navegador também fecha a apresentação.
    const onFs = () => !document.fullscreenElement && onClose();
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFs);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFs);
      document.body.style.overflow = prev;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [go, onClose, pages.length]);

  const scale = vp.w ? Math.min(vp.w / w, vp.h / h) : 0;
  const page = pages[i];

  return createPortal(
    <div
      ref={ref}
      className="rp-present"
      role="dialog"
      aria-modal="true"
      aria-label="Apresentação"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(".rp-present-bar")) return;
        go(e.clientX > window.innerWidth / 2 ? 1 : -1);
      }}
    >
      <div className="rp-present-progress" style={{ width: `${((i + 1) / pages.length) * 100}%` }} />
      {page && scale > 0 && <ScaledPage page={page} ctx={ctx} scale={scale} />}
      <div className="rp-present-bar">
        <button type="button" onClick={() => go(-1)} aria-label="Anterior" disabled={i === 0}>
          <Icon name="chevronLeft" size={18} />
        </button>
        <span className="tnum min-w-[56px] text-center">
          {i + 1} / {pages.length}
        </span>
        <button type="button" onClick={() => go(1)} aria-label="Próxima" disabled={i === pages.length - 1}>
          <Icon name="chevronRight" size={18} />
        </button>
        <button type="button" onClick={onClose} aria-label="Sair da apresentação">
          <Icon name="x" size={17} />
        </button>
      </div>
    </div>,
    document.body,
  );
}

/* --------------------------- link do cliente --------------------------- */

/** O que o cliente vê no link público: as páginas, apresentar e baixar PDF. */
export function ReportViewer({
  title,
  pages,
  ctx,
}: {
  title: string;
  pages: Page[];
  ctx: RenderCtx;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [presenting, setPresenting] = useState(false);
  const { w } = PAGE[ctx.format];
  const scale = width ? Math.min(1, width / w) : 0;
  const fileName = `${title} - ${periodLabel(ctx.data.period.start, ctx.data.period.end)}`;

  return (
    <div className="min-h-dvh w-full" style={{ background: "#0b0b0c" }}>
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b0b0c]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1320px] items-center gap-3 px-4 py-3 sm:px-6">
          <Image src="/brand/v4-simbolo.webp" alt="V4 Company" width={26} height={26} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate font-display text-[14px] font-semibold text-white">{title}</div>
            <div className="truncate text-[12px] text-ink-400">
              {ctx.data.client?.name ? `${ctx.data.client.name} · ` : ""}
              {periodLabel(ctx.data.period.start, ctx.data.period.end)}
            </div>
          </div>
          <button type="button" className="btn btn-sm hidden sm:inline-flex" onClick={() => setPresenting(true)}>
            <Icon name="play" size={14} />
            Apresentar
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => printReport(fileName)}>
            <Icon name="download" size={14} />
            Baixar PDF
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6 sm:py-10">
        {/* A largura medida é a da coluna, já sem o respiro lateral. */}
        <div ref={ref} className="flex w-full flex-col items-center gap-6">
          {scale > 0 && pages.map((p) => <ScaledPage key={p.id} page={p} ctx={ctx} scale={scale} className="rp-shadow" />)}
          <p className="pb-4 text-center text-[12px] text-ink-500">Relatório preparado pela V4 Oliveira &amp; Co.</p>
        </div>
      </main>

      {presenting && <Presenter pages={pages} ctx={ctx} onClose={() => setPresenting(false)} />}
      <PrintRoot pages={pages} ctx={ctx} />
    </div>
  );
}

