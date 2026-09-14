/** Carregando o link de aprovação — sem a moldura do painel. */
export default function GuestLoading() {
  return (
    <div className="center-screen" aria-busy="true" aria-label="Carregando criativos">
      <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3, color: "#e50914" }} />
    </div>
  );
}
