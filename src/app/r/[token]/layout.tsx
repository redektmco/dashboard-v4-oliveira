/**
 * Link público do relatório: sem login e sem a moldura do painel. Mesmo
 * truque do link de aprovação (`/a/`): o `<body>` é flex, então a largura
 * vem da linha (`flex: 1 1 0%`), não do conteúdo.
 */
export default function PublicReportLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: "1 1 0%", minWidth: 0, width: "100%", minHeight: "100dvh", background: "#0b0b0c" }}>{children}</div>;
}
