// =========================================================
// V4 BI — Client table (used in Overview + Clients pages)
// =========================================================
export const ClientTable = ({ onOpen, fullPage = false }) => {
  const [filter, setFilter] = React.useState("all");
  const [sortKey, setSortKey] = React.useState("health");
  const [sortDir, setSortDir] = React.useState("asc");

  const filters = [
    { id: "all",      label: "Todos" },
    { id: "healthy",  label: "Saudáveis" },
    { id: "warning",  label: "Em risco" },
    { id: "critical", label: "Críticos" },
  ];

  const filtered = React.useMemo(() => {
    let rows = V4Data.clients;
    if (filter !== "all") rows = rows.filter(c => c.status === filter);
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const n = (typeof av === "number" ? av - bv : String(av).localeCompare(String(bv)));
      return sortDir === "asc" ? n : -n;
    });
    return rows;
  }, [filter, sortKey, sortDir]);

  const squadColor = (id) => ({
    aurora: "#e50914", volta: "#52cc5a", norte: "#ffc02a", delta: "#7a4ad8", matriz: "#3a9cff",
  })[id] || "#888";

  const sortBy = (k) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  return (
    <Card
      title="Carteira de clientes"
      subtitle={`${filtered.length} de ${V4Data.clients.length} clientes`}
      padded={false}
      action={
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {filters.map(f => (
            <button key={f.id}
              className={"chip" + (filter === f.id ? " active" : "")}
              onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      }>
      <div style={{ overflow: "auto", maxHeight: fullPage ? "none" : 520 }}>
        <table className="client-table">
          <thead>
            <tr>
              <th style={{ width: "26%" }}>Cliente</th>
              <th>Squad</th>
              <th style={{ textAlign: "right" }} onClick={() => sortBy("fee")} role="button">Fee</th>
              <th style={{ textAlign: "right" }} onClick={() => sortBy("invest")} role="button">Invest.</th>
              <th style={{ textAlign: "right" }} onClick={() => sortBy("roas")} role="button">ROAS</th>
              <th style={{ textAlign: "right" }} onClick={() => sortBy("ltv")} role="button">LTV</th>
              <th style={{ textAlign: "right" }} onClick={() => sortBy("health")} role="button">Health ↑</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} className={c.status === "critical" ? "alert" : ""}
                  onClick={() => onOpen?.(c)}>
                <td>
                  <div className="name">
                    <Avatar name={c.name} size={32}/>
                    <div className="name-text">
                      <div className="n">{c.name}</div>
                      <div className="s">{c.segment} · {c.months} meses</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className="squad-tag">
                    <i style={{ background: squadColor(c.squad) }}></i>
                    {c.squad}
                  </span>
                </td>
                <td style={{ textAlign: "right" }} className="num">{V4Data.fmtBRL(c.fee)}</td>
                <td style={{ textAlign: "right" }} className="num">{V4Data.fmtBRL(c.invest)}</td>
                <td style={{ textAlign: "right" }} className={"num " + (c.roas < 2 ? "bad" : "")}>
                  {c.roas.toFixed(1).replace(".", ",")}×
                </td>
                <td style={{ textAlign: "right" }} className="num">{V4Data.fmtBRLk(c.ltv)}</td>
                <td style={{ textAlign: "right" }}>
                  <StatusBadge status={c.status} score={c.health}/>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};

window.ClientTable = ClientTable;
