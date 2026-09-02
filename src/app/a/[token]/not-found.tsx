export default function GuestNotFound() {
  return (
    <div className="center-screen">
      <div className="card pad" style={{ maxWidth: 360, textAlign: "center" }}>
        <h3 style={{ marginBottom: 8 }}>Link indisponível</h3>
        <p className="muted">
          Este link de aprovação não existe mais ou foi arquivado. Peça um novo à equipe da V4.
        </p>
      </div>
    </div>
  );
}
