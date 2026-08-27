// =========================================================
// V4 BI — Overview page (route: /)
// =========================================================
export const Overview = ({ onOpenClient }) => {
  const D = V4Data;
  const trendValues = D.trend.map(t => t.v);

  return (
    <div className="page" data-screen-label="Visão geral">

      <div className="page-head">
        <div>
          <h1>Boa tarde, equipe Oliveira.</h1>
          <div className="sub">
            Dia 27 de maio · 4 dias úteis até o fechamento do mês. <b style={{ color: "var(--v4-red-500)" }}>3 clientes em risco.</b>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn secondary"><Icon name="download" size={14}/>Exportar</button>
          <button className="btn secondary"><Icon name="filter" size={14}/>Filtros</button>
        </div>
      </div>

      {/* KPI row */}
      <div className="kpi-row">
        <KPITile
          big accent
          kpi={D.unit.kpis.faturamento}
          sparkData={trendValues}/>
        <KPITile kpi={D.unit.kpis.fee} sparkData={trendValues.slice(-7)} />
        <KPITile kpi={D.unit.kpis.invest} sparkData={[800,900,950,1020,1080,1120,1240].map(v=>v*1000)} />
        <KPITile kpi={D.unit.kpis.roasMedio} sparkData={[3.8,4.0,4.1,4.3,4.5,4.5,4.8]} />
      </div>

      <div className="kpi-row" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <KPITile kpi={D.unit.kpis.healthMedia} />
        <KPITile kpi={D.unit.kpis.clientesAtivos} />
        <KPITile kpi={D.unit.kpis.ltv} />
        <KPITile kpi={D.unit.kpis.churn} />
      </div>

      {/* Trend + Health distribution */}
      <div className="grid-2-1">
        <Card
          title="Faturamento gerado para clientes"
          subtitle="Soma do faturamento informado pelos clientes · 12 meses"
          action={<button className="btn ghost sm"><Icon name="moreH" size={16}/></button>}>
          <BarChart data={D.trend}/>
        </Card>

        <Card
          title="Health score · distribuição"
          subtitle="42 clientes ativos">
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <HealthRing score={78} size={120} stroke={10}/>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
              <HealthBucket label="Saudáveis ≥ 70" count={28} pct={67} color="var(--v4-green)"/>
              <HealthBucket label="Em risco 50–69" count={11} pct={26} color="var(--v4-yellow)"/>
              <HealthBucket label="Críticos < 50"  count={3}  pct={7}  color="var(--v4-red-500)"/>
            </div>
          </div>
        </Card>
      </div>

      {/* Pipeline funnel */}
      <Card
        title="Pipeline da unidade"
        subtitle="Novos clientes em prospecção"
        action={<button className="btn secondary sm">Ver pipeline →</button>}>
        <div className="pipe">
          {D.pipeline.map((s, i) => (
            <div key={s.stage} className={"pipe-stage" + (i === D.pipeline.length - 1 ? " last" : "")}>
              <div className="stg">{s.stage}</div>
              <div className="ct">{s.count}</div>
              <div className="vl">{D.fmtBRLk(s.value)}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Squad performance */}
      <SquadPerformance/>

      {/* Carteira + Método V4 */}
      <div className="grid-2-1">
        <ClientTable onOpen={onOpenClient}/>

        <Card title="Método V4 · distribuição da carteira"
              subtitle="Por pilar de atuação principal">
          <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 16 }}>
            <Donut data={D.metodo} size={140} stroke={20}/>
            <div className="legend-list" style={{ flex: 1 }}>
              {D.metodo.map(p => (
                <div className="legend-row" key={p.pillar}>
                  <i style={{ background: p.color }}></i>
                  <span>{p.pillar}</span>
                  <span className="pct">{p.share}%</span>
                  <span className="ct">{p.clients}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Alerts + Agenda */}
      <div className="grid-1-1">
        <Card title="Alertas" subtitle="Itens que pedem atenção agora"
              action={<button className="btn ghost sm">5 itens</button>}
              padded={false}>
          <div className="alerts">
            <AlertRow
              kind="crit"
              title="Fazenda Zumbi · ROAS abaixo de 2× há 14 dias"
              meta="Squad Volta · fee R$ 9.800 em risco"
              time="há 2 h"/>
            <AlertRow
              kind="crit"
              title="Doce Atelier · health caiu 22 pontos"
              meta="Squad Norte · onboarding incompleto"
              time="há 6 h"/>
            <AlertRow
              kind="warn"
              title="RedFit · meta de leads 38% atingida"
              meta="Squad Norte · falta 8 dias úteis"
              time="ontem"/>
            <AlertRow
              kind="warn"
              title="3 propostas paradas há mais de 7 dias"
              meta="Pipeline · estágio Negociação"
              time="ontem"/>
            <AlertRow
              kind="warn"
              title="Squad Aurora a 92% de capacidade"
              meta="Reduzir carga ou contratar"
              time="2 dias"/>
          </div>
        </Card>

        <Card title="Esta semana" subtitle="Reuniões agendadas" padded={false}
              action={<button className="btn ghost sm">Abrir agenda →</button>}>
          <div className="agenda">
            {V4Data.meetings.map((m, i) => (
              <div key={i} className={"agenda-row" + (m.alert ? " crise" : "")}>
                <div className="when">
                  <span className="d">{m.day}</span>
                  <span>{m.time}</span>
                </div>
                <div className="what">
                  <div className="c">{m.client}</div>
                  <div className="t">{m.type} · squad {m.squad}</div>
                </div>
                <button className="btn ghost sm">Abrir</button>
              </div>
            ))}
          </div>
        </Card>
      </div>

    </div>
  );
};

const HealthBucket = ({ label, count, pct, color }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
    <div style={{ display: "flex", justifyContent: "space-between", font: "var(--t-body-sm)", color: "var(--fg-2)" }}>
      <span>{label}</span>
      <span style={{ font: "var(--t-mono-sm)", color: "var(--fg-3)" }}>
        <b style={{ color: "var(--fg)" }}>{count}</b> · {pct}%
      </span>
    </div>
    <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden" }}>
      <div style={{ width: pct + "%", height: "100%", background: color, borderRadius: 999 }}/>
    </div>
  </div>
);

const AlertRow = ({ kind, title, meta, time }) => (
  <div className={"alert-row" + (kind === "warn" ? " warn" : "")}>
    <div className="alert-icon">
      <Icon name="alert" size={16}/>
    </div>
    <div className="alert-body">
      <div className="title">{title}</div>
      <div className="meta">{meta}</div>
    </div>
    <div className="alert-time">{time}</div>
  </div>
);

window.Overview = Overview;
