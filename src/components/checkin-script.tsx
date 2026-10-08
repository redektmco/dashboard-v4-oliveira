"use client";

import { Icon } from "./icon";
import { SidePanel } from "./side-panel";

/** Uma pergunta de escala 1–5, já com o texto do catálogo. */
export type Scale = { key: string; question: string; anchors: Record<number, string> };

/* Textos da tela (título curto, pergunta curta, âncoras e dica do roteiro). */
export const COPY: Record<string, { title: string; short: string; lo: string; hi: string; tip: string }> = {
  q1_satisfaction: { title: "Satisfação com o resultado", short: "Quão satisfeito está com o resultado do período", lo: "Insatisfeito", hi: "Superou o esperado", tip: "Se responder por cima, peça o número: “me dá uma nota de 1 a 5”." },
  q2_climate: { title: "Relacionamento e comunicação", short: "Como avalia a relação e a comunicação no dia a dia", lo: "Relação tensa", hi: "Parceria", tip: "Se houver atrito, deixe o cliente terminar antes de responder." },
  q3_trust: { title: "Intenção de continuidade", short: "Qual a chance de seguir no próximo ciclo", lo: "Avaliando sair", hi: "Já fala de próximos passos", tip: "Pergunta direta. Não sugira a resposta." },
  q4_lead_quality: { title: "Qualidade dos leads", short: "Como o time comercial avalia os leads recebidos", lo: "Improváveis", hi: "Qualificados, no perfil", tip: "É a visão do cliente, não a nossa." },
  q5_engagement: { title: "Ritmo do time do cliente", short: "Acompanhamento de aprovações, materiais e calls", lo: "Quase não responde", hi: "Rápido, sem cobrança", tip: "Aprovações, materiais e presença nas calls." },
  q6_expectation: { title: "Expectativa vs. entrega", short: "O entregue corresponde ao esperado no fechamento", lo: "Outra coisa", hi: "Acima do combinado", tip: "Nota baixa com resultado bom indica problema de expectativa." },
};

/**
 * Roteiro da ligação: as perguntas para ler em voz alta, na ordem. Abre do
 * formulário de check-in e da lista de Check-ins — não salva nada.
 */
export function ScriptPanel({ open, onClose, scales }: { open: boolean; onClose: () => void; scales: Scale[] }) {
  return (
    <SidePanel open={open} onClose={onClose} label="Roteiro da ligação" width={416}>
      <div className="space-y-2 border-b border-[var(--border-hair)] p-5">
        <div className="flex items-center gap-2.5">
          <Icon name="book" size={18} className="text-ink-300" />
          <h2 className="flex-1 font-display text-[17px] font-semibold text-ink-100">Roteiro da ligação</h2>
          <button type="button" onClick={onClose} className="modal-x" aria-label="Fechar">
            <Icon name="x" size={16} />
          </button>
        </div>
        <p className="text-[13px] leading-[19px] text-ink-300">
          Leia as perguntas em voz alta, na ordem. O roteiro não salva nada — a nota que o cliente der você registra no formulário do check-in.
        </p>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {scales.map((s, i) => {
          const c = COPY[s.key];
          return (
            <div key={s.key} className="space-y-2">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase text-ink-500">
                <span className="tnum">{String(i + 1).padStart(2, "0")}</span>
                {c?.title ?? s.key}
              </p>
              <p className="text-[15px] font-medium leading-[22px] text-ink-100">“{s.question}”</p>
              {c && <p className="text-[12px] text-ink-300">{c.tip}</p>}
              {c && (
                <p className="text-[12px] text-ink-500">
                  1 = {c.lo} · 5 = {c.hi}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="m-5 mt-0 flex gap-2.5 rounded-[10px] bg-ink-850 p-3 text-[12px] leading-[17px] text-ink-300">
        <Icon name="alertCircle" size={15} className="mt-0.5 shrink-0" />
        Presença, adimplência, renovação e risco são fatos objetivos — preencha depois da ligação, sem perguntar ao cliente.
      </p>
    </SidePanel>
  );
}
