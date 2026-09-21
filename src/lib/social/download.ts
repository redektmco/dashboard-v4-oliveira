import type { Asset } from "./types";

/**
 * Baixa uma mídia do Blob. `?download=1` faz o CDN da Vercel responder com
 * `Content-Disposition: attachment`, então funciona mesmo sendo um domínio
 * diferente (o atributo `download` do <a> é ignorado pelo navegador nesse caso).
 */
function downloadOne(url: string, name: string) {
  const withParam = `${url}${url.includes("?") ? "&" : "?"}download=1`;
  const a = document.createElement("a");
  a.href = withParam;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Uma ou várias mídias (carrossel/story): dispara uma a uma, espaçadas, para o navegador não bloquear. */
export function downloadAssets(assets: Pick<Asset, "url" | "name">[]) {
  assets.forEach((asset, i) => setTimeout(() => downloadOne(asset.url, asset.name), i * 200));
}
