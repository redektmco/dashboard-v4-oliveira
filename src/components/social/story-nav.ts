// Navegação do viewer de Stories — pura, sem React, para ser testável e
// segura no StrictMode (o reducer pode rodar duas vezes sem efeito colateral).

export type Nav = { itemIdx: number; frameIdx: number; progress: number; ended: boolean };

/** Quantos frames tem cada item e quais seguram a sequência (pendentes na aprovação). */
export type NavCtx = { counts: number[]; hold: boolean[] };

export type NavAction =
  | { type: "next"; auto: boolean; ctx: NavCtx }
  | { type: "prev"; ctx: NavCtx }
  | { type: "item"; delta: 1 | -1; ctx: NavCtx }
  | { type: "goto"; itemIdx: number; frameIdx: number }
  | { type: "tick"; dt: number; ctx: NavCtx }
  | { type: "progress"; value: number };

const at = (itemIdx: number, frameIdx: number): Nav => ({ itemIdx, frameIdx, progress: 0, ended: false });

export function navReducer(s: Nav, a: NavAction): Nav {
  switch (a.type) {
    case "goto":
      return at(a.itemIdx, a.frameIdx);
    case "progress":
      return { ...s, progress: Math.min(Math.max(a.value, 0), 1) };
    case "tick": {
      if (s.ended) return s;
      const p = s.progress + a.dt;
      return p >= 1 ? navReducer({ ...s, progress: 1 }, { type: "next", auto: true, ctx: a.ctx }) : { ...s, progress: p };
    }
    case "next": {
      const count = a.ctx.counts[s.itemIdx] ?? 0;
      if (s.frameIdx < count - 1) return at(s.itemIdx, s.frameIdx + 1);
      // Fim do item atual: na aprovação, o pendente segura a sequência para o
      // cliente decidir — só o avanço automático é segurado, o toque passa.
      if (a.auto && a.ctx.hold[s.itemIdx]) return { ...s, progress: 1, ended: true };
      if (s.itemIdx < a.ctx.counts.length - 1) return at(s.itemIdx + 1, 0);
      return { ...s, progress: 1, ended: true };
    }
    case "prev": {
      if (s.frameIdx > 0) return at(s.itemIdx, s.frameIdx - 1);
      if (s.itemIdx > 0) return at(s.itemIdx - 1, Math.max((a.ctx.counts[s.itemIdx - 1] ?? 1) - 1, 0));
      return at(s.itemIdx, 0);
    }
    case "item": {
      const i = s.itemIdx + a.delta;
      return i >= 0 && i < a.ctx.counts.length ? at(i, 0) : s;
    }
  }
}
