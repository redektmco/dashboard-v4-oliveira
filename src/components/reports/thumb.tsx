import { PAGE, type Page } from "@/lib/reports/types";
import { PageView, type RenderCtx } from "./blocks";

/**
 * Miniatura da primeira página, desenhada no servidor (sem JS no navegador):
 * a lista de relatórios e de modelos mostra como cada um começa.
 */
export function Thumb({ page, ctx, width }: { page: Page | undefined; ctx: RenderCtx; width: number }) {
  const { w, h } = PAGE[ctx.format];
  const scale = width / w;
  return (
    <div className="rp-scaled pointer-events-none overflow-hidden" style={{ width, height: h * scale }} aria-hidden>
      {page && <PageView page={page} ctx={ctx} style={{ transform: `scale(${scale})` }} />}
    </div>
  );
}
