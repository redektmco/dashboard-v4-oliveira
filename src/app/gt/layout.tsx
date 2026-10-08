import { requireUser } from "@/lib/auth";
import { badgesOf, configSnapshot } from "@/lib/config-status";
import { SectionProvider, type HeadTab } from "@/components/page-head";

/**
 * Performance: o número da semana chega sozinho pelas integrações (Meta Ads,
 * Google Ads e CRM). O que o time ajusta aqui é a régua — as metas de cada
 * conta — e, para administradores, as integrações e os canais de envio.
 */
export default async function PerformanceLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const b = badgesOf(await configSnapshot());
  const tabs: HeadTab[] = [
    { href: "/gt", label: "Metas", icon: "target", exact: true, badge: b.clientes ? { tone: "vermelho", text: String(b.clientes) } : null },
  ];
  if (me.is_admin)
    tabs.push(
      { href: "/gt/integracoes", label: "Integrações", icon: "plug", badge: b.integracoes ? { tone: "vermelho", text: String(b.integracoes) } : null },
      { href: "/gt/canais", label: "Canais de envio", icon: "send", badge: b.canais ? { tone: "amarelo", text: "!" } : null },
    );
  return (
    <SectionProvider section="Performance" href="/gt" tabs={tabs}>
      {children}
    </SectionProvider>
  );
}
