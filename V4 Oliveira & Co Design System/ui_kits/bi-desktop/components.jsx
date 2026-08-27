// =========================================================
// V4 BI — Shared components (icons, cards, charts, badges)
// =========================================================
const { useState, useMemo, useEffect } = React;

// ---- ICONS (inline SVG, currentColor, Lucide-style) ----
const Icon = ({ name, size = 16, stroke = 2, ...rest }) => {
  const paths = {
    grid:      <><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></>,
    users:     <><circle cx="9" cy="7" r="4"/><path d="M3 21a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="3"/><path d="M14 21a4 4 0 0 1 8 0"/></>,
    user:      <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    briefcase: <><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/></>,
    chart:     <><path d="M3 21h18"/><rect x="5" y="10" width="3" height="9"/><rect x="11" y="6" width="3" height="13"/><rect x="17" y="13" width="3" height="6"/></>,
    funnel:    <><path d="M3 4h18l-7 9v6l-4 2v-8z"/></>,
    money:     <><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/></>,
    calendar:  <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
    bell:      <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z"/><path d="M10 21a2 2 0 0 0 4 0"/></>,
    search:    <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    settings:  <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8h0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
    chevron:   <><path d="M9 6l6 6-6 6"/></>,
    chevronDown:<><path d="M6 9l6 6 6-6"/></>,
    arrowUp:   <><path d="M12 19V5M5 12l7-7 7 7"/></>,
    arrowDown: <><path d="M12 5v14M19 12l-7 7-7-7"/></>,
    plus:      <><path d="M5 12h14M12 5v14"/></>,
    alert:     <><path d="M12 2 2 21h20L12 2zM12 9v5M12 18h.01"/></>,
    check:     <><path d="M5 12l5 5L20 7"/></>,
    x:         <><path d="M6 6l12 12M18 6l-12 12"/></>,
    sparkles:  <><path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></>,
    filter:    <><path d="M3 6h18M6 12h12M10 18h4"/></>,
    download:  <><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></>,
    target:    <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
    flag:      <><path d="M5 21V4h13l-2 5 2 5H5"/></>,
    moreH:     <><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></>,
    home:      <><path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {paths[name]}
    </svg>
  );
};

// ---- BADGE / STATUS PILL ----
const statusMap = {
  healthy:  { cls: "h", label: "Saudável" },
  warning:  { cls: "r", label: "Em risco" },
  critical: { cls: "c", label: "Crítico"  },
  neutral:  { cls: "n", label: "—" },
};
const StatusBadge = ({ status, score }) => {
  const m = statusMap[status] || statusMap.neutral;
  return (
    <span className={`badge ${m.cls}`}>
      <i></i>
      {score != null ? score : m.label}
    </span>
  );
};

// ---- AVATAR ----
const avatarColors = ["#e50914", "#1f6f4a", "#2b3450", "#7a4a1f", "#5a3066", "#1a4060"];
const Avatar = ({ name, size = 28, square = true }) => {
  const initials = name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const idx = name.charCodeAt(0) % avatarColors.length;
  return (
    <div className="avatar" style={{
      width: size, height: size,
      background: avatarColors[idx],
      borderRadius: square ? 6 : "50%",
      fontSize: Math.max(10, size * 0.4),
    }}>{initials}</div>
  );
};

// ---- DELTA INDICATOR (▲ / ▼ pct) ----
const Delta = ({ value, prev, invert = false, format = "pct" }) => {
  if (prev == null) return null;
  const diff = value - prev;
  const pct = prev === 0 ? 0 : (diff / prev) * 100;
  const up = diff > 0;
  const good = invert ? !up : up;
  const label = format === "abs"
    ? (up ? "+" : "") + diff.toFixed(0)
    : (up ? "+" : "") + pct.toFixed(1).replace(".", ",") + "%";
  return (
    <span className={"delta " + (good ? "good" : "bad")}>
      <Icon name={up ? "arrowUp" : "arrowDown"} size={11} stroke={3}/>
      {label}
    </span>
  );
};

