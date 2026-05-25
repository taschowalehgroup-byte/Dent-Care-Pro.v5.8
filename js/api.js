/**
 * DentCare Pro — Static API Engine (Netlify Edition)
 *
 * All data is loaded from GitHub raw JSON on startup.
 * All writes are in-memory (reset on page refresh).
 * Auth uses /.netlify/functions/accounts for persistence.
 * ─────────────────────────────────────────────────────────
 * ⚠️  BEFORE DEPLOYING:
 *     Set GITHUB_RAW_BASE to your public GitHub repo path
 *     e.g. https://raw.githubusercontent.com/YourUser/YourRepo/main/database/JSON
 */

const DB = (() => {

  // ── Point this at your GitHub repo's /database/JSON folder ──────
  const GITHUB_RAW_BASE =
    'https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/database/JSON';

  // ── Netlify Function for persistent auth ────────────────────────
  const ACCOUNTS_FN = '/.netlify/functions/accounts';

  // ── In-memory store ─────────────────────────────────────────────
  const store = {
    patients:       [],
    appointments:   [],
    treatments:     [],
    transactions:   [],
    inventory:      [],
    doctors:        [],
    users:          [],
    discount_codes: [],
    installments:   [],
    installment_payments: [],
    xrays:          [],
    waiting:        [],
    abilities:      {},   // doctor_id → [ability, ...]
    settings:       {},
    pages:          {},   // page-access config (pages.json)
    commissions:    [],
  };

  // ── Auto-increment counters per table ───────────────────────────
  const _nextId = {};
  function nextId(table) {
    if (!_nextId[table]) {
      const rows = store[table];
      _nextId[table] = Array.isArray(rows) && rows.length
        ? Math.max(...rows.map(r => r.id || 0)) + 1
        : 1;
    }
    return _nextId[table]++;
  }

  // ── Predefined abilities list (mirrors backend route) ───────────
  const ALL_ABILITIES = [
    'General Checkup', 'Cleaning / Scaling', 'Filling', 'Root Canal',
    'Extraction', 'Crown / Bridge', 'Implant', 'Orthodontics',
    'Cosmetic Dentistry', 'Teeth Whitening', 'Pediatric Dentistry',
    'Gum Treatment (Periodontics)', 'Oral Surgery', 'Dentures / Prosthetics',
    'Emergency Care', 'X-Ray / Diagnosis'
  ];

  // ── Fetch a JSON file from GitHub ───────────────────────────────
  async function ghFetch(file) {
    const res = await fetch(`${GITHUB_RAW_BASE}/${file}`);
    if (!res.ok) throw new Error(`GitHub fetch failed: ${file} (${res.status})`);
    return res.json();
  }

  // ── Load all seed data on startup ───────────────────────────────
  const _ready = (async () => {
    try {
      // Main database tables
      const db = await ghFetch('db.json');
      ['doctors','patients','appointments','treatments','transactions','inventory'].forEach(t => {
        if (Array.isArray(db[t])) store[t] = db[t];
      });

      // Users from passwords.json
      const pwData = await ghFetch('passwords.json').catch(() => ({ users: [] }));
      if (Array.isArray(pwData.users)) store.users = pwData.users;

      // Settings
      const settingsData = await ghFetch('settings.json').catch(() => ({}));
      // settings.json may be an array of {key,value} rows or an object
      if (Array.isArray(settingsData)) {
        settingsData.forEach(row => { if (row.key) store.settings[row.key] = row.value; });
      } else {
        store.settings = settingsData;
      }

      // Pages access config
      const pagesData = await ghFetch('pages.json').catch(() => ({ pages:[], actions:[], users:[] }));
      store.pages = pagesData;

      // Waiting room
      const waitingData = await ghFetch('waiting_room.json').catch(() => ({ waiting_room: [] }));
      store.waiting = waitingData.waiting_room || waitingData || [];

    } catch(e) {
      console.error('[DB] Failed to seed from GitHub:', e.message);
    }
  })();

  // ── Generic CRUD factory ─────────────────────────────────────────
  function makeCRUD(table) {
    return {
      all:    async ()           => { await _ready; return [...store[table]]; },
      find:   async (id)         => { await _ready; return store[table].find(r => r.id == id) || null; },
      insert: async (row)        => { await _ready; const r = { id: nextId(table), ...row }; store[table].push(r); return r; },
      update: async (id, patch)  => {
        await _ready;
        const i = store[table].findIndex(r => r.id == id);
        if (i > -1) store[table][i] = { ...store[table][i], ...patch };
        return store[table][i] || null;
      },
      delete: async (id)         => { await _ready; store[table] = store[table].filter(r => r.id != id); return { deleted: true }; },
      bulk:   async (rows)       => {
        await _ready;
        const inserted = rows.map(row => { const r = { id: nextId(table), ...row }; store[table].push(r); return r; });
        return { inserted: inserted.length, rows: inserted };
      },
    };
  }

  // ── Build tables ─────────────────────────────────────────────────
  const tables = {};
  ['patients','appointments','treatments','transactions','inventory','doctors','users','discount_codes'].forEach(t => {
    tables[t] = makeCRUD(t);
  });

  // validate for discount_codes
  tables.discount_codes.validate = async (code) => {
    await _ready;
    const dc = store.discount_codes.find(d => d.code === code && d.active !== false);
    if (!dc) return { valid: false, error: 'Invalid or expired code' };
    return { valid: true, discount: dc };
  };

  // ── Auth — uses Netlify Function for persistence ─────────────────
  const auth = {
    async login(username, password) {
      try {
        const res = await fetch(ACCOUNTS_FN + '/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!data.success) return null;
        const session = { ...data.user, loginTime: Date.now() };
        localStorage.setItem('dentcare_session', JSON.stringify(session));
        return session;
      } catch(e) {
        // Fallback: check in-memory users (seed data)
        await _ready;
        const user = store.users.find(u => u.username === username && u.password === password);
        if (!user) return null;
        const session = { ...user, loginTime: Date.now() };
        localStorage.setItem('dentcare_session', JSON.stringify(session));
        return session;
      }
    },
    logout()  { localStorage.removeItem('dentcare_session'); },
    current() { const s = localStorage.getItem('dentcare_session'); return s ? JSON.parse(s) : null; },
  };

  // ── Settings ─────────────────────────────────────────────────────
  const settings = {
    get:   async ()     => { await _ready; return { ...store.settings }; },
    save:  async (data) => { await _ready; store.settings = { ...store.settings, ...data }; return store.settings; },
    reset: async ()     => { store.settings = {}; return {}; },
  };

  // ── Helpers ───────────────────────────────────────────────────────
  const helpers = {
    patientName: async (id) => {
      const p = await tables.patients.find(id);
      return p?.full_name || 'Unknown';
    },
    doctorName: async (id) => {
      const d = await tables.doctors.find(id);
      return d?.full_name || 'Unknown';
    },
    todayAppts: async () => {
      const today = new Date().toISOString().split('T')[0];
      const all   = await tables.appointments.all();
      return all.filter(a => a.date === today);
    },
    stats: async () => {
      await _ready;
      return {
        patients:     store.patients.length,
        appointments: store.appointments.length,
        treatments:   store.treatments.length,
        transactions: store.transactions.length,
        doctors:      store.doctors.length,
        inventory:    store.inventory.length,
      };
    },
    nextPatientNo: async () => {
      await _ready;
      const nums = store.patients.map(p => parseInt(p.patient_no || 0)).filter(n => !isNaN(n));
      const next = nums.length ? Math.max(...nums) + 1 : 1;
      return { patient_no: String(next).padStart(4, '0') };
    },
    reset: async () => { /* no-op in static mode */ },
  };

  // ── Waiting Room ──────────────────────────────────────────────────
  const waiting = {
    all:             async ()              => { await _ready; return [...store.waiting]; },
    add:             async (patient_id, notes) => {
      await _ready;
      const r = { id: nextId('waiting'), patient_id, notes: notes || null, added_at: new Date().toISOString() };
      store.waiting.push(r);
      return r;
    },
    remove:          async (id)            => { store.waiting = store.waiting.filter(r => r.id != id); return { deleted: true }; },
    removeByPatient: async (patient_id)    => { store.waiting = store.waiting.filter(r => r.patient_id != patient_id); return { deleted: true }; },
    clearAll:        async ()              => { store.waiting = []; return { deleted: true }; },
  };

  // ── Installment Plans ─────────────────────────────────────────────
  const installments = {
    all:           async ()         => { await _ready; return [...store.installments]; },
    byPatient:     async (pid)      => { await _ready; return store.installments.filter(r => r.patient_id == pid); },
    create:        async (data)     => {
      await _ready;
      const r = { id: nextId('installments'), created_at: new Date().toISOString(), ...data };
      store.installments.push(r);
      return r;
    },
    delete:        async (id)       => { store.installments = store.installments.filter(r => r.id != id); return { deleted: true }; },
    payInstallment: async (payId, data) => {
      const i = store.installment_payments.findIndex(r => r.id == payId);
      if (i > -1) store.installment_payments[i] = { ...store.installment_payments[i], ...data };
      return store.installment_payments[i] || null;
    },
  };

  // ── Xray Gallery ──────────────────────────────────────────────────
  const xrays = {
    byPatient: async (pid)  => { await _ready; return store.xrays.filter(r => r.patient_id == pid); },
    add:       async (data) => {
      await _ready;
      const r = { id: nextId('xrays'), uploaded_at: new Date().toISOString(), ...data };
      store.xrays.push(r);
      return r;
    },
    delete:    async (id)   => { store.xrays = store.xrays.filter(r => r.id != id); return { deleted: true }; },
  };

  // ── Commissions ───────────────────────────────────────────────────
  const commissions = {
    report: async (params = {}) => {
      await _ready;
      // Build report from in-memory transactions
      const { doctor_id, from, to } = params;
      let txns = [...store.transactions];
      if (doctor_id) txns = txns.filter(t => t.doctor_id == doctor_id);
      if (from) txns = txns.filter(t => t.date >= from);
      if (to)   txns = txns.filter(t => t.date <= to);
      const total = txns.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
      return { transactions: txns, total, count: txns.length };
    },
  };

  // ── Reminders ─────────────────────────────────────────────────────
  const reminders = {
    followups: async (days = 3) => {
      await _ready;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + parseInt(days));
      const cutoffStr = cutoff.toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];
      return store.appointments.filter(a => a.date >= today && a.date <= cutoffStr && a.status === 'scheduled');
    },
    todayAppointments: async () => {
      await _ready;
      const today = new Date().toISOString().split('T')[0];
      return store.appointments.filter(a => a.date === today);
    },
    overdueInstallments: async () => {
      await _ready;
      const today = new Date().toISOString().split('T')[0];
      return store.installments.filter(i => i.due_date && i.due_date < today && i.status !== 'paid');
    },
  };

  // ── Pages access config ────────────────────────────────────────────
  const pages = {
    getAll:   async ()       => { await _ready; return store.pages; },
    getUser:  async (uid)    => {
      await _ready;
      const entry = (store.pages.users || []).find(u => u.userId == uid);
      return entry || null;
    },
    saveUser: async (uid, d) => {
      await _ready;
      const idx = (store.pages.users || []).findIndex(u => u.userId == uid);
      if (!store.pages.users) store.pages.users = [];
      if (idx > -1) store.pages.users[idx] = { ...store.pages.users[idx], ...d };
      else          store.pages.users.push({ userId: uid, ...d });
      return { success: true };
    },
    saveBulk: async (users) => {
      await _ready;
      if (!store.pages.users) store.pages.users = [];
      for (const u of users) {
        const idx = store.pages.users.findIndex(x => x.userId == u.userId);
        if (idx > -1) store.pages.users[idx] = u;
        else          store.pages.users.push(u);
      }
      return { success: true, count: users.length };
    },
    backup: async () => ({ success: true, message: 'Page access saved in-memory (resets on refresh)' }),
  };

  // ── Abilities ─────────────────────────────────────────────────────
  const abilitiesAPI = {
    allList: () => ({ abilities: ALL_ABILITIES }),
    byDoctor: async (doctorId) => {
      await _ready;
      return { abilities: store.abilities[doctorId] || [] };
    },
    saveDoctor: async (doctorId, abilitiesList) => {
      await _ready;
      store.abilities[doctorId] = abilitiesList;
      return { success: true, abilities: abilitiesList };
    },
  };

  // ── Backup — export in-memory data as a downloadable JSON ────────
  const backup = {
    list:     async ()         => ({ count: 0, backups: [], message: 'Backups not available in static mode' }),
    create:   async (label)    => {
      const payload = {
        ...store,
        exported_at: new Date().toISOString(),
        label: label || 'manual'
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = `backup-${Date.now()}.json`;
      a.click();
      return { backup: { total_size: `~${Math.round(blob.size / 1024)}KB` } };
    },
    restore:  async ()         => { toast('Restore is not supported in static mode. Upload your backup JSON to GitHub instead.', 'warning'); },
    download: async ()         => { return backup.create('download'); },
    delete:   async ()         => ({ success: false, error: 'Delete not supported in static mode' }),
  };

  // ── Password reset — simple in-memory token store ─────────────────
  const _resetTokens = {};
  const authExtended = {
    requestReset: async (username) => {
      await _ready;
      const user = store.users.find(u => u.username === username);
      if (!user) return { success: false, error: 'User not found' };
      const token = Math.floor(1000 + Math.random() * 9000).toString();
      _resetTokens[username] = { token, expires: Date.now() + 3600000 };
      return { success: true, token };
    },
    resetPassword: async (username, token, new_password) => {
      const entry = _resetTokens[username];
      if (!entry || entry.token !== token || Date.now() > entry.expires)
        return { success: false, error: 'Invalid or expired token' };
      const user = store.users.find(u => u.username === username);
      if (user) user.password = new_password;
      delete _resetTokens[username];
      // Also update via Netlify function if available
      try {
        await fetch(ACCOUNTS_FN + '/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, token, new_password })
        });
      } catch(e) {}
      return { success: true };
    },
    resetRequests: async () => {
      return Object.entries(_resetTokens).map(([username, v]) => ({
        username,
        token: v.token,
        expires_at: new Date(v.expires).toISOString(),
        role: store.users.find(u => u.username === username)?.role || 'unknown'
      }));
    },
  };

  // ── apiGet helper ─────────────────────────────────────────────────
  const apiGet = async (endpoint) => {
    // Handle a handful of special endpoints still called via raw fetch
    if (endpoint === '/stats')         return helpers.stats();
    if (endpoint === '/nextPatientNo') return helpers.nextPatientNo();
    return {};
  };

  // ── Expose _store for backup/export ──────────────────────────────
  return {
    tables,
    auth,
    helpers,
    settings,
    pages,
    waiting,
    fetch: apiGet,
    installments,
    xrays,
    commissions,
    reminders,
    abilitiesAPI,
    backup,
    authExtended,
    _store: store,
  };
})();
