// ============================================================
// Normalização de URL de vídeo para embed (YouTube, Vimeo, Loom).
// Puro e sem dependência: recebe o que o admin colar e devolve a URL
// de embed + uma thumbnail quando dá para derivar sem rede. O player
// só é injetado no clique (facade), então isto roda no servidor.
// ============================================================

export type VideoEmbed = {
  provider: "youtube" | "vimeo" | "loom";
  /** URL do iframe (já no formato de embed). */
  embedUrl: string;
  /** Thumbnail derivável sem chamada de rede, quando existe. */
  thumbUrl: string | null;
};

function parse(raw: string): URL | null {
  try {
    return new URL(raw.trim());
  } catch {
    return null;
  }
}

/**
 * Converte uma URL "de navegador" em dados de embed. Aceita as formas comuns
 * de cada provedor e ignora parâmetros que não interessam. Retorna `null`
 * quando não reconhece — aí o front cai no link cru, nunca num iframe quebrado.
 */
export function toVideoEmbed(raw: string | null | undefined): VideoEmbed | null {
  if (!raw) return null;
  const u = parse(raw);
  if (!u) return null;
  const host = u.hostname.replace(/^www\./, "");

  // YouTube: youtu.be/<id>, watch?v=<id>, /embed/<id>, /shorts/<id>
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return id ? youtube(id, u) : null;
  }
  if (host.endsWith("youtube.com") || host === "youtube-nocookie.com") {
    const id =
      u.searchParams.get("v") ||
      u.pathname.match(/\/(embed|shorts|v)\/([^/?]+)/)?.[2] ||
      "";
    return id ? youtube(id, u) : null;
  }

  // Vimeo: vimeo.com/<id> ou player.vimeo.com/video/<id>
  if (host.endsWith("vimeo.com")) {
    const id = u.pathname.match(/(\d{6,})/)?.[1];
    if (!id) return null;
    return { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}`, thumbUrl: null };
  }

  // Loom: loom.com/share/<id> ou /embed/<id>
  if (host.endsWith("loom.com")) {
    const id = u.pathname.match(/\/(share|embed)\/([^/?]+)/)?.[2];
    if (!id) return null;
    return { provider: "loom", embedUrl: `https://www.loom.com/embed/${id}`, thumbUrl: null };
  }

  return null;
}

function youtube(id: string, src: URL): VideoEmbed {
  // Preserva o início do vídeo (?t= / ?start=) se veio na URL original.
  const start = src.searchParams.get("start") || parseTime(src.searchParams.get("t"));
  const q = start ? `?start=${start}` : "";
  return {
    provider: "youtube",
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}${q}`,
    thumbUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

/** "1m30s" ou "90" -> segundos. */
function parseTime(t: string | null): string {
  if (!t) return "";
  if (/^\d+$/.test(t)) return t;
  const m = t.match(/(?:(\d+)m)?(?:(\d+)s)?/);
  const secs = (Number(m?.[1] ?? 0) * 60) + Number(m?.[2] ?? 0);
  return secs ? String(secs) : "";
}

/** A URL é de um provedor de vídeo que sabemos incorporar? (validação do admin) */
export const isEmbeddableVideo = (raw: string): boolean => toVideoEmbed(raw) !== null;
