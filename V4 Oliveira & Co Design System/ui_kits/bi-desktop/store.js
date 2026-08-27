// =========================================================
// V4 BI — Store (realtime, multi-tab, localStorage-persisted)
//   • Identity (name + email) is stored once per browser.
//   • Dossie & meeting notes are keyed by client id.
//   • Changes broadcast via BroadcastChannel so every open tab
//     in the unit sees writes from any other tab instantly.
//   • A revision log records who-changed-what-when.
// =========================================================
(function () {

  const LS_KEY = "v4-oliveira-store-v1";
  const LS_ID_KEY = "v4-oliveira-identity-v1";
  const CH_NAME  = "v4-oliveira-store";

  // ---- INITIAL STATE ----
  const seedDossie = {
    fazenda: {
      improvementsUs: [
        { id: "u1", text: "Replanejar campanha Meta Ads zerando criativos antigos.", by: "Marina Lopes", at: "2026-05-24T14:00:00" },
        { id: "u2", text: "CS precisa retomar cadência semanal com o dono.",         by: "Diego Prado",  at: "2026-05-22T10:30:00" },
      ],
      improvementsProject: [
        { id: "p1", text: "Cliente sem time interno para responder briefings — gargalo de aprovação.", by: "Diego Prado", at: "2026-05-22T10:35:00" },
        { id: "p2", text: "Conta de anúncio Meta caiu por verificação pendente.",                       by: "Marina Lopes", at: "2026-05-20T09:00:00" },
      ],
    },
    ecomm: {
      improvementsUs: [
        { id: "u1", text: "Finalizar onboarding (faltam 2 documentos).", by: "Beatriz Lima", at: "2026-05-26T11:20:00" },
      ],
      improvementsProject: [
        { id: "p1", text: "Estoque inconsistente nos anúncios — pausa frequente.", by: "Beatriz Lima", at: "2026-05-25T16:00:00" },
      ],
    },
  };
  const seedMeetings = {
    fazenda: [
      {
        id: "m1",
        date: "2026-05-24",
        time: "16:00",
        type: "Reunião de crise",
        title: "Alinhamento sobre ROAS abaixo do target",
        attendees: "Marina Lopes (V4) · Diego Prado (V4) · João Zumbi (cliente) · Rita Zumbi (cliente)",
        summary: "Cliente reconhece urgência. Concordou em destravar verba para criativos novos. Próximo passo: rodar 3 campanhas paralelas testando público amplo vs. retargeting.",
        pains: [
          "Estamos pagando alto pra trazer lead que não fecha.",
          "Não consigo medir o que está dando resultado no dia a dia.",
          "Precisamos de mais agilidade nos criativos.",
        ],
        by: "Marina Lopes",
        at: "2026-05-24T18:30:00",
      },
    ],
    ecomm: [
      {
        id: "m1",
        date: "2026-05-26",
        time: "10:00",
        type: "Weekly",
        title: "Status de onboarding",
        attendees: "Beatriz Lima (V4) · Felipe Tonin (V4) · Carla Atelier (cliente)",
        summary: "Documentação ainda incompleta. Cliente operando vendas via WhatsApp; conversão de loja ainda não medida. Próximo passo: instalar pixel + GA4 até sexta.",
        pains: [
          "Não enxergo de onde vem cada venda.",
          "Estoque some sem aviso e os anúncios ficam fora do ar.",
        ],
        by: "Beatriz Lima",
        at: "2026-05-26T12:00:00",
      },
    ],
  };

  const seed = {
    dossie: seedDossie,
    meetings: seedMeetings,
    presence: {}, // online users
    revisions: [], // global revision log
  };

  // ---- STORAGE ----
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return { ...seed, ...JSON.parse(raw) };
    } catch (e) {}
    return seed;
  }
  function save(state) {
    try { localStorage.setItem(LS_KEY, JSON.stringify({
      dossie: state.dossie,
      meetings: state.meetings,
      revisions: state.revisions.slice(-200),
    })); } catch (e) {}
  }

  // ---- IDENTITY ----
  function loadIdentity() {
    try {
      const raw = localStorage.getItem(LS_ID_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }
  function saveIdentity(id) {
    localStorage.setItem(LS_ID_KEY, JSON.stringify(id));
  }
  function clearIdentity() {
    localStorage.removeItem(LS_ID_KEY);
  }

  // ---- BROADCAST CHANNEL ----
  let channel = null;
  try { channel = new BroadcastChannel(CH_NAME); } catch (e) {}

  // ---- STORE CLASS ----
  class Store {
    constructor() {
      this.state = load();
      this.subs = new Set();
      this.identity = loadIdentity();
      this._sessionId = Math.random().toString(36).slice(2, 9);

      if (channel) {
        channel.addEventListener("message", (e) => this._onRemote(e.data));
      }
      // Also handle plain localStorage events (cross-tab fallback)
      window.addEventListener("storage", (e) => {
        if (e.key === LS_KEY && e.newValue) {
          try {
            const next = JSON.parse(e.newValue);
            this.state = { ...this.state, ...next };
            this._emit();
          } catch (e) {}
        }
      });

      // Presence ping every 5s
      this._announcePresence();
      this._presenceTimer = setInterval(() => this._announcePresence(), 5000);
      window.addEventListener("beforeunload", () => this._leavePresence());
    }

    _emit() { this.subs.forEach(fn => fn(this.state)); }
    subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }

    _broadcast(payload) {
      if (channel) channel.postMessage({ from: this._sessionId, ...payload });
    }
    _onRemote(msg) {
      if (!msg || msg.from === this._sessionId) return;
      if (msg.type === "state")    { this.state = msg.state;     this._emit(); }
      if (msg.type === "presence") { this._mergePresence(msg.user); }
    }

    // ---- IDENTITY ----
    setIdentity(name, email) {
      const id = { name: name.trim(), email: email.trim(), at: new Date().toISOString() };
      this.identity = id;
      saveIdentity(id);
      this._announcePresence();
      this._emit();
    }
    signOut() {
      this._leavePresence();
      clearIdentity();
      this.identity = null;
      this._emit();
    }

    // ---- PRESENCE ----
    _announcePresence() {
      if (!this.identity) return;
      const u = { ...this.identity, sessionId: this._sessionId, lastSeen: Date.now() };
      this.state.presence = { ...this.state.presence, [this._sessionId]: u };
      this._broadcast({ type: "presence", user: u });
      // Reap stale (>15s without ping)
      const now = Date.now();
      for (const k of Object.keys(this.state.presence)) {
        if (now - (this.state.presence[k].lastSeen || 0) > 15000) {
          delete this.state.presence[k];
        }
      }
      this._emit();
    }
    _leavePresence() {
      if (!this.state.presence) return;
      delete this.state.presence[this._sessionId];
      this._broadcast({ type: "presence", user: { sessionId: this._sessionId, lastSeen: 0 } });
    }
    _mergePresence(user) {
      if (!user.sessionId) return;
      if (!user.lastSeen) { delete this.state.presence[user.sessionId]; }
      else { this.state.presence[user.sessionId] = user; }
      this._emit();
    }
    onlineUsers() {
      const now = Date.now();
      return Object.values(this.state.presence || {})
        .filter(u => u.lastSeen && now - u.lastSeen < 15000);
    }

    // ---- REVISIONS ----
    _logRevision(action, clientId, summary) {
      if (!this.identity) return;
      this.state.revisions.push({
        id: Math.random().toString(36).slice(2, 10),
        action, clientId, summary,
        by: this.identity.name, email: this.identity.email,
        at: new Date().toISOString(),
      });
    }

    // ---- DOSSIE ----
    addImprovement(clientId, kind, text) {
      if (!this.identity || !text.trim()) return;
      const item = {
        id: Math.random().toString(36).slice(2, 10),
        text: text.trim(),
        by: this.identity.name,
        at: new Date().toISOString(),
      };
      const d = this.state.dossie[clientId] || { improvementsUs: [], improvementsProject: [] };
      const next = {
        ...d,
        [kind]: [...(d[kind] || []), item],
      };
      this.state.dossie = { ...this.state.dossie, [clientId]: next };
      this._logRevision("dossie:add", clientId, `+ ${kind === "improvementsUs" ? "ponto nosso" : "ponto do projeto"}: ${text.slice(0, 80)}`);
      this._persistAndBroadcast();
    }
    removeImprovement(clientId, kind, itemId) {
      const d = this.state.dossie[clientId];
      if (!d) return;
      const next = { ...d, [kind]: (d[kind] || []).filter(i => i.id !== itemId) };
      this.state.dossie = { ...this.state.dossie, [clientId]: next };
      this._logRevision("dossie:remove", clientId, `− ponto removido`);
      this._persistAndBroadcast();
    }

    // ---- MEETINGS ----
    addMeeting(clientId, payload) {
      if (!this.identity) return;
      const m = {
        id: Math.random().toString(36).slice(2, 10),
        date: payload.date,
        time: payload.time,
        type: payload.type || "Reunião",
        title: payload.title,
        attendees: payload.attendees || "",
        summary: payload.summary || "",
        pains: (payload.pains || []).filter(p => p.trim()),
        by: this.identity.name,
        at: new Date().toISOString(),
      };
      const list = this.state.meetings[clientId] || [];
      this.state.meetings = { ...this.state.meetings, [clientId]: [m, ...list] };
      this._logRevision("meeting:add", clientId, `+ ${m.type}: ${m.title}`);
      this._persistAndBroadcast();
    }
    removeMeeting(clientId, meetingId) {
      const list = this.state.meetings[clientId] || [];
      this.state.meetings = { ...this.state.meetings, [clientId]: list.filter(m => m.id !== meetingId) };
      this._logRevision("meeting:remove", clientId, `− reunião removida`);
      this._persistAndBroadcast();
    }

    _persistAndBroadcast() {
      save(this.state);
      this._broadcast({ type: "state", state: {
        dossie: this.state.dossie,
        meetings: this.state.meetings,
        revisions: this.state.revisions,
      }});
      this._emit();
    }

    // ---- QUERIES ----
    getDossie(clientId)   { return this.state.dossie[clientId] || { improvementsUs: [], improvementsProject: [] }; }
    getMeetings(clientId) { return this.state.meetings[clientId] || []; }
    getRevisions(clientId, limit = 20) {
      let r = this.state.revisions;
      if (clientId) r = r.filter(x => x.clientId === clientId);
      return [...r].reverse().slice(0, limit);
    }
  }

  window.V4Store = new Store();
})();
