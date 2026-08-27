// =========================================================
// V4 BI Mobile · App
// 4 screens + bottom tab nav, all inside iOS frame.
// Data is loaded from /data/* via window.V4Data (shared
// loader with bi-desktop). Falls back to inline data if
// fetch fails (offline / file://).
// =========================================================
const { useState, useEffect, useMemo } = React;

// ---- Shared mock data (light copy of bi-desktop) -----------
const fmtBRLk = (n) => {
  if (n == null) return "—";
  if (n >= 1_000_000) return "R$ " + (n / 1_000_000).toFixed(1).replace(".", ",") + "M";
  if (n >= 1_000)     return "R$ " + Math.round(n / 1_000) + "k";
  return "R$ " + n;
};
// Notifications are runtime data — not in /data/. They simulate the
// in-product alert feed; replace with your own source when ready.
const NOTIFS_FALLBACK = [
  { kind: "r", urgent: true,  title: "Fazenda Zumbi entrou em crise", det: "Health caiu 18 pts em 7 dias. Reunião marcada hoje 14:30.", ago: "12 min" },
  { kind: "r", urgent: true,  title: "Doce Atelier · ROAS 1,4×",      det: "Abaixo da meta há 14 dias. Diego pediu revisão de criativos.", ago: "1 h" },
  { kind: "y",                title: "RedFit · novo orçamento",       det: "Cliente solicitou aumentar investimento em +30% para Black Friday.", ago: "2 h" },
  { kind: "g",                title: "Solar Bras · meta atingida",    det: "ROAS 5,2× em maio. Squad Aurora ✔", ago: "3 h" },
  { kind: "g",                title: "Petshop Companhia renovou",     det: "Contrato +12 meses. LTV projetado R$ 198k.", ago: "ontem" },
  { kind: "y",                title: "Constru Bem · sem reunião há 9 dias", det: "Última weekly: 18/mai. Cadência abaixo do SLA.", ago: "ontem" },
];

// Build the mobile-shape client list from /data/clients.json + /data/meetings.json.
// `next` is "Hoje · 14:30 · Crise" — combined day/time/type for the mobile screens.
function buildClients() {
  const data = window.V4Data;
  if (!data) return [];
  const squadName = (id) => (data.squadsById?.[id]?.name) || id;
  const dayLabel = (d) => ({ seg: "HOJE", ter: "Ter", qua: "Qua", qui: "Qui", sex: "Sex" }[d] || d);
  // Build next-meeting index keyed by client name
  const nextByName = {};
  for (const m of data.meetings || []) {
    if (!nextByName[m.client]) {
      nextByName[m.client] = `${dayLabel(m.day)} · ${m.time}${m.type ? " · " + m.type : ""}`;
    }
  }
  return (data.clients || []).map(c => ({
    id: c.id,
    name: c.name,
    seg: c.segment,
    squad: squadName(c.squad),
    fee: c.fee, invest: c.invest, roas: c.roas, health: c.health,
    status: c.status, months: c.months,
    next: nextByName[c.name] || "Sem reunião agendada",
  }));
}
const CLIENTS_FALLBACK = [
  { id: "fazenda",   name: "Fazenda Zumbi",     seg: "Agro",          squad: "Volta",   fee:  9800, invest: 12500, roas: 1.8, health: 34, status: "critical", months: 11, next: "Hoje · 14:30 · Crise" },
  { id: "ecomm",     name: "Doce Atelier",      seg: "E-commerce",    squad: "Norte",   fee:  6500, invest:  9800, roas: 1.4, health: 28, status: "critical", months:  9, next: "Qui · 09:30 · Crise" },
  { id: "fitness",   name: "RedFit Academias",  seg: "Fitness",       squad: "Norte",   fee:  8800, invest: 19500, roas: 2.6, health: 52, status: "warning",  months:  5, next: "Sex · 11:00" },
  { id: "moveis",    name: "Móveis Vargas",     seg: "Varejo",        squad: "Norte",   fee:  7200, invest: 18000, roas: 3.4, health: 61, status: "warning",  months:  3, next: "Ter · 10:00" },
  { id: "constru",   name: "Constru Bem",       seg: "Construção",    squad: "Delta",   fee:  6200, invest: 14000, roas: 3.0, health: 58, status: "warning",  months:  2, next: "Qua · 16:00" },
  { id: "spa",       name: "Caravelas Spa",     seg: "Hospitalidade", squad: "Aurora",  fee: 10500, invest: 17000, roas: 4.0, health: 69, status: "warning",  months: 12, next: "Qua · 14:00" },
  { id: "edu",       name: "EduPlus",           seg: "Educação",      squad: "Aurora",  fee:  9500, invest: 22000, roas: 4.2, health: 74, status: "healthy",  months:  8, next: "Ter · 16:00" },
  { id: "imob",      name: "Imobiliária Rocha", seg: "Imobiliário",   squad: "Volta",   fee: 14000, invest: 32000, roas: 4.6, health: 76, status: "healthy",  months:  4, next: "Sex · 15:00" },
  { id: "solar",     name: "Solar Bras",        seg: "Energia solar", squad: "Aurora",  fee: 18500, invest: 42000, roas: 5.2, health: 82, status: "healthy",  months:  6, next: "Seg · 09:00" },
  { id: "advogados", name: "Marques Advocacia", seg: "Serviços",      squad: "Matriz",  fee:  8200, invest: 11000, roas: 5.0, health: 81, status: "healthy",  months:  7, next: "Qui · 16:00" },
  { id: "estetica",  name: "Clínica Estética",  seg: "Saúde",         squad: "Delta",   fee: 12500, invest: 28000, roas: 6.1, health: 89, status: "healthy",  months: 14, next: "Seg · 11:30" },
  { id: "petshop",   name: "Petshop Companhia", seg: "Pet",           squad: "Matriz",  fee: 11000, invest: 24000, roas: 5.8, health: 91, status: "healthy",  months: 18, next: "Sex · 10:00" },
];

