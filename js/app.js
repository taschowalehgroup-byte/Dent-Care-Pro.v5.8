/* ═══════════════════════════════════════════════════════
   DentCare Pro — Main Application Controller
   Loads after: api.js, ui.js, pages/*.js, modals.js, actions.js
   ═══════════════════════════════════════════════════════ */

/* ── Translation Utility ────────────────────────────── */
const I18n = {
  _data: null,
  _lang: 'en',

  async load() {
    try {
      const res   = await fetch('https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/database/JSON/translation.json');
      this._data  = await res.json();
    } catch(e) {
      console.warn('I18n: could not load translation.json', e);
      this._data = {};
    }
  },

  setLang(lang) {
    this._lang = lang || 'en';
  },

  getLang() {
    if (document.body.classList.contains('lang-ar')) return 'ar';
    return 'en';
  },

  /**
   * Get a translated string.
   * @param {string} section  e.g. 'nav', 'buttons', 'status_values'
   * @param {string} key      e.g. 'dashboard', 'cancel'
   * @param {string} [lang]   override language (defaults to current UI lang)
   * @returns {string}
   */
  t(section, key, lang) {
    const l = lang || this.getLang();
    try {
      return this._data[section][key][l]
          || this._data[section][key]['en']
          || key;
    } catch(e) { return key; }
  }
};

/* ── Pages Registry (maps page name → module) ──────── */
const Pages = {
  waiting:        WaitingPage,
  dashboard:      DashboardPage,
  patients:       PatientsPage,
  appointments:   AppointmentsPage,
  doctors:        DoctorsPage,
  finance:        FinancePage,
  inventory:      InventoryPage,
  passwords:      PasswordsPage,
  messages:       MessagesPage,
  calendar:       CalendarPage,
  treatments:     TreatmentsPage,
  settings:       SettingsPage,
  analytics:      AnalyticsPage,
  discount_codes: DiscountCodesPage,
  backup:         BackupPage,
  commissions:    CommissionsPage,
  installments:   InstallmentsPage,
  recip:           RecipPage,
  abilities:       AbilitiesPage,
  prescription:    PrescriptionPage,
  dental_chart:    DentalChart,
  page_access:     PageAccessPage
};