// ---- KPI TILE ----
const formatValue = (v, fmt) => {
  if (fmt === "BRLk") return V4Data.fmtBRLk(v);
  if (fmt === "BRL")  return V4Data.fmtBRL(v);
  if (fmt === "x")    return v.toFixed(1).replace(".", ",") + "×";
  if (fmt === "pct")  return v.toFixed(1).replace(".", ",") + "%";
  if (fmt === "score")return v + "/100";
  if (fmt === "int")  return V4Data.fmtNum(v);
  return v;
};
const KPITile = ({ kpi, accent = false, sparkData, big = false }) => (
  <div className={"kpi-tile" + (accent ? " accent" : "")}>
    <div className="eyebrow">{kpi.label}</div>
    <div className={"kpi-value " + (big ? "xl" : "lg")}>
      {formatValue(kpi.v, kpi.fmt)}
    </div>
    <div className="kpi-meta">
      <Delta value={kpi.v} prev={kpi.prev} invert={kpi.invert}/>
      <span className="kpi-prev">vs. mês ant.</span>
    </div>
    {sparkData && <Sparkline data={sparkData} className="kpi-spark"/>}
  </div>
);

// ---- SPARKLINE ----
const Sparkline = ({ data, width = 80, height = 28, color = "var(--accent)", className = "" }) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg className={className} width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      <polyline points={pts} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
};

// ---- HEALTH RING (radial gauge) ----
const HealthRing = ({ score, size = 96, stroke = 8 }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const off = c * (1 - pct);
  const color = score >= 70 ? "var(--v4-green)"
              : score >= 50 ? "var(--v4-yellow)"
              : "var(--v4-red-500)";
  return (
    <div className="health-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r}
          stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} fill="none"/>
        <circle cx={size/2} cy={size/2} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off}
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: "stroke-dashoffset 600ms var(--ease-out)" }}/>
      </svg>
      <div className="health-ring-label">
        <div className="health-ring-score">{score}</div>
        <div className="health-ring-max">/ 100</div>
      </div>
    </div>
  );
};

// ---- BAR CHART (categorical, 12 mo trend) ----
const BarChart = ({ data, height = 180, accentLast = true }) => {
  const max = Math.max(...data.map(d => d.v));
  return (
    <div className="bar-chart" style={{ height }}>
      {data.map((d, i) => {
        const h = (d.v / max) * (height - 32);
        const isLast = i === data.length - 1;
        return (
          <div key={i} className="bar-col" title={`${d.m}: ${V4Data.fmtBRLk(d.v)}`}>
            <div className="bar-val">{isLast ? V4Data.fmtBRLk(d.v) : ""}</div>
            <div className="bar"
              style={{
                height: h,
                background: (accentLast && isLast) ? "var(--accent)" : "var(--v4-gray-600)"
              }}/>
            <div className="bar-lbl">{d.m}</div>
          </div>
        );
      })}
    </div>
  );
};

// ---- DONUT (Método V4 pillars) ----
const Donut = ({ data, size = 160, stroke = 22 }) => {
  const total = data.reduce((s, d) => s + d.share, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r}
          stroke="rgba(255,255,255,0.04)" strokeWidth={stroke} fill="none"/>
        {data.map((d, i) => {
          const len = (d.share / total) * c;
          const dash = `${len} ${c}`;
          const dashOff = -off;
          off += len;
          return (
            <circle key={i} cx={size/2} cy={size/2} r={r}
              stroke={d.color} strokeWidth={stroke} fill="none"
              strokeDasharray={dash} strokeDashoffset={dashOff}
              transform={`rotate(-90 ${size/2} ${size/2})`}/>
          );
        })}
      </svg>
      <div className="donut-center">
        <div className="eyebrow">Método</div>
        <div style={{ font: "var(--t-h2)" }}>V4</div>
      </div>
    </div>
  );
};

// ---- CARD WRAPPER ----
const Card = ({ title, subtitle, action, children, padded = true, className = "" }) => (
  <section className={"v4-card " + className}>
    {(title || action) && (
      <header className="v4-card-head">
        <div>
          {title && <h3 className="v4-card-title">{title}</h3>}
          {subtitle && <div className="v4-card-sub">{subtitle}</div>}
        </div>
        {action}
      </header>
    )}
    <div className={padded ? "v4-card-body" : ""}>{children}</div>
  </section>
);

// ---- Method V4 pillar tag ----
const PillarTag = ({ pillar }) => {
  const map = {
    "Aquisição":   { c: "var(--viz-1)", short: "A" },
    "Engajamento": { c: "var(--viz-2)", short: "E" },
    "Monetização": { c: "var(--viz-3)", short: "M" },
    "Retenção":    { c: "var(--viz-4)", short: "R" },
  };
  const m = map[pillar] || { c: "var(--fg-3)", short: "·" };
  return (
    <span className="pillar-tag">
      <i style={{ background: m.c }}></i>{pillar}
    </span>
  );
};

Object.assign(window, {
  Icon, StatusBadge, Avatar, Delta, KPITile, Sparkline,
  HealthRing, BarChart, Donut, Card, PillarTag, formatValue, statusMap,
});
