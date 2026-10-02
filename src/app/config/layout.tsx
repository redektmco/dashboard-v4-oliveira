import { requireUser } from "@/lib/auth";
import { badgesOf, configSnapshot } from "@/lib/config-status";
import { ConfigShell } from "@/components/config-shell";

/**
 * Configurações: tudo que se ajusta de vez em quando e não é jornada do dia
 * — pendências da carteira, cadastro e metas, cobrança, modelo do score,
 * integrações e acesso do time. Moldura própria, com contadores do que
 * falta em cada seção.
 */
export default async function ConfigLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const badges = badgesOf(await configSnapshot());
  return (
    <ConfigShell isAdmin={Boolean(me.is_admin)} badges={badges}>
      {children}
    </ConfigShell>
  );
}