// Hook: returns the live client list. Re-renders the calling component
// when V4Data finishes loading. Falls back to the inline array above
// when loading from /data/* fails or hasn't completed yet.
function useClients() {
  const [_, force] = useState(0);
  useEffect(() => {
    if (window.V4Data) return;
    const on = () => force(x => x + 1);
    window.addEventListener("v4-data-ready", on, { once: true });
    return () => window.removeEventListener("v4-data-ready", on);
  }, []);
  return window.V4Data ? buildClients() : CLIENTS_FALLBACK;
}
const NOTIFS = NOTIFS_FALLBACK;

const avatarColors = ["#e50914", "#1f6f4a", "#2b3450", "#7a4a1f", "#5a3066", "#1a4060"];
const colorFor = (s) => avatarColors[(s.charCodeAt(0) + s.length) % avatarColors.length];
const initials = (s) => s.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

// ---- ICONS ------------------------------------------------
const I = ({ n, s = 18 }) => {
  const paths = {
    home:    <path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>,
    users:   <><path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/><path d="M3 21a6 6 0 0 1 12 0"/><path d="M17 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M14 21a4 4 0 0 1 8 0"/></>,
    bell:    <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z"/><path d="M10 21a2 2 0 0 0 4 0"/></>,
    user:    <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    search:  <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    settings:<><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.4l2.1-1.6-2-3.5-2.5 1a7 7 0 0 0-2.4-1.4L13.5 2h-3l-.6 3.1A7 7 0 0 0 7.5 6.5l-2.5-1-2 3.5L5.1 10.6A7 7 0 0 0 5 12c0 .5 0 .9.1 1.4L3 15l2 3.5 2.5-1c.7.6 1.5 1.1 2.4 1.4L10.5 22h3l.6-3.1c.9-.3 1.7-.8 2.4-1.4l2.5 1 2-3.5-2.1-1.6c.1-.5.1-.9.1-1.4z"/></>,
    chev:    <path d="M9 6l6 6-6 6"/>,
    chevL:   <path d="M15 6l-6 6 6 6"/>,
    alert:   <><path d="M12 2 2 21h20L12 2zM12 9v5M12 18h.01"/></>,
    money:   <><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></>,
    target:  <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
    spark:   <><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></>,
    cal:     <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
    filter:  <><path d="M3 6h18M6 12h12M10 18h4"/></>,
  };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[n]}
    </svg>
  );
};

// ---- Sparkline ----
const Spark = ({ data, w = 80, h = 26, color = "#e50914" }) => {
  const max = Math.max(...data), min = Math.min(...data), r = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / r) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <polyline points={pts} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
};

