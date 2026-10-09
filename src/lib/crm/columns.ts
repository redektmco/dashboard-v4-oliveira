import type { SortKey } from "./views";

/**
 * As colunas da tabela, num lugar só: o cabeçalho, as linhas e o seletor de
 * "Personalizar colunas" leem daqui, então acrescentar uma coluna é mexer em
 * um array — não em três componentes.
 *
 * `width` é a faixa do grid (medidas do design). Cliente é a única elástica;
 * o resto é fixo para os números alinharem entre as linhas. Como o grid é
 * montado a partir das colunas *visíveis*, esconder coluna no CSS não serve:
 * a tela calcula a lista e o template juntos (ver `visibleColumns`).
 *
 * Abaixo de 1024px a tabela vira lista de cartões e nada disto se aplica.
 */

export type ColumnId =
  | "saude"
  | "etapa"
  | "mrr"
  | "interacao"
  | "proxima"
  | "pendencias"
  | "metas"
  | "fonte"
  | "cobranca"
  | "inicio"
  | "renovacao"
  | "servicos"
  | "tarefas";

export type Column = {
  id: ColumnId;
  label: string;
  width: string;
  /** Coluna principal: vem ligada e não pode ser desligada. */
  core?: boolean;
  sort?: SortKey;
  align?: "right";
  /** Só cabe a partir de 1280px — some sozinha em telas menores. */
  wide?: boolean;
};

export const COLUMNS: Column[] = [
  { id: "saude", label: "Saúde", width: "128px", core: true, sort: "score" },
  { id: "etapa", label: "Etapa", width: "116px", core: true },
  { id: "mrr", label: "MRR", width: "112px", core: true, sort: "mrr", align: "right" },
  { id: "interacao", label: "Última interação", width: "132px", core: true, sort: "interacao" },
  { id: "proxima", label: "Próxima ação", width: "184px", core: true, wide: true },
  { id: "pendencias", label: "Pendências", width: "92px", core: true },
  { id: "metas", label: "Forecast", width: "92px" },
  { id: "fonte", label: "Fonte de leads", width: "140px" },
  { id: "cobranca", label: "Cobrança", width: "124px" },
  { id: "inicio", label: "Início", width: "100px" },
  { id: "renovacao", label: "Renovação", width: "120px", sort: "renovacao" },
  { id: "servicos", label: "Serviços", width: "160px" },
  { id: "tarefas", label: "Tarefas abertas", width: "108px", align: "right" },
];

export const CORE_COLUMNS = COLUMNS.filter((c) => c.core).map((c) => c.id);
export const OPTIONAL_COLUMNS = COLUMNS.filter((c) => !c.core);

/** As colunas que a tela realmente desenha: ligadas, e que cabem na largura. */
export const visibleColumns = (enabled: ColumnId[], wide: boolean) =>
  COLUMNS.filter((c) => enabled.includes(c.id) && (wide || !c.wide));

/** Faixas do grid: seleção, cliente, as colunas visíveis e o menu da linha. */
export const gridTemplate = (visible: Column[]) =>
  ["36px", "minmax(220px, 1fr)", ...visible.map((c) => c.width), "32px"].join(" ");
