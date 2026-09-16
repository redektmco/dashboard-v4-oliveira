import "@/app/social/approval.css";

/**
 * Experiência do cliente (guest): sem login, sem a moldura do dashboard.
 *
 * O `<body>` do app é um flex container (a moldura do painel vive nele). Como
 * item flex com base `auto`, este wrapper se mediria pelo conteúdo — e as
 * telas de dentro, que pedem `width: min(100%, …)`, entrariam num laço onde o
 * 100% vira max-content: a página ficava estreita num canto ou larga demais
 * (grade vazando pela direita). `flex: 1 1 0%` faz a largura vir da linha.
 */
export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="sm-scope"
      style={{ flex: "1 1 0%", minWidth: 0, width: "100%", minHeight: "100dvh", background: "#08080a" }}
    >
      {children}
    </div>
  );
}
