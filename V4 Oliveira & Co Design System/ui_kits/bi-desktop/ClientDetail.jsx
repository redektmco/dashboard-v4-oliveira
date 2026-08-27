// =========================================================
// V4 BI — Client detail (drill-in view per cliente)
// Tabs: Resumo · Dossiê · Reuniões · Pesquisa
// =========================================================
export const ClientDetail = ({ client, onBack }) => {
  const c = client;
  const squad = V4Data.squads.find(s => s.id === c.squad);
  const [tab, setTab] = React.useState("resumo");

  // Re-render on store changes so the tab counts stay live
  const [_, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => V4Store.subscribe(() => force()), []);
  const meetingsCount = V4Store.getMeetings(c.id).length;
  const dossieCount = V4Store.getDossie(c.id).improvementsUs.length + V4Store.getDossie(c.id).improvementsProject.length;

  const tabs = [
    { id: "resumo",   label: "Resumo",   icon: "grid" },
    { id: "dossie",   label: "Dossiê",   icon: "flag",    badge: dossieCount },
    { id: "reunioes", label: "Reuniões", icon: "calendar", badge: meetingsCount },
    { id: "pesquisa", label: "Pesquisa mensal", icon: "target" },
  ];

  return (
    <div className="page" data-screen-label={"Cliente " + c.name}>

      <div className="page-head" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div className="crumb" style={{ marginBottom: 8 }}>
            <button className="btn ghost sm" onClick={onBack}>
              <Icon name="chevron" size={14} style={{ transform: "rotate(180deg)" }}/>
              Carteira
            </button>
            <Icon name="chevron" size={12}/>
            <span className="here">{c.name}</span>
          </div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar name={c.name} size={40}/>
            {c.name}
            <StatusBadge status={c.status} score={c.health}/>
          </h1>
          <div className="sub">
            {c.segment} · {c.months} meses · squad {squad?.name} · lead {squad?.lead}
          </div>
        </div>
        <div className="page-actions">
          <button className="btn secondary"><Icon name="calendar" size={14}/>Agendar reunião</button>
          <button className="btn secondary"><Icon name="flag" size={14}/>Marcar prioridade</button>
          <button className="btn primary"><Icon name="sparkles" size={14}/>Plano de ação</button>
        </div>
      </div>

      {/* TAB STRIP */}
      <div className="tab-strip">
        {tabs.map(t => (
          <button key={t.id}
            className={"tab" + (tab === t.id ? " active" : "")}
            onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={14}/>
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="tab-badge">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "resumo"   && <ClientResumo client={c} squad={squad}/>}
      {tab === "dossie"   && <ClientDossie client={c}/>}
      {tab === "reunioes" && <ClientMeetings client={c}/>}
      {tab === "pesquisa" && <ClientPesquisa client={c}/>}
    </div>
  );
};

// ---- RESUMO TAB ----
const ClientResumo = ({ client, squad }) => {
  const c = client;
  const trend = [
    { m: "jan", v: c.fee * 0.9, i: c.invest * 0.7, r: c.roas - 1.2 },
    { m: "fev", v: c.fee * 0.92, i: c.invest * 0.75, r: c.roas - 0.9 },
    { m: "mar", v: c.fee * 0.95, i: c.invest * 0.82, r: c.roas - 0.5 },
    { m: "abr", v: c.fee * 0.98, i: c.invest * 0.9,  r: c.roas - 0.2 },
    { m: "mai", v: c.fee,        i: c.invest,        r: c.roas },
  ];

  return (
    <>
      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <KPITile kpi={{ label: "Fee mensal",   v: c.fee,    prev: c.fee*0.95, fmt: "BRL" }}/>
        <KPITile kpi={{ label: "Investimento", v: c.invest, prev: c.invest*0.9, fmt: "BRL" }}/>
        <KPITile kpi={{ label: "ROAS",         v: c.roas,   prev: c.roas-0.3, fmt: "x" }}/>
        <KPITile kpi={{ label: "LTV acumulado",v: c.ltv,    prev: c.ltv*0.92, fmt: "BRLk" }}/>
      </div>

      <div className="grid-2-1">
        <Card title="Performance · últimos 5 meses">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 12 }}>Fee · evolução</div>
              <Sparkline data={trend.map(t => t.v)} width={280} height={56} color="var(--v4-green)"/>
              <div style={{ font: "var(--t-mono-sm)", color: "var(--fg-3)", marginTop: 4 }}>
                {trend.map(t => <span key={t.m} style={{ display: "inline-block", width: 56, textAlign: "center" }}>{t.m}</span>)}
              </div>
            </div>
            <div>
              <div className="eyebrow" style={{ marginBottom: 12 }}>ROAS · evolução</div>
              <Sparkline data={trend.map(t => t.r)} width={280} height={56}
                color={c.roas < 2 ? "var(--v4-red-500)" : "var(--v4-yellow)"}/>
              <div style={{ font: "var(--t-mono-sm)", color: "var(--fg-3)", marginTop: 4 }}>
                {trend.map(t => <span key={t.m} style={{ display: "inline-block", width: 56, textAlign: "center" }}>{t.r.toFixed(1).replace(".",",")}×</span>)}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Squad atribuído" subtitle={squad?.name + " · " + squad?.lead}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
            <HealthRing score={c.health} size={88} stroke={8}/>
            <div style={{ flex: 1 }}>
              <div className="eyebrow" style={{ marginBottom: 4 }}>Health score</div>
              <div style={{ font: "var(--t-body)", color: "var(--fg-2)" }}>
                {c.health >= 70 ? "Cliente saudável. Manter cadência atual."
                  : c.health >= 50 ? "Atenção. Revisar pilar de Engajamento."
                  : "Crítico. Plano de retenção imediato."}
              </div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <SquadMember role="Gestor de tráfego" name={squad?.lead || "—"}/>
            <SquadMember role="CS / sucesso" name="Júlia Marques"/>
            <SquadMember role="Copy" name="Felipe Tonin"/>
            <SquadMember role="Design" name="Ana Cordeiro"/>
          </div>
        </Card>
      </div>
    </>
  );
};

