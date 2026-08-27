// =========================================================
// V4 BI — Layout: Topbar
// =========================================================
export const Topbar = ({ crumbs = [], period = "Maio · 2026", onSearch, query = "" }) => (
  <header className="topbar">
    <nav className="crumb">
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Icon name="chevron" size={12}/>}
          <span className={i === crumbs.length - 1 ? "here" : ""}>{c}</span>
        </React.Fragment>
      ))}
    </nav>

    <div className="search">
      <Icon name="search" size={16}/>
      <input
        placeholder="Buscar cliente, squad ou campanha…"
        value={query}
        onChange={e => onSearch?.(e.target.value)}/>
      <span className="kbd">⌘ K</span>
    </div>

    <button className="period-picker">
      <Icon name="calendar" size={14}/>
      {period}
      <Icon name="chevronDown" size={14}/>
    </button>

    <PresenceStrip/>

    <button className="icon-btn" aria-label="Notificações">
      <Icon name="bell" size={16}/>
      <span className="dot"></span>
    </button>

    <button className="btn primary">
      <Icon name="plus" size={14} stroke={2.5}/>
      Novo cliente
    </button>
  </header>
);

window.Topbar = Topbar;
