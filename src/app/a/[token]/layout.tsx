import "@/app/social/approval.css";

/**
 * Experiência do cliente (guest): sem login, sem a moldura do dashboard.
 * Tudo vive sob `.sm-scope` para herdar o design da aprovação.
 */
export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="sm-scope" style={{ width: "100%", minHeight: "100dvh", background: "#0d0d0d" }}>
      {children}
    </div>
  );
}
