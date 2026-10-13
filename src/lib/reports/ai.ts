/**
 * "Escrever com IA" do construtor: o Gemini escreve o texto de um bloco
 * (leitura do período, próximos passos, título) a partir dos números do
 * próprio relatório. Só roda no servidor — a chave vive na env da Vercel,
 * nunca no navegador nem no banco.
 *
 * A chave do Gemini foi cadastrada como ANTHROPIC_API_KEY; GEMINI_API_KEY,
 * se existir, tem preferência. GEMINI_MODEL troca o modelo sem deploy de código.
 */
import { ApiError, FinishReason, GoogleGenAI } from "@google/genai";
import { autoTarget, deltaPct, formatDelta, formatValue, METRICS, metricOf, periodLabel, shortDay, totalsOf } from "./metrics";
import type { MetricKey, ReportData, Source } from "./types";

const apiKey = () => process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY || "";

export const aiConfigured = () => Boolean(apiKey());

export class AiError extends Error {}

/** Flash estável do Gemini (GA em set/2026). */
const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

/* ------------------------------ contexto ------------------------------ */

const KEYS: MetricKey[] = ["spend", "impressions", "reach", "clicks", "ctr", "cpc", "cpm", "leads", "cpl", "conversations", "purchases", "revenue", "roas", "ticket"];

function line(data: ReportData, metric: MetricKey, source: Source) {
  const def = METRICS[metric];
  const cur = metricOf(totalsOf(data.weeks, source, data.leadSource), metric);
  const prev = data.prevWeeks.length ? metricOf(totalsOf(data.prevWeeks, source, data.leadSource), metric) : null;
  if (!cur && !prev) return null;
  const d = deltaPct(cur, prev);
  // Investir mais ou menos não é bom nem ruim por si (`neutral`): sem rótulo de melhora.
  const better = d === null || def.neutral ? "" : def.lowerIsBetter ? (d < 0 ? " (melhorou)" : d > 0 ? " (piorou)" : "") : d > 0 ? " (melhorou)" : d < 0 ? " (piorou)" : "";
  return `- ${def.label}: ${formatValue(cur, def.format)} (anterior: ${formatValue(prev, def.format)}; variação ${formatDelta(d)}${better})`;
}

/**
 * Os números do relatório em texto, do jeito que um analista leria: total do
 * período contra o anterior, por canal, semana a semana, metas e Health Score.
 * É o único material que a IA recebe — ela não inventa número fora disto.
 */
export function dataContext(data: ReportData): string {
  const out: string[] = [];
  out.push(`Cliente: ${data.client?.name ?? "(exemplo)"}`);
  out.push(`Período: ${periodLabel(data.period.start, data.period.end)} (comparado com ${periodLabel(data.previous.start, data.previous.end)})`);
  if (data.sample) out.push("ATENÇÃO: números de exemplo, não são de um cliente real.");
  const rule = { campaign: "conversão das campanhas", webhook: "leads do CRM (webhook)", both: "soma das campanhas com o CRM" }[data.leadSource];
  out.push(`Leads no total contam de: ${rule}. Nos canais separados, Lead é a conversão de cada canal.`);
  for (const [source, title] of [
    ["all", "Meta Ads + Google Ads (total)"],
    ["meta", "Meta Ads"],
    ["google", "Google Ads"],
  ] as const) {
    const rows = KEYS.filter((k) => !(METRICS[k].only === "meta" && source !== "meta"))
      .map((k) => line(data, k, source))
      .filter(Boolean);
    if (rows.length) out.push(`\n${title}:\n${rows.join("\n")}`);
  }
  const crm = totalsOf(data.weeks, "all").crmLeads;
  if (crm) out.push(`\nLeads recebidos no CRM: ${crm} (anterior: ${totalsOf(data.prevWeeks, "all").crmLeads})`);
  if (data.weeks.length > 1) {
    out.push("\nSemana a semana (Meta + Google):");
    for (const w of data.weeks) {
      const t = totalsOf([w], "all", data.leadSource);
      out.push(
        `- ${shortDay(w.start)} a ${shortDay(w.ref)}: investimento ${formatValue(t.spend, "currency")}, leads ${formatValue(t.leads, "int")}, CPL ${formatValue(metricOf(t, "cpl"), "currency")}, cliques ${formatValue(t.clicks, "int")}`,
      );
    }
  }
  const goals = (["leads", "cpl", "spend", "revenue", "roas"] as const)
    .map((k) => {
      const target = autoTarget(data, k);
      if (target === null) return null;
      const def = METRICS[k];
      return `- ${def.label}: realizado ${formatValue(metricOf(totalsOf(data.weeks, "all", data.leadSource), k), def.format)}, ${def.lowerIsBetter ? "teto" : "meta"} ${formatValue(target, def.format)}`;
    })
    .filter(Boolean);
  if (goals.length) out.push(`\nMetas do período:\n${goals.join("\n")}`);
  if (data.score.value !== null) {
    const band = { verde: "saudável", amarelo: "atenção", vermelho: "crítico" }[data.score.band ?? "amarelo"];
    out.push(`\nHealth Score interno da conta: ${Math.round(data.score.value)} (${band}) — indicador da agência, mencione só se pedirem.`);
  }
  return out.join("\n");
}

