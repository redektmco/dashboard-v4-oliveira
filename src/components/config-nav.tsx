"use client";

import { RouteTabs, type TabItem } from "./tabs";

const TABS: (TabItem & { admin?: boolean })[] = [
  { href: "/config", label: "Clientes", icon: "grid", exact: true },
  { href: "/config/calibracao", label: "Calibração", icon: "target" },
  { href: "/config/usuarios", label: "Usuários", icon: "shield", admin: true },
  { href: "/config/integracoes", label: "Integrações", icon: "plug", admin: true },
  { href: "/config/modelo", label: "Modelo do score", icon: "layers" },
];

/** Abas de rota da área de Configurações. Admin-only some para quem não é. */
export function ConfigNav({ isAdmin }: { isAdmin: boolean }) {
  return (
    <RouteTabs
      items={TABS.filter((t) => !t.admin || isAdmin)}
      label="Seções de configuração"
    />
  );
}
