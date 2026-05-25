/* ═══════════════════════════════════════════════════════
   DentCare Pro — Feature Pack
   1. Dark / Light Theme Toggle
   2. Global Search
   3. Keyboard Shortcuts
   4. Patient Rating System
   5. In-app Notifications
   6. Email Reports (mailto + PDF summary)
   Load order: after animations.js, before app.js closing
   ═══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   1. DARK / LIGHT THEME TOGGLE
   ══════════════════════════════════════════════════════ */
const Theme = {
  LIGHT_VARS: {
    '--bg':       '#f0f2f8',
    '--bg2':      '#e4e8f2',
    '--bg3':      '#d8ddef',
    '--card':     '#ffffff',
    '--surface2': '#edf0fa',
    '--border':   '#c8cedf',
    '--text':     '#1a1e2e',
    '--text2':    '#4a5070',
    '--text3':    '#8890a8',
  },
  DARK_VARS: {
    '--bg':       '#0a0d14',
    '--bg2':      '#111520',
    '--bg3':      '#171c2b',
    '--card':     '#131825',
    '--surface2': '#1a2035',
    '--border':   '#1e2640',
    '--text':     '#e8eaf6',
    '--text2':    '#7b84a3',
    '--text3':    '#4a5070',
  },

  _current: 'dark',

  apply(mode) {
    this._current = mode;
    const vars = mode === 'light' ? this.LIGHT_VARS : this.DARK_VARS;
    Object.entries(vars).forEach(([k, v]) =>
      document.documentElement.style.setProperty(k, v)
    );
    document.body.classList.toggle('theme-light', mode === 'light');
    document.body.classList.toggle('theme-dark',  mode === 'dark');
    /* update toggle button icon */
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.title = mode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    if (btn) btn.textContent = mode === 'dark' ? '☀️' : '🌙';
    /* persist per-user */
    try {
      const user = typeof DB !== 'undefined' ? DB.auth.current()?.username : null;
      const key  = user ? `dc_theme_${user}` : 'dc_theme';
      localStorage.setItem(key, mode);
      localStorage.setItem('dc_theme', mode); // fallback global
    } catch(e) {}
  },

  toggle() {
    this.apply(this._current === 'dark' ? 'light' : 'dark');
    toast(`${this._current === 'light' ? 'Light' : 'Dark'} mode`, 'info');
  },

  init(username) {
    let saved = 'dark';
    try {
      const key = username ? `dc_theme_${username}` : 'dc_theme';
      saved = localStorage.getItem(key) || localStorage.getItem('dc_theme') || 'dark';
    } catch(e) {}
    this.apply(saved);
  }
};

/* ══════════════════════════════════════════════════════
   2. GLOBAL SEARCH
   ══════════════════════════════════════════════════════ */
