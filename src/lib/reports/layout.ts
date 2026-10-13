/**
 * Geometria da grade e fábrica de blocos do construtor. Puro: o editor, o
 * servidor (modelos prontos) e os testes usam as mesmas regras de encaixe.
 */
import {
  COLS,
  DEFAULT_THEME,
  GAP,
  PAGE,
  PAGE_PAD,
  type Block,
  type BlockType,
  type Page,
  type ReportDoc,
  type ReportFormat,
} from "./types";

/** Id curto de bloco/página — só precisa ser único dentro do documento. */
export const uid = (p = "b") => `${p}${Math.random().toString(36).slice(2, 10)}`;

/** Tamanho de uma célula da grade, em px da página. */
export function cellSize(format: ReportFormat) {
  const { w, h, rows } = PAGE[format];
  return { cw: (w - PAGE_PAD * 2) / COLS, ch: (h - PAGE_PAD * 2) / rows, rows };
}

/** Retângulo do bloco em px da página (já com o respiro entre blocos). */
export function blockRect(format: ReportFormat, b: Pick<Block, "x" | "y" | "w" | "h">) {
  const { cw, ch } = cellSize(format);
  return {
    left: PAGE_PAD + b.x * cw + GAP / 2,
    top: PAGE_PAD + b.y * ch + GAP / 2,
    width: b.w * cw - GAP,
    height: b.h * ch - GAP,
  };
}

/** Mantém o bloco dentro da página, com no mínimo 1×1. */
export function clampBlock<T extends Pick<Block, "x" | "y" | "w" | "h">>(format: ReportFormat, b: T): T {
  const rows = PAGE[format].rows;
  const w = Math.max(1, Math.min(COLS, Math.round(b.w)));
  const h = Math.max(1, Math.min(rows, Math.round(b.h)));
  const x = Math.max(0, Math.min(COLS - w, Math.round(b.x)));
  const y = Math.max(0, Math.min(rows - h, Math.round(b.y)));
  return { ...b, x, y, w, h };
}

const overlaps = (a: Pick<Block, "x" | "y" | "w" | "h">, b: Pick<Block, "x" | "y" | "w" | "h">) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Primeiro lugar livre para um bloco w×h, de cima para baixo e da esquerda
 * para a direita. Página cheia: vai para o fim (por cima), sem sumir.
 */
export function freeSpot(format: ReportFormat, blocks: Block[], w: number, h: number): { x: number; y: number } {
  const rows = PAGE[format].rows;
  const ww = Math.min(w, COLS);
  const hh = Math.min(h, rows);
  for (let y = 0; y <= rows - hh; y++)
    for (let x = 0; x <= COLS - ww; x++) {
      const r = { x, y, w: ww, h: hh };
      if (!blocks.some((b) => overlaps(b, r))) return { x, y };
    }
  return { x: 0, y: rows - hh };
}

/* ------------------------------ catálogo ------------------------------ */

export type BlockMeta = {
  label: string;
  icon: "fileText" | "squarePen" | "gauge" | "chart" | "layoutList" | "filter" | "target" | "heartPulse" | "image" | "award" | "circle";
  group: "Texto" | "Números" | "Mídia";
  hint: string;
  /** Tamanho inicial (colunas × linhas) por formato. */
  size: Record<ReportFormat, [number, number]>;
};

export const BLOCKS: Record<BlockType, BlockMeta> = {
  heading: { label: "Título", icon: "fileText", group: "Texto", hint: "Título de página ou seção", size: { a4: [12, 2], slide: [12, 2] } },
  text: { label: "Texto", icon: "squarePen", group: "Texto", hint: "Análise, contexto, próximos passos", size: { a4: [12, 4], slide: [6, 4] } },
  kpi: { label: "Indicador", icon: "gauge", group: "Números", hint: "Um número com a variação do período", size: { a4: [4, 3], slide: [3, 3] } },
  chart: { label: "Gráfico", icon: "chart", group: "Números", hint: "Linha, barras ou rosca", size: { a4: [12, 8], slide: [8, 8] } },
  table: { label: "Tabela", icon: "layoutList", group: "Números", hint: "Semana a semana ou por canal", size: { a4: [12, 7], slide: [12, 6] } },
  funnel: { label: "Funil", icon: "filter", group: "Números", hint: "Impressões → cliques → leads → vendas", size: { a4: [6, 8], slide: [4, 9] } },
  goal: { label: "Meta x realizado", icon: "target", group: "Números", hint: "Barra de progresso contra a meta", size: { a4: [6, 3], slide: [4, 3] } },
  score: { label: "Health Score", icon: "heartPulse", group: "Números", hint: "Nota de saúde da conta", size: { a4: [4, 4], slide: [3, 4] } },
  image: { label: "Imagem", icon: "image", group: "Mídia", hint: "Print de criativo, foto, logo do cliente", size: { a4: [6, 6], slide: [5, 6] } },
  logo: { label: "Logo V4", icon: "award", group: "Mídia", hint: "Marca da unidade", size: { a4: [4, 2], slide: [3, 2] } },
  shape: { label: "Forma", icon: "circle", group: "Mídia", hint: "Faixa, divisor ou fundo de destaque", size: { a4: [12, 1], slide: [12, 1] } },
};

