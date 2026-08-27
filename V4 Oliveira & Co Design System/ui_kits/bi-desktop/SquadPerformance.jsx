// =========================================================
// V4 BI — Squad performance card (Overview)
// =========================================================
export const SquadPerformance = () => {
  const squadStats = V4Data.squads.map(sq => {
    const clients = V4Data.clients.filter(c => c.squad === sq.id);
    const healthAvg = clients.length
      ? Math.round(clients.reduce((s, c) => s + c.health, 0) / clients.length)
      : 0;
    const feeTotal    = clients.reduce((s, c) => s + c.fee, 0);
    const investTotal = clients.reduce((s, c) => s + c.invest, 0);
    const roasAvg = clients.length
      ? clients.reduce((s, c) => s + c.roas, 0) / clients.length
      : 0;
    const critical = clients.filter(c => c.status === "critical").length;
    return { sq, clients: clients.length, healthAvg, feeTotal, investTotal, roasAvg, critical };
  });

  const squadColor = (id) => ({
    aurora: "#e50914", volta: "#52cc5a", norte: "#ffc02a", delta: "#7a4ad8", matriz: "#3a9cff",
  })[id] || "#888";

  return (
    <Card padded={false}
      title="Desempenho dos squads"
      subtitle="Health médio, fee gerido e clientes em crise por squad"
      action={<button className="btn ghost sm">Ver detalhes →</button>}>
      <div className="squad-table">
        <div className="squad-row head">
          <span>Squad</span>
          <span>Líder</span>
          <span>Clientes</span>
          <span>Carga</span>
          <span style={{ textAlign: "right" }}>Fee</span>
          <span style={{ textAlign: "right" }}>ROAS</span>
          <span style={{ textAlign: "right" }}>Health</span>
          <span style={{ textAlign: "center" }}>Crítico</span>
        </div>
        {squadStats.map(s => (
          <div key={s.sq.id} className="squad-row">
            <span className="squad-name">
              <i style={{ background: squadColor(s.sq.id) }}></i>
              {s.sq.name}
            </span>
            <span style={{ font: "var(--t-body)" }}>{s.sq.lead}</span>
            <span className="num">{s.clients}</span>
            <span>
              <div className="load-bar">
                <div className="load-bar-fill" style={{
                  width: s.sq.load + "%",
                  background: s.sq.load >= 90 ? "var(--v4-red-500)" : s.sq.load >= 80 ? "var(--v4-yellow)" : "var(--v4-green)",
                }}/>
              </div>
              <div className="num" style={{ font: "var(--t-mono-sm)", color: "var(--fg-3)", marginTop: 4 }}>{s.sq.load}%</div>
            </span>
            <span className="num" style={{ textAlign: "right" }}>{V4Data.fmtBRLk(s.feeTotal)}</span>
            <span className="num" style={{ textAlign: "right" }}>{s.roasAvg.toFixed(1).replace(".", ",")}×</span>
            <span style={{ textAlign: "right" }}>
              <StatusBadge status={s.healthAvg >= 70 ? "healthy" : s.healthAvg >= 50 ? "warning" : "critical"} score={s.healthAvg}/>
            </span>
            <span style={{ textAlign: "center" }}>
              {s.critical > 0
                ? <span className="badge c"><i></i>{s.critical}</span>
                : <span style={{ color: "var(--fg-4)" }}>—</span>}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
};

window.SquadPerformance = SquadPerformance;