const GlobalSearch = {
  _open: false,
  _results: [],

  open() {
    const overlay = document.getElementById('globalSearchOverlay');
    if (!overlay) return;
    this._open = true;
    overlay.classList.add('gs-visible');
    const inp = document.getElementById('globalSearchInput');
    if (inp) { inp.value = ''; inp.focus(); }
    document.getElementById('gsResults').innerHTML =
      '<div class="gs-hint">Type a patient name, appointment, or doctor…</div>';
    // Hide shortcut hints for pages the current user can't access
    this._filterShortcutHints();
  },

  _filterShortcutHints() {
    const session = DB.auth.current();
    const hints = document.querySelectorAll('#gsShortcutList [data-shortcut-page]');
    hints.forEach(el => {
      const pageId   = el.dataset.shortcutPage;
      const actionId = el.dataset.shortcutAction;
      // Admins see everything
      if (!session || session.role === 'admin') { el.style.display = ''; return; }
      // Check nav visibility for page access
      const navEl = document.querySelector(`[data-page="${pageId}"]`);
      if (navEl && navEl.style.display === 'none') { el.style.display = 'none'; return; }
      // Check specific action permission if required
      if (actionId) {
        const allowed = PageAccessEnforcer.can(session.id, session.role, pageId, actionId);
        el.style.display = allowed ? '' : 'none';
        return;
      }
      el.style.display = '';
    });
  },

  close() {
    this._open = false;
    const overlay = document.getElementById('globalSearchOverlay');
    if (overlay) overlay.classList.remove('gs-visible');
  },

  async search(q) {
    q = (q || '').trim().toLowerCase();
    const resultsEl = document.getElementById('gsResults');
    if (!q) {
      resultsEl.innerHTML = '<div class="gs-hint">Type a patient name, appointment, or doctor…</div>';
      return;
    }

    resultsEl.innerHTML = '<div class="gs-hint">Searching…</div>';

    try {
      const [patients, doctors, appts] = await Promise.all([
        DB.tables.patients.all(),
        DB.tables.doctors.all(),
        DB.tables.appointments.all()
      ]);

      const ptHits = patients.filter(p =>
        (p.full_name||'').toLowerCase().includes(q) ||
        (p.phone||'').includes(q) ||
        (p.patient_no||'').toLowerCase().includes(q)
      ).slice(0, 6);

      const drHits = doctors.filter(d =>
        (d.full_name||'').toLowerCase().includes(q) ||
        (d.specialty||'').toLowerCase().includes(q)
      ).slice(0, 4);

      const ptMap = Object.fromEntries(patients.map(p => [p.id, p.full_name]));
      const drMap = Object.fromEntries(doctors.map(d => [d.id, d.full_name]));

      const apHits = appts.filter(a =>
        (ptMap[a.patient_id]||'').toLowerCase().includes(q) ||
        (drMap[a.doctor_id]||'').toLowerCase().includes(q) ||
        (a.treatment_type||'').toLowerCase().includes(q) ||
        (a.date||'').includes(q)
      ).slice(0, 5);

      const total = ptHits.length + drHits.length + apHits.length;
      if (total === 0) {
        resultsEl.innerHTML = '<div class="gs-hint">No results found</div>';
        return;
      }

      let html = '';

      if (ptHits.length) {
        html += '<div class="gs-section-title">Patients</div>';
        html += ptHits.map(p => `
          <div class="gs-item" onclick="GlobalSearch.goPatient(${p.id})">
            <div class="gs-item-icon">👤</div>
            <div class="gs-item-body">
              <div class="gs-item-name">${p.full_name}</div>
              <div class="gs-item-sub">${p.patient_no || ''} · ${p.phone || ''}</div>
            </div>
            <div class="gs-item-arrow">→</div>
          </div>`).join('');
      }

      if (drHits.length) {
        html += '<div class="gs-section-title">Doctors</div>';
        html += drHits.map(d => `
          <div class="gs-item" onclick="GlobalSearch.goDoctor(${d.id})">
            <div class="gs-item-icon">⚕️</div>
            <div class="gs-item-body">
              <div class="gs-item-name">${d.full_name}</div>
              <div class="gs-item-sub">${d.specialty || ''}</div>
            </div>
            <div class="gs-item-arrow">→</div>
          </div>`).join('');
      }

      if (apHits.length) {
        html += '<div class="gs-section-title">Appointments</div>';
        html += apHits.map(a => `
          <div class="gs-item" onclick="GlobalSearch.goAppointment(${a.id})">
            <div class="gs-item-icon">📅</div>
            <div class="gs-item-body">
              <div class="gs-item-name">${ptMap[a.patient_id] || 'Unknown'}</div>
              <div class="gs-item-sub">${a.date} · ${a.treatment_type || ''} · ${drMap[a.doctor_id] || ''}</div>
            </div>
            <div class="gs-item-arrow">→</div>
          </div>`).join('');
      }

      resultsEl.innerHTML = html;
    } catch(e) {
      resultsEl.innerHTML = '<div class="gs-hint">Error searching — please try again</div>';
    }
  },

  goPatient(id) {
    this.close();
    App.page('patients').then(() => {
      setTimeout(() => Modals.viewPatient(id), 300);
    });
  },
  goDoctor(id) {
    this.close();
    App.page('doctors').then(() => {
      setTimeout(() => Modals.viewDoctor(id), 300);
    });
  },
  goAppointment(id) {
    this.close();
    App.page('appointments').then(() => {
      setTimeout(() => Modals.viewAppointmentDetail(id), 300);
    });
  }
};

/* ══════════════════════════════════════════════════════
   3. KEYBOARD SHORTCUTS
   ══════════════════════════════════════════════════════ */
