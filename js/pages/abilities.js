/* ═══════════════════════════════════════════════════════
   DentCare Pro — Abilities Page
   Manage which treatments each doctor can perform.
   ═══════════════════════════════════════════════════════ */

const AbilitiesPage = {
  _doctors:   [],
  _abilities: [],        // predefined list
  _map:       {},        // doctor_id → Set of abilities

  /* ── Bootstrap ──────────────────────────────────────── */
  async render() {
    await this._load();
    this._renderGrid();
  },

  async _load() {
    try {
      [this._doctors] = await Promise.all([
        DB.tables.doctors.all()
      ]);

      // Get predefined ability list
      const listData = DB.abilitiesAPI.allList();
      this._abilities = listData.abilities || [];

      // Get each doctor's abilities
      this._map = {};
      await Promise.all(this._doctors.map(async d => {
        try {
          const data = await DB.abilitiesAPI.byDoctor(d.id);
          this._map[d.id] = new Set(data.abilities || []);
        } catch(e) {
          this._map[d.id] = new Set();
        }
      }));
    } catch(e) {
      console.error('Abilities load error:', e);
      this._doctors   = [];
      this._abilities = [];
      this._map       = {};
    }
  },

  /* ── Doctor grid ────────────────────────────────────── */
  _renderGrid() {
    const el = $('abilitiesGrid');
    if (!el) return;

    if (!this._doctors.length) {
      el.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div>⚕️</div><p>No doctors found. Add a doctor first.</p></div>`;
      return;
    }

    el.innerHTML = this._doctors.map((d, i) => {
      const abilities = this._map[d.id] || new Set();
      const count     = abilities.size;
      const initials  = d.full_name.split(' ').filter(w => /^[A-Z]/.test(w)).map(w => w[0]).join('').slice(0, 2) || '?';

      // Top 3 ability tags preview
      const preview = [...abilities].slice(0, 3).map(a =>
        `<span style="background:var(--accent-faint,#ede9fe);color:var(--accent);font-size:.7rem;padding:.15rem .5rem;border-radius:4px">${a}</span>`
      ).join(' ');

      return `
        <div class="doctor-card" style="--i:${i}">
          <div class="dr-avatar">${initials}</div>
          <div class="dr-name">${d.full_name}</div>
          <div class="dr-spec">${d.specialty}</div>
          <div style="margin:.5rem 0;min-height:2.2rem;display:flex;flex-wrap:wrap;gap:.3rem;justify-content:center">
            ${count === 0
              ? `<span style="color:var(--text2);font-size:.78rem;font-style:italic">No abilities set yet</span>`
              : preview + (abilities.size > 3 ? `<span style="color:var(--text2);font-size:.7rem">+${abilities.size - 3} more</span>` : '')
            }
          </div>
          <div style="font-size:.8rem;color:var(--text2);margin-bottom:.75rem">
            ${count} / ${this._abilities.length} abilities enabled
          </div>
          <div style="background:var(--surface2);border-radius:6px;height:6px;overflow:hidden;margin-bottom:1rem">
            <div style="height:100%;width:${this._abilities.length ? Math.round(count/this._abilities.length*100) : 0}%;background:var(--accent);border-radius:6px;transition:width .4s"></div>
          </div>
          <button class="btn-primary" style="width:100%" onclick="AbilitiesPage.openEditor(${d.id})">
            ✏️ Manage Abilities
          </button>
        </div>`;
    }).join('');
  },

  /* ── Ability Editor Modal ───────────────────────────── */
  async openEditor(doctorId) {
    const doc       = this._doctors.find(d => d.id === doctorId);
    if (!doc) return;
    const selected  = this._map[doctorId] || new Set();

    // Group abilities by category
    const categories = {
      'Preventive & General':  ['General Checkup', 'Cleaning / Scaling', 'X-Ray / Diagnosis'],
      'Restorative':           ['Filling', 'Crown / Bridge', 'Dentures / Prosthetics'],
      'Surgical':              ['Extraction', 'Implant', 'Oral Surgery', 'Bone Grafting'],
      'Specialised':           ['Root Canal', 'Orthodontics', 'Gum Treatment (Periodontics)', 'Pediatric Dentistry'],
      'Cosmetic & Aesthetic':  ['Cosmetic Dentistry', 'Teeth Whitening'],
      'Other':                 ['Emergency Care', 'Sleep Apnea Treatment', 'TMJ Treatment', 'Other'],
    };

    const initials = doc.full_name.split(' ').filter(w => /^[A-Z]/.test(w)).map(w => w[0]).join('').slice(0, 2) || '?';

    document.getElementById('modalAbilityEditor')?.remove();

    const modal = document.createElement('div');
    modal.id        = 'modalAbilityEditor';
    modal.className = 'modal';
    modal.style.cssText = 'display:flex;max-width:620px;width:95%';

    const catHtml = Object.entries(categories).map(([cat, items]) => `
      <div style="margin-bottom:1.1rem">
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--accent);margin-bottom:.4rem">${cat}</div>
        <div style="display:flex;flex-wrap:wrap;gap:.4rem">
          ${items.map(ability => `
            <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;
                          background:var(--surface2);border-radius:8px;padding:.35rem .7rem;
                          border:1.5px solid ${selected.has(ability) ? 'var(--accent)' : 'transparent'};
                          transition:all .15s" id="abl_wrap_${CSS.escape(ability.replace(/[^a-z0-9]/gi,'_'))}">
              <input type="checkbox"
                     id="abl_${CSS.escape(ability.replace(/[^a-z0-9]/gi,'_'))}"
                     value="${ability}"
                     ${selected.has(ability) ? 'checked' : ''}
                     onchange="AbilitiesPage._toggleBorder(this)"
                     style="accent-color:var(--accent)">
              <span style="font-size:.83rem">${ability}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `).join('');

    modal.innerHTML = `
      <div class="modal-head">
        <div style="display:flex;align-items:center;gap:.75rem">
          <div class="dr-avatar" style="width:38px;height:38px;font-size:.9rem;flex-shrink:0">${initials}</div>
          <div>
            <h3 style="margin:0">⚕️ ${doc.full_name}</h3>
            <div style="font-size:.78rem;color:var(--text2)">${doc.specialty} — Abilities Manager</div>
          </div>
        </div>
        <button class="close-btn" onclick="Modals.close()">×</button>
      </div>
      <div class="modal-body" style="max-height:65vh;overflow-y:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:.5rem">
          <span style="font-size:.83rem;color:var(--text2)">Check all treatments this doctor is qualified to perform</span>
          <div style="display:flex;gap:.4rem">
            <button class="btn-icon" onclick="AbilitiesPage._selectAll(true)"  style="font-size:.78rem;padding:.3rem .65rem">✓ All</button>
            <button class="btn-icon" onclick="AbilitiesPage._selectAll(false)" style="font-size:.78rem;padding:.3rem .65rem">✕ None</button>
          </div>
        </div>
        ${catHtml}
      </div>
      <div class="modal-foot">
        <button class="btn-ghost" onclick="Modals.close()">Cancel</button>
        <button class="btn-primary" onclick="AbilitiesPage.saveEditor(${doctorId})">💾 Save Abilities</button>
      </div>`;

    const overlay = $('modalOverlay');
    // Clear any existing modals first
    document.querySelectorAll('#modalOverlay .modal').forEach(m => {
      if (m.dataset && m.dataset.dynamic === '1') m.remove();
      else m.style.display = 'none';
    });
    modal.dataset.dynamic = '1';
    overlay.appendChild(modal);
    overlay.classList.add('open');
  },

  _toggleBorder(checkbox) {
    const key   = checkbox.value.replace(/[^a-z0-9]/gi,'_');
    const wrap  = document.getElementById(`abl_wrap_${CSS.escape(key)}`);
    if (wrap) wrap.style.borderColor = checkbox.checked ? 'var(--accent)' : 'transparent';
  },

  _selectAll(checked) {
    document.querySelectorAll('#modalAbilityEditor input[type="checkbox"]').forEach(cb => {
      cb.checked = checked;
      this._toggleBorder(cb);
    });
  },

  async saveEditor(doctorId) {
    const checks   = document.querySelectorAll('#modalAbilityEditor input[type="checkbox"]:checked');
    const selected = [...checks].map(c => c.value);

    try {
      const data = await DB.abilitiesAPI.saveDoctor(doctorId, selected);
      if (!data.success) throw new Error(data.error || 'Save failed');

      // Update local map
      this._map[doctorId] = new Set(data.abilities);

      Modals.close();
      toast(`Abilities saved for ${this._doctors.find(d=>d.id===doctorId)?.full_name} ✓`, 'success');
      this._renderGrid();
    } catch(e) {
      toast('Error saving abilities: ' + e.message, 'error');
      console.error(e);
    }
  }
};
