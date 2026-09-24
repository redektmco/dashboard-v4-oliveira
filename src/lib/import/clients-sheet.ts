/**
 * Leitura da planilha de Gestão de Projetos da unidade (export CSV do Google
 * Sheets) para o cadastro de clientes. Puro — sem banco — para ser testado.
 *
 * A planilha tem duas linhas de grupo antes do cabeçalho, blocos por squad
 * com uma linha de total no fim de cada um e células com quebra de linha
 * entre aspas. O cabeçalho é achado pela linha que tem CLIENTE e MRR.
 */
import type { AccountType } from "../model/types";

export type SheetClient = {
  name: string;
  accountType: AccountType;
  mrr: number;
  gt: string | null;
  account: string | null;
  email: string | null;
  phone: string | null;
  /** Mídia gerida mensal (R$), quando definida. */
  mediaMonthly: number | null;
  /** Início do contrato (YYYY-MM-DD). */
  start: string | null;
};

/** CSV RFC 4180: vírgula, aspas duplas, "" escapado, quebra de linha dentro de aspas. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/** "R$ 13.800,00" → 13800. Texto ("Não definido") e vazio → null. */
export function parseBRL(s: string | undefined): number | null {
  const t = (s ?? "").replace(/R\$|\s/g, "");
  if (!/^-?[\d.]+(,\d+)?$/.test(t)) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** "28/08/24" ou "28/08/2024" → "2024-08-28". */
export function parseDateBR(s: string | undefined): string | null {
  const m = (s ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** Primeiro e-mail de uma célula com vários ("a@x / b@y; c@z"). */
export function firstEmail(s: string | undefined): string | null {
  return (s ?? "").match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0]?.toLowerCase() ?? null;
}

/**
 * Primeiro telefone em formato E.164 sem o "+" (o que o WhatsApp Cloud usa):
 * "Maria 15 99677-9992 / Pedro …" → "5515996779992".
 */
export function firstPhone(s: string | undefined): string | null {
  for (const part of (s ?? "").split(/[\/;,]/)) {
    const digits = part.replace(/\D/g, "");
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits;
  }
  return null;
}

/** "IGOR" → "Igor"; "SEM GT"/vazio → null. */
export function personName(s: string | undefined): string | null {
  const t = (s ?? "").trim();
  if (!t || /^sem\b/i.test(t)) return null;
  return t
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function parseClientsSheet(text: string): SheetClient[] {
  const rows = parseCsv(text);
  const headerAt = rows.findIndex((r) => {
    const cells = r.map(norm);
    return cells.includes("CLIENTE") && cells.includes("MRR");
  });
  if (headerAt < 0) throw new Error("Cabeçalho não encontrado: a planilha precisa das colunas CLIENTE e MRR.");

  const header = rows[headerAt].map(norm);
  // Primeira ocorrência: "CRM" e "OBS." se repetem mais à direita.
  const col = (name: string) => header.indexOf(name);
  const c = {
    name: col("CLIENTE"),
    mrr: col("MRR"),
    gt: col("GT"),
    account: col("ACC"),
    email: col("E-MAIL"),
    phone: col("CONTATO"),
    media: col("MIDIA GERIDA"),
    start: col("INICIO"),
    ecommerce: col("E-COMMERCE"),
  };
  const at = (r: string[], i: number) => (i >= 0 ? r[i]?.trim() ?? "" : "");

  const out: SheetClient[] = [];
  const seen = new Set<string>();
  for (const r of rows.slice(headerAt + 1)) {
    const name = at(r, c.name).replace(/\s+/g, " ");
    // Linha de total do squad: sem nome, só as somas.
    if (!name || seen.has(norm(name))) continue;
    seen.add(norm(name));
    out.push({
      name,
      accountType: /^https?:\/\//i.test(at(r, c.ecommerce)) ? "ecommerce" : "lead_gen",
      mrr: parseBRL(at(r, c.mrr)) ?? 0,
      gt: personName(at(r, c.gt)),
      account: personName(at(r, c.account)),
      email: firstEmail(at(r, c.email)),
      phone: firstPhone(at(r, c.phone)),
      mediaMonthly: parseBRL(at(r, c.media)) || null,
      start: parseDateBR(at(r, c.start)),
    });
  }
  return out;
}

/** Chave de comparação de nome de cliente: sem acento, caixa, espaços e pontuação. */
export const clientKey = (s: string) => norm(s).replace(/[^A-Z0-9]/g, "");