const KeyShortcuts = {
  /* Maps keyboard key → { page: pageId, action: actionId } or { fn: callable }
     For page shortcuts: both 'page' (nav item must be visible) and optional
     'action' (e.g. 'add' for the new-appointment shortcut) are checked.      */
  _map: {
    'd': { page: 'dashboard' },
    'p': { page: 'patients' },
    'a': { page: 'appointments' },
    'f': { page: 'finance' },
    'w': { page: 'waiting' },
    'i': { page: 'inventory' },
    'n': { page: 'appointments', action: 'add', fn: () => Modals.newAppointment() },
    '/': { fn: () => GlobalSearch.open() },
    'Escape': { fn: () => {
      GlobalSearch.close();
      document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    }}
  },

  /**
   * Returns true if the current user is allowed to use this shortcut.
   * Admins always pass. For non-admins we check:
   *   1. If 'page' is set — the nav item for that page must be visible
   *      (PageAccessEnforcer already hides it when access is denied).
   *   2. If 'action' is also set — PageAccessEnforcer.can() must return true.
   */
  _isAllowed(descriptor) {
    // No page restriction → always allowed (e.g. '/' search, Escape)
    if (!descriptor.page) return true;

    const session = DB.auth.current();
    // Admins bypass everything
    if (!session || session.role === 'admin') return true;

    // Check nav visibility — the enforcer already set display:none for blocked pages
    const navEl = document.querySelector(`[data-page="${descriptor.page}"]`);
    if (navEl && navEl.style.display === 'none') return false;

    // If there's a specific action (e.g. 'add' for new appointment), check that too
    if (descriptor.action) {
      const allowed = PageAccessEnforcer.can(session.id, session.role, descriptor.page, descriptor.action);
      if (!allowed) return false;
    }

    return true;
  },

  init() {
    document.addEventListener('keydown', e => {
      /* ignore if typing in an input / textarea / select */
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        const esc = this._map['Escape'];
        if (e.key === 'Escape' && esc?.fn) esc.fn();
        return;
      }

      const descriptor = this._map[e.key.toLowerCase()] || this._map[e.key];
      if (!descriptor) return;

      // Permission gate
      if (!this._isAllowed(descriptor)) return;

      e.preventDefault();

      // Execute: if a custom fn is provided use it, otherwise navigate to the page
      if (descriptor.fn) {
        descriptor.fn();
      } else if (descriptor.page) {
        App.page(descriptor.page);
      }
    });
  }
};

/* ══════════════════════════════════════════════════════
   4. PATIENT RATING SYSTEM
   ══════════════════════════════════════════════════════ */
