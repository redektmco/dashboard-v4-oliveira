"use client";

import "./reports.css";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ActionMenu } from "@/components/action-menu";
import { CopyField } from "@/components/copy-field";
import { Segmented } from "@/components/form-controls";
import { Icon } from "@/components/icon";
import { ConfirmDialog, Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { deleteReportAction, duplicateReportAction, saveAsTemplateAction } from "@/actions/reports";
import { BLOCKS, blockRect, cellSize, clampBlock, cloneBlock, clonePage, freeSpot, newBlock, uid } from "@/lib/reports/layout";
import { periodLabel, PRESET_LABEL, presetRange, type PeriodPreset } from "@/lib/reports/metrics";
import {
  FORMAT_LABEL,
  PAGE,
  PAGE_PAD,
  type Block,
  type BlockType,
  type Page,
  type Report,
  type ReportData,
  type ReportDoc,
  type Theme,
} from "@/lib/reports/types";
import { HEADING_PX, TEXT_PX, type RenderCtx } from "./blocks";
import { EditorPage, type Drag, type Ghost, type PageHandlers } from "./editor-page";
import { BlockInspector, ColorField, Field, Section } from "./inspector";
import { Presenter, PrintRoot, printReport, ScaledPage, useWidth } from "./viewer";

type ClientOpt = { id: number; name: string };
type Panel = "add" | "pages" | "settings";
type Sel = { pageId: string; blockId: string } | null;
type Hist = { past: ReportDoc[]; present: ReportDoc; future: ReportDoc[]; key: string | null; at: number };

const ZOOMS = [0.5, 0.75, 1] as const;

/* ------------------------------ helpers ------------------------------ */

const mapPage = (d: ReportDoc, pageId: string, fn: (p: Page) => Page): ReportDoc => ({
  ...d,
  pages: d.pages.map((p) => (p.id === pageId ? fn(p) : p)),
});

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

/**
 * O construtor só existe no computador: a tela pequena ganha a prévia.
 * `print` entra na consulta porque, ao imprimir, o navegador troca a largura
 * pela da folha (794px no A4) — sem isso o editor virava a prévia de celular
 * no meio da impressão e o PDF saía em branco.
 */
const wideQuery = "(min-width: 1024px), print";
const subscribeWide = (cb: () => void) => {
  const m = window.matchMedia(wideQuery);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/* ------------------------------- editor ------------------------------- */

export function ReportEditor({
  report,
  initialData,
  clients,
  today,
}: {
  report: Report;
  initialData: ReportData;
  clients: ClientOpt[];
  today: string;
}) {
  const isTemplate = report.kind === "template";
  const format = report.format;
  const { w: pageW } = PAGE[format];
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(wideQuery).matches, () => true);

  /* ---------- documento + desfazer ---------- */
  const [hist, setHist] = useState<Hist>({ past: [], present: report.doc, future: [], key: null, at: 0 });
  const doc = hist.present;

  /** Aplica uma mudança. Mesma `key` em sequência (digitação) vira um passo só do desfazer. */
  const commit = useCallback((fn: (d: ReportDoc) => ReportDoc, key?: string) => {
    setHist((h) => {
      const next = fn(h.present);
      if (next === h.present) return h;
      const now = Date.now();
      const merge = Boolean(key) && h.key === key && now - h.at < 1500;
      return { past: merge ? h.past : [...h.past.slice(-100), h.present], present: next, future: [], key: key ?? null, at: now };
    });
  }, []);
  const undo = useCallback(
    () =>
      setHist((h) =>
        h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], key: null, at: 0 } : h,
      ),
    [],
  );
  const redo = useCallback(
    () => setHist((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), key: null, at: 0 } : h)),
    [],
  );

  /* ---------- meta do relatório ---------- */
  const [title, setTitle] = useState(report.title);
  const [clientId, setClientId] = useState<number | null>(report.clientId);
  const fallbackPeriod = useMemo(() => presetRange("last_month", today), [today]);
  const [period, setPeriod] = useState({ start: report.periodStart ?? fallbackPeriod.start, end: report.periodEnd ?? fallbackPeriod.end });
  const [data, setData] = useState(initialData);
  const [loadingData, setLoadingData] = useState(false);
  const [shareToken, setShareToken] = useState(report.shareToken);

  /* ---------- salvamento automático ---------- */
  const [saved, setSaved] = useState(report.doc);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const persist = useCallback(
    (body: Record<string, unknown>) => {
      const run = async () => {
        const res = await fetch(`/api/relatorios/${report.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(j.error || "Não foi possível salvar.");
      };
      // Em fila: um salvamento nunca atropela o anterior.
      const p = queue.current.then(run, run);
      queue.current = p.catch(() => {});
      return p;
    },
    [report.id],
  );

  const saveDoc = useCallback(
    (sent: ReportDoc) => {
      setSaving(true);
      persist({ doc: sent })
        .then(() => {
          setSaved(sent);
          setSaveError(null);
        })
        .catch((e: Error) => setSaveError(e.message))
        .finally(() => setSaving(false));
    },
    [persist],
  );

  useEffect(() => {
    if (doc === saved) return;
    const t = setTimeout(() => saveDoc(doc), 900);
    return () => clearTimeout(t);
  }, [doc, saved, saveDoc]);

  const dirty = doc !== saved;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const saveMeta = useCallback(
    (body: Record<string, unknown>) => {
      if (isTemplate && !("title" in body)) return; // modelo: cliente e período são só prévia
      persist(body).catch((e: Error) => toast(e.message, { tone: "error" }));
    },
    [persist, isTemplate],
  );

  const reload = useCallback(async (cid: number | null, start: string, end: string) => {
    setLoadingData(true);
    try {
      const q = new URLSearchParams({ start, end, ...(cid ? { client: String(cid) } : {}) });
      const res = await fetch(`/api/relatorios/dados?${q}`);
      const j = (await res.json().catch(() => ({}))) as { data?: ReportData; error?: string };
      if (!res.ok || !j.data) throw new Error(j.error || "Não foi possível carregar os números.");
      setData(j.data);
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setLoadingData(false);
    }
  }, []);

  /* ---------- sincronizar com Meta e Google ---------- */
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  /**
   * Lê Meta e Google ao vivo no período exato (rota `sincronizar`). Num
   * relatório a leitura fica gravada — é ela que o link público mostra.
   * Devolve false quando não deu (sem conta vinculada, API fora): aí quem
   * chamou cai nas semanas do banco.
   */
  const sync = useCallback(
    async (cid: number | null, start: string, end: string, { quiet = false } = {}) => {
      if (!cid) return false;
      setSyncing(true);
      setSyncError(null);
      try {
        const res = await fetch(`/api/relatorios/${report.id}/sincronizar`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientId: cid, start, end }),
        });
        const j = (await res.json().catch(() => ({}))) as { data?: ReportData; error?: string };
        if (!res.ok || !j.data) throw new Error(j.error || "Não foi possível sincronizar com a Meta e o Google.");
        setData(j.data);
        const errors = j.data.source.kind === "live" ? j.data.source.errors : [];
        if (errors.length) toast(`Sincronizado, mas ficou de fora: ${errors.map((e) => `${e.account} (${e.error})`).join(" · ")}`, { tone: "error" });
        else if (!quiet) toast("Números atualizados com a Meta e o Google.");
        return true;
      } catch (e) {
        const msg = (e as Error).message;
        setSyncError(msg);
        if (!quiet) toast(msg, { tone: "error" });
        return false;
      } finally {
        setSyncing(false);
      }
    },
    [report.id],
  );

  // Ao abrir: sem leitura ao vivo, ou com mais de 1 hora, sincroniza sozinho.
  const autoSynced = useRef(false);
  useEffect(() => {
    if (autoSynced.current || !clientId) return;
    const src = initialData.source;
    const stale = src.kind !== "live" || Date.now() - Date.parse(src.at) > 60 * 60 * 1000;
    if (!stale) return;
    // A trava vale só quando dispara: o efeito montado duas vezes (Strict
    // Mode) cancela o primeiro agendamento e o segundo segue.
    const t = setTimeout(() => {
      autoSynced.current = true;
      sync(clientId, period.start, period.end, { quiet: true });
    }, 0);
    return () => clearTimeout(t);
  }, [clientId, initialData.source, period.start, period.end, sync]);

  /** Cliente ou período mudou: tenta a leitura ao vivo; sem ela, o banco. */
  const refresh = (cid: number | null, start: string, end: string) => {
    if (!cid) return reload(cid, start, end);
    sync(cid, start, end, { quiet: true }).then((ok) => {
      if (!ok) reload(cid, start, end);
    });
  };
  const changeClient = (cid: number | null) => {
    setClientId(cid);
    saveMeta({ clientId: cid });
    refresh(cid, period.start, period.end);
  };
  const changePeriod = (p: { start: string; end: string }) => {
    if (!p.start || !p.end || p.start > p.end) return;
    setPeriod(p);
    saveMeta({ periodStart: p.start, periodEnd: p.end });
    refresh(clientId, p.start, p.end);
  };

  /* ---------- seleção e painéis ---------- */
  const [sel, setSel] = useState<Sel>(null);
  const [panel, setPanel] = useState<Panel>("add");
  const [currentPage, setCurrentPage] = useState(doc.pages[0]?.id ?? "");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [zoom, setZoom] = useState<"fit" | (typeof ZOOMS)[number]>("fit");
  const [presenting, setPresenting] = useState<number | null>(null);
  const [modal, setModal] = useState<"share" | "template" | "delete" | null>(null);

  const selPage = sel ? doc.pages.find((p) => p.id === sel.pageId) : undefined;
  const selBlock = sel ? selPage?.blocks.find((b) => b.id === sel.blockId) : undefined;
  // Bloco desfeito/excluído some da seleção sozinho.
  const selection = selBlock ? sel : null;
  const pageIds = doc.pages.map((p) => p.id);
  const current = pageIds.includes(currentPage) ? currentPage : pageIds[0];

  const [canvasRef, canvasW] = useWidth<HTMLDivElement>();
  const fit = canvasW ? Math.min(1, (canvasW - 96) / pageW) : 0;
  const scale = zoom === "fit" ? fit : zoom;

  const ctx: RenderCtx = useMemo(() => ({ data, format, today, theme: doc.theme }), [data, format, today, doc.theme]);

  /* ---------- operações ---------- */
  const updateBlock = useCallback(
    (pageId: string, blockId: string, patch: Record<string, unknown>, key?: string) =>
      commit((d) => mapPage(d, pageId, (p) => ({ ...p, blocks: p.blocks.map((b) => (b.id === blockId ? ({ ...b, ...patch } as Block) : b)) })), key),
    [commit],
  );

  const addBlock = useCallback(
    (type: BlockType, pageId: string, at?: { x: number; y: number }) => {
      const page = doc.pages.find((p) => p.id === pageId);
      if (!page) return;
      const [w, h] = BLOCKS[type].size[format];
      const pos = at ?? freeSpot(format, page.blocks, w, h);
      const b = newBlock(type, format, pos);
      commit((d) => mapPage(d, pageId, (p) => ({ ...p, blocks: [...p.blocks, b] })));
      setSel({ pageId, blockId: b.id });
      setCurrentPage(pageId);
    },
    [commit, doc.pages, format],
  );

  const removeBlock = useCallback(
    (pageId: string, blockId: string) => {
      commit((d) => mapPage(d, pageId, (p) => ({ ...p, blocks: p.blocks.filter((b) => b.id !== blockId) })));
      setSel(null);
    },
    [commit],
  );

  const duplicateBlock = useCallback(
    (pageId: string, blockId: string) => {
      const page = doc.pages.find((p) => p.id === pageId);
      const b = page?.blocks.find((x) => x.id === blockId);
      if (!page || !b) return;
      const rows = PAGE[format].rows;
      // A cópia vai logo abaixo; sem espaço, para o primeiro lugar livre.
      const below = b.y + b.h + b.h <= rows ? { x: b.x, y: b.y + b.h } : freeSpot(format, page.blocks, b.w, b.h);
      const copy = clampBlock(format, { ...cloneBlock(b), ...below });
      commit((d) => mapPage(d, pageId, (p) => ({ ...p, blocks: [...p.blocks, copy] })));
      setSel({ pageId, blockId: copy.id });
    },
    [commit, doc.pages, format],
  );

  const orderBlock = useCallback(
    (pageId: string, blockId: string, to: "front" | "back") =>
      commit((d) =>
        mapPage(d, pageId, (p) => {
          const b = p.blocks.find((x) => x.id === blockId);
          if (!b) return p;
          const rest = p.blocks.filter((x) => x.id !== blockId);
          return { ...p, blocks: to === "front" ? [...rest, b] : [b, ...rest] };
        }),
      ),
    [commit],
  );

  const addPage = (afterId?: string) => {
    const page: Page = { id: uid("p"), blocks: [] };
    commit((d) => {
      const i = afterId ? d.pages.findIndex((p) => p.id === afterId) : d.pages.length - 1;
      const pages = [...d.pages];
      pages.splice(i + 1, 0, page);
      return { ...d, pages };
    });
    setCurrentPage(page.id);
    requestAnimationFrame(() => pageEls.current.get(page.id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const duplicatePage = (id: string) => {
    const src = doc.pages.find((p) => p.id === id);
    if (!src) return;
    const copy = clonePage(src);
    commit((d) => {
      const pages = [...d.pages];
      pages.splice(pages.findIndex((p) => p.id === id) + 1, 0, copy);
      return { ...d, pages };
    });
    setCurrentPage(copy.id);
  };
  const deletePage = (id: string) => {
    if (doc.pages.length <= 1) return toast("O relatório precisa de pelo menos uma página.", { tone: "info" });
    commit((d) => ({ ...d, pages: d.pages.filter((p) => p.id !== id) }));
    setSel(null);
    toast("Página excluída.", { action: { label: "Desfazer", onClick: undo } });
  };
  const movePage = (id: string, dir: -1 | 1) =>
    commit((d) => {
      const i = d.pages.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.pages.length) return d;
      const pages = [...d.pages];
      [pages[i], pages[j]] = [pages[j], pages[i]];
      return { ...d, pages };
    });
  const setTheme = (t: Partial<Theme>) => commit((d) => ({ ...d, theme: { ...d.theme, ...t } }), "theme");

  /* ---------- arrastar e redimensionar ---------- */
  const pageEls = useRef(new Map<string, HTMLDivElement>());
  const paletteType = useRef<BlockType | null>(null);
  const live = useRef({ scale, format, doc });
  useEffect(() => {
    live.current = { scale, format, doc };
  });

  /** Posição do ponteiro na grade da página (células, fracionário). */
  const cellAt = useCallback((pageId: string, cx: number, cy: number) => {
    const el = pageEls.current.get(pageId);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const { cw, ch } = cellSize(live.current.format);
    const s = live.current.scale || 1;
    return { fx: ((cx - r.left) / s - PAGE_PAD) / cw, fy: ((cy - r.top) / s - PAGE_PAD) / ch };
  }, []);

  const pageAt = useCallback((cx: number, cy: number) => {
    for (const [id, el] of pageEls.current) {
      const r = el.getBoundingClientRect();
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return id;
    }
    return null;
  }, []);

  /** Arrasto com listeners na janela: o bloco segue o ponteiro até entre páginas. */
  const track = useCallback((onMove: (e: PointerEvent) => void, onEnd: () => void) => {
    const up = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      onEnd();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }, []);

  const handlersRef = useRef<PageHandlers>(null as unknown as PageHandlers);
  const latest: PageHandlers = {
    register: (id, el) => {
      if (el) pageEls.current.set(id, el);
      else pageEls.current.delete(id);
    },
    pageDown: (id) => {
      setSel(null);
      setEditingId(null);
      setCurrentPage(id);
    },
    blockDown: (e, pageId, b) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      setSel({ pageId, blockId: b.id });
      setCurrentPage(pageId);
      setEditingId(null);
      const c = cellAt(pageId, e.clientX, e.clientY);
      if (!c) return;
      const grab = { gx: c.fx - b.x, gy: c.fy - b.y };
      const start = { x: e.clientX, y: e.clientY };
      let last: Drag | null = null;
      track(
        (ev) => {
          if (!last && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
          const to = pageAt(ev.clientX, ev.clientY) ?? last?.toPage ?? pageId;
          const c2 = cellAt(to, ev.clientX, ev.clientY);
          if (!c2) return;
          const pos = clampBlock(live.current.format, { x: c2.fx - grab.gx, y: c2.fy - grab.gy, w: b.w, h: b.h });
          last = { kind: "move", block: b, fromPage: pageId, toPage: to, ...pos };
          setDrag(last);
        },
        () => {
          setDrag(null);
          const d = last;
          if (!d || (d.toPage === pageId && d.x === b.x && d.y === b.y)) return;
          // Mesma página: só a posição muda (a ordem das camadas fica).
          if (d.toPage === pageId) return updateBlock(pageId, b.id, { x: d.x, y: d.y });
          const moved = { ...b, x: d.x, y: d.y } as Block;
          commit((doc0) => {
            const out = mapPage(doc0, pageId, (p) => ({ ...p, blocks: p.blocks.filter((x) => x.id !== b.id) }));
            return mapPage(out, d.toPage, (p) => ({ ...p, blocks: [...p.blocks, moved] }));
          });
          setSel({ pageId: d.toPage, blockId: b.id });
          setCurrentPage(d.toPage);
        },
      );
    },
    handleDown: (e, pageId, b, dir) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const c0 = cellAt(pageId, e.clientX, e.clientY);
      if (!c0) return;
      let last: Drag | null = null;
      track(
        (ev) => {
          const c = cellAt(pageId, ev.clientX, ev.clientY);
          if (!c) return;
          const dx = c.fx - c0.fx;
          const dy = c.fy - c0.fy;
          let { x, y, w, h } = b;
          if (dir.includes("e")) w = Math.max(1, Math.round(b.w + dx));
          if (dir.includes("s")) h = Math.max(1, Math.round(b.h + dy));
          if (dir.includes("w")) {
            x = Math.min(b.x + b.w - 1, Math.max(0, Math.round(b.x + dx)));
            w = b.w + (b.x - x);
          }
          if (dir.includes("n")) {
            y = Math.min(b.y + b.h - 1, Math.max(0, Math.round(b.y + dy)));
            h = b.h + (b.y - y);
          }
          const rows = PAGE[live.current.format].rows;
          w = Math.min(w, 12 - x);
          h = Math.min(h, rows - y);
          last = { kind: "resize", block: b, fromPage: pageId, toPage: pageId, x, y, w, h };
          setDrag(last);
        },
        () => {
          setDrag(null);
          const d = last;
          if (!d || (d.x === b.x && d.y === b.y && d.w === b.w && d.h === b.h)) return;
          updateBlock(pageId, b.id, { x: d.x, y: d.y, w: d.w, h: d.h });
        },
      );
    },
    startEdit: (id) => setEditingId(id),
    commitText: (pageId, blockId, text) => updateBlock(pageId, blockId, { text }, `${blockId}:text`),
    endEdit: () => setEditingId(null),
    duplicate: duplicateBlock,
    remove: removeBlock,
    order: orderBlock,
    dragOver: (e, pageId) => {
      const type = paletteType.current;
      if (!type) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      const c = cellAt(pageId, e.clientX, e.clientY);
      if (!c) return;
      const [w, h] = BLOCKS[type].size[live.current.format];
      const pos = clampBlock(live.current.format, { x: c.fx - w / 2, y: c.fy - h / 2, w, h });
      setGhost((g) => (g && g.pageId === pageId && g.x === pos.x && g.y === pos.y ? g : { pageId, ...pos }));
    },
    dragLeave: (pageId) => setGhost((g) => (g?.pageId === pageId ? null : g)),
    drop: (e, pageId) => {
      const type = paletteType.current;
      if (!type) return;
      e.preventDefault();
      const g = ghost;
      setGhost(null);
      paletteType.current = null;
      addBlock(type, pageId, g && g.pageId === pageId ? { x: g.x, y: g.y } : undefined);
    },
  };
  useLayoutEffect(() => {
    handlersRef.current = latest;
  });
  // Objeto estável para as páginas memorizadas; as funções leem o ref atual.
  const handlers = useMemo<PageHandlers>(
    () => ({
      register: (...a) => handlersRef.current.register(...a),
      pageDown: (...a) => handlersRef.current.pageDown(...a),
      blockDown: (...a) => handlersRef.current.blockDown(...a),
      handleDown: (...a) => handlersRef.current.handleDown(...a),
      startEdit: (...a) => handlersRef.current.startEdit(...a),
      commitText: (...a) => handlersRef.current.commitText(...a),
      endEdit: () => handlersRef.current.endEdit(),
      duplicate: (...a) => handlersRef.current.duplicate(...a),
      remove: (...a) => handlersRef.current.remove(...a),
      order: (...a) => handlersRef.current.order(...a),
      dragOver: (...a) => handlersRef.current.dragOver(...a),
      dragLeave: (...a) => handlersRef.current.dragLeave(...a),
      drop: (...a) => handlersRef.current.drop(...a),
    }),
    [],
  );

  /* ---------- escrever com IA ---------- */
  const [aiBusy, setAiBusy] = useState<string[]>([]);

  /** Pede à IA o texto de um bloco de título ou texto e grava no bloco (Ctrl+Z desfaz). */
  const writeAi = useCallback(
    async (pageId: string, b: Extract<Block, { type: "heading" | "text" }>, instruction = "") => {
      const page = live.current.doc.pages.find((p) => p.id === pageId);
      const pageContext = (page?.blocks ?? [])
        .filter((x): x is Extract<Block, { type: "heading" | "text" }> => x.id !== b.id && (x.type === "heading" || x.type === "text"))
        .map((x) => x.text)
        .join("\n")
        .slice(0, 3000);
      setAiBusy((l) => [...l, b.id]);
      try {
        const res = await fetch("/api/relatorios/ia", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            reportId: report.id,
            clientId,
            start: period.start,
            end: period.end,
            kind: b.type,
            current: b.text,
            instruction,
            pageContext,
            maxWords: wordsThatFit(format, b),
          }),
        });
        const j = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
        if (!res.ok || !j.text) throw new Error(j.error || "Não foi possível gerar o texto.");
        updateBlock(pageId, b.id, { text: j.text });
        return true;
      } catch (e) {
        toast((e as Error).message, { tone: "error" });
        return false;
      } finally {
        setAiBusy((l) => l.filter((x) => x !== b.id));
      }
    },
    [report.id, clientId, period.start, period.end, format, updateBlock],
  );

  /** Preenche de uma vez os textos com roteiro em aberto ("…"), três por vez. */
  const writeAllAi = async () => {
    const targets = doc.pages.flatMap((p) =>
      p.blocks
        .filter((b): b is Extract<Block, { type: "text" }> => b.type === "text" && /…|\.\.\./.test(b.text))
        .map((b) => ({ pageId: p.id, block: b })),
    );
    if (!targets.length)
      return toast("Nenhum texto com roteiro em aberto (\"…\"). Para reescrever um texto, selecione o bloco e use Escrever com IA.", { tone: "info" });
    toast(`Escrevendo ${targets.length} ${targets.length === 1 ? "texto" : "textos"} com IA…`, { tone: "info" });
    let ok = 0;
    for (let i = 0; i < targets.length; i += 3)
      ok += (await Promise.all(targets.slice(i, i + 3).map((t) => writeAi(t.pageId, t.block)))).filter(Boolean).length;
    if (ok) toast(`${ok} ${ok === 1 ? "texto escrito" : "textos escritos"} com IA. Revise antes de enviar — Ctrl+Z desfaz.`);
  };

  /* ---------- teclado ---------- */
  const clipboard = useRef<Block | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (presenting !== null || document.querySelector("dialog[open]") || isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") return (e.preventDefault(), e.shiftKey ? redo() : undo());
      if (mod && k === "y") return (e.preventDefault(), redo());
      if (mod && k === "v" && clipboard.current) {
        e.preventDefault();
        const page = doc.pages.find((p) => p.id === current);
        if (!page) return;
        const src = clipboard.current;
        const pos = freeSpot(format, page.blocks, src.w, src.h);
        const copy = clampBlock(format, { ...cloneBlock(src), ...pos });
        commit((d) => mapPage(d, page.id, (p) => ({ ...p, blocks: [...p.blocks, copy] })));
        setSel({ pageId: page.id, blockId: copy.id });
        return;
      }
      if (!selection || !selBlock) return;
      const { pageId, blockId } = selection;
      if (k === "escape") return setSel(null);
      if (k === "delete" || k === "backspace") return (e.preventDefault(), removeBlock(pageId, blockId));
      if (mod && k === "d") return (e.preventDefault(), duplicateBlock(pageId, blockId));
      if (mod && k === "c") return void (clipboard.current = structuredClone(selBlock));
      if (k === "enter" && (selBlock.type === "heading" || selBlock.type === "text")) return (e.preventDefault(), setEditingId(blockId));
      const arrows: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
      const a = arrows[k];
      if (a) {
        e.preventDefault();
        const next = e.shiftKey
          ? clampBlock(format, { ...selBlock, w: selBlock.w + a[0], h: selBlock.h + a[1] })
          : clampBlock(format, { ...selBlock, x: selBlock.x + a[0], y: selBlock.y + a[1] });
        updateBlock(pageId, blockId, { x: next.x, y: next.y, w: next.w, h: next.h }, `${blockId}:kbd`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting, selection, selBlock, doc.pages, current, format, commit, undo, redo, removeBlock, duplicateBlock, updateBlock]);

  /* ---------- render ---------- */
  const fileName = `${title}${isTemplate ? "" : ` - ${periodLabel(period.start, period.end)}`}`;
  const status = saveError ? "Não salvou" : saving || dirty ? "Salvando…" : "Salvo";

  // A raiz de impressão fica fora dos dois ramos: trocar de ramo nunca a desmonta.
  return (
    <>
      {wide ? editor() : <SmallScreen title={title} pages={doc.pages} ctx={ctx} onPresent={() => setPresenting(0)} onPdf={() => printReport(fileName)} presenting={presenting} onClosePresent={() => setPresenting(null)} />}
      <PrintRoot pages={doc.pages} ctx={ctx} />
    </>
  );

  function editor() {
    return (
      <div className="rp-editor">
        {/* -------------------- barra superior -------------------- */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--border-hair)] bg-ink-900 px-3">
          <Link href={isTemplate ? "/relatorios?aba=modelos" : "/relatorios"} className="btn btn-ghost btn-sm btn-icon" aria-label="Voltar para Relatórios" title="Voltar para Relatórios">
            <Icon name="arrowLeft" size={16} />
          </Link>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <input
              className="field field--deep h-9 min-w-0 max-w-[340px] flex-1 border-transparent bg-transparent font-display text-[15px] font-semibold hover:border-[var(--border-strong)]"
              value={title}
              aria-label="Título"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                const t = title.trim();
                if (!t) return setTitle(report.title);
                if (t !== report.title) saveMeta({ title: t });
              }}
            />
            <span className="hidden truncate text-[12px] text-ink-400 xl:inline">
              {isTemplate ? "Modelo" : data.client?.name} · {FORMAT_LABEL[format]}
            </span>
            <span className={`flex shrink-0 items-center gap-1.5 text-[12px] ${saveError ? "text-vermelho-fg" : "text-ink-500"}`} role="status">
              {saving || dirty ? <span className="spinner" aria-hidden /> : <Icon name={saveError ? "alert" : "check"} size={13} />}
              {status}
              {saveError && (
                <button type="button" className="font-semibold underline" onClick={() => saveDoc(doc)}>
                  Tentar de novo
                </button>
              )}
            </span>
            <SourceLabel source={data.source} syncing={syncing} error={syncError} />
          </div>

          <div className="flex items-center gap-1">
            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={undo} disabled={!hist.past.length} title="Desfazer (Ctrl+Z)" aria-label="Desfazer">
              <Icon name="reply" size={15} />
            </button>
            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={redo} disabled={!hist.future.length} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer">
              <Icon name="reply" size={15} className="-scale-x-100" />
            </button>
            <select className="field w-[96px] py-1 text-[12px]" value={String(zoom)} onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : (Number(e.target.value) as (typeof ZOOMS)[number]))} aria-label="Zoom">
              <option value="fit">Ajustar</option>
              {ZOOMS.map((z) => (
                <option key={z} value={z}>
                  {z * 100}%
                </option>
              ))}
            </select>
          </div>
          <span className="mx-1 h-6 w-px bg-[var(--border-hair)]" />
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => sync(clientId, period.start, period.end)}
            disabled={syncing || !clientId}
            aria-busy={syncing}
            title={clientId ? "Ler agora a Meta e o Google no período exato do relatório" : "Escolha um cliente em Relatório para sincronizar"}
          >
            {syncing ? <span className="spinner" aria-hidden /> : <Icon name="refresh" size={14} />}
            {syncing ? "Sincronizando…" : "Sincronizar"}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setPresenting(Math.max(0, pageIds.indexOf(current)))}>
            <Icon name="play" size={14} />
            Apresentar
          </button>
          <button type="button" className="btn btn-sm" onClick={() => printReport(fileName)}>
            <Icon name="download" size={14} />
            PDF
          </button>
          {!isTemplate && (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setModal("share")}>
              <Icon name="link" size={14} />
              {shareToken ? "Link ativo" : "Compartilhar"}
            </button>
          )}
          <ActionMenu
            items={[
              { label: "Escrever textos com IA", icon: "sparkles", onSelect: writeAllAi, hint: "Preenche os textos com roteiro em aberto (…)" },
              { label: "Salvar como modelo", icon: "layers", onSelect: () => setModal("template"), hint: "Reaproveitar em outros clientes" },
              { label: isTemplate ? "Duplicar modelo" : "Duplicar relatório", icon: "copy", onSelect: () => duplicateReportAction(report.id) },
              "separator",
              { label: isTemplate ? "Excluir modelo" : "Excluir relatório", icon: "trash", danger: true, onSelect: () => setModal("delete") },
            ]}
          />
        </header>

        <div className="flex min-h-0 flex-1">
          {/* -------------------- painel esquerdo -------------------- */}
          <aside className="flex w-[300px] shrink-0 flex-col border-r border-[var(--border-hair)] bg-ink-900">
            {selBlock && selection ? (
              <>
                <div className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border-hair)] px-2">
                  <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setSel(null)} aria-label="Voltar aos blocos">
                    <Icon name="chevronLeft" size={16} />
                  </button>
                  <span className="min-w-0 flex-1 truncate font-display text-[13px] font-semibold">Editar {BLOCKS[selBlock.type].label.toLowerCase()}</span>
                  <button type="button" className="btn btn-ghost btn-sm btn-icon" title="Duplicar" aria-label="Duplicar" onClick={() => duplicateBlock(selection.pageId, selection.blockId)}>
                    <Icon name="copy" size={14} />
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm btn-icon" title="Excluir" aria-label="Excluir" onClick={() => removeBlock(selection.pageId, selection.blockId)}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <BlockInspector
                    key={selBlock.id}
                    block={selBlock}
                    data={data}
                    onChange={(patch, key) => updateBlock(selection.pageId, selection.blockId, patch, key)}
                    ai={
                      selBlock.type === "heading" || selBlock.type === "text"
                        ? {
                            busy: aiBusy.includes(selBlock.id),
                            run: (instruction) => writeAi(selection.pageId, selBlock, instruction),
                          }
                        : undefined
                    }
                  />
                  <PositionFields block={selBlock} onChange={(p) => updateBlock(selection.pageId, selection.blockId, clampBlock(format, { ...selBlock, ...p }))} />
                </div>
              </>
            ) : (
              <>
                <nav className="flex h-12 shrink-0 border-b border-[var(--border-hair)] px-2" aria-label="Painel">
                  {(
                    [
                      ["add", "Blocos", "plusCircle"],
                      ["pages", "Páginas", "layers"],
                      ["settings", "Relatório", "sliders"],
                    ] as const
                  ).map(([k, label, icon]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setPanel(k)}
                      className={`-mb-px flex flex-1 items-center justify-center gap-1.5 border-b-2 text-[12.5px] font-semibold ${panel === k ? "border-v4-red text-ink-100" : "border-transparent text-ink-400 hover:text-ink-100"}`}
                    >
                      <Icon name={icon} size={14} />
                      {label}
                    </button>
                  ))}
                </nav>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {panel === "add" && (
                    <Palette
                      onAdd={(t) => addBlock(t, current)}
                      onDragStart={(t) => (paletteType.current = t)}
                      onDragEnd={() => {
                        paletteType.current = null;
                        setGhost(null);
                      }}
                    />
                  )}
                  {panel === "pages" && (
                    <PagesPanel
                      pages={doc.pages}
                      ctx={ctx}
                      current={current}
                      onOpen={(id) => {
                        setCurrentPage(id);
                        pageEls.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      onAdd={() => addPage(current)}
                      onDuplicate={duplicatePage}
                      onDelete={deletePage}
                      onMove={movePage}
                      onBackground={(id, bg) => commit((d) => mapPage(d, id, (p) => ({ ...p, background: bg })), `${id}:bg`)}
                    />
                  )}
                  {panel === "settings" && (
                    <SettingsPanel
                      isTemplate={isTemplate}
                      clients={clients}
                      clientId={clientId}
                      period={period}
                      today={today}
                      theme={doc.theme}
                      loading={loadingData}
                      sample={data.sample}
                      onClient={changeClient}
                      onPeriod={changePeriod}
                      onTheme={setTheme}
                    />
                  )}
                </div>
              </>
            )}
          </aside>

          {/* -------------------- tela -------------------- */}
          <div
            ref={canvasRef}
            className="rp-canvas relative min-w-0 flex-1 overflow-auto"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvas !== undefined) {
                setSel(null);
                setEditingId(null);
              }
            }}
          >
            {data.sample && (
              <div className="sticky top-0 z-40 flex justify-center pt-3" data-canvas="">
                <span className="rounded-full border border-amarelo/40 bg-[#2a2210] px-3 py-1 text-[12px] font-semibold text-amarelo-fg shadow">
                  Números de exemplo — {isTemplate ? "escolha um cliente em Relatório para pré-visualizar" : "sem dados"}
                </span>
              </div>
            )}
            {loadingData && (
              <div className="sticky top-0 z-40 flex justify-center pt-3">
                <span className="flex items-center gap-2 rounded-full bg-ink-800 px-3 py-1 text-[12px] text-ink-200 shadow">
                  <span className="spinner" aria-hidden /> Atualizando números…
                </span>
              </div>
            )}
            <div className="flex min-w-fit flex-col items-center gap-4 px-12 py-10" data-canvas="">
              {scale > 0 &&
                doc.pages.map((p, i) => (
                  <div key={p.id} className="flex flex-col gap-2" data-canvas="">
                    <div className="flex items-center gap-1 text-[12px] text-ink-500" data-canvas="">
                      <span className={`mr-auto font-semibold ${p.id === current ? "text-ink-200" : ""}`}>
                        {format === "slide" ? "Slide" : "Página"} {i + 1}
                      </span>
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => movePage(p.id, -1)} disabled={i === 0} aria-label="Subir página" title="Subir">
                        <Icon name="arrowUp" size={13} />
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => movePage(p.id, 1)} disabled={i === doc.pages.length - 1} aria-label="Descer página" title="Descer">
                        <Icon name="arrowDown" size={13} />
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => duplicatePage(p.id)} aria-label="Duplicar página" title="Duplicar página">
                        <Icon name="copy" size={13} />
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => deletePage(p.id)} aria-label="Excluir página" title="Excluir página">
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                    <EditorPage
                      page={p}
                      ctx={ctx}
                      scale={scale}
                      selectedId={selection?.pageId === p.id || drag?.toPage === p.id ? (selection?.blockId ?? null) : null}
                      editingId={editingId}
                      drag={drag && (drag.fromPage === p.id || drag.toPage === p.id) ? drag : null}
                      ghost={ghost?.pageId === p.id ? ghost : null}
                      handlers={handlers}
                    />
                  </div>
                ))}
              <button type="button" className="btn mt-2" onClick={() => addPage()}>
                <Icon name="plus" size={14} />
                Adicionar {format === "slide" ? "slide" : "página"}
              </button>
              <p className="max-w-[560px] text-center text-[12px] leading-relaxed text-ink-500" data-canvas="">
                Arraste os blocos do painel para a página. Clique para editar, arraste para mover, puxe as alças para redimensionar.
                Atalhos: Delete exclui, Ctrl+D duplica, Ctrl+C/V copia, setas movem (Shift + setas redimensionam), Ctrl+Z desfaz.
              </p>
            </div>
          </div>
        </div>

        {presenting !== null && <Presenter pages={doc.pages} ctx={ctx} start={presenting} onClose={() => setPresenting(null)} />}

        <ShareModal open={modal === "share"} onClose={() => setModal(null)} reportId={report.id} token={shareToken} onToken={setShareToken} />
        <TemplateModal open={modal === "template"} onClose={() => setModal(null)} reportId={report.id} defaultName={isTemplate ? `${title} (cópia)` : `Modelo — ${title}`} />
        <ConfirmDialog
          open={modal === "delete"}
          onClose={() => setModal(null)}
          title={isTemplate ? "Excluir este modelo?" : "Excluir este relatório?"}
          confirmLabel="Excluir"
          pendingLabel="Excluindo…"
          onConfirm={async () => {
            const r = await deleteReportAction(report.id);
            if (r?.error) return r.error;
            toast(r?.ok ?? "Excluído.");
            window.location.assign(isTemplate ? "/relatorios?aba=modelos" : "/relatorios");
          }}
        >
          {isTemplate ? "Relatórios já criados a partir dele continuam como estão." : "O link público, se estiver ativo, para de abrir. Não dá para desfazer."}
        </ConfirmDialog>
      </div>
    );
  }
}

/* ------------------------------ painéis ------------------------------ */

function Palette({ onAdd, onDragStart, onDragEnd }: { onAdd: (t: BlockType) => void; onDragStart: (t: BlockType) => void; onDragEnd: () => void }) {
  const groups = ["Texto", "Números", "Mídia"] as const;
  return (
    <div className="space-y-5 p-4">
      {groups.map((g) => (
        <div key={g}>
          <h3 className="label mb-2">{g}</h3>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(BLOCKS) as BlockType[])
              .filter((t) => BLOCKS[t].group === g)
              .map((t) => (
                <button
                  key={t}
                  type="button"
                  draggable
                  className="rp-palette-item"
                  title={`${BLOCKS[t].hint} — arraste para a página ou clique para adicionar`}
                  onClick={() => onAdd(t)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/x-rp-block", t);
                    e.dataTransfer.effectAllowed = "copy";
                    onDragStart(t);
                  }}
                  onDragEnd={onDragEnd}
                >
                  <Icon name={BLOCKS[t].icon} size={20} stroke={1.6} />
                  {BLOCKS[t].label}
                </button>
              ))}
          </div>
        </div>
      ))}
      <p className="text-[11.5px] leading-relaxed text-ink-500">
        Os números saem do painel (Meta Ads, Google Ads, CRM e Health Score) pelo cliente e período do relatório. Para o que o
        painel não tem, escolha <strong className="text-ink-300">Digitar</strong> no bloco.
      </p>
    </div>
  );
}

function PagesPanel({
  pages,
  ctx,
  current,
  onOpen,
  onAdd,
  onDuplicate,
  onDelete,
  onMove,
  onBackground,
}: {
  pages: Page[];
  ctx: RenderCtx;
  current: string;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, d: -1 | 1) => void;
  onBackground: (id: string, bg: string | undefined) => void;
}) {
  const { w } = PAGE[ctx.format];
  const thumb = (ctx.format === "slide" ? 236 : 150) / w;
  const cur = pages.find((p) => p.id === current);
  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col items-center gap-3">
        {pages.map((p, i) => (
          <div key={p.id} className="w-full">
            <button type="button" className="rp-thumb mx-auto block overflow-hidden rounded-sm" data-current={p.id === current ? "" : undefined} onClick={() => onOpen(p.id)} aria-label={`Ir para a página ${i + 1}`}>
              <div className="pointer-events-none">
                <ScaledPage page={p} ctx={ctx} scale={thumb} />
              </div>
            </button>
            <div className="mt-1 flex items-center justify-center gap-0.5 text-[11px] text-ink-500">
              <span className="mr-1">{i + 1}</span>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => onMove(p.id, -1)} disabled={i === 0} aria-label="Subir">
                <Icon name="arrowUp" size={12} />
              </button>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => onMove(p.id, 1)} disabled={i === pages.length - 1} aria-label="Descer">
                <Icon name="arrowDown" size={12} />
              </button>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => onDuplicate(p.id)} aria-label="Duplicar">
                <Icon name="copy" size={12} />
              </button>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => onDelete(p.id)} aria-label="Excluir">
                <Icon name="trash" size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="btn w-full justify-center" onClick={onAdd}>
        <Icon name="plus" size={14} />
        Nova página
      </button>
      {cur && (
        <div className="border-t border-[var(--border-hair)] pt-4">
          <ColorField label={`Fundo da página ${pages.indexOf(cur) + 1}`} value={cur.background} onChange={(v) => onBackground(cur.id, v === "accent" ? ctx.theme.accent : v)} />
        </div>
      )}
    </div>
  );
}

const ACCENTS = ["#e50914", "#2a78d6", "#1baf7a", "#eda100", "#6250d6", "#141414"];

function SettingsPanel({
  isTemplate,
  clients,
  clientId,
  period,
  today,
  theme,
  loading,
  sample,
  onClient,
  onPeriod,
  onTheme,
}: {
  isTemplate: boolean;
  clients: ClientOpt[];
  clientId: number | null;
  period: { start: string; end: string };
  today: string;
  theme: Theme;
  loading: boolean;
  sample: boolean;
  onClient: (id: number | null) => void;
  onPeriod: (p: { start: string; end: string }) => void;
  onTheme: (t: Partial<Theme>) => void;
}) {
  const preset = (Object.keys(PRESET_LABEL) as PeriodPreset[]).find((k) => {
    const r = presetRange(k, today);
    return r.start === period.start && r.end === period.end;
  });
  return (
    <>
      <Section title={isTemplate ? "Pré-visualizar com" : "Dados"}>
        <Field label="Cliente" hint={isTemplate ? "Só para ver o modelo com números reais — o modelo não fica preso a ele." : undefined}>
          <select className="field" value={clientId ?? ""} onChange={(e) => onClient(Number(e.target.value) || null)} disabled={loading}>
            {isTemplate && <option value="">Números de exemplo</option>}
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Período">
          <select
            className="field"
            value={preset ?? "custom"}
            disabled={loading}
            onChange={(e) => e.target.value !== "custom" && onPeriod(presetRange(e.target.value as PeriodPreset, today))}
          >
            {(Object.keys(PRESET_LABEL) as PeriodPreset[]).map((k) => (
              <option key={k} value={k}>
                {PRESET_LABEL[k]}
              </option>
            ))}
            <option value="custom">Personalizado</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="De">
            <input type="date" className="field" value={period.start} max={period.end} onChange={(e) => onPeriod({ ...period, start: e.target.value })} />
          </Field>
          <Field label="Até">
            <input type="date" className="field" value={period.end} min={period.start} onChange={(e) => onPeriod({ ...period, end: e.target.value })} />
          </Field>
        </div>
        <p className="text-[11.5px] leading-relaxed text-ink-500">
          {sample
            ? "Sem cliente: os blocos mostram números de exemplo."
            : "Sincronizar lê a Meta e o Google no período exato e compara com o mesmo número de dias logo antes. Sem sincronizar, valem as semanas gravadas no banco."}
        </p>
      </Section>
      <Section title="Aparência">
        <Field label="Tema">
          <Segmented
            size="sm"
            value={theme.mode}
            onChange={(m) => onTheme({ mode: m })}
            options={[
              { value: "dark", label: "Escuro" },
              { value: "light", label: "Claro" },
            ]}
          />
        </Field>
        <Field label="Cor de destaque">
          <div className="flex flex-wrap items-center gap-2">
            {ACCENTS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Destaque ${c}`}
                aria-pressed={theme.accent === c}
                onClick={() => onTheme({ accent: c })}
                className={`h-7 w-7 rounded-full border-2 ${theme.accent === c ? "border-white" : "border-transparent"}`}
                style={{ background: c }}
              />
            ))}
            <label className="chip cursor-pointer">
              Outra
              <input type="color" className="sr-only" value={theme.accent} onChange={(e) => onTheme({ accent: e.target.value })} />
            </label>
          </div>
        </Field>
      </Section>
    </>
  );
}

