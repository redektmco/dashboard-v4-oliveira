import { CORE_COLUMNS, visibleColumns } from "@/lib/crm/columns";
import { CrmSkeleton } from "@/components/crm/crm-table";

/**
 * A estrutura da tela aparece de imediato — cabeçalho, indicadores e a moldura
 * da tabela — e só as linhas ficam em esqueleto. Trocar de aba não deve dar a
 * impressão de que a página sumiu.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="skeleton h-2.5 w-24 rounded" />
        <span className="skeleton h-7 w-40 rounded" />
        <span className="skeleton h-3 w-[min(100%,460px)] rounded" />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <span className="skeleton h-2.5 w-20 rounded" />
            <span className="skeleton h-6 w-16 rounded" />
          </div>
        ))}
      </div>

      <section className="panel">
        <CrmSkeleton columns={visibleColumns(CORE_COLUMNS, true)} wide />
      </section>
    </div>
  );
}