const Ratings = {
  /* Called after treatment is confirmed — shows star modal */
  prompt(patientName, doctorId, appointmentId) {
    const overlay = document.getElementById('ratingOverlay');
    if (!overlay) return;
    overlay.dataset.doctorId = doctorId;
    overlay.dataset.appointmentId = appointmentId;
    document.getElementById('ratingPatientName').textContent = patientName;
    this._setStars(0);
    overlay.classList.add('rating-visible');
  },

  _setStars(n) {
    document.querySelectorAll('.rating-star').forEach((s, i) => {
      s.classList.toggle('active', i < n);
      s.dataset.val = i + 1;
    });
    const submitBtn = document.getElementById('ratingSubmitBtn');
    if (submitBtn) submitBtn.disabled = n === 0;
    this._selected = n;
  },

  hoverStar(n) {
    document.querySelectorAll('.rating-star').forEach((s, i) => {
      s.classList.toggle('hover', i < n);
    });
  },

  clearHover() {
    document.querySelectorAll('.rating-star').forEach(s => s.classList.remove('hover'));
  },

  async submit() {
    const overlay = document.getElementById('ratingOverlay');
    const doctorId = parseInt(overlay.dataset.doctorId);
    const apptId   = parseInt(overlay.dataset.appointmentId);
    const score    = this._selected || 0;
    if (!score) return;

    try {
      const key = `rating_appt_${apptId}`;
      await DB.settings.save({ [key]: JSON.stringify({ doctorId, apptId, score, ts: Date.now() }) });
      overlay.classList.remove('rating-visible');
      toast(`Thank you! ${score} ⭐ saved`, 'success');
    } catch(e) {
      overlay.classList.remove('rating-visible');
    }
  },

  skip() {
    document.getElementById('ratingOverlay')?.classList.remove('rating-visible');
  },

  /** Get average rating for a doctor from stored settings keys */
  async getDoctorRating(doctorId) {
    try {
      const settingsObj = await DB.settings.get();
      const rows = Object.entries(settingsObj)
        .filter(([k]) => k.startsWith('rating_appt_'))
        .map(([, v]) => { try { return JSON.parse(v); } catch(e) { return null; } })
        .filter(r => r && r.doctorId === doctorId);
      const ratings = rows;
      if (!ratings.length) return null;
      const avg = ratings.reduce((s, r) => s + r.score, 0) / ratings.length;
      return { avg: Math.round(avg * 10) / 10, count: ratings.length };
    } catch(e) { return null; }
  },

  starsHtml(avg) {
    if (avg === null || avg === undefined) return '<span style="color:var(--text3);font-size:.75rem">No ratings yet</span>';
    const full = Math.floor(avg);
    const half = avg - full >= 0.4;
    let html = '';
    for (let i = 1; i <= 5; i++) {
      if (i <= full) html += '<span style="color:#ffd166">★</span>';
      else if (i === full + 1 && half) html += '<span style="color:#ffd166">½</span>';
      else html += '<span style="color:var(--text3)">★</span>';
    }
    return `<span style="font-size:.8rem">${html} <span style="color:var(--text2)">${avg}</span></span>`;
  }
};

/* ══════════════════════════════════════════════════════
   5. IN-APP NOTIFICATIONS
   ══════════════════════════════════════════════════════ */
const Notifications = {
  _items: [],
  _unread: 0,

  async refresh() {
    this._items = [];

    try {
      const [inv, appts, installments, patients] = await Promise.all([
        DB.tables.inventory.all(),
        DB.tables.appointments.all(),
        DB.tables.installments ? DB.tables.installments.all().catch(() => []) : Promise.resolve([]),
        DB.tables.patients.all()
      ]);

      const ptMap = Object.fromEntries(patients.map(p => [p.id, p.full_name]));
      const todayStr = new Date().toISOString().split('T')[0];
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      /* Low stock alerts */
      inv.filter(i => i.quantity <= i.min_stock).forEach(i => {
        this._items.push({
          id: `low_${i.id}`,
          type: 'warning',
          icon: '📦',
          title: 'Low Stock',
          body: `${i.item_name} — only ${i.quantity} left (min: ${i.min_stock})`,
          action: () => App.page('inventory'),
          ts: Date.now()
        });
      });

      /* Tomorrow's appointments */
      const tomorrowAppts = appts.filter(a => a.date === tomorrowStr && a.status !== 'cancelled');
      if (tomorrowAppts.length) {
        this._items.push({
          id: 'appts_tomorrow',
          type: 'info',
          icon: '📅',
          title: `${tomorrowAppts.length} appointment${tomorrowAppts.length > 1 ? 's' : ''} tomorrow`,
          body: tomorrowAppts.slice(0, 3).map(a => ptMap[a.patient_id] || 'Patient').join(', ') + (tomorrowAppts.length > 3 ? '…' : ''),
          action: () => App.page('appointments'),
          ts: Date.now()
        });
      }

      /* Overdue installments */
      if (installments.length) {
        const overdue = installments.filter(i => i.status === 'pending' && i.due_date && i.due_date < todayStr);
        if (overdue.length) {
          this._items.push({
            id: 'overdue_installments',
            type: 'danger',
            icon: '💳',
            title: `${overdue.length} overdue payment plan${overdue.length > 1 ? 's' : ''}`,
            body: 'Some payment plans have passed their due date',
            action: () => App.page('installments'),
            ts: Date.now()
          });
        }
      }

      /* Today's unconfirmed appointments */
      const unconfirmed = appts.filter(a => a.date === todayStr && a.status === 'scheduled');
      if (unconfirmed.length) {
        this._items.push({
          id: 'unconfirmed_today',
          type: 'info',
          icon: '⏰',
          title: `${unconfirmed.length} unconfirmed appointment${unconfirmed.length > 1 ? 's' : ''} today`,
          body: 'Some of today\'s appointments are still in "scheduled" status',
          action: () => App.page('appointments'),
          ts: Date.now()
        });
      }

    } catch(e) { console.warn('[Notifications] refresh error', e); }

    this._unread = this._items.length;
    this._updateBadge();
    return this._items;
  },

  _updateBadge() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    badge.textContent = this._unread;
    badge.style.display = this._unread > 0 ? '' : 'none';
  },

  toggle() {
    const panel = document.getElementById('notifPanel');
    if (!panel) return;
    const isOpen = panel.classList.toggle('notif-open');
    if (isOpen) {
      this._unread = 0;
      this._updateBadge();
      this._renderPanel();
    }
  },

  closePanel() {
    document.getElementById('notifPanel')?.classList.remove('notif-open');
  },

  _renderPanel() {
    const list = document.getElementById('notifList');
    if (!list) return;
    if (!this._items.length) {
      list.innerHTML = '<div class="notif-empty">🎉 All clear — no alerts</div>';
      return;
    }
    list.innerHTML = this._items.map(n => `
      <div class="notif-item notif-${n.type}" onclick="Notifications._handleClick('${n.id}')">
        <div class="notif-icon">${n.icon}</div>
        <div class="notif-body">
          <div class="notif-title">${n.title}</div>
          <div class="notif-desc">${n.body}</div>
        </div>
      </div>`).join('');
  },

  _handleClick(id) {
    const item = this._items.find(n => n.id === id);
    if (item?.action) { this.closePanel(); item.action(); }
  },

  /** Auto-refresh every 5 minutes */
  startPolling() {
    this.refresh();
    setInterval(() => this.refresh(), 5 * 60 * 1000);
  }
};