/* ------------------------------- escrita ------------------------------- */

const SYSTEM = `Você escreve textos de relatórios de resultados de mídia paga da V4 Oliveira & Co, uma assessoria de marketing, para o cliente final ler.

Regras:
- Português do Brasil, tom profissional e direto, de quem conhece o negócio do cliente. Frases curtas.
- Use apenas os números do bloco <dados>. Nunca invente número, meta, causa ou ação que não decorra deles. Se faltar dado para algo, diga isso de forma neutra ou deixe de fora.
- Interprete, não só repita: o que mudou, por quê provavelmente mudou (como hipótese, quando não houver certeza) e o que fazer.
- Formato: texto puro. Pode usar **negrito** para destacar números-chave e "• " no início de linha para listas. Sem títulos markdown, sem emojis, sem aspas em volta do texto.
- Respeite o limite de tamanho pedido: o texto precisa caber no bloco da página.
- Responda só com o texto do bloco, sem introdução nem comentário.`;

export type WriteInput = {
  data: ReportData;
  kind: "heading" | "text";
  /** O que já está no bloco: serve de roteiro (ex.: "O que funcionou: …"). */
  current: string;
  /** Pedido opcional de quem edita ("foque no CPL", "tom mais leve"). */
  instruction: string;
  maxWords: number;
  /** Títulos e textos das outras partes da página, para não repetir. */
  pageContext: string;
};

export async function writeBlockText(input: WriteInput): Promise<string> {
  if (!aiConfigured()) throw new AiError("IA não configurada: falta a chave do Gemini (ANTHROPIC_API_KEY ou GEMINI_API_KEY) na Vercel.");
  const ai = new GoogleGenAI({ apiKey: apiKey() });
  const words = Math.max(3, Math.min(400, Math.round(input.maxWords)));
  const task =
    input.kind === "heading"
      ? `Escreva um título curto (no máximo ${Math.min(words, 12)} palavras) para esta parte do relatório.`
      : `Escreva o texto deste bloco com no máximo ${words} palavras.`;

  const user = [
    `<dados>\n${dataContext(input.data)}\n</dados>`,
    input.pageContext ? `<pagina>\nO que já existe na mesma página (não repita):\n${input.pageContext}\n</pagina>` : "",
    input.current.trim()
      ? `<bloco_atual>\n${input.current.trim()}\n</bloco_atual>\nSe o bloco atual for um roteiro (tópicos com "…" ou "..."), mantenha a estrutura e preencha cada tópico. Se já for um texto pronto, reescreva-o melhor com os números.`
      : "",
    input.instruction.trim() ? `<pedido>\n${input.instruction.trim()}\n</pedido>` : "",
    task,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: user,
      config: {
        systemInstruction: SYSTEM,
        // Inclui o raciocínio do modelo: folga para o texto não sair cortado.
        maxOutputTokens: 8192,
      },
    });
    if (response.promptFeedback?.blockReason)
      throw new AiError("O Gemini bloqueou o pedido. Ajuste o pedido e tente de novo.");
    const finish = response.candidates?.[0]?.finishReason;
    if (finish === FinishReason.SAFETY || finish === FinishReason.PROHIBITED_CONTENT)
      throw new AiError("O Gemini não quis escrever este texto. Ajuste o pedido e tente de novo.");
    const text = (response.text ?? "").trim();
    if (!text) throw new AiError("A IA não devolveu texto. Tente de novo.");
    if (finish === FinishReason.MAX_TOKENS) throw new AiError("O texto saiu cortado. Tente de novo ou peça um texto mais curto.");
    return text;
  } catch (e) {
    if (e instanceof AiError) throw e;
    if (e instanceof ApiError) {
      if (e.status === 400 && /api key/i.test(e.message)) throw new AiError("A chave do Gemini foi recusada. Confira o valor na Vercel.");
      if (e.status === 401 || e.status === 403) throw new AiError("A chave do Gemini foi recusada ou não tem acesso à API. Confira o valor na Vercel.");
      if (e.status === 404) throw new AiError(`Modelo ${MODEL} não encontrado para esta chave. Ajuste GEMINI_MODEL na Vercel.`);
      if (e.status === 429) throw new AiError("Limite de uso do Gemini atingido. Espere alguns segundos e tente de novo.");
      throw new AiError(`O Gemini respondeu com erro (${e.status}). Tente de novo.`);
    }
    throw e;
  }
}