/* ── App Controller ────────────────────────────────── */
const App = {
  currentPage: 'dashboard',

  async login() {
    const u = $('loginUser').value.trim();
    const p = $('loginPass').value.trim();
    
    const btn = document.querySelector('.btn-login');
    const ogText = btn.textContent;
    btn.textContent = 'Logging in...';
    btn.disabled = true;

    try {
      const session = await DB.auth.login(u, p);
      if (!session) { $('loginErr').classList.remove('hidden'); return }
      $('loginErr').classList.add('hidden');
      $('loginScreen').classList.remove('active');
      $('appScreen').classList.add('active');
      $('sidebarName').textContent = session.username;
      $('sidebarAvatar').textContent = session.username.charAt(0).toUpperCase();
      App._applyRoleRestrictions(session);
      // Load page access permissions — wrapped so it never crashes login
      try {
        await PageAccessEnforcer.load();
        PageAccessEnforcer.applyNavVisibility(session);
      } catch(e) { console.warn('[PageAccess] load failed:', e.message); }
      /* Apply saved theme + branding on login */
      try {
        const settData = await DB.settings.get();
        const appearance = settData?.appearance || {};
        // Apply global theme first, then override with per-user preference
        if (typeof Theme !== 'undefined' && appearance.theme) Theme.apply(appearance.theme);
        try {
          const userTheme = localStorage.getItem(`dc_theme_${session.username}`);
          if (userTheme && typeof Theme !== 'undefined') Theme.apply(userTheme);
        } catch(e) {}
        if (appearance.accentColor) document.documentElement.style.setProperty('--accent', appearance.accentColor);
        App.applyBranding(settData?.clinic || {});
        // Cache settings globally for WA reminders etc
        window._clinicSettings = settData;
      } catch(e) { /* use defaults */ }
      startClock();
      if (typeof AutoReminder !== 'undefined') AutoReminder.start();
      await App.page('dashboard');
      toast(`Welcome back, ${session.username}!`, 'success');
      // Check follow-up reminders after a short delay
      setTimeout(() => Modals.checkFollowUps(), 2000);
    } finally {
      btn.textContent = ogText;
      btn.disabled = false;
    }
  },

  /* ── Apply clinic name + logo everywhere ─────────────────────── */
  applyBranding(clinic = {}) {
    const name = clinic.name?.trim() || 'DentCare Pro';
    const logo = clinic.logo || '';           // base64 or URL

    /* 1 — Sidebar brand name */
    const brandNameEl = document.querySelector('.brand-name');
    if (brandNameEl) {
      // Bold the last word like "DentCare<b>Pro</b>"
      brandNameEl.innerHTML = name.replace(/(\S+)\s*$/, '<b>$1</b>');
    }

    /* 2 — Sidebar brand icon: replace 🦷 with logo if available */
    const brandIconEl = document.querySelector('.brand-icon');
    if (brandIconEl) {
      if (logo) {
        brandIconEl.innerHTML = `<img src="${logo}" alt="logo"
          style="width:36px;height:36px;object-fit:contain;border-radius:8px;">`;
      } else {
        brandIconEl.textContent = '🦷';
      }
    }

    /* 3 — Login page logo icon */
    const loginIconEl = document.querySelector('.logo-icon');
    if (loginIconEl) {
      if (logo) {
        loginIconEl.innerHTML = `<img src="${logo}" alt="logo"
          style="width:64px;height:64px;object-fit:contain;border-radius:12px;">`;
      } else {
        loginIconEl.textContent = '🦷';
      }
    }

    /* 4 — Login page title */
    const loginTitleEl = document.querySelector('.login-logo h1');
    if (loginTitleEl) {
      loginTitleEl.innerHTML = name.replace(/(\S+)\s*$/, '<span>$1</span>');
    }

    /* 5 — Browser tab title */
    document.title = `${name} — Advanced Dental Management`;
  },

  logout() {
    DB.auth.logout();
    $('appScreen').classList.remove('active');
    $('loginScreen').classList.add('active');
    toast('Logged out successfully', 'info');
  },

  async page(name) {
    /* ── Page leave animation ── */
    const leaving = document.querySelector('.page-content.active');
    if (leaving && leaving.id !== `pg-${name}`) {
      leaving.classList.add('page-leaving');
      await new Promise(r => setTimeout(r, 160));
      leaving.classList.remove('page-leaving', 'active');
    } else {
      document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
    }
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    const pageEl = $(`pg-${name}`);
    if (pageEl) {
      // Re-trigger entrance animation by resetting it
      pageEl.style.animation = 'none';
      pageEl.classList.add('active');
      // Force reflow so the animation restarts cleanly
      void pageEl.offsetWidth;
      pageEl.style.animation = '';
    }
    
    const navItem = document.querySelector(`[data-page="${name}"]`);
    if (navItem) navItem.classList.add('active');
    
    const titles = {
      discount_codes: 'Discount Codes', backup: 'Backup & Restore',
      commissions: 'Doctor Commissions', installments: 'Payment Plans',
      waiting: 'Waiting Room', recip: 'Receipts', prescription: 'Prescriptions',
      abilities: 'Abilities'
    };
    const arTitles = {
      dashboard: 'لوحة التحكم', patients: 'المرضى', appointments: 'المواعيد',
      treatments: 'العلاجات', doctors: 'الأطباء', finance: 'المالية',
      inventory: 'المخزون', analytics: 'التحليلات', settings: 'الإعدادات',
      waiting: 'غرفة الانتظار', calendar: 'التقويم', commissions: 'العمولات',
      installments: 'خطط الدفع', passwords: 'كلمات المرور', messages: 'الرسائل',
      backup: 'النسخ الاحتياطي', discount_codes: 'أكواد الخصم',
      recip: 'الإيصالات', prescription: 'الوصفات الطبية', abilities: 'الصلاحيات'
    };
    const isAr = document.body.classList.contains('lang-ar');
    const titleEl = $('pageTitle');
    if (titleEl) {
      if (isAr && arTitles[name]) {
        titleEl.textContent = arTitles[name];
      } else {
        titleEl.textContent = titles[name] || name.charAt(0).toUpperCase() + name.slice(1);
      }
    }
    App.currentPage = name;
    
    if (Pages[name]?.render) {
      await Pages[name].render();
    }

    // Populate commission doctor dropdown on first visit
    if (name === 'commissions' && $('cm_doctor')) {
      const doctors = await DB.tables.doctors.all();
      const sel = $('cm_doctor');
      if (sel.options.length <= 1) {
        doctors.forEach(d => {
          const opt = document.createElement('option');
          opt.value = d.id;
          opt.textContent = d.full_name;
          sel.appendChild(opt);
        });
      }
    }

    await UI.updateBadges();
  },

  toggleSidebar() {
    const sidebar = $('sidebar');
    if (window.innerWidth <= 768) {
      /* Mobile: slide in/out overlay */
      sidebar.classList.toggle('open');
    } else {
      /* Desktop: collapse/expand by width */
      sidebar.classList.toggle('collapsed');
    }
  },

  /* ── Role-based UI restrictions ─────────────────────── */
  _applyRoleRestrictions(session) {
    const role = session?.role || '';

    // Pages hidden per role
    const roleHiddenPages = {
      doctor:       ['finance', 'inventory', 'analytics', 'doctors', 'settings', 'passwords', 'messages'],
      receptionist: ['finance', 'analytics', 'passwords', 'messages'],
      hygienist:    ['finance', 'analytics', 'passwords', 'messages', 'doctors'],
      assistant:    ['finance', 'analytics', 'passwords', 'messages', 'doctors'],
      accountant:   ['patients', 'appointments', 'calendar', 'treatments', 'doctors', 'passwords'],
      manager:      ['passwords']
    };

    // First reset — show everything
    document.querySelectorAll('.nav-item').forEach(el => el.style.display = '');

    const hidden = roleHiddenPages[role] || [];
    hidden.forEach(page => {
      const el = document.querySelector(`[data-page="${page}"]`);
      if (el) el.style.display = 'none';
    });

    // Admin-only items: only admin sees them
    if (role !== 'admin') {
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    }

    // Show a role label in the sidebar next to the name
    const drLabel = role === 'doctor' && session.doctor_id
      ? ` — Dr. #${session.doctor_id}` : '';
    const roleEl = $('sidebarRole');
    if (roleEl) roleEl.textContent = (role ? role.charAt(0).toUpperCase() + role.slice(1) : '') + drLabel;
  },

  forgotPassword() {
    const select   = $('loginUser');
    const username = select?.value?.trim();
    if (!username) { toast('Please select your username first', 'warning'); return; }

    // Show a self-service reset dialog
    const html = `
    <div id="forgotPwModal" style="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center">
      <div style="background:var(--surface,#1e1e2e);border:1px solid var(--border,#333);border-radius:14px;padding:2rem;width:340px;max-width:95vw;box-shadow:0 20px 60px rgba(0,0,0,.5)">
        <h3 style="margin:0 0 .5rem;color:var(--text,#fff)">🔑 Password Reset</h3>
        <p style="font-size:.85rem;color:var(--text2,#aaa);margin-bottom:1.25rem">
          A reset token will be generated for <strong>${username}</strong>. 
          Show it to the admin, who will use it to set a new password.
        </p>
        <div id="fpResult"></div>
        <div style="display:flex;gap:.75rem;margin-top:1rem">
          <button onclick="$('forgotPwModal').remove()" style="flex:1;padding:.6rem;border-radius:8px;border:1px solid var(--border,#333);background:transparent;color:var(--text,#fff);cursor:pointer">Cancel</button>
          <button id="fpSubmitBtn" onclick="App._submitForgotPw('${username}')" style="flex:2;padding:.6rem;border-radius:8px;border:none;background:#7c3aed;color:#fff;font-weight:600;cursor:pointer">Generate Token</button>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  },

  async _submitForgotPw(username) {
    const btn = $('fpSubmitBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
    try {
      const data = await DB.authExtended.requestReset(username);
      const fpResult = $('fpResult');
      if (data.success && fpResult) {
        fpResult.innerHTML = `
          <div style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);border-radius:8px;padding:.75rem;text-align:center">
            <div style="font-size:.8rem;color:var(--text2,#aaa);margin-bottom:.35rem">Your reset token (valid 1 hour):</div>
            <div style="font-size:2rem;font-weight:700;letter-spacing:.25em;color:#22c55e">${data.token}</div>
            <div style="font-size:.75rem;color:var(--text2,#aaa);margin-top:.35rem">Show this to your administrator to reset your password.</div>
          </div>
          <div style="margin-top:.75rem">
            <label style="font-size:.8rem;color:var(--text2,#aaa)">New Password (enter after admin approves):</label>
            <input id="fpNewPass" type="password" placeholder="New password…" style="width:100%;margin-top:.35rem;padding:.5rem;border-radius:8px;border:1px solid var(--border,#333);background:var(--surface2,#2a2a3e);color:var(--text,#fff)">
          </div>
          <button onclick="App._confirmPasswordReset('${username}','${data.token}')" style="width:100%;margin-top:.75rem;padding:.6rem;border-radius:8px;border:none;background:#7c3aed;color:#fff;font-weight:600;cursor:pointer">✓ Set New Password</button>`;
        if (btn) btn.style.display = 'none';
      } else {
        if (fpResult) fpResult.innerHTML = `<p style="color:#ef4444;font-size:.85rem">${data.error || 'Failed to generate token'}</p>`;
        if (btn) { btn.disabled = false; btn.textContent = 'Try Again'; }
      }
    } catch(e) {
      if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
      toast('Network error — is the server running?', 'error');
    }
  },

  async _confirmPasswordReset(username, token) {
    const newPass = $('fpNewPass')?.value?.trim();
    if (!newPass || newPass.length < 4) { toast('Password must be at least 4 characters', 'warning'); return; }
    try {
      const data = await DB.authExtended.resetPassword(username, token, newPass);
      if (data.success) {
        $('forgotPwModal')?.remove();
        toast('Password reset successfully! Please log in.', 'success');
      } else {
        toast(data.error || 'Reset failed — token may have expired', 'error');
      }
    } catch(e) { toast('Network error', 'error'); }
  },
};

/* ── Keyboard Shortcuts ────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') Modals.close();
  if ($('loginScreen').classList.contains('active') && e.key === 'Enter') App.login();
});

/* ── Populate Username Dropdown via API ── */
document.addEventListener('DOMContentLoaded', async () => {
  // Load translations async — don't block login UI on this
  I18n.load().catch(() => {});

  // Apply saved branding (name + logo) immediately on the login page
  try {
    const settData = await DB.settings.get();
    App.applyBranding(settData?.clinic || {});
  } catch(e) { /* use defaults */ }

  const select = $('loginUser');

  // Fallback list — matches real DB seed usernames exactly
  const FALLBACK = [
    {v:'admin',        r:'admin',        name:null},
    {v:'manager',      r:'manager',      name:null},
    {v:'doctor1',      r:'doctor',       name:null},
    {v:'doctor2',      r:'doctor',       name:null},
    {v:'doctor3',      r:'doctor',       name:null},
    {v:'doctor4',      r:'doctor',       name:null},
    {v:'doctor5',      r:'doctor',       name:null},
    {v:'hygienist',    r:'hygienist',    name:null},
    {v:'assistant',    r:'assistant',    name:null},
    {v:'receptionist', r:'receptionist', name:null},
    {v:'accountant',   r:'accountant',   name:null}
  ];

  function populateDropdown(list) {
    select.innerHTML = '<option value="">— Select username —</option>';
    list.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.v || u.username;
      const role = u.r || u.role;
      const name = u.name || null;
      if (role === 'doctor' && name) {
        opt.textContent = `${opt.value}  —  ${name}`;
      } else {
        opt.textContent = `${opt.value}  (${role})`;
      }
      select.appendChild(opt);
    });
  }

  // Populate immediately with fallback, then try to refresh from API
  populateDropdown(FALLBACK);

  try {
    // Use the API — not raw JSON file paths — to get users + doctors
    const [users, doctors] = await Promise.all([
      DB.tables.users.all(),
      DB.tables.doctors.all()
    ]);
    const doctorMap = Object.fromEntries(doctors.map(d => [d.id, d.full_name]));
    const enriched  = users.map(u => ({
      v:    u.username,
      r:    u.role,
      name: u.role === 'doctor' && u.doctor_id ? doctorMap[u.doctor_id] : null
    }));
    populateDropdown(enriched);
  } catch(e) {
    // Fallback already shown — leave it in place
  }

  // Restore last session username
  const session = DB.auth.current();

  // ── Restore language preference (EN / AR) ──
  const savedLang = localStorage.getItem('dentcare_lang');
  if (savedLang === 'ar') {
    document.body.classList.add('lang-ar');
    document.documentElement.dir = 'rtl';
    document.querySelectorAll('[data-ar]').forEach(el => { el.textContent = el.dataset.ar || el.dataset.en; });
    const btn = document.getElementById('langToggleBtn');
    if (btn) btn.textContent = '🌐 EN';
  } else {
    // If somehow 'fr' was saved from an older session, reset to EN
    if (savedLang === 'fr') localStorage.setItem('dentcare_lang', 'en');
    document.body.classList.remove('lang-ar', 'lang-fr');
    document.documentElement.dir = 'ltr';
    const btn = document.getElementById('langToggleBtn');
    if (btn) btn.textContent = '🌐 AR';
  }
  if (session) {
    select.value = session.username;

    // ── Auto-restore session (fixes logout-on-refresh bug) ──
    // If we have a valid saved session, skip the login screen entirely
    // and bring the user straight back into the app.
    try {
      $('loginScreen').classList.remove('active');
      $('appScreen').classList.add('active');
      $('sidebarName').textContent = session.username;
      $('sidebarAvatar').textContent = session.username.charAt(0).toUpperCase();
      App._applyRoleRestrictions(session);
      try {
        await PageAccessEnforcer.load();
        PageAccessEnforcer.applyNavVisibility(session);
      } catch(e) { console.warn('[PageAccess] restore load failed:', e.message); }
      /* Apply saved theme & accent on restore */
      try {
        const settData = await DB.settings.get();
        const appearance = settData?.appearance || {};
        if (typeof Theme !== 'undefined' && appearance.theme) Theme.apply(appearance.theme);
        if (appearance.accentColor) document.documentElement.style.setProperty('--accent', appearance.accentColor);
      } catch(e) { /* use defaults */ }
      startClock();
      await App.page('dashboard');
      setTimeout(() => Modals.checkFollowUps(), 2500);
    } catch(e) {
      // If restore fails for any reason, fall back to login screen
      DB.auth.logout();
      $('loginScreen').classList.add('active');
      $('appScreen').classList.remove('active');
    }
  }
});
