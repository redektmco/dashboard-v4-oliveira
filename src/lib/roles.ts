/** Job membership is explicit. A screen preset never grants permissions. */
export type JobRole = { id: string; label: string; preset: string };

export const BUILTIN_ROLES: JobRole[] = [
  { id: "coord", label: "Coordenação", preset: "coord" },
  { id: "gt", label: "GT", preset: "gt" },
  { id: "account", label: "Account Manager", preset: "account" },
  { id: "social", label: "Social Media", preset: "social" },
  { id: "designer", label: "Designer", preset: "designer" },
  { id: "crm", label: "Analista de CRM", preset: "crm" },
  { id: "finance", label: "Financeiro", preset: "finance" },
];

export function hasRole(user: { role: string; roles?: string[] }, role: string): boolean {
  return user.role === role || Boolean(user.roles?.includes(role));
}

export function roleLabel(id: string, catalog: JobRole[] = BUILTIN_ROLES): string {
  return catalog.find((role) => role.id === id)?.label
    ?? BUILTIN_ROLES.find((role) => role.id === id)?.label
    ?? id;
}
