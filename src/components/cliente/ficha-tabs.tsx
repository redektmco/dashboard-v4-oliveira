"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { CountBadge } from "../kit";

/**
 * Abas da ficha do cliente.
 *
 * Por que trocar de aba sem trocar de rota: a ficha é um `ClientUI` só, com
 * contexto de drawers, modais e plano de ação, montado a partir de uma rodada
 * de leitura que já traz tudo. Quebrar em `/clientes/[id]/metas`, `/saude`,
 * etc. obrigaria cada rota a refazer aquela leitura inteira (a página é
 * `force-dynamic`) ou a subir o provider para um layout que também teria de
 * carregá-la — duas vezes o mesmo custo, e o estado dos drawers morrendo a
 * cada clique. As abas aqui só escondem painel.
 *
 * O conteúdo de todas as abas fica no DOM, com `hidden`. É de propósito: o
 * servidor já renderizou tudo, o Ctrl+F do navegador continua achando, e
 * trocar de aba não dispara requisição nenhuma.
 *
 * A aba escolhida vai para o fragmento da URL (`#metas`), não para a query:
 * fragmento não chega ao servidor e portanto não refaz a página, mas ainda
 * deixa o link colável ("manda a ficha dele na aba de metas").
 */

type Ctx = { active: string; panelId: (id: string) => string; tabId: (id: string) => string };
const TabsCtx = createContext<Ctx | null>(null);

export type FichaTab = {
  id: string;
  label: string;
  /** Contador ao lado do rótulo (ex.: 3 pendências). `0` ou ausente não mostra. */
  count?: number;
  /** Contador em vermelho — pendência que cobra ação. */
  alert?: boolean;
};

export function FichaTabs({
  tabs,
  initial,
  children,
}: {
  tabs: FichaTab[];
  /** Aba inicial quando a URL não pede nenhuma. Sem isto, a primeira. */
  initial?: string;
  children: React.ReactNode;
}) {
  const uid = useId().replace(/:/g, "");
  const ids = tabs.map((t) => t.id);
  const [active, setActive] = useState(initial && ids.includes(initial) ? initial : ids[0]);
  const strip = useRef<HTMLDivElement>(null);

  // Link com fragmento (`/clientes/12#metas`) abre direto na aba. Lido depois
  // da montagem porque o servidor não vê o fragmento — ler no render faria o
  // HTML do servidor divergir do primeiro render do cliente.
  useEffect(() => {
    const fromHash = () => {
      const h = decodeURIComponent(window.location.hash.replace("#", ""));
      if (h && ids.includes(h)) setActive(h);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
    // `ids` é derivado de `tabs`, que é estático por página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = useCallback((id: string) => {
    setActive(id);
    // `replaceState` em vez de `location.hash =` para não empilhar uma entrada
    // no histórico por clique — e para não rolar a página até o âncora.
    window.history.replaceState(null, "", `#${id}`);
  }, []);

  const panelId = useCallback((id: string) => `${uid}-painel-${id}`, [uid]);
  const tabId = useCallback((id: string) => `${uid}-aba-${id}`, [uid]);

  /** Setas navegam entre abas, como manda o padrão de tablist. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const i = ids.indexOf(active);
    const next = ids[(i + delta + ids.length) % ids.length];
    go(next);
    strip.current?.querySelector<HTMLButtonElement>(`#${tabId(next)}`)?.focus();
  };

  return (
    <TabsCtx.Provider value={{ active, panelId, tabId }}>
      {/* Rola na horizontal no celular: são sete abas, não cabem em 390px. */}
      <div
        ref={strip}
        role="tablist"
        aria-label="Seções da ficha"
        onKeyDown={onKeyDown}
        className="-mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-[var(--border-hair)] px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              id={tabId(t.id)}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={panelId(t.id)}
              tabIndex={on ? 0 : -1}
              onClick={() => go(t.id)}
              className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] transition-colors ${
                on
                  ? "border-[var(--color-accent)] font-medium text-ink-100"
                  : "border-transparent text-ink-400 hover:text-ink-200"
              }`}
            >
              {t.label}
              {Boolean(t.count) && <CountBadge tone={t.alert ? "vermelho" : "neutro"}>{t.count}</CountBadge>}
            </button>
          );
        })}
      </div>
      {children}
    </TabsCtx.Provider>
  );
}

/**
 * Um painel de aba. Fora de `FichaTabs` renderiza o conteúdo direto, sem
 * esconder nada — assim um bloco reaproveitado em outra página não depende
 * do provider para aparecer.
 */
export function FichaPane({ id, children }: { id: string; children: React.ReactNode }) {
  const ctx = useContext(TabsCtx);
  if (!ctx) return <>{children}</>;
  const on = ctx.active === id;
  return (
    <div
      id={ctx.panelId(id)}
      role="tabpanel"
      aria-labelledby={ctx.tabId(id)}
      hidden={!on}
      // `hidden` já esconde; o `flex` fica no filho para não vazar quando oculto.
      className={on ? "flex flex-col gap-6 lg:gap-8" : undefined}
    >
      {children}
    </div>
  );
}