function PositionFields({ block, onChange }: { block: Block; onChange: (p: Partial<Pick<Block, "x" | "y" | "w" | "h">>) => void }) {
  const items = [
    ["x", "Coluna", 1],
    ["y", "Linha", 1],
    ["w", "Largura", 0],
    ["h", "Altura", 0],
  ] as const;
  return (
    <Section title="Posição na grade">
      <div className="grid grid-cols-4 gap-2">
        {items.map(([k, label, base]) => (
          <label key={k} className="block">
            <span className="label">{label}</span>
            <input
              type="number"
              className="field tnum mt-1 px-2"
              value={block[k] + base}
              min={base}
              onChange={(e) => onChange({ [k]: Number(e.target.value) - base })}
            />
          </label>
        ))}
      </div>
      <p className="text-[11px] text-ink-500">Grade de 12 colunas. Arrastar e as setas do teclado também movem.</p>
    </Section>
  );
}

/* ------------------------------ janelas ------------------------------ */

function ShareModal({
  open,
  onClose,
  reportId,
  token,
  onToken,
}: {
  open: boolean;
  onClose: () => void;
  reportId: string;
  token: string | null;
  onToken: (t: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/relatorios/${reportId}/compartilhar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ on }),
      });
      const j = (await res.json().catch(() => ({}))) as { token?: string | null; error?: string };
      if (!res.ok) throw new Error(j.error || "Não foi possível atualizar o link.");
      onToken(j.token ?? null);
      toast(on ? "Link público criado." : "Link desligado. Quem tinha o endereço não abre mais.");
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const url = token && typeof window !== "undefined" ? `${window.location.origin}/r/${token}` : "";
  return (
    <Modal open={open} onClose={onClose} title="Compartilhar com o cliente" description="O cliente abre sem login, vê as páginas, apresenta em tela cheia e baixa o PDF. Os números são os da última sincronização com a Meta e o Google.">
      <div className="space-y-4">
        {token ? (
          <>
            <CopyField value={url} label="Link do relatório" />
            <div className="flex flex-wrap gap-2">
              <a className="btn btn-sm" href={url} target="_blank" rel="noreferrer">
                <Icon name="external" size={14} />
                Abrir como o cliente
              </a>
              <a className="btn btn-sm" href={`https://wa.me/?text=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer">
                <Icon name="messageCircle" size={14} />
                Enviar no WhatsApp
              </a>
              <button type="button" className="btn btn-sm btn-danger ml-auto" onClick={() => toggle(false)} disabled={busy} aria-busy={busy}>
                Desligar link
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => toggle(true)} disabled={busy} aria-busy={busy}>
            {busy ? <span className="spinner" aria-hidden /> : <Icon name="link" size={14} />}
            Criar link público
          </button>
        )}
      </div>
    </Modal>
  );
}

function TemplateModal({ open, onClose, reportId, defaultName }: { open: boolean; onClose: () => void; reportId: string; defaultName: string }) {
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Salvar como modelo" description="O modelo guarda as páginas e os blocos — não os números. Ao usar em outro cliente, tudo se recalcula sozinho." size="sm">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await saveAsTemplateAction(reportId, name).finally(() => setBusy(false));
          if (r?.error) return toast(r.error, { tone: "error" });
          toast(r?.ok ?? "Modelo salvo.");
          onClose();
        }}
      >
        <Field label="Nome do modelo">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </Field>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
            {busy && <span className="spinner" aria-hidden />}
            Salvar modelo
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Celular e tablet em pé: sem construtor, mas dá para ver, apresentar e baixar. */
function SmallScreen({
  title,
  pages,
  ctx,
  onPresent,
  onPdf,
  presenting,
  onClosePresent,
}: {
  title: string;
  pages: Page[];
  ctx: RenderCtx;
  onPresent: () => void;
  onPdf: () => void;
  presenting: number | null;
  onClosePresent: () => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const scale = width ? Math.min(1, width / PAGE[ctx.format].w) : 0;
  return (
    <div className="w-full space-y-4 px-4 py-5">
      <div className="flex items-center gap-2">
        <Link href="/relatorios" className="btn btn-ghost btn-sm btn-icon" aria-label="Voltar">
          <Icon name="arrowLeft" size={16} />
        </Link>
        <h1 className="min-w-0 flex-1 truncate font-display text-[17px] font-semibold">{title}</h1>
      </div>
      <p className="rounded-lg bg-ink-850 px-3 py-2 text-[12.5px] text-ink-300">O construtor abre no computador. Aqui dá para conferir, apresentar e baixar o PDF.</p>
      <div className="flex gap-2">
        <button type="button" className="btn btn-sm flex-1 justify-center" onClick={onPresent}>
          <Icon name="play" size={14} /> Apresentar
        </button>
        <button type="button" className="btn btn-sm btn-primary flex-1 justify-center" onClick={onPdf}>
          <Icon name="download" size={14} /> PDF
        </button>
      </div>
      <div ref={ref} className="flex w-full flex-col gap-4">
        {scale > 0 && pages.map((p) => <ScaledPage key={p.id} page={p} ctx={ctx} scale={scale} className="rp-shadow" />)}
      </div>
      {presenting !== null && <Presenter pages={pages} ctx={ctx} start={presenting} onClose={onClosePresent} />}
    </div>
  );
}

/* ------------------------------ auxiliares ------------------------------ */

/** De onde vêm os números agora, ao lado do status de salvamento. */
function SourceLabel({ source, syncing, error }: { source: ReportData["source"]; syncing: boolean; error: string | null }) {
  if (syncing) return null;
  if (error)
    return (
      <span className="hidden shrink-0 items-center gap-1.5 text-[12px] text-amarelo-fg lg:flex" title={error}>
        <Icon name="alert" size={13} />
        Semanas do banco
      </span>
    );
  if (source.kind === "sample") return null;
  if (source.kind === "db")
    return (
      <span className="hidden shrink-0 text-[12px] text-ink-500 lg:inline" title="Semanas-ritual gravadas pelo sync diário. Use Sincronizar para ler o período exato.">
        · Semanas do banco
      </span>
    );
  const at = new Date(source.at);
  const when = at.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <span className="hidden shrink-0 text-[12px] text-ink-500 lg:inline" title="Lido ao vivo da Meta e do Google no período exato do relatório">
      · Meta e Google em {when}
    </span>
  );
}

/**
 * Quantas palavras cabem no bloco: área útil ÷ área de uma palavra média no
 * tamanho de letra do bloco. É o limite que a IA recebe para o texto caber.
 */
function wordsThatFit(format: Report["format"], b: Extract<Block, { type: "heading" | "text" }>) {
  const r = blockRect(format, b);
  const pad = b.surface === "none" ? 0 : 32;
  const px = b.type === "heading" ? HEADING_PX[b.size] : TEXT_PX[b.size];
  const lineH = px * (b.type === "heading" ? 1.08 : 1.5);
  const perLine = (r.width - pad) / (px * 0.52);
  const lines = Math.floor((r.height - pad) / lineH);
  return Math.max(3, Math.round((perLine * lines) / 6.5));
}
