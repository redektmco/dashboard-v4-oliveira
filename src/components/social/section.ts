import type { HeadTab } from "../page-head";

/** Abas de Social media, no cabeçalho de Projetos e de Planejamento. */
export const SOCIAL_TABS: HeadTab[] = [
  { href: "/social", label: "Projetos", icon: "image", exact: true },
  { href: "/social/planejamento", label: "Planejamento", icon: "calendar" },
];
