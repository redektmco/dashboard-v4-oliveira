/**
 * Modelos prontos da V4: o ponto de partida quando a unidade ainda não salvou
 * modelo próprio. Vivem no código (não no banco) para sempre existirem —
 * "Usar modelo" copia o documento para o relatório novo.
 */
import { newBlock, uid } from "./layout";
import { DEFAULT_THEME, type Block, type BlockType, type Page, type ReportDoc, type ReportFormat } from "./types";

type Patch = Partial<Omit<Block, "type">> & Record<string, unknown>;

function put(format: ReportFormat, type: BlockType, x: number, y: number, w: number, h: number, patch: Patch = {}): Block {
  return { ...newBlock(type, format, { x, y }), x, y, w, h, ...patch } as Block;
}

const page = (blocks: Block[]): Page => ({ id: uid("p"), blocks });

const ANALISE =
  "O que funcionou: …\n\nO que mudou em relação ao período anterior: …\n\nPróximo passo: …";

function monthlyA4(): ReportDoc {
  const f: ReportFormat = "a4";
  return {
    version: 1,
    theme: { ...DEFAULT_THEME },
    pages: [
      page([
        put(f, "logo", 0, 0, 4, 2),
        put(f, "heading", 0, 8, 12, 3, { text: "Relatório de resultados", size: "xl" }),
        put(f, "heading", 0, 11, 12, 2, { text: "{cliente}", size: "md", color: "accent" }),
        put(f, "text", 0, 13, 12, 2, { text: "{periodo} · comparado a {periodo_anterior}", size: "lg" }),
        put(f, "shape", 0, 15, 2, 1, { radius: 2 }),
        put(f, "text", 0, 24, 12, 2, { text: "Preparado pela V4 Oliveira & Co em {data}", size: "sm" }),
      ]),
      page([
        put(f, "heading", 0, 0, 12, 2, { text: "Resumo do período" }),
        put(f, "kpi", 0, 2, 4, 3, { metric: "spend" }),
        put(f, "kpi", 4, 2, 4, 3, { metric: "leads" }),
        put(f, "kpi", 8, 2, 4, 3, { metric: "cpl" }),
        put(f, "kpi", 0, 5, 4, 3, { metric: "impressions" }),
        put(f, "kpi", 4, 5, 4, 3, { metric: "clicks" }),
        put(f, "kpi", 8, 5, 4, 3, { metric: "ctr" }),
        put(f, "chart", 0, 8, 12, 8, { title: "Leads por semana", metric: "leads", kind: "bar" }),
        put(f, "goal", 0, 16, 6, 3, { metric: "leads" }),
        put(f, "goal", 6, 16, 6, 3, { metric: "cpl" }),
        put(f, "text", 0, 19, 12, 7, { text: ANALISE, surface: "card" }),
      ]),
      page([
        put(f, "heading", 0, 0, 12, 2, { text: "Meta Ads x Google Ads" }),
        put(f, "chart", 0, 2, 6, 8, { title: "Investimento por canal", metric: "spend", kind: "donut", by: "channel" }),
        put(f, "chart", 6, 2, 6, 8, { title: "Leads por canal", metric: "leads", kind: "bar", by: "channel" }),
        put(f, "table", 0, 10, 12, 5, { rows: "channel", metrics: ["spend", "impressions", "clicks", "leads", "cpl"] }),
        put(f, "funnel", 0, 15, 7, 11),
        put(f, "score", 7, 15, 5, 5),
        put(f, "text", 7, 20, 5, 6, { text: "Próximos passos:\n• …\n• …", surface: "card" }),
      ]),
      page([
        put(f, "heading", 0, 0, 12, 2, { text: "Semana a semana" }),
        put(f, "chart", 0, 2, 12, 8, { title: "Investimento por semana", metric: "spend", kind: "line" }),
        put(f, "table", 0, 10, 12, 14, { rows: "week", metrics: ["spend", "impressions", "clicks", "leads", "cpl"] }),
      ]),
    ],
  };
}

function resultsSlides(): ReportDoc {
  const f: ReportFormat = "slide";
  return {
    version: 1,
    theme: { ...DEFAULT_THEME },
    pages: [
      page([
        put(f, "logo", 0, 0, 3, 2),
        put(f, "heading", 0, 6, 10, 3, { text: "Resultados de {periodo}", size: "xl" }),
        put(f, "heading", 0, 9, 10, 2, { text: "{cliente}", size: "md", color: "accent" }),
        put(f, "shape", 0, 11, 1, 1, { radius: 2 }),
        put(f, "text", 0, 14, 12, 2, { text: "V4 Oliveira & Co · {data}", size: "sm" }),
      ]),
      page([
        put(f, "heading", 0, 0, 12, 2, { text: "Resumo do período" }),
        put(f, "kpi", 0, 2, 3, 3, { metric: "spend" }),
        put(f, "kpi", 3, 2, 3, 3, { metric: "leads" }),
        put(f, "kpi", 6, 2, 3, 3, { metric: "cpl" }),
        put(f, "kpi", 9, 2, 3, 3, { metric: "clicks" }),
        put(f, "chart", 0, 5, 8, 11, { title: "Leads por semana", metric: "leads", kind: "bar" }),
        put(f, "goal", 8, 5, 4, 3, { metric: "leads" }),
        put(f, "goal", 8, 8, 4, 3, { metric: "cpl" }),
        put(f, "score", 8, 11, 4, 5),
      ]),
      page([
        put(f, "heading", 0, 0, 12, 2, { text: "Meta Ads x Google Ads" }),
        put(f, "chart", 0, 2, 4, 8, { title: "Investimento por canal", metric: "spend", kind: "donut", by: "channel" }),
        put(f, "chart", 4, 2, 4, 8, { title: "Leads por canal", metric: "leads", kind: "bar", by: "channel" }),
        put(f, "funnel", 8, 2, 4, 14),
        put(f, "table", 0, 10, 8, 6, { rows: "channel", metrics: ["spend", "clicks", "leads", "cpl"] }),
      ]),
      page([
        put(f, "heading", 0, 0, 12, 2, { text: "Leitura do período e próximos passos" }),
        put(f, "text", 0, 2, 6, 13, { text: ANALISE, size: "lg" }),
        put(f, "text", 6, 2, 6, 13, { text: "Próximos passos:\n\n• …\n• …\n• …", size: "lg", surface: "card" }),
      ]),
    ],
  };
}

export type Starter = { id: string; title: string; description: string; format: ReportFormat; build: () => ReportDoc };

export const STARTERS: Starter[] = [
  {
    id: "v4-mensal-a4",
    title: "Relatório mensal de mídia",
    description: "Capa, resumo com indicadores e metas, Meta x Google e semana a semana.",
    format: "a4",
    build: monthlyA4,
  },
  {
    id: "v4-resultados-slide",
    title: "Apresentação de resultados",
    description: "Quatro slides para a call: capa, resumo, canais e próximos passos.",
    format: "slide",
    build: resultsSlides,
  },
];
