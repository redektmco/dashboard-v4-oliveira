// =========================================================
// V4 BI — Reuniões do cliente (registro + dores + sync)
// =========================================================
export const ClientMeetings = ({ client }) => {
  const [_, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => V4Store.subscribe(() => force()), []);
  const [composeOpen, setComposeOpen] = React.useState(false);
  const meetings = V4Store.getMeetings(client.id);

  return (
    <>
      <Card padded={false}
        title="Reuniões registradas"
        subtitle="Resumos enviados pelos squads — todo o time vê em tempo real"
        action={
          <button className="btn primary sm" onClick={() => setComposeOpen(true)}>
            <Icon name="plus" size={12} stroke={2.5}/>Nova reunião
          </button>
        }>
        {meetings.length === 0 && (
          <div style={{ padding: "32px 24px", color: "var(--fg-4)", font: "var(--t-body)" }}>
            Nenhuma reunião registrada para este cliente ainda. Use o botão acima.
          </div>
        )}
        <div className="meetings-list">
          {meetings.map(m => (
            <MeetingCard key={m.id} m={m} clientId={client.id}/>
          ))}
        </div>
      </Card>

      {composeOpen && (
        <MeetingCompose
          client={client}
          onClose={() => setComposeOpen(false)}/>
      )}
    </>
  );
};

const typeColor = (t) => {
  if (/crise/i.test(t))      return "var(--v4-red-500)";
  if (/onboard/i.test(t))    return "#3a9cff";
  if (/review/i.test(t))     return "var(--v4-yellow)";
  return "var(--v4-green)";
};

const MeetingCard = ({ m, clientId }) => (
  <div className="meeting-card">
    <div className="meeting-head">
      <div className="meeting-date">
        <div className="d">{m.date}</div>
        <div className="t">{m.time}</div>
      </div>
      <div style={{ flex: 1 }}>
        <div className="meeting-type" style={{ color: typeColor(m.type) }}>
          <span className="dot" style={{ background: typeColor(m.type) }}></span>
          {m.type}
        </div>
        <div className="meeting-title">{m.title}</div>
        {m.attendees && (
          <div className="meeting-attendees">
            <Icon name="users" size={12}/> {m.attendees}
          </div>
        )}
      </div>
      <button className="btn ghost sm icon-only" aria-label="Remover"
        onClick={() => { if (confirm("Remover esta reunião?")) V4Store.removeMeeting(clientId, m.id); }}>
        <Icon name="x" size={14}/>
      </button>
    </div>

    {m.summary && (
      <div className="meeting-section">
        <div className="eyebrow">Resumo</div>
        <div className="meeting-body">{m.summary}</div>
      </div>
    )}

    {m.pains?.length > 0 && (
      <div className="meeting-section">
        <div className="eyebrow" style={{ color: "var(--v4-red-500)" }}>Principais dores citadas</div>
        <ul className="pain-list">
          {m.pains.map((p, i) => (
            <li key={i}>
              <Icon name="alert" size={12}/>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    )}

    <div className="meeting-foot">
      <Stamp by={m.by} at={m.at} action="registrou esta reunião"/>
    </div>
  </div>
);

const MeetingCompose = ({ client, onClose }) => {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toTimeString().slice(0, 5);
  const [form, setForm] = React.useState({
    date: today, time: now, type: "Weekly", title: "", attendees: "", summary: "",
    pains: ["", "", ""],
  });
  const setF = (k, v) => setForm(s => ({ ...s, [k]: v }));
  const setPain = (i, v) => setForm(s => {
    const next = [...s.pains]; next[i] = v; return { ...s, pains: next };
  });
  const submit = () => {
    if (!form.title.trim()) return;
    V4Store.addMeeting(client.id, form);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <div className="eyebrow">{client.name}</div>
            <h3 className="v4-card-title" style={{ marginTop: 4 }}>Registrar reunião</h3>
          </div>
          <button className="btn ghost sm icon-only" onClick={onClose}>
            <Icon name="x" size={14}/>
          </button>
        </header>

        <div className="modal-body">
          <div className="form-row">
            <Field label="Data">
              <input type="date" value={form.date} onChange={e => setF("date", e.target.value)}/>
            </Field>
            <Field label="Hora">
              <input type="time" value={form.time} onChange={e => setF("time", e.target.value)}/>
            </Field>
            <Field label="Tipo">
              <select value={form.type} onChange={e => setF("type", e.target.value)}>
                <option>Weekly</option>
                <option>Review</option>
                <option>Onboarding</option>
                <option>Reunião de crise</option>
                <option>Apresentação de resultados</option>
              </select>
            </Field>
          </div>

          <Field label="Título da reunião">
            <input value={form.title} autoFocus
              placeholder="Ex.: Alinhamento mensal · maio"
              onChange={e => setF("title", e.target.value)}/>
          </Field>

          <Field label="Participantes">
            <input value={form.attendees}
              placeholder="Marina Lopes (V4) · Diego Prado (V4) · João Silva (cliente)"
              onChange={e => setF("attendees", e.target.value)}/>
          </Field>

          <Field label="Resumo da reunião">
            <textarea rows={4} value={form.summary}
              placeholder="O que foi decidido, próximos passos, prazos…"
              onChange={e => setF("summary", e.target.value)}/>
          </Field>

          <Field label="Principais dores citadas pelo cliente">
            <div className="pain-input-list">
              {form.pains.map((p, i) => (
                <div key={i} className="pain-input">
                  <Icon name="alert" size={12} style={{ color: "var(--v4-red-500)", flexShrink: 0 }}/>
                  <input value={p}
                    placeholder={`Dor ${i + 1}…`}
                    onChange={e => setPain(i, e.target.value)}/>
                </div>
              ))}
              <button className="btn ghost sm" type="button"
                onClick={() => setForm(s => ({ ...s, pains: [...s.pains, ""] }))}>
                <Icon name="plus" size={12} stroke={2.5}/>+ uma dor
              </button>
            </div>
          </Field>
        </div>

        <footer className="modal-foot">
          <div style={{ font: "var(--t-mono-sm)", color: "var(--fg-4)" }}>
            Será registrado como <b style={{ color: "var(--fg-2)" }}>{V4Store.identity?.name}</b>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn secondary" onClick={onClose}>Cancelar</button>
            <button className="btn primary" onClick={submit} disabled={!form.title.trim()}>
              Salvar reunião
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

const Field = ({ label, children }) => (
  <label className="field-row">
    <span className="field-label">{label}</span>
    {children}
  </label>
);

window.ClientMeetings = ClientMeetings;
