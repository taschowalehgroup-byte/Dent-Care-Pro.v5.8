/* ═══════════════════════════════════════════════════════
   DentCare Pro — Treatments Page (v2)
   • Full CRUD + Excel/JSON import & export
   • Interactive dental chart — click teeth to select
   ═══════════════════════════════════════════════════════ */

const TreatmentsPage = {
  _rows:          [],
  _patients:      [],
  _doctors:       [],
  _filter:        '',
  _selectedTeeth: [],   // array of tooth numbers currently selected in modal

  async render() {
    await this._load();
    this._renderTable();
  },

  async _load() {
    try {
      const session = DB.auth.current();
      let treatPromise;
      if (session?.role === 'doctor' && session?.doctor_id) {
        treatPromise = DB.fetch(`/treatments?doctor_id=${session.doctor_id}`);
      } else {
        treatPromise = DB.tables.treatments.all();
      }
      [this._rows, this._patients, this._doctors] = await Promise.all([
        treatPromise,
        DB.tables.patients.all(),
        DB.tables.doctors.all()
      ]);
    } catch(e) { this._rows = []; }
  },

  _renderTable() {
    const body = $('treatBody');
    if (!body) return;
    let rows = this._rows;
    const q = this._filter.toLowerCase();
    if (q) {
      const ptMap = Object.fromEntries(this._patients.map(p=>[p.id,p]));
      rows = rows.filter(r =>
        (r.treatment_type||'').toLowerCase().includes(q) ||
        (ptMap[r.patient_id]?.full_name||'').toLowerCase().includes(q) ||
        (r.diagnosis||'').toLowerCase().includes(q)
      );
    }
    const ptMap = Object.fromEntries(this._patients.map(p=>[p.id,p]));
    const dcMap = Object.fromEntries(this._doctors.map(d=>[d.id,d]));

    body.innerHTML = rows.length === 0
      ? `<tr><td colspan="9"><div class="empty-state"><div>🦷</div><p>No treatments found</p></div></td></tr>`
      : rows.map(t => {
          const teeth = this._parseTeeth(t.tooth_number);
          const teethDisplay = teeth.length
            ? teeth.map(n=>`<span class="tooth-chip">${n}</span>`).join('')
            : '—';
          return `
          <tr>
            <td><strong>${ptMap[t.patient_id]?.full_name||'Unknown'}</strong></td>
            <td>${dcMap[t.doctor_id]?.full_name||'—'}</td>
            <td>${t.treatment_type}</td>
            <td style="white-space:nowrap">${teethDisplay}</td>
            <td>${t.date}</td>
            <td>${t.diagnosis||'—'}</td>
            <td><strong style="color:var(--accent)">${t.cost?Number(t.cost).toLocaleString()+' EGP':'—'}</strong></td>
            <td>${UI.statusBadge(t.status||'completed')}</td>
            <td>
              <div class="actions">
                <button class="action-btn" onclick="TreatmentsPage._viewModal(${t.id})" title="View">View</button>
                <button class="action-btn" onclick="TreatmentsPage._editModal(${t.id})" title="Edit">Edit</button>
                <button class="action-btn" onclick="Modals.printReceipt(${t.id})" title="Receipt">🧾</button>
                <button class="action-btn" onclick="Modals.printPrescription(${t.id})" title="Prescription">℞</button>
                <button class="action-btn danger" onclick="TreatmentsPage._delete(${t.id})" title="Delete">Del</button>
              </div>
            </td>
          </tr>`;
        }).join('');
  },

  // tooth_number stored as comma-separated string or single int
  _parseTeeth(val) {
    if (!val && val !== 0) return [];
    const s = String(val).trim();
    if (!s || s === '0') return [];
    return s.split(',').map(v=>parseInt(v.trim())).filter(n=>!isNaN(n)&&n>0);
  },

  search(q) { this._filter = q; this._renderTable(); },

  // ── Add / Edit Modal ──────────────────────────────────
  _addModal()       { this._openModal(null); },
  async _editModal(id) {
    const t = this._rows.find(r=>r.id===id);
    if (t) this._openModal(t);
  },

  _openModal(t) {
    // Pre-populate selected teeth
    this._selectedTeeth = this._parseTeeth(t?.tooth_number);
    this._currentPatientId = t?.patient_id || null;

    const ptOpts = this._patients.map(p=>`<option value="${p.id}" ${t?.patient_id==p.id?'selected':''}>${p.full_name}</option>`).join('');
    const dcOpts = this._doctors.map(d=>`<option value="${d.id}" ${t?.doctor_id==d.id?'selected':''}>${d.full_name}</option>`).join('');
    const statusOpts = ['in-progress','completed','pending','cancelled']
      .map(s=>`<option value="${s}" ${(t?.status||'completed')===s?'selected':''}>${s}</option>`).join('');

    const html = `
    <div id="treatModal" class="modal-overlay open" onclick="if(event.target===this)TreatmentsPage._closeModal()">
      <div class="modal" style="max-width:720px;max-height:90vh;overflow-y:auto">
        <div class="modal-head">
          <h3>${t?'Edit Treatment':'Add Treatment'}</h3>
          <button class="close-btn" onclick="TreatmentsPage._closeModal()">✕</button>
        </div>
        <div class="modal-body">

          <!-- Top fields -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.2rem">
            <div class="form-group">
              <label>Patient *</label>
              <select id="tPatient">${ptOpts}</select>
            </div>
            <div class="form-group">
              <label>Doctor</label>
              <select id="tDoctor"><option value="">— None —</option>${dcOpts}</select>
            </div>
            <div class="form-group">
              <label>Treatment Type *</label>
              <select id="tType">
                ${['Root Canal','Filling','Crown','Extraction','Implant','Orthodontics','Whitening','Cleaning','X-Ray','Consultation','Other']
                  .map(x=>`<option ${t?.treatment_type===x?'selected':''}>${x}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Date *</label>
              <input type="date" id="tDate" value="${t?.date||new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
              <label>Cost (EGP)</label>
              <input type="number" id="tCost" min="0" value="${t?.cost||0}">
            </div>
            <div class="form-group">
              <label>Status</label>
              <select id="tStatus">${statusOpts}</select>
            </div>
            <div class="form-group" style="grid-column:span 2">
              <label>Diagnosis</label>
              <input type="text" id="tDiag" value="${t?.diagnosis||''}" placeholder="Diagnosis notes">
            </div>
            <div class="form-group" style="grid-column:span 2">
              <label>Procedure Notes</label>
              <textarea id="tNotes" rows="2" style="width:100%;background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.6rem;resize:vertical">${t?.procedure_notes||''}</textarea>
            </div>
            <div class="form-group">
              <label>Prescription</label>
              <input type="text" id="tRx" value="${t?.prescription||''}" placeholder="Medications">
            </div>
            <div class="form-group">
              <label>Follow-up Date</label>
              <input type="date" id="tFollowUp" value="${t?.follow_up_date||''}">
            </div>
          </div>

          <!-- ── Dental Chart ── -->
          <div class="dental-chart-section">
            <div class="dental-chart-head">
              <span>🦷 Select Teeth</span>
              <div id="teethSelectedDisplay" class="teeth-selected-display">
                ${this._selectedTeeth.length ? this._selectedTeeth.map(n=>`<span class="tooth-chip selected">${n}</span>`).join('') : '<span style="color:var(--text2);font-size:.8rem">None selected</span>'}
              </div>
              <button class="btn-clear-teeth" onclick="TreatmentsPage._clearTeeth()">Clear</button>
            </div>
            ${this._buildDentalChart()}
          </div>

        </div>
        <div class="modal-foot">
          <button class="btn-icon" onclick="TreatmentsPage._closeModal()">Cancel</button>
          <button class="btn-icon accent" onclick="TreatmentsPage._save(${t?.id||'null'})">
            ${t?'Save Changes':'Add Treatment'}
          </button>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  },

  /* ──────────────────────────────────────────────────────
     DENTAL CHART
     FDI/ISO notation:
       Upper right: 18-11   Upper left: 21-28
       Lower right: 48-41   Lower left: 31-38
     ────────────────────────────────────────────────────── */
  _buildDentalChart() {
    const upperRight = [18,17,16,15,14,13,12,11];
    const upperLeft  = [21,22,23,24,25,26,27,28];
    const lowerLeft  = [31,32,33,34,35,36,37,38];
    const lowerRight = [48,47,46,45,44,43,42,41];

    const toothIcons = {
      // Molars (3-root symbol)
      18:'M',17:'M',16:'M',  28:'M',27:'M',26:'M',
      48:'M',47:'M',46:'M',  38:'M',37:'M',36:'M',
      // Premolars
      15:'P',14:'P',  25:'P',24:'P',
      45:'P',44:'P',  35:'P',34:'P',
      // Canines
      13:'C',  23:'C',  43:'C',  33:'C',
      // Incisors
      12:'I',11:'I',  21:'I',22:'I',
      42:'I',41:'I',  31:'I',32:'I',
    };

    const sel = this._selectedTeeth;

    const tooth = (n) => {
      const isSelected = sel.includes(n);
      return `<div class="tooth-btn ${isSelected?'selected':''}"
                   data-tooth="${n}"
                   title="Tooth ${n}"
                   onclick="TreatmentsPage._toggleTooth(${n})">
                <div class="tooth-icon">${toothIcons[n]||'?'}</div>
                <div class="tooth-num">${n}</div>
              </div>`;
    };

    return `
      <div class="dental-chart">
        <div class="dental-jaw upper">
          <div class="jaw-label">Upper</div>
          <div class="teeth-row">
            ${upperRight.map(tooth).join('')}
            <div class="jaw-divider"></div>
            ${upperLeft.map(tooth).join('')}
          </div>
        </div>
        <div class="dental-midline"></div>
        <div class="dental-jaw lower">
          <div class="jaw-label">Lower</div>
          <div class="teeth-row">
            ${lowerRight.map(tooth).join('')}
            <div class="jaw-divider"></div>
            ${lowerLeft.map(tooth).join('')}
          </div>
        </div>
        <div class="dental-chart-legend">
          <span><b>M</b> = Molar</span>
          <span><b>P</b> = Premolar</span>
          <span><b>C</b> = Canine</span>
          <span><b>I</b> = Incisor</span>
          ${this._currentPatientId ? `<button class="action-btn" style="margin-left:.5rem" onclick="DentalChart.open(${this._currentPatientId}, (nums)=>{ TreatmentsPage._setTeethFromChart(nums); })">🗺 Full Chart History</button>` : ''}
        </div>
      </div>`;
  },

  _currentPatientId: null,

  _setTeethFromChart(nums) {
    // nums is e.g. "1, 2, 14" (universal numbering from DentalChart)
    this._selectedTeeth = nums.split(',').map(s => parseInt(s.trim())).filter(Boolean);
    // Re-render the dental chart section of the modal
    const chartSection = document.querySelector('#treatModal .dental-chart-section');
    if (chartSection) {
      chartSection.innerHTML = `
        <div class="dental-chart-head">
          <span>🦷 Select Teeth</span>
          <div id="teethSelectedDisplay" class="teeth-selected-display">
            ${this._selectedTeeth.length ? this._selectedTeeth.map(n=>`<span class="tooth-chip selected">${n}</span>`).join('') : '<span style="color:var(--text2);font-size:.8rem">None selected</span>'}
          </div>
          <button class="btn-clear-teeth" onclick="TreatmentsPage._clearTeeth()">Clear</button>
        </div>
        ${this._buildDentalChart()}`;
    }
    toast('Teeth from chart applied: ' + nums, 'success');
  },

  _toggleTooth(n) {
    const idx = this._selectedTeeth.indexOf(n);
    if (idx === -1) {
      this._selectedTeeth.push(n);
    } else {
      this._selectedTeeth.splice(idx, 1);
    }
    // Update visual
    const btn = document.querySelector(`.tooth-btn[data-tooth="${n}"]`);
    if (btn) btn.classList.toggle('selected', this._selectedTeeth.includes(n));
    // Update display
    this._updateTeethDisplay();
  },

  _clearTeeth() {
    this._selectedTeeth = [];
    document.querySelectorAll('.tooth-btn.selected').forEach(b=>b.classList.remove('selected'));
    this._updateTeethDisplay();
  },

  _updateTeethDisplay() {
    const d = $('teethSelectedDisplay');
    if (!d) return;
    d.innerHTML = this._selectedTeeth.length
      ? this._selectedTeeth.sort((a,b)=>a-b).map(n=>`<span class="tooth-chip selected">${n}</span>`).join('')
      : '<span style="color:var(--text2);font-size:.8rem">None selected</span>';
  },

  _closeModal() { const m = $('treatModal'); if (m) m.remove(); },

  async _save(id) {
    const patient_id     = parseInt($('tPatient')?.value);
    const doctor_id      = parseInt($('tDoctor')?.value) || null;
    const treatment_type = $('tType')?.value;
    const date           = $('tDate')?.value;
    const cost           = parseFloat($('tCost')?.value) || 0;
    const diagnosis      = $('tDiag')?.value;
    const procedure_notes= $('tNotes')?.value;
    const prescription   = $('tRx')?.value;
    const status         = $('tStatus')?.value;
    const follow_up_date = $('tFollowUp')?.value || null;
    // Store teeth as comma-separated string
    const tooth_number   = this._selectedTeeth.length
      ? this._selectedTeeth.sort((a,b)=>a-b).join(',')
      : null;

    if (!patient_id || !treatment_type || !date) {
      toast('Patient, treatment type and date are required', 'error');
      return;
    }

    const payload = {
      patient_id, doctor_id, treatment_type, tooth_number, date, cost,
      diagnosis, procedure_notes, prescription, status, follow_up_date,
      follow_up: follow_up_date ? 1 : 0
    };

    try {
      if (id) {
        await DB.tables.treatments.update(id, payload);
        toast('Treatment updated ✓', 'success');
      } else {
        await DB.tables.treatments.insert(payload);
        toast('Treatment added ✓', 'success');
      }
      this._closeModal();
      await this.render();
    } catch(e) { toast('Error: '+e.message, 'error'); }
  },

  async _delete(id) {
    if (!confirm('Delete this treatment?')) return;
    try {
      await DB.tables.treatments.delete(id);
      toast('Treatment deleted', 'info');
      await this.render();
    } catch(e) { toast('Delete failed: '+e.message, 'error'); }
  },

  async _viewModal(id) {
    const t = this._rows.find(r=>r.id===id);
    if (!t) return;
    const p = this._patients.find(p=>p.id==t.patient_id);
    const d = this._doctors.find(d=>d.id==t.doctor_id);
    const teeth = this._parseTeeth(t.tooth_number);

    const html = `
    <div id="treatViewModal" class="modal-overlay open" onclick="if(event.target===this)this.remove()">
      <div class="modal" style="max-width:600px">
        <div class="modal-head">
          <h3>Treatment Details</h3>
          <button class="close-btn" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body">
          <div class="detail-info-grid">
            <div class="detail-info-item"><label>Patient</label><span>${p?.full_name||'Unknown'}</span></div>
            <div class="detail-info-item"><label>Doctor</label><span>${d?.full_name||'—'}</span></div>
            <div class="detail-info-item"><label>Type</label><span>${t.treatment_type}</span></div>
            <div class="detail-info-item"><label>Date</label><span>${t.date}</span></div>
            <div class="detail-info-item"><label>Cost</label><span style="color:var(--accent)">${fmt(t.cost)}</span></div>
            <div class="detail-info-item"><label>Status</label><span>${UI.statusBadge(t.status||'completed')}</span></div>
            <div class="detail-info-item full"><label>Teeth</label><span>${teeth.length?teeth.join(', '):'—'}</span></div>
            <div class="detail-info-item full"><label>Diagnosis</label><span>${t.diagnosis||'—'}</span></div>
            <div class="detail-info-item full"><label>Notes</label><span>${t.procedure_notes||'—'}</span></div>
            <div class="detail-info-item full"><label>Prescription</label><span>${t.prescription||'—'}</span></div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-primary" onclick="this.closest('.modal-overlay').remove()">Close</button>
          <button class="btn-icon" onclick="Modals.printReceipt(${t.id})">🧾 Receipt</button>
          <button class="btn-icon" onclick="Modals.printPrescription(${t.id})">℞ Prescription</button>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  },

  // ── Excel Export ──────────────────────────────────────
  exportExcel() {
    const ptMap = Object.fromEntries(this._patients.map(p=>[p.id,p.full_name]));
    const dcMap = Object.fromEntries(this._doctors.map(d=>[d.id,d.full_name]));
    const data  = this._rows.map(t=>({
      Patient:           ptMap[t.patient_id]||t.patient_id,
      Doctor:            dcMap[t.doctor_id]||'—',
      'Treatment Type':  t.treatment_type,
      'Teeth':           t.tooth_number||'',
      Date:              t.date,
      Cost:              t.cost||0,
      Diagnosis:         t.diagnosis||'',
      'Procedure Notes': t.procedure_notes||'',
      Prescription:      t.prescription||'',
      Status:            t.status||'',
      'Follow-up Date':  t.follow_up_date||''
    }));
    UI.exportExcel(data, 'treatments');
  },

  importFile() {
    UI.importFile(async rows => {
      const ptByName = Object.fromEntries(this._patients.map(p=>[p.full_name.toLowerCase(),p.id]));
      const dcByName = Object.fromEntries(this._doctors.map(d=>[d.full_name.toLowerCase(),d.id]));
      const mapped = rows.map(r=>({
        patient_id:      ptByName[(r['Patient']||'').toLowerCase()]||null,
        doctor_id:       dcByName[(r['Doctor']||'').toLowerCase()] ||null,
        treatment_type:  r['Treatment Type']||r['treatment_type']||'Other',
        tooth_number:    r['Teeth']||r['tooth_number']||null,
        date:            r['Date']||r['date']||today(),
        cost:            r['Cost']||r['cost']||0,
        diagnosis:       r['Diagnosis']||r['diagnosis']||'',
        procedure_notes: r['Procedure Notes']||r['procedure_notes']||'',
        prescription:    r['Prescription']||r['prescription']||'',
        status:          r['Status']||r['status']||'completed',
        follow_up_date:  r['Follow-up Date']||r['follow_up_date']||null,
        follow_up:       r['Follow-up Date']?1:0
      })).filter(r=>r.patient_id&&r.treatment_type&&r.date);
      if (!mapped.length) { toast('No valid rows found','error'); return; }
      const res = await DB.tables.treatments.bulk(mapped);
      toast(`Imported ${res.inserted} treatments`, 'success');
      await this.render();
    });
  },

  exportJson() {
    UI.exportJson(this._rows, 'treatments');
  }
};
