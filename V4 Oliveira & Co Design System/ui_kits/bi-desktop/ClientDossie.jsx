// =========================================================
// V4 BI — Dossiê do cliente (editable, realtime)
// =========================================================
export const ClientDossie = ({ client }) => {
  const [_, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => V4Store.subscribe(() => force()), []);

  const d = V4Store.getDossie(client.id);
  const revisions = V4Store.getRevisions(client.id, 8);

  return (
    <div className="grid-2-1">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <DossieColumn
          client={client}
          kind="improvementsUs"
          title="Pontos de melhoria — nosso lado"
          subtitle="O que a V4 precisa entregar para destravar este cliente"
          icon="sparkles"
          accent="var(--v4-red-500)"
          items={d.improvementsUs}/>
        <DossieColumn
          client={client}
          kind="improvementsProject"
          title="Pontos de melhoria — lado do projeto"
          subtitle="O que depende do cliente para o resultado melhorar"
          icon="target"
          accent="var(--v4-yellow)"
          items={d.improvementsProject}/>
      </div>

      <Card title="Atividade" subtitle="Histórico de alterações deste cliente" padded={false}>
        {revisions.length === 0 ? (
          <div style={{ padding: 24, color: "var(--fg-4)", font: "var(--t-body-sm)" }}>
            Nada registrado ainda.
          </div>
        ) : (
          <div style={{ padding: "8px 0" }}>
            {revisions.map(r => (
              <div key={r.id} style={{ padding: "10px 20px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ font: "var(--t-body-sm)", color: "var(--fg)" }}>{r.summary}</div>
                <Stamp by={r.by} at={r.at} action={r.action.startsWith("dossie") ? "no dossiê" : r.action.startsWith("meeting") ? "em reunião" : "atualizou"}/>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

const DossieColumn = ({ client, kind, title, subtitle, icon, accent, items }) => {
  const [draft, setDraft] = React.useState("");
  const ta = React.useRef(null);

  const add = () => {
    if (!draft.trim()) return;
    V4Store.addImprovement(client.id, kind, draft);
    setDraft("");
    ta.current?.focus();
  };

  return (
    <Card padded={false}>
      <header className="v4-card-head">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "rgba(255,255,255,0.04)",
            color: accent,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon name={icon} size={16}/>
          </div>
          <div>
            <h3 className="v4-card-title">{title}</h3>
            <div className="v4-card-sub">{subtitle}</div>
          </div>
        </div>
        <span className="dossie-count">{items.length}</span>
      </header>

      <div className="dossie-list">
        {items.length === 0 && (
          <div style={{ padding: "24px 20px", color: "var(--fg-4)", font: "var(--t-body-sm)" }}>
            Nenhum ponto registrado ainda. Adicione abaixo.
          </div>
        )}
        {items.map(it => (
          <div key={it.id} className="dossie-row">
            <div className="dossie-bullet" style={{ background: accent }}></div>
            <div style={{ flex: 1 }}>
              <div style={{ font: "var(--t-body)", color: "var(--fg)" }}>{it.text}</div>
              <Stamp by={it.by} at={it.at} action="adicionou"/>
            </div>
            <button
              className="btn ghost sm icon-only"
              aria-label="Remover"
              onClick={() => V4Store.removeImprovement(client.id, kind, it.id)}>
              <Icon name="x" size={14}/>
            </button>
          </div>
        ))}
      </div>

      <div className="dossie-compose">
        <textarea
          ref={ta}
          value={draft}
          rows={2}
          placeholder={kind === "improvementsUs"
            ? "Ex.: revisar criativos da campanha Black Friday até sexta."
            : "Ex.: cliente sem aprovador para os briefings; bloqueio na operação."}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add(); }}/>
        <div className="dossie-compose-foot">
          <div style={{ font: "var(--t-mono-sm)", color: "var(--fg-4)" }}>
            {V4Store.identity ? `você: ${V4Store.identity.name}` : "sessão anônima"}
          </div>
          <button className="btn primary sm" onClick={add} disabled={!draft.trim()}>
            <Icon name="plus" size={12} stroke={2.5}/>Adicionar
          </button>
        </div>
      </div>
    </Card>
  );
};

window.ClientDossie = ClientDossie;
