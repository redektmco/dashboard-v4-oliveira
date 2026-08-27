// =========================================================
// V4 BI — Layout: Sidebar
// =========================================================
export const Sidebar = ({ current, onNavigate, counts = {} }) => {
  const items = [
    { id: "overview",   label: "Visão geral",  icon: "grid" },
    { id: "clients",    label: "Clientes",     icon: "briefcase", count: counts.clients ?? 42 },
    { id: "squads",     label: "Squads",       icon: "users",     count: counts.squads ?? 5 },
    { id: "campaigns",  label: "Campanhas",    icon: "chart" },
    { id: "pipeline",   label: "Pipeline",     icon: "funnel" },
    { id: "financeiro", label: "Financeiro",   icon: "money" },
    { id: "agenda",     label: "Agenda",       icon: "calendar", count: counts.agenda ?? 7 },
  ];
  const secondary = [
    { id: "settings",   label: "Configurações", icon: "settings" },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="../../assets/v4-simbolo.webp" alt="V4"/>
        <div className="brand-text">
          <div className="name">Oliveira &amp; Co</div>
          <div className="unit">Unidade · V4</div>
        </div>
      </div>

      <div className="nav-group">
        <div className="nav-label">Operação</div>
        {items.map(it => (
          <button key={it.id}
            className={"nav-item" + (current === it.id ? " active" : "")}
            onClick={() => onNavigate?.(it.id)}>
            <Icon name={it.icon} size={16}/>
            {it.label}
            {it.count != null && <span className="count">{it.count}</span>}
          </button>
        ))}
      </div>

      <div className="nav-group">
        <div className="nav-label">Conta</div>
        {secondary.map(it => (
          <button key={it.id} className="nav-item" onClick={() => onNavigate?.(it.id)}>
            <Icon name={it.icon} size={16}/>{it.label}
          </button>
        ))}
      </div>

      <div className="sidebar-foot">
        <Avatar name="Renato Oliveira" size={32}/>
        <div className="who">
          <div className="n">Renato O.</div>
          <div className="r">Head da unidade</div>
        </div>
      </div>
    </aside>
  );
};

window.Sidebar = Sidebar;
