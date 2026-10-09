import { daysBetween } from "../model/scoring";
import type { Stage } from "../model/types";

/**
 * Etapa do relacionamento da conta.
 *
 * Não é um campo que alguém preenche toda semana: é lida do que o painel já
 * sabe — contrato aberto, renovação chegando, churn solicitado, upsell em
 * andamento. Quando a regra erra num cliente específico, `stage_override`
 * manda e a derivação é ignorada.
 *
 * Puro de propósito (sem banco, sem rede): a listagem chama isto 40+ vezes
 * em memória, depois de um `Promise.all` só — e o teste roda sem banco.
 */

export type StageInput = {
  /** Correção manual. Preenchido = decide sozinho. */
  override: Stage | null;
  /** Há solicitação de churn em aberto (não concluída). */
  churnOpen: boolean;
  /** Há oportunidade de upsell em estágio ativo (nem ganha nem perdida). */
  upsellOpen: boolean;
  /** `contract_start`, ou `created_at` quando o contrato não tem data. */
  since: string | null;
  renewalDate: string | null;
  /** Hoje, em `YYYY-MM-DD`. */
  at: string;
};

/** Renovação "à vista" — mesma janela que a régua RENEWAL do score trata como risco. */
export const RENEWAL_WINDOW_DAYS = 60;
/** Conta recém-assinada ainda está sendo implantada. */
export const ONBOARDING_DAYS = 60;

export function stageOf(i: StageInput): Stage {
  if (i.override) return i.override;
  // Churn vence tudo: a conta pediu para sair, não importa o que mais exista.
  if (i.churnOpen) return "retencao";

  const renewalIn = i.renewalDate ? daysBetween(i.at, i.renewalDate) : null;
  // Vencida também é renovação: continua sendo a conversa pendente da conta.
  if (renewalIn !== null && renewalIn <= RENEWAL_WINDOW_DAYS) return "renovacao";

  if (i.upsellOpen) return "expansao";

  const age = i.since ? daysBetween(i.since, i.at) : null;
  if (age !== null && age >= 0 && age < ONBOARDING_DAYS) return "onboarding";

  return "estavel";
}
