/**
 * Esqueleto de página enquanto o servidor monta a rota. Sem este arquivo a
 * troca de aba não dava sinal nenhum até a página inteira chegar — parecia
 * que o clique não tinha sido registrado.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando">
      <div className="space-y-2">
        <div className="skeleton h-3 w-28" />
        <div className="skeleton h-8 w-72 max-w-full" />
        <div className="skeleton h-4 w-[28rem] max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton h-[92px]" />
        ))}
      </div>
      <div className="panel">
        <div className="border-b border-[var(--border-hair)] px-5 py-4">
          <div className="skeleton h-5 w-44" />
        </div>
        <div className="divide-y divide-[var(--border-hair)]">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
              <div className="skeleton h-4 flex-1" />
              <div className="skeleton h-4 w-24" />
              <div className="skeleton h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
