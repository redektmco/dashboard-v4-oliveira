/**
 * Resultado padrão das Server Actions chamadas por formulário em modal
 * (`useActionState`): `ok` vira toast e fecha o modal; `error` aparece no
 * próprio formulário, sem perder o que foi digitado.
 */
export type ActionResult = { ok?: string; error?: string } | null;
