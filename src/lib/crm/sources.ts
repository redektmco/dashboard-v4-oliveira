import type { IconName } from "../../components/icon";
import { whenBR } from "../config-status";
import { describeUnread, GOOGLE_UNREAD, type UnreadEvent } from "../meta/metrics";

/**
 * Fontes de dados de uma conta (Meta Ads, Google Ads, CRM por webhook), num
 * formato só. É a mesma leitura na ficha do cliente (aba Forecast e fontes),
 * na lista de Performance (as pílulas) e no painel da conta — antes cada tela
 * montava a sua e uma dizia "conectada" enquanto a outra dizia "nenhuma".
 */

export type SourceState = "conectada" | "erro" | "pendente";

export type SourceView = {
  id: string;
  /** Rótulo curto: "Meta Ads", "Google Ads", "CRM · Kommo". */
  name: string;
  icon: IconName;
  /** Linha de contexto: id da conta, última sincronização, o que falta. */
  detail: string;
  state: SourceState;
  /** Não existe ainda (só o CRM aparece assim, como convite a conectar). */
  missing?: boolean;
  action?: { label: string; href: string };
};

type MetaLinkLike = {
  id: number;
  ad_account_id: string;
  active: number;
  last_sync_at: string | null;
  last_error: string | null;
  unread_events: UnreadEvent[] | null;
};
type GoogleLinkLike = Omit<MetaLinkLike, "ad_account_id"> & { customer_id: string };
type HookLike = { crm_name: string | null; active: number; last_event_at: string | null; last_sale_at?: string | null } | null;

export function clientSources({
  clientId,
  meta,
  google,
  hook,
}: {
  clientId: number;
  meta: MetaLinkLike[];
  google: GoogleLinkLike[];
  hook: HookLike;
}): SourceView[] {
  const panel = `/gt?c=${clientId}`;
  const out: SourceView[] = [];
  for (const l of meta) {
    const unread = describeUnread(l.unread_events);
    out.push({
      id: `meta-${l.id}`,
      name: "Meta Ads",
      icon: "megaphone",
      detail: l.last_error ?? unread ?? `${l.ad_account_id} · sincronizado ${whenBR(l.last_sync_at).toLowerCase()}`,
      state: l.last_error || unread ? "erro" : l.active ? "conectada" : "pendente",
      action: l.last_error
        ? { label: "Reconectar", href: "/gt/integracoes" }
        : unread
          ? { label: "Ver eventos", href: `/api/meta/eventos?cliente=${clientId}` }
          : undefined,
    });
  }
  for (const l of google) {
    const unread = describeUnread(l.unread_events, GOOGLE_UNREAD);
    out.push({
      id: `google-${l.id}`,
      name: "Google Ads",
      icon: "search",
      detail: l.last_error ?? unread ?? `${l.customer_id} · sincronizado ${whenBR(l.last_sync_at).toLowerCase()}`,
      state: l.last_error || unread ? "erro" : l.active ? "conectada" : "pendente",
      action: l.last_error
        ? { label: "Reconectar", href: "/gt/integracoes" }
        : unread
          ? { label: "Ver conversões", href: `/api/google/eventos?cliente=${clientId}` }
          : undefined,
    });
  }
  const sale = hook?.last_sale_at ? ` · última venda ${whenBR(hook.last_sale_at).toLowerCase()}` : "";
  out.push({
    id: "crm",
    name: hook?.crm_name ? `CRM · ${hook.crm_name}` : "CRM",
    icon: "webhook",
    missing: !hook,
    detail: !hook
      ? "webhook não gerado — leads e vendas do CRM não entram no score"
      : !hook.active
        ? "webhook pausado"
        : hook.last_event_at
          ? `último lead ${whenBR(hook.last_event_at).toLowerCase()}${sale}`
          : `webhook gerado, nenhum lead recebido ainda${sale}`,
    state: hook && hook.active && (hook.last_event_at || hook.last_sale_at) ? "conectada" : "pendente",
    action: { label: hook ? "Gerenciar" : "Gerar webhook", href: panel },
  });
  return out;
}

/** As fontes que existem (o CRM sem webhook fica de fora). */
export const linkedSources = (list: SourceView[]) => list.filter((s) => !s.missing);