/** Bloco novo com os padrões do tipo, já posicionado. */
export function newBlock(type: BlockType, format: ReportFormat, at: { x: number; y: number }): Block {
  const [w, h] = BLOCKS[type].size[format];
  const base = { id: uid(), ...clampBlock(format, { x: at.x, y: at.y, w, h }) };
  switch (type) {
    case "heading":
      return { ...base, type, text: "Título da seção", size: "lg", align: "left", surface: "none" };
    case "text":
      return {
        ...base,
        type,
        text: "Escreva aqui a leitura do período: o que funcionou, o que mudou e o próximo passo.",
        size: "md",
        align: "left",
        surface: "none",
      };
    case "kpi":
      return {
        ...base,
        type,
        label: "",
        metric: "leads",
        source: "all",
        mode: "auto",
        manual: { value: null, previous: null, format: "int" },
        showDelta: true,
        surface: "card",
      };
    case "chart":
      return {
        ...base,
        type,
        title: "",
        kind: "bar",
        metric: "leads",
        source: "all",
        by: "week",
        mode: "auto",
        manualText: "Janeiro; 120\nFevereiro; 135\nMarço; 160",
        manualFormat: "int",
        surface: "card",
      };
    case "table":
      return {
        ...base,
        type,
        title: "",
        metrics: ["spend", "leads", "cpl", "clicks"],
        source: "all",
        rows: "week",
        mode: "auto",
        manualText: "Canal\tSeguidores\tAlcance\nInstagram\t12.400\t58.000\nTikTok\t3.100\t21.500",
        surface: "card",
      };
    case "funnel":
      return {
        ...base,
        type,
        title: "Funil do período",
        steps: ["impressions", "clicks", "leads", "purchases"],
        source: "all",
        mode: "auto",
        manualText: "Visitas; 8.000\nCadastros; 640\nVendas; 52",
        surface: "card",
      };
    case "goal":
      return { ...base, type, label: "", metric: "leads", source: "all", targetMode: "auto", target: null, surface: "card" };
    case "score":
      return { ...base, type, label: "Health Score", surface: "card" };
    case "image":
      return { ...base, type, url: "", fit: "cover", radius: 12 };
    case "logo":
      return { ...base, type, variant: "full", align: "left" };
    case "shape":
      return { ...base, type, color: "accent", radius: 4, opacity: 1 };
  }
}

/** Cópia com ids novos (duplicar bloco/página, colar). */
export function cloneBlock(b: Block, offset = 0): Block {
  return { ...structuredClone(b), id: uid(), y: b.y + offset };
}
export function clonePage(p: Page): Page {
  return { ...structuredClone(p), id: uid("p"), blocks: p.blocks.map((b) => cloneBlock(b)) };
}

export const emptyDoc = (): ReportDoc => ({ version: 1, theme: { ...DEFAULT_THEME }, pages: [{ id: uid("p"), blocks: [] }] });

/**
 * Normaliza o que veio do banco ou do navegador: descarta lixo, mantém cada
 * bloco dentro da página. O editor confia no formato depois disso.
 */
export function sanitizeDoc(raw: unknown, format: ReportFormat): ReportDoc {
  const d = (raw && typeof raw === "object" ? raw : {}) as Partial<ReportDoc>;
  const theme = d.theme && typeof d.theme === "object" ? d.theme : DEFAULT_THEME;
  const pages = Array.isArray(d.pages) ? d.pages : [];
  const out: ReportDoc = {
    version: 1,
    theme: {
      mode: theme.mode === "light" ? "light" : "dark",
      accent: /^#[0-9a-f]{6}$/i.test(String(theme.accent)) ? String(theme.accent) : DEFAULT_THEME.accent,
    },
    pages: pages.slice(0, 60).map((p) => ({
      id: typeof p?.id === "string" ? p.id : uid("p"),
      background: typeof p?.background === "string" ? p.background : undefined,
      blocks: (Array.isArray(p?.blocks) ? p.blocks : [])
        .filter((b): b is Block => !!b && typeof b === "object" && typeof b.type === "string" && b.type in BLOCKS)
        .slice(0, 80)
        .map((b) => clampBlock(format, { ...b, id: typeof b.id === "string" ? b.id : uid() })),
    })),
  };
  if (!out.pages.length) out.pages.push({ id: uid("p"), blocks: [] });
  return out;
}