/* ══════════════════════════════════════════════════════
   6. EMAIL REPORTS  (monthly PDF-style summary via mailto)
   ══════════════════════════════════════════════════════ */
const EmailReports = {
  async generate() {
    try {
      const [tx, patients, appts, doctors] = await Promise.all([
        DB.tables.transactions.all(),
        DB.tables.patients.all(),
        DB.tables.appointments.all(),
        DB.tables.doctors.all()
      ]);

      const now   = new Date();
      const month = now.toLocaleString('en-EG', { month: 'long', year: 'numeric' });
      const income  = tx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const expense = tx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      const net     = income - expense;

      /* treatments this month */
      const mo = now.getMonth(), yr = now.getFullYear();
      const monthAppts = appts.filter(a => {
        const d = new Date(a.date);
        return d.getMonth() === mo && d.getFullYear() === yr;
      });

      /* top doctor */
      const drCounts = {};
      monthAppts.forEach(a => { drCounts[a.doctor_id] = (drCounts[a.doctor_id] || 0) + 1; });
      const topDrId  = Object.entries(drCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      const topDr    = doctors.find(d => d.id == topDrId)?.full_name || '—';

      /* new patients this month */
      const newPt = patients.filter(p => {
        const d = new Date(p.created_at || p.date || 0);
        return d.getMonth() === mo && d.getFullYear() === yr;
      }).length;

      const subject = encodeURIComponent(`DentCare Pro — Monthly Report ${month}`);
      const body = encodeURIComponent(
`DentCare Pro — Monthly Report
${month}
${'─'.repeat(40)}

FINANCIAL SUMMARY
  Total Revenue  : E£ ${income.toLocaleString()}
  Total Expenses : E£ ${expense.toLocaleString()}
  Net Profit     : E£ ${net.toLocaleString()}

CLINIC ACTIVITY
  Appointments this month : ${monthAppts.length}
  New patients            : ${newPt}
  Top doctor              : ${topDr}

INVENTORY
  Total patients on record : ${patients.length}
  Total doctors            : ${doctors.length}

${'─'.repeat(40)}
Generated by DentCare Pro on ${now.toLocaleString('en-EG')}
`);

      /* open default mail client */
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
      toast('Email client opened with monthly report ✓', 'success');
    } catch(e) {
      toast('Failed to generate report', 'error');
      console.error(e);
    }
  }
};

/* ══════════════════════════════════════════════════════
   INIT — wire everything up after DOM is ready
   ══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  Theme.init(typeof DB !== 'undefined' ? DB.auth.current()?.username : null);
  KeyShortcuts.init();
  Notifications.startPolling();

  /* close notif panel when clicking outside */
  document.addEventListener('click', e => {
    const panel = document.getElementById('notifPanel');
    const btn   = document.getElementById('notifBtn');
    if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
      Notifications.closePanel();
    }
  });

  /* close global search on overlay-click */
  document.getElementById('globalSearchOverlay')?.addEventListener('click', e => {
    if (e.target.id === 'globalSearchOverlay') GlobalSearch.close();
  });

  /* search input debounce */
  let _gsTimer;
  document.getElementById('globalSearchInput')?.addEventListener('input', e => {
    clearTimeout(_gsTimer);
    _gsTimer = setTimeout(() => GlobalSearch.search(e.target.value), 220);
  });
});

