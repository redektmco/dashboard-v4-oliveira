// =========================================================
// V4 BI — Identity gate + Presence avatars
// =========================================================
const IdentityGate = ({ onReady }) => {
  const [identity, setIdentity] = React.useState(V4Store.identity);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (identity) onReady?.(identity);
  }, [identity]);

  if (identity) return null;

  const valid = name.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const submit = (e) => {
    e?.preventDefault();
    setTouched(true);
    if (!valid) return;
    V4Store.setIdentity(name, email);
    setIdentity(V4Store.identity);
  };

  return (
    <div className="identity-overlay" role="dialog" aria-modal="true">
      <div className="identity-card">
        <img src="../../assets/v4-simbolo.webp" alt="" className="identity-logo"/>
        <div className="eyebrow" style={{ marginTop: 18 }}>Unidade Oliveira &amp; Co</div>
        <h2 className="identity-title">Quem está entrando?</h2>
        <p className="identity-sub">
          O BI é colaborativo. Toda alteração no <b>dossiê</b> ou <b>reunião</b> fica registrada com seu nome e e-mail —
          e aparece em tempo real para o resto do time.
        </p>

        <form onSubmit={submit}>
          <label className="identity-field">
            <span>Nome completo</span>
            <input
              autoFocus
              type="text"
              value={name}
              placeholder="Ex.: Marina Lopes"
              onChange={e => setName(e.target.value)}/>
          </label>
          <label className="identity-field">
            <span>E-mail V4</span>
            <input
              type="email"
              value={email}
              placeholder="marina@v4oliveira.com.br"
              onChange={e => setEmail(e.target.value)}/>
          </label>

          {touched && !valid && (
            <div className="identity-error">Preencha um nome e um e-mail válido.</div>
          )}

          <button type="submit" className="btn primary"
            style={{ width: "100%", height: 44, marginTop: 10 }}
            disabled={!valid}>
            Entrar na unidade
          </button>
        </form>

        <div className="identity-foot">
          Ao continuar você confirma que tem acesso aos dados desta unidade.
        </div>
      </div>
    </div>
  );
};

// ---- Presence avatars (top bar) ----
const PresenceStrip = () => {
  const [_, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => V4Store.subscribe(() => force()), []);
  const users = V4Store.onlineUsers();
  if (!users.length) return null;
  return (
    <div className="presence">
      <div className="presence-dot"></div>
      <span className="presence-count">{users.length} online</span>
      <div className="presence-avatars">
        {users.slice(0, 5).map((u, i) => (
          <div key={u.sessionId} className="presence-av"
            title={u.name + " · " + u.email}
            style={{ background: ["#e50914","#1f6f4a","#2b3450","#7a4a1f","#5a3066"][i % 5] }}>
            {u.name.split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase()}
          </div>
        ))}
        {users.length > 5 && <div className="presence-av more">+{users.length - 5}</div>}
      </div>
    </div>
  );
};

// ---- "by Xxx · há Yh" stamp ----
const Stamp = ({ by, at, action = "registrou" }) => {
  const ago = (() => {
    const ms = Date.now() - new Date(at).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `há ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `há ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `há ${days}d`;
  })();
  return (
    <div className="stamp">
      <span className="stamp-by">{by}</span>
      <span className="stamp-sep">·</span>
      <span className="stamp-action">{action}</span>
      <span className="stamp-sep">·</span>
      <span className="stamp-ago">{ago}</span>
    </div>
  );
};

window.IdentityGate = IdentityGate;
window.PresenceStrip = PresenceStrip;
window.Stamp = Stamp;

export function Identity(props) { return React.createElement(IdentityGate, props); }