// ---- Health ring ----
const HealthRing = ({ score, size = 76, stroke = 7 }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const off = c * (1 - pct);
  const color = score >= 70 ? "#52cc5a" : score >= 50 ? "#ffc02a" : "#e50914";
  return (
    <div style={{ width: size, height: size, position: "relative" }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none"/>
        <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          transform={`rotate(-90 ${size/2} ${size/2})`}/>
      </svg>
      <div style={{
        position:"absolute", inset:0, display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center", lineHeight:1,
      }}>
        <div style={{ font: "700 22px/1 var(--font-display)", letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{score}</div>
        <div style={{ font: "var(--t-caption)", color: "var(--fg-3)", marginTop: 2 }}>/ 100</div>
      </div>
    </div>
  );
};

// =========================================================
// SCREEN: Overview
// =========================================================
const OverviewScreen = ({ onOpenClient, onTab }) => {
  const CLIENTS = useClients();
  return (
  <div className="m-screen" data-screen-label="01 Mobile · Overview">
    <header className="m-header">
      <div>
        <div className="m-brand">
          <img src="../../assets/v4-simbolo.webp" alt=""/>
          <span className="lbl">Oliveira & Co</span>
        </div>
        <div className="ttl" style={{ marginTop: 4 }}>Visão geral</div>
      </div>
      <div className="right">
        <button className="m-icon-btn" onClick={() => onTab("notifs")}>
          <I n="bell" s={16}/><span className="dot"></span>
        </button>
        <button className="m-icon-btn"><I n="user" s={16}/></button>
      </div>
    </header>

    <div className="m-body">
      <div className="m-hero-kpi">
        <div className="ey">Faturamento · mai 2026</div>
        <div className="v">R$ 482<span className="u">k</span></div>
        <div className="m">
          <span style={{ font: "700 12px/1 var(--font-mono)", color: "#52cc5a", background: "rgba(82,204,90,0.14)", padding: "3px 7px", borderRadius: 999 }}>↑ 12,4%</span>
          <span>vs. abril · 95% da meta</span>
        </div>
        <div className="spark">
          <Spark data={[308,322,341,358,372,401,388,396,412,438,429,482]} w={108} h={36}/>
        </div>
      </div>

      <div className="m-grid-2">
        <div className="m-kpi"><div className="ey">Health médio</div><div className="v">78<span style={{font:"700 14px/1 var(--font-display)", color:"var(--fg-3)"}}>/100</span></div><div className="d good">↑ +4 pts</div></div>
        <div className="m-kpi"><div className="ey">Clientes ativos</div><div className="v">42</div><div className="d good">↑ +3</div></div>
        <div className="m-kpi"><div className="ey">Fee recorrente</div><div className="v">R$ 482k</div><div className="d good">↑ 12,4%</div></div>
        <div className="m-kpi"><div className="ey">Churn 90d</div><div className="v">2,1%</div><div className="d good">↓ 1,3pp</div></div>
      </div>

      <div className="m-section">
        <h2>Atenção agora</h2>
        <span className="more">3 crises →</span>
      </div>
      <div className="m-list">
        {CLIENTS.filter(c => c.status === "critical").slice(0, 2).concat(CLIENTS.filter(c => c.status === "warning").slice(0,1)).map(c => (
          <button key={c.id} className={"m-list-item " + (c.status === "critical" ? "alert" : "")} onClick={() => onOpenClient(c)}>
            <div className="av" style={{ background: colorFor(c.name) }}>{initials(c.name)}</div>
            <div>
              <div className="n">{c.name}</div>
              <div className="s">{c.squad} · {c.seg}</div>
            </div>
            <div className="meta">
              <span className={"m-badge " + (c.status === "critical" ? "c" : c.status === "warning" ? "r" : "h")}>
                <i></i>{c.health}
              </span>
            </div>
          </button>
        ))}
      </div>

      <div className="m-section">
        <h2>Próximas reuniões</h2>
        <span className="more">Ver agenda →</span>
      </div>
      <div className="m-list">
        {[
          { day: "HOJE", time: "14:30", c: "Fazenda Zumbi", t: "Reunião de crise", alert: true },
          { day: "TER",  time: "10:00", c: "Móveis Vargas", t: "Onboarding · D+7", alert: false },
          { day: "QUA",  time: "11:00", c: "Petshop Companhia", t: "Weekly", alert: false },
        ].map((r, i) => (
          <div key={i} className={"m-list-item " + (r.alert ? "alert" : "")}>
            <div className="av" style={{ background: r.alert ? "var(--accent)" : "var(--bg-elev-3)", color: r.alert ? "#fff" : "var(--fg-2)", flexDirection: "column" }}>
              <div style={{ font: "700 10px/1 var(--font-mono)", letterSpacing: "0.04em" }}>{r.day}</div>
              <div style={{ font: "700 10px/1 var(--font-mono)", marginTop: 2 }}>{r.time}</div>
            </div>
            <div>
              <div className="n">{r.c}</div>
              <div className="s" style={r.alert ? { color: "var(--v4-red-500)" } : undefined}>{r.t}</div>
            </div>
            <I n="chev" s={14}/>
          </div>
        ))}
      </div>
    </div>
  </div>
  );
};

// =========================================================
// SCREEN: Clients list
// =========================================================
const ClientsScreen = ({ onOpenClient }) => {
  const CLIENTS = useClients();
  const [filter, setFilter] = useState("todos");
  const [q, setQ] = useState("");
  const filtered = CLIENTS
    .filter(c => filter === "todos" || c.status === filter)
    .filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.health - b.health);
  return (
    <div className="m-screen" data-screen-label="02 Mobile · Clientes">
      <header className="m-header">
        <div>
          <div className="sub">Oliveira & Co</div>
          <div className="ttl">Clientes</div>
        </div>
        <div className="right">
          <button className="m-icon-btn"><I n="filter" s={16}/></button>
        </div>
      </header>
      <div className="m-body">
        <div className="m-search">
          <I n="search" s={16}/>
          <input placeholder="Buscar cliente, squad…" value={q} onChange={(e) => setQ(e.target.value)}/>
        </div>
        <div className="m-chips">
          {[
            ["todos", "Todos", CLIENTS.length],
            ["critical", "Crise", CLIENTS.filter(c=>c.status==="critical").length],
            ["warning", "Em risco", CLIENTS.filter(c=>c.status==="warning").length],
            ["healthy", "Saudável", CLIENTS.filter(c=>c.status==="healthy").length],
          ].map(([k, l, n]) => (
            <button key={k} className={"m-chip " + (filter === k ? "active" : "")} onClick={() => setFilter(k)}>
              {l} <span style={{ opacity: 0.7 }}>{n}</span>
            </button>
          ))}
        </div>
        <div className="m-list">
          {filtered.map(c => (
            <button key={c.id} className={"m-list-item " + (c.status === "critical" ? "alert" : "")} onClick={() => onOpenClient(c)}>
              <div className="av" style={{ background: colorFor(c.name) }}>{initials(c.name)}</div>
              <div>
                <div className="n">{c.name}</div>
                <div className="s">{c.squad} · {fmtBRLk(c.fee)}/mês · ROAS {c.roas.toString().replace(".",",")}×</div>
              </div>
              <div className="meta">
                <span className={"m-badge " + (c.status === "critical" ? "c" : c.status === "warning" ? "r" : "h")}>
                  <i></i>{c.health}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// =========================================================
// SCREEN: Client detail
// =========================================================
const ClientScreen = ({ client, onBack }) => {
  if (!client) return null;
  return (
    <div className="m-screen" data-screen-label="03 Mobile · Cliente">
      <header className="m-header" style={{ paddingTop: 4 }}>
        <button className="m-back" onClick={onBack}><I n="chevL" s={18}/>Clientes</button>
        <div className="right"><button className="m-icon-btn"><I n="cal" s={16}/></button></div>
      </header>

      <div className="m-detail-hero">
        <div className="av" style={{ background: colorFor(client.name) }}>{initials(client.name)}</div>
        <div>
          <div className="name">{client.name}</div>
          <div className="seg">{client.seg} · Squad <b>{client.squad}</b> · {client.months} meses</div>
        </div>
      </div>

      <div className="m-body">
        <div className="m-health-block">
          <HealthRing score={client.health}/>
          <div className="copy">
            <div className="lbl">Health score</div>
            <div style={{ font: "var(--t-body-strong)", color: client.status === "critical" ? "var(--v4-red-500)" : client.status === "warning" ? "var(--v4-yellow)" : "var(--v4-green)" }}>
              {client.status === "critical" ? "Em crise" : client.status === "warning" ? "Em risco" : "Saudável"}
            </div>
            <div className="det">
              {client.status === "critical"
                ? "ROAS abaixo da meta há 14d. Squad notificado."
                : client.status === "warning"
                ? "Cadência de reunião abaixo do esperado."
                : "Performance dentro da meta. Renovação prevista."}
            </div>
          </div>
        </div>

        <div className="m-stat-row">
          <div className="m-stat"><div className="ey">Fee · mês</div><div className="v">{fmtBRLk(client.fee)}</div></div>
          <div className="m-stat"><div className="ey">Investimento</div><div className="v">{fmtBRLk(client.invest)}</div></div>
          <div className="m-stat"><div className="ey">ROAS</div><div className="v" style={{ color: client.roas < 2.5 ? "var(--v4-red-500)" : undefined }}>{client.roas.toString().replace(".",",")}×</div></div>
          <div className="m-stat"><div className="ey">LTV proj.</div><div className="v">{fmtBRLk(client.fee * client.months * 1.4)}</div></div>
        </div>

        <div className="m-section">
          <h2>Próxima reunião</h2>
        </div>
        <div className="m-list">
          <div className="m-list-item" style={{ cursor: "default" }}>
            <div className="av" style={{ background: "var(--accent)", color: "#fff", flexDirection: "column" }}>
              <div style={{ font: "700 10px/1 var(--font-mono)" }}>{client.next.split(" · ")[0].toUpperCase().slice(0,3)}</div>
            </div>
            <div>
              <div className="n">{client.next.split(" · ")[2] || "Weekly"}</div>
              <div className="s">{client.next}</div>
            </div>
            <I n="chev" s={14}/>
          </div>
        </div>

        <div className="m-section">
          <h2>Método V4</h2>
        </div>
        <div className="m-list" style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            ["Aquisição",   "var(--viz-1)", 42],
            ["Engajamento", "var(--viz-2)", 28],
            ["Monetização", "var(--viz-3)", 78],
            ["Retenção",    "var(--viz-4)", 60],
          ].map(([n, c, p]) => (
            <div key={n}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ font: "var(--t-body-strong)", display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <i style={{ width: 8, height: 8, borderRadius: 2, background: c, display: "inline-block" }}></i>{n}
                </span>
                <span style={{ font: "var(--t-mono-sm)", color: "var(--fg-2)" }}>{p}%</span>
              </div>
              <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: p + "%", height: "100%", background: c, borderRadius: 999 }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// =========================================================
// SCREEN: Notifications
// =========================================================
const NotifsScreen = () => (
  <div className="m-screen" data-screen-label="04 Mobile · Notificações">
    <header className="m-header">
      <div>
        <div className="sub">Oliveira & Co</div>
        <div className="ttl">Notificações</div>
      </div>
      <div className="right">
        <button className="m-icon-btn"><I n="settings" s={16}/></button>
      </div>
    </header>
    <div className="m-body">
      <div className="m-chips">
        <button className="m-chip active">Todas <span style={{ opacity: 0.7 }}>{NOTIFS.length}</span></button>
        <button className="m-chip">Crises <span style={{ opacity: 0.7 }}>2</span></button>
        <button className="m-chip">Reuniões</button>
        <button className="m-chip">Oportunidades</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {NOTIFS.map((n, i) => (
          <div key={i} className={"m-notif" + (n.urgent ? " urgent" : "")}>
            <div className={"m-notif-icon " + n.kind}>
              <I n={n.kind === "g" ? "spark" : n.kind === "y" ? "target" : "alert"} s={16}/>
            </div>
            <div>
              <div className="ttl">{n.title}</div>
              <div className="det">{n.det}</div>
            </div>
            <div className="ago">{n.ago}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// =========================================================
// TAB BAR
// =========================================================
const TabBar = ({ tab, onTab }) => (
  <nav className="m-tabbar">
    {[
      ["home", "home", "Geral"],
      ["clients", "users", "Clientes"],
      ["notifs", "bell", "Avisos"],
      ["me", "user", "Eu"],
    ].map(([id, ic, lb]) => (
      <button key={id} className={"m-tab " + (tab === id ? "active" : "")} onClick={() => onTab(id)}>
        <I n={ic} s={20}/>{lb}
      </button>
    ))}
  </nav>
);

// =========================================================
// APP
// =========================================================
const MobileApp = () => {
  const [tab, setTab] = useState("home");
  const [client, setClient] = useState(null);

  const showClient = (c) => setClient(c);
  const goTab = (t) => { setClient(null); setTab(t); };

  return (
    <>
      {client ? <ClientScreen client={client} onBack={() => setClient(null)}/>
        : tab === "home"    ? <OverviewScreen onOpenClient={showClient} onTab={setTab}/>
        : tab === "clients" ? <ClientsScreen onOpenClient={showClient}/>
        : tab === "notifs"  ? <NotifsScreen/>
        : <div className="m-screen" data-screen-label="05 Mobile · Eu"><header className="m-header"><div><div className="sub">Oliveira & Co</div><div className="ttl">Eu</div></div></header><div className="m-body"><div style={{ color: "var(--fg-3)", textAlign: "center", padding: 40 }}>Perfil — placeholder</div></div></div>}
      <TabBar tab={tab} onTab={goTab}/>
    </>
  );
};

Object.assign(window, {
  MobileApp, OverviewScreen, ClientsScreen, ClientScreen, NotifsScreen, TabBar,
});

export function App(props) { return React.createElement(MobileApp, props); }