/* ══════════════════════════════════════════════════════
   AUTO WHATSAPP REMINDER — 2h before appointments
   ══════════════════════════════════════════════════════ */
const AutoReminder = {
  _sentKeys: new Set(), // track sent reminders in this session
  _timer: null,

  start() {
    // Check every 60 seconds
    this._timer = setInterval(() => this._check(), 60_000);
    this._check(); // run immediately on login
  },

  stop() {
    if (this._timer) clearInterval(this._timer);
  },

  async _check() {
    try {
      const settings = window._clinicSettings;
      if (!settings?.clinic?.whatsapp) return; // only run if WA number is set

      const now      = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const appts    = await DB.tables.appointments.all();

      // Filter: today, scheduled/confirmed, not cancelled/completed
      const upcoming = appts.filter(a =>
        a.date === todayStr &&
        (a.status === 'scheduled' || a.status === 'confirmed')
      );

      if (!upcoming.length) return;

      const patients = await DB.tables.patients.all();
      const doctors  = await DB.tables.doctors.all();
      const ptMap    = Object.fromEntries(patients.map(p => [p.id, p]));
      const dcMap    = Object.fromEntries(doctors.map(d  => [d.id, d]));

      for (const appt of upcoming) {
        const key = `reminder_${appt.id}_${todayStr}`;
        if (this._sentKeys.has(key)) continue;

        // Parse appointment time
        const [hh, mm] = (appt.time || '00:00').split(':').map(Number);
        const apptTime = new Date(now);
        apptTime.setHours(hh, mm, 0, 0);

        const diffMs   = apptTime - now;
        const diffMins = diffMs / 60_000;

        // Send if within 2h–1h55m window (5-min window to avoid spam)
        if (diffMins >= 115 && diffMins <= 120) {
          const patient = ptMap[appt.patient_id];
          const doctor  = dcMap[appt.doctor_id];
          if (!patient?.phone) continue;

          this._sentKeys.add(key);

          // Send reminder
          const clinicName = document.querySelector('.brand-name')?.textContent || 'DentCare Pro';
          let phone = patient.phone.replace(/\D/g, '');
          if (phone.startsWith('0')) phone = '20' + phone.slice(1);
          if (!phone.startsWith('20') && phone.length === 10) phone = '20' + phone;

          const isAr = document.body.classList.contains('lang-ar');
          const msg  = isAr
            ? `مرحباً ${patient.full_name},\n\nتذكير تلقائي من ${clinicName} 🦷\n\nموعدك بعد ساعتين:\n📅 ${appt.date}\n🕐 ${appt.time}\n👨‍⚕️ ${doctor?.full_name || '—'}\n\nيرجى الحضور قبل 10 دقائق.`
            : `Hello ${patient.full_name},\n\n⏰ Automated reminder from ${clinicName} 🦷\n\nYour appointment is in 2 hours:\n📅 ${appt.date}\n🕐 ${appt.time}\n👨‍⚕️ ${doctor?.full_name || '—'}\n\nPlease arrive 10 minutes early.`;

          const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
          window.open(url, '_blank');

          toast(`📱 Auto-reminder sent to ${patient.full_name} (${appt.time})`, 'success');
        }
      }
    } catch(e) {
      console.warn('[AutoReminder]', e.message);
    }
  }
};

