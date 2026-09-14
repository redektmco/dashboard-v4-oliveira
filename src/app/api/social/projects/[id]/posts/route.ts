import { NextResponse } from "next/server";
import { canManageSocial, getSessionUser } from "@/lib/auth";
import { createPosts, getProject, listPosts, postIdsByClientKey, type NewPost } from "@/lib/social/db";
import { newId } from "@/lib/social/id";
import { FORMAT_ACCEPTS, kindOfType } from "@/lib/social/media";
import { isOwnBlobUrl } from "@/lib/social/storage";
import type { Asset, PostFormat } from "@/lib/social/types";

type Ctx = { params: Promise<{ id: string }> };

const FORMATS: PostFormat[] = ["feed", "reels", "story"];
const MAX_POSTS_PER_REQUEST = 50;
const MAX_ASSETS_PER_POST = 20; // carrossel do IG vai até 20

type ItemIn = {
  clientKey?: unknown;
  format?: unknown;
  caption?: unknown;
  assets?: unknown;
};

type ItemResult =
  | { clientKey: string | null; status: "created" | "duplicate"; postId: string }
  | { clientKey: string | null; status: "error"; error: string };

const num = (v: unknown) => (typeof v === "number" && isFinite(v) && v > 0 ? v : undefined);

/** Valida um item e devolve o post pronto para gravar, ou o motivo da recusa. */
function parseItem(projectId: string, raw: ItemIn): NewPost | string {
  const format = FORMATS.includes(raw.format as PostFormat) ? (raw.format as PostFormat) : null;
  if (!format) return "Formato inválido.";
  const list = Array.isArray(raw.assets) ? raw.assets : [];
  if (!list.length) return "Envie ao menos uma mídia.";
  if (list.length > MAX_ASSETS_PER_POST) return `Máximo de ${MAX_ASSETS_PER_POST} mídias por criativo.`;
  if (format === "reels" && list.length !== 1) return "Reels é um vídeo só.";

  const assets: Asset[] = [];
  for (const a of list as Record<string, unknown>[]) {
    const url = typeof a.url === "string" ? a.url : "";
    if (!isOwnBlobUrl(url, projectId)) return "Mídia fora do armazenamento do projeto.";
    const contentType = typeof a.contentType === "string" ? a.contentType.toLowerCase() : "";
    const kind = kindOfType(contentType);
    if (!kind || !FORMAT_ACCEPTS[format].includes(kind)) return "Tipo de mídia não aceito neste formato.";
    assets.push({
      id: newId("ast_"),
      url,
      name: typeof a.name === "string" ? a.name.slice(0, 200) : "arquivo",
      kind,
      contentType,
      width: num(a.width),
      height: num(a.height),
      duration: num(a.duration),
      size: num(a.size),
    });
  }

  const clientKey = typeof raw.clientKey === "string" && raw.clientKey ? raw.clientKey.slice(0, 120) : null;
  const caption = typeof raw.caption === "string" ? raw.caption.slice(0, 2200) : ""; // limite do IG
  return { id: newId("pst_"), projectId, format, caption, assets, clientKey };
}

/**
 * Quais destas chaves de idempotência já viraram criativo neste projeto?
 * O composer pergunta antes de subir: reenvio de algo que já entrou não
 * gasta banda nem deixa arquivo órfão no Blob.
 */
export async function GET(req: Request, { params }: Ctx) {
  const u = await getSessionUser();
  if (!u || !canManageSocial(u))
    return NextResponse.json({ error: "Sessão expirada ou sem permissão." }, { status: 401 });
  const { id } = await params;
  const keys = (new URL(req.url).searchParams.get("keys") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, MAX_POSTS_PER_REQUEST);
  const existing = await postIdsByClientKey(id, keys);
  return NextResponse.json({ existing: [...existing.keys()] });
}

/**
 * Cria criativos a partir de mídias que o navegador já enviou ao Blob.
 * Corpo: `{ posts: [{ clientKey, format, caption, assets: [...] }] }`.
 *
 * Um item inválido não derruba os outros: a resposta traz o resultado de
 * cada um, na ordem recebida. Reenviar a mesma `clientKey` devolve o post
 * existente (`duplicate`) em vez de criar outro.
 */
export async function POST(req: Request, { params }: Ctx) {
  const u = await getSessionUser();
  if (!u || !canManageSocial(u))
    return NextResponse.json({ error: "Sessão expirada ou sem permissão." }, { status: 401 });

  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { posts?: unknown } | null;
  const items = Array.isArray(body?.posts) ? (body!.posts as ItemIn[]) : null;
  if (!items || !items.length) return NextResponse.json({ error: "Nada para criar." }, { status: 400 });
  if (items.length > MAX_POSTS_PER_REQUEST)
    return NextResponse.json({ error: `Máximo de ${MAX_POSTS_PER_REQUEST} criativos por envio.` }, { status: 400 });

  const parsed = items.map((it) => parseItem(id, it));
  const valid = parsed.filter((p): p is NewPost => typeof p !== "string");

  // Uma chave repetida dentro do próprio envio também é duplicata.
  const seen = new Set<string>();
  const toInsert = valid.filter((p) => !p.clientKey || (!seen.has(p.clientKey) && seen.add(p.clientKey)));
  const created = await createPosts(toInsert);
  const existing = await postIdsByClientKey(
    id,
    valid.filter((p) => p.clientKey && !created.has(p.id)).map((p) => p.clientKey!),
  );

  const results: ItemResult[] = parsed.map((p, i) => {
    const clientKey = typeof items[i].clientKey === "string" ? (items[i].clientKey as string) : null;
    if (typeof p === "string") return { clientKey, status: "error", error: p };
    if (created.has(p.id)) return { clientKey, status: "created", postId: p.id };
    const prev = p.clientKey ? existing.get(p.clientKey) : undefined;
    return prev
      ? { clientKey, status: "duplicate", postId: prev }
      : { clientKey, status: "error", error: "Não foi possível gravar." };
  });

  const posts = await listPosts(id);
  const ok = results.some((r) => r.status !== "error");
  return NextResponse.json({ results, posts }, { status: ok ? 201 : 400 });
}
