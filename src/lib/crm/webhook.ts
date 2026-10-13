/**
 * Leitura do corpo dos webhooks de CRM (leads e vendas). Cada CRM manda num
 * formato: JSON (RD Station, Pipedrive, HubSpot, n8n/Zapier) ou formulário
 * (`leads[status][0][price]=1500`, Kommo). Aqui tudo vira um objeto só e as
 * chaves comuns são procuradas em qualquer nível — sem mapear CRM a CRM.
 */

type Bag = Record<string, unknown>;

/** Corpo do POST como objeto, seja JSON ou formulário. Corpo inválido vira `{}`. */
export async function readBody(req: Request): Promise<Bag> {
  const type = req.headers.get("content-type") ?? "";
  const text = await req.text().catch(() => "");
  if (!text) return {};
  if (!type.includes("application/x-www-form-urlencoded")) {
    try {
      const body = JSON.parse(text);
      return body && typeof body === "object" ? (body as Bag) : {};
    } catch {
      if (!text.includes("=")) return {};
    }
  }
  const out: Bag = {};
  for (const [k, v] of new URLSearchParams(text)) out[k] = v;
  return out;
}

/** Percorre o objeto (até 5 níveis) devolvendo cada par chave/valor folha. */
function* leaves(v: unknown, depth = 0, key = ""): Generator<[string, unknown]> {
  if (depth > 5) return;
  if (Array.isArray(v)) {
    for (const x of v) yield* leaves(x, depth + 1, key);
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v as Bag)) yield* leaves(x, depth + 1, k);
  } else if (key) {
    yield [key, v];
  }
}

/** Última parte do nome da chave, sem colchetes: `leads[status][0][price]` → `price`. */
const tail = (k: string) => {
  const parts = k.toLowerCase().split(/[\[\].]+/).filter(Boolean);
  return parts[parts.length - 1] ?? "";
};

/**
 * Primeiro valor (na ordem de prioridade das chaves) em qualquer nível.
 * Chave plana de formulário vale pelo último pedaço.
 */
function find(bag: Bag, keys: string[]): unknown {
  const all = [...leaves(bag)];
  for (const k of keys) {
    const hit = all.find(([name, v]) => tail(name) === k && v !== null && v !== undefined && String(v).trim() !== "");
    if (hit) return hit[1];
  }
  return undefined;
}

/** Onde o CRM costuma aninhar o registro: `lead`, `deal`, `data`… */
const CONTAINERS = ["lead", "deal", "opportunity", "negocio", "data", "contact", "document"];

/**
 * Chave de dedup tirada do payload, quando o CRM manda algo estável (id do
 * lead/negócio, e-mail, telefone). Sem ela cada POST conta um — o que também
 * é o certo para um CRM que só dispara "lead novo" ou "negócio ganho".
 * Só olha o topo, os contêineres comuns e o item 0 do formulário do Kommo
 * (`leads[add][0][id]`): um `account.id` perdido no payload é igual em todo
 * POST e faria todos os leads virarem um só.
 */
export function dedupFrom(bag: Bag, keys = ["id", "lead_id", "leadid", "uuid", "email", "phone"]): string | null {
  const scopes: Bag[] = [bag, ...CONTAINERS.map((c) => bag[c]).filter((x): x is Bag => Boolean(x) && typeof x === "object")];
  for (const k of keys) {
    for (const scope of scopes) {
      const v = scope[k];
      if (v !== null && v !== undefined && typeof v !== "object" && String(v).trim()) return String(v).trim().toLowerCase().slice(0, 200);
    }
    const flat = Object.entries(bag).find(([name, v]) => /^leads\[\w+\]\[0\]\[/.test(name) && tail(name) === k && String(v).trim());
    if (flat) return String(flat[1]).trim().toLowerCase().slice(0, 200);
  }
  return null;
}

/** Número em qualquer formato que um CRM manda: 1500, "1500.50", "R$ 1.500,50". */
export function parseMoney(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[^\d,.-]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); // padrão brasileiro
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // "1.500" = mil e quinhentos
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Chaves de valor da venda, da mais específica para a mais genérica. */
export const SALE_VALUE_KEYS = [
  "valor_venda",
  "sale_value",
  "deal_value",
  "amount_total",
  "price",
  "valor",
  "amount",
  "value",
  "revenue",
  "total",
];

/** Valor da venda no payload, ou `null` quando o CRM não mandou nenhum. */
export const saleValue = (bag: Bag): number | null => {
  const n = parseMoney(find(bag, SALE_VALUE_KEYS));
  return n === null || n < 0 ? null : Math.round(n * 100) / 100;
};

/** Dedup da venda: id do negócio primeiro — o e-mail se repete em duas compras. */
export const saleDedup = (bag: Bag) => dedupFrom(bag, ["deal_id", "dealid", "order_id", "pedido", "id", "uuid"]);