const SquadMember = ({ role, name }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <Avatar name={name} size={26}/>
    <div>
      <div style={{ font: "var(--t-body-strong)" }}>{name}</div>
      <div style={{ font: "var(--t-caption)", color: "var(--fg-3)" }}>{role}</div>
    </div>
  </div>
);

// ---- PESQUISA MENSAL TAB ----
const ClientPesquisa = ({ client }) => {
  const survey = V4Health.SURVEYS[client.id] || {};
  const dims = V4Health.DIMENSIONS;
  const score = V4Health.composite(survey);

  // group by pillar
  const byPillar = {};
  dims.forEach(d => { (byPillar[d.pillar] = byPillar[d.pillar] || []).push(d); });
  const pillarColors = {
    "Aquisição": "var(--viz-1)", "Engajamento": "var(--viz-2)",
    "Monetização": "var(--viz-3)", "Retenção": "var(--viz-4)",
  };

  return (
    <div className="grid-2-1">
      <Card title="Pesquisa mensal · maio 2026"
        subtitle="12 dimensões alimentam o health score deste cliente">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {Object.entries(byPillar).map(([pillar, list]) => (
            <div key={pillar}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: pillarColors[pillar] }}></span>
                <div className="eyebrow">{pillar}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {list.map(d => {
                  const raw = survey[d.id];
                  const s = V4Health.scoreOne(d.kind, raw);
                  const pct = s == null ? 0 : (s / 10) * 100;
                  return (
                    <div key={d.id} className="pesquisa-row">
                      <div className="pesquisa-row-top">
                        <span className="pesquisa-label" title={d.help}>{d.label}</span>
                        <span className="pesquisa-value">{V4Health.displayValue(d.kind, raw)}</span>
                      </div>
                      <div className="pesquisa-bar">
                        <div className="pesquisa-bar-fill" style={{
                          width: pct + "%",
                          background: pct >= 70 ? "var(--v4-green)" : pct >= 50 ? "var(--v4-yellow)" : "var(--v4-red-500)",
                        }}/>
                      </div>
                      <div className="pesquisa-row-foot">
                        <span>Peso {d.weight}%</span>
                        <span>{s == null ? "—" : s.toFixed(1).replace(".", ",") + " / 10"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Health composto">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "12px 0" }}>
          <HealthRing score={score} size={160} stroke={14}/>
          <StatusBadge status={V4Health.flag(score)} score={score}/>
          <p style={{ font: "var(--t-body-sm)", color: "var(--fg-2)", textAlign: "center", maxWidth: 260 }}>
            {score >= 70
              ? "Saudável. Manter cadência atual e replicar o que está funcionando."
              : score >= 50
              ? "Em risco. Identifique 2-3 dimensões mais baixas e ataque esta semana."
              : "Crítico. Reunião de retenção imediata. Use o dossiê para plano de ação."}
          </p>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, marginTop: 14 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Regra do score</div>
          <ul style={{ margin: 0, paddingLeft: 18, font: "var(--t-body-sm)", color: "var(--fg-2)", display: "flex", flexDirection: "column", gap: 6 }}>
            <li><b style={{ color: "var(--v4-green)" }}>≥ 70</b> · Saudável</li>
            <li><b style={{ color: "var(--v4-yellow)" }}>50 – 69</b> · Em risco</li>
            <li><b style={{ color: "var(--v4-red-500)" }}>&lt; 50</b> · Crítico</li>
          </ul>
        </div>
      </Card>
    </div>
  );
};

window.ClientDetail = ClientDetail;
