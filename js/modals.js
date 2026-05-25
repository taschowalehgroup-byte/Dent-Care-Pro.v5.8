/* ═══════════════════════════════════════════════════════
   DentCare Pro — Modal Controllers
   ═══════════════════════════════════════════════════════ */

const Modals = {
  _active: null,

  open(id) {
    this._active = id;
    // Remove any dynamic modals, hide all static ones
    document.querySelectorAll('#modalOverlay .modal').forEach(m => {
      if (m.dataset.dynamic === '1') m.remove();
      else m.style.display = 'none';
    });
    // Also hide modals outside overlay (legacy selectors)
    document.querySelectorAll('.modal').forEach(m => {
      if (!m.closest('#modalOverlay') && m.id !== id) m.style.display = 'none';
    });
    $('modalOverlay').classList.add('open');
    const target = $(id);
    if (target) {
      target.style.display = 'flex';
      target.style.animation = 'modalIn .3s cubic-bezier(.4,0,.2,1) both';
    }
  },

  /* ── Master close — hides ALL modals and removes dynamic ones ── */
  _nukeOverlay() {
    // Hide every static modal
    document.querySelectorAll('#modalOverlay .modal').forEach(m => {
      // Only remove dynamic ones; hide static ones (they are reused)
      if (m.dataset.dynamic === '1') {
        m.remove();
      } else {
        m.style.display = 'none';
      }
    });
    $('modalOverlay').classList.remove('open');
    this._active = null;
  },

  close(e) {
    // If called from backdrop click, only close when clicking the bare overlay
    if (e && e.target !== $('modalOverlay')) return;
    this._nukeOverlay();
  },

  newPatient() {
    this._resetPatientModal();
    this.open('modalNewPatient');
  },

  _resetPatientModal() {
    ['np_name','np_phone','np_dob','np_email','np_occupation','np_insurance','np_address','np_conditions','np_allergies','np_concerns','np_xray_date','np_xray_notes']
      .forEach(id => $(id) && ($(id).value = ''));
    this._clearXray();
    this._npTab('info', document.querySelector('.np-tab'));
    const foot = document.querySelector('#modalNewPatient .modal-foot');
    if (foot) {
      foot.innerHTML = `
        <button class="btn-ghost" onclick="Modals.close()">Cancel</button>
        <button class="btn-primary" onclick="Actions.registerPatient()">✓ Register Patient</button>
      `;
    }
  },

  async editPatient(id) {
    try {
      const p = await DB.tables.patients.find(id);
      if (!p) return;
      this._resetPatientModal();

      $('np_name').value        = p.full_name || '';
      $('np_phone').value       = p.phone || '';
      $('np_dob').value         = p.date_of_birth || '';
      $('np_gender').value      = p.gender || '';
      $('np_email').value       = p.email || '';
      $('np_occupation').value  = p.occupation || '';
      $('np_blood').value       = p.blood_type || '';
      $('np_insurance').value   = p.insurance || '';
      $('np_ref').value         = p.referral_source || '';
      $('np_pay').value         = p.payment_method || '';
      $('np_conditions').value  = p.medical_conditions || '';
      $('np_allergies').value   = p.allergies || '';
      $('np_concerns').value    = p.dental_concerns || '';
      $('np_address').value     = p.address || '';
      $('np_xray_date').value   = p.xray_date || '';
      $('np_xray_notes').value  = p.xray_notes || '';

      if (p.xray_image) this._showXrayPreview(p.xray_image);

      const foot = document.querySelector('#modalNewPatient .modal-foot');
      if (foot) {
        foot.innerHTML = `
          <button class="btn-ghost" onclick="Modals.close()">Cancel</button>
          <button class="btn-primary" onclick="Actions.updatePatient(${id})">✓ Update Patient</button>
        `;
      }
      this.open('modalNewPatient');
    } catch(e) {
      console.error(e);
      toast('Error loading patient for edit', 'error');
    }
  },

  _npTab(tab, btn) {
    ['Info','Xray'].forEach(t => {
      const panel = $(`npTab${t}`);
      if (panel) panel.style.display = 'none';
    });
    const active = $(`npTab${tab.charAt(0).toUpperCase() + tab.slice(1)}`);
    if (active) active.style.display = '';
    document.querySelectorAll('.np-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
  },

  _xrayBase64: null,

  _handleXrayFile(input) {
    if (!input.files[0]) return;
    const reader = new FileReader();
    reader.onload = (e) => this._uploadAndPreviewXray(e.target.result, input.files[0].name);
    reader.readAsDataURL(input.files[0]);
  },

  _handleXrayDrop(e) {
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => this._uploadAndPreviewXray(ev.target.result, file.name);
    reader.readAsDataURL(file);
  },

  async _uploadAndPreviewXray(dataUrl, filename) {
    try {
      // Show preview immediately
      this._showXrayPreview(dataUrl);
      // Static mode: store base64 directly as the URL (no server disk)
      this._xrayBase64 = null;
      this._xrayUrl    = dataUrl;
      toast('X-ray loaded (stored in memory) ✓', 'success');
    } catch(e) {
      console.warn('Image preview failed:', e);
    }
  },

  _showXrayPreview(dataUrl) {
    this._xrayBase64 = dataUrl;
    const img    = $('xrayPreviewImg');
    const wrap   = $('xrayPreviewWrap');
    const prompt = $('xrayUploadPrompt');
    if (img)    img.src = dataUrl;
    if (wrap)   wrap.style.display = '';
    if (prompt) prompt.style.display = 'none';
  },

  _clearXray() {
    this._xrayBase64 = null;
    this._xrayUrl    = null;
    const wrap   = $('xrayPreviewWrap');
    const prompt = $('xrayUploadPrompt');
    const inp    = $('xrayFileInp');
    if (wrap)   wrap.style.display = 'none';
    if (prompt) prompt.style.display = '';
    if (inp)    inp.value = '';
  },

  /* ── APPOINTMENTS ─────────────────────────────── */
  /* ── Appointment commission live preview ──────────────── */
  _apptCommissionPreview() {
    const cost    = parseFloat($('ap_cost')?.value || 0);
    const preview = $('apptCommPreview');
    if (!cost || cost <= 0) { if (preview) preview.style.display = 'none'; return; }

    const treatType = $('ap_type')?.value || '';
    // Map treatment type → commission field on doctor
    const typeMap = {
      'General Checkup': 'commission_filling',
      'Cleaning/Scaling': 'commission_filling',
      'Filling':          'commission_crown',
      'Root Canal':       'commission_root_canal',
      'Extraction':       'commission_extraction',
      'Implant':          'commission_implant',
      'Orthodontics':     'commission_orthodontics',
      'Crown/Bridge':     'commission_crown',
    };
    const comField = typeMap[treatType] || 'commission_other';

    const doctorId = $('ap_doctor')?.value;
    if (!doctorId) { if (preview) preview.style.display = 'none'; return; }

    // Fetch doctor commission rate
    DB.tables.doctors.find(parseInt(doctorId)).then(d => {
      if (!d) return;
      const rate   = parseFloat(d[comField] || d.commission_other || 15);
      const earns  = (cost * rate / 100);
      const clinic = cost - earns;
      const fmt    = v => v.toLocaleString('en-EG', {maximumFractionDigits:2}) + ' EGP';

      if ($('apptCommTotal'))  $('apptCommTotal').textContent  = fmt(cost);
      if ($('apptCommRate'))   $('apptCommRate').textContent   = rate + '%';
      if ($('apptCommEarns'))  $('apptCommEarns').textContent  = fmt(earns);
      if ($('apptCommClinic')) $('apptCommClinic').textContent = fmt(clinic);
      if (preview) preview.style.display = '';
    }).catch(() => { if (preview) preview.style.display = 'none'; });
  },

    async newAppointment(patientId = null) {
    this._resetApptModal();
    const patients = await DB.tables.patients.all();
    $('ap_patient').innerHTML = '<option value="">Select patient…</option>' +
      patients.map(p => `<option value="${p.id}" ${patientId == p.id ? 'selected' : ''}>${p.full_name}</option>`).join('');

    // Load all doctors — will filter dynamically when treatment type changes
    this._apptAllDoctors = await DB.tables.doctors.all();
    this._apptPopulateDoctors(this._apptAllDoctors, null);

    // When treatment type changes: filter doctors by ability + refresh commission
    const typeEl = $('ap_type');
    if (typeEl) {
      typeEl.onchange = () => {
        const type = typeEl.value;
        if (!type) {
          this._apptPopulateDoctors(this._apptAllDoctors, null);
        } else {
          fetch(`/api/abilities/for-treatment/${encodeURIComponent(type)}`)
            .then(r => r.json())
            .then(data => {
              const able = new Set((data.doctors || []).map(d => String(d.doctor_id)));
              this._apptPopulateDoctors(this._apptAllDoctors, able);
            })
            .catch(() => this._apptPopulateDoctors(this._apptAllDoctors, null));
        }
        this._apptCommissionPreview();
      };
    }

    // When doctor changes: refresh commission preview
    const docEl = $('ap_doctor');
    if (docEl) docEl.onchange = () => this._apptCommissionPreview();

    $('ap_date').value = today();
    $('ap_time').value = '09:00';
    this.open('modalNewAppt');
  },

  _apptPopulateDoctors(doctors, ableSet) {
    const el = $('ap_doctor');
    if (!el) return;
    let opts = '<option value="">Select doctor…</option>';
    if (!ableSet || !ableSet.size) {
      // No filter — show all
      opts += doctors.map(d =>
        `<option value="${d.id}">${d.full_name} — ${d.specialty}</option>`
      ).join('');
    } else {
      const capable  = doctors.filter(d => ableSet.has(String(d.id)));
      const rest     = doctors.filter(d => !ableSet.has(String(d.id)));
      if (capable.length) {
        opts += `<optgroup label="✅ Can perform this treatment">`;
        opts += capable.map(d => `<option value="${d.id}">${d.full_name} — ${d.specialty}</option>`).join('');
        opts += `</optgroup>`;
      }
      if (rest.length) {
        opts += `<optgroup label="— All other doctors">`;
        opts += rest.map(d => `<option value="${d.id}" style="color:var(--text2)">${d.full_name} — ${d.specialty}</option>`).join('');
        opts += `</optgroup>`;
      }
    }
    el.innerHTML = opts;
  },

  _resetApptModal() {
    ['ap_patient','ap_doctor','ap_date','ap_time','ap_dur','ap_priority','ap_type',
     'ap_complaint','ap_notes','ap_pay_method','ap_discount_code','ap_cost']
      .forEach(id => $(id) && ($(id).value = ''));
    const prev = $('apptCommPreview');
    if (prev) prev.style.display = 'none';
    // Remove doctor/type change hooks
    const typeEl = $('ap_type');   if (typeEl) typeEl.onchange = null;
    const docEl  = $('ap_doctor'); if (docEl)  docEl.onchange  = null;
    this._apptAllDoctors = null;
    const foot = document.querySelector('#modalNewAppt .modal-foot');
    if (foot) {
      foot.innerHTML = `
        <button class="btn-ghost" onclick="Modals.close()">Cancel</button>
        <button class="btn-primary" onclick="Actions.scheduleAppt()">✓ Schedule</button>
      `;
    }
  },

  async editAppointment(id) {
    try {
      const a = await DB.tables.appointments.find(id);
      if (!a) return;
      this._resetApptModal();

      const patients = await DB.tables.patients.all();
      $('ap_patient').innerHTML = '<option value="">Select patient…</option>' +
        patients.map(p => `<option value="${p.id}" ${a.patient_id == p.id ? 'selected' : ''}>${p.full_name}</option>`).join('');

      const doctors = await DB.tables.doctors.all();
      $('ap_doctor').innerHTML = '<option value="">Select doctor…</option>' +
        doctors.map(d => `<option value="${d.id}" ${a.doctor_id == d.id ? 'selected' : ''}>${d.full_name} — ${d.specialty}</option>`).join('');

      $('ap_date').value          = a.date || '';
      $('ap_time').value          = a.time || '';
      $('ap_dur').value           = a.duration_min || '30';
      $('ap_priority').value      = a.priority || 'normal';
      $('ap_type').value          = a.treatment_type || '';
      $('ap_complaint').value     = a.chief_complaint || '';
      $('ap_notes').value         = a.notes || '';
      $('ap_pay_method').value    = a.payment_method || '';
      $('ap_discount_code').value = a.discount_code || '';
      if ($('ap_cost')) { $('ap_cost').value = a.cost || ''; }

      // Re-hook commission preview for edit mode
      const typeEl = $('ap_type');
      const docEl  = $('ap_doctor');
      if (typeEl) typeEl.onchange = () => this._apptCommissionPreview();
      if (docEl)  docEl.onchange  = () => this._apptCommissionPreview();
      if (a.cost) this._apptCommissionPreview();

      const foot = document.querySelector('#modalNewAppt .modal-foot');
      if (foot) {
        foot.innerHTML = `
          <button class="btn-ghost" onclick="Modals.close()">Cancel</button>
          <button class="btn-primary" onclick="Actions.updateAppt(${id})">✓ Update Appointment</button>
        `;
      }
      this.open('modalNewAppt');
    } catch(e) {
      console.error(e);
      toast('Error loading appointment for edit', 'error');
    }
  },

  async viewAppointmentDetail(id) {
    try {
      const a = await DB.tables.appointments.find(id);
      if (!a) return;
      const [p, d] = await Promise.all([
        DB.tables.patients.find(a.patient_id),
        DB.tables.doctors.find(a.doctor_id)
      ]);

      $('apptDetailBody').innerHTML = `
        <div class="detail-info-grid">
          <div class="detail-info-item"><label>Patient</label><span>${p?.full_name || 'Unknown'}</span></div>
          <div class="detail-info-item"><label>Doctor</label><span>${d?.full_name || 'Unknown'}</span></div>
          <div class="detail-info-item"><label>Date</label><span>${a.date}</span></div>
          <div class="detail-info-item"><label>Time</label><span>${a.time}</span></div>
          <div class="detail-info-item"><label>Duration</label><span>${a.duration_min} min</span></div>
          <div class="detail-info-item"><label>Priority</label><span>${UI.priorityBadge(a.priority)}</span></div>
          <div class="detail-info-item"><label>Status</label><span>${UI.statusBadge(a.status)}</span></div>
          <div class="detail-info-item"><label>Treatment</label><span>${a.treatment_type || '—'}</span></div>
          <div class="detail-info-item"><label>Payment Method</label><span>${a.payment_method || '—'}</span></div>
          <div class="detail-info-item"><label>Discount Code</label><span>${a.discount_code ? `<span class="badge badge-normal">🏷 ${a.discount_code}</span>` : '—'}</span></div>
          <div class="detail-info-item"><label>💰 Appointment Cost</label><span style="font-weight:700;color:var(--green)">${a.cost ? Number(a.cost).toLocaleString()+' EGP' : '—'}</span></div>
          <div class="detail-info-item"><label>👨‍⚕️ Doctor Commission</label><span style="color:var(--accent)">${a.doctor_commission_amt ? Number(a.doctor_commission_amt).toLocaleString()+' EGP ('+( a.doctor_commission_pct??0)+'%)' : '—'}</span></div>
          <div class="detail-info-item"><label>🏥 Clinic Keeps</label><span style="color:var(--green);font-weight:700">${(a.cost && a.doctor_commission_amt) ? (Number(a.cost)-Number(a.doctor_commission_amt)).toLocaleString()+' EGP' : '—'}</span></div>
          <div class="detail-info-item full"><label>Chief Complaint</label><span>${a.chief_complaint || '—'}</span></div>
          <div class="detail-info-item full"><label>Notes</label><span>${a.notes || '—'}</span></div>
        </div>
        ${a.status !== 'completed' ? `
        <div style="margin-top:1rem;display:flex;gap:.5rem;flex-wrap:wrap">
          ${a.status !== 'cancelled' ? `<button class="btn-primary" onclick="Modals.close();Actions.confirmTreatment(${a.id})">
            ✓ Confirm Treatment & Add to Finance
          </button>` : ''}
          ${a.status !== 'cancelled' ? `<button class="btn-ghost" onclick="Modals.close();Actions.cancelAppt(${a.id})" style="color:var(--red);border-color:var(--red)">✕ Cancel Appointment</button>` : ''}
          ${p?.phone ? `<button class="btn-icon" onclick="Modals.sendWhatsAppReminder('${p.phone.replace(/\D/g,'')}','${(p?.full_name||'').replace(/'/g,"\\'")}','${a.date}','${a.time}','${d?.full_name||''}')">💬 WhatsApp Reminder</button>` : ''}
        </div>` : `
        <div style="margin-top:1rem">
          ${p?.phone ? `<button class="btn-icon" onclick="Modals.sendWhatsAppReminder('${p.phone.replace(/\D/g,'')}','${(p?.full_name||'').replace(/'/g,"\\'")}','${a.date}','${a.time}','${d?.full_name||''}')">💬 Send Follow-up Message</button>` : ''}
        </div>`}
      `;
      this.open('modalApptDetail');
    } catch(e) {
      console.error(e);
      toast('Error loading appointment details', 'error');
    }
  },

  /* ── DOCTORS ──────────────────────────────────── */
  addDoctor() {
    this._resetDrModal();
    this.open('modalAddDoctor');
  },

  /* ── Doctor modal tab switching ────────────────────────── */
  _drTab(n) {
    [1,2,3].forEach(i => {
      const content = $(`drTabContent${i}`);
      const tab     = $(`drTab${i}`);
      if (content) content.style.display = i===n ? '' : 'none';
      if (tab) {
        tab.style.borderBottomColor = i===n ? 'var(--accent)' : 'transparent';
        tab.style.color             = i===n ? 'var(--accent)' : 'var(--text2)';
        tab.style.fontWeight        = i===n ? '700' : '400';
      }
    });
    // Populate abilities checkboxes on first open
    if (n===3) this._initDrAbilities();
  },

  async _initDrAbilities() {
    const box = $('drAbilitiesCheckboxes');
    if (!box || box.dataset.loaded) return;
    try {
      const data = DB.abilitiesAPI.allList();
      const list = data.abilities || [];
      box.innerHTML = list.map(a => `
        <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;
                      background:var(--surface2);border-radius:8px;padding:.4rem .7rem;
                      border:1.5px solid transparent;transition:border-color .15s"
               id="drab_wrap_${a.replace(/[^a-z0-9]/gi,'_')}">
          <input type="checkbox" value="${a}"
                 id="drab_${a.replace(/[^a-z0-9]/gi,'_')}"
                 onchange="Modals._drAbilityBorder(this)"
                 style="accent-color:var(--accent)">
          <span style="font-size:.82rem">${a}</span>
        </label>`).join('');
      box.dataset.loaded = '1';
    } catch(e) { console.error('Abilities load error', e); }
  },

  _drAbilityBorder(cb) {
    const wrap = document.getElementById(`drab_wrap_${cb.value.replace(/[^a-z0-9]/gi,'_')}`);
    if (wrap) wrap.style.borderColor = cb.checked ? 'var(--accent)' : 'transparent';
  },

  _drAbilitySelectAll(checked) {
    document.querySelectorAll('#drAbilitiesCheckboxes input[type="checkbox"]').forEach(cb => {
      cb.checked = checked;
      this._drAbilityBorder(cb);
    });
  },

  _calcDrCommission() {
    const amt     = parseFloat($('dr_calc_amount')?.value || 0);
    const typeId  = $('dr_calc_type')?.value || 'dr_com_filling';
    const pct     = parseFloat($(''+typeId)?.value || 0);
    const earn    = amt > 0 && pct > 0 ? (amt * pct / 100).toLocaleString('en-EG', {maximumFractionDigits:2}) : '—';
    const result  = $('dr_calc_result');
    if (result) result.textContent = `Doctor earns: ${earn !== '—' ? earn + ' EGP' : '—'}`;
  },

    _resetDrModal() {
    // Clear all personal fields
    ['dr_name','dr_phone','dr_email','dr_lic','dr_national_id','dr_room','dr_sched',
     'dr_address','dr_emergency','dr_notes','dr_hire_date'].forEach(id => {
      if ($(id)) { $(id).value = ''; $(id).classList?.remove('input-error'); }
    });
    if ($('dr_spec'))     { $('dr_spec').value = '';     $('dr_spec').classList?.remove('input-error'); }
    if ($('drCredentialsPreview')) $('drCredentialsPreview').style.display = 'none';
    if ($('dr_name_err')) $('dr_name_err').style.display = 'none';
    if ($('dr_spec_err')) $('dr_spec_err').style.display = 'none';
    const pf = $('drPreviewPassword');
    if (pf) delete pf.dataset.generated;

    // Reset commission defaults
    const comDefaults = {
      dr_com_filling:20, dr_com_crown:20, dr_com_root:20,
      dr_com_ext:20, dr_com_imp:25, dr_com_ortho:20, dr_com_other:15, dr_com_misc:15
    };
    Object.entries(comDefaults).forEach(([id,val]) => { if ($(id)) $(id).value = val; });
    if ($('dr_calc_amount')) $('dr_calc_amount').value = '';
    if ($('dr_calc_result')) $('dr_calc_result').textContent = 'Doctor earns: —';

    // Reset ability checkboxes
    const box = $('drAbilitiesCheckboxes');
    if (box) {
      box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
        this._drAbilityBorder(cb);
      });
    }

    // Switch to tab 1
    this._drTab(1);

    const title = $('drModalTitle');
    if (title) title.textContent = '⚕️ Add Doctor';

    const btn = $('drSubmitBtn');
    if (btn) { btn.textContent = '✓ Add Doctor'; btn.onclick = () => Actions.addDoctor(); }
  },

  async editDoctor(id) {
    try {
      const d = await DB.tables.doctors.find(id);
      if (!d) return;
      this._resetDrModal();

      // Personal info
      $('dr_name').value  = d.full_name.replace(/^Dr\.\s*/i, '');
      $('dr_spec').value  = d.specialty;
      $('dr_phone').value = d.phone      || '';
      $('dr_email').value = d.email      || '';
      $('dr_lic').value   = d.license_no || '';
      $('dr_room').value  = d.room       || '';
      $('dr_sched').value = d.schedule   || '';
      if ($('dr_national_id')) $('dr_national_id').value = d.national_id || '';
      if ($('dr_address'))     $('dr_address').value     = d.address     || '';
      if ($('dr_emergency'))   $('dr_emergency').value   = d.emergency_contact || '';
      if ($('dr_hire_date'))   $('dr_hire_date').value   = d.hire_date   || '';
      if ($('dr_notes'))       $('dr_notes').value       = d.notes       || '';

      // Commissions
      if ($('dr_com_filling')) $('dr_com_filling').value = d.commission_filling  ?? 20;
      if ($('dr_com_crown'))   $('dr_com_crown').value   = d.commission_crown    ?? 20;
      if ($('dr_com_root'))    $('dr_com_root').value    = d.commission_root_canal ?? 20;
      if ($('dr_com_ext'))     $('dr_com_ext').value     = d.commission_extraction ?? 20;
      if ($('dr_com_imp'))     $('dr_com_imp').value     = d.commission_implant  ?? 25;
      if ($('dr_com_ortho'))   $('dr_com_ortho').value   = d.commission_orthodontics ?? 20;
      if ($('dr_com_other'))   $('dr_com_other').value   = d.commission_crown    ?? 15;
      if ($('dr_com_misc'))    $('dr_com_misc').value    = d.commission_other    ?? 15;

      // Load abilities and check boxes
      try {
        await this._initDrAbilities();
        const res  = await fetch(`/api/abilities/doctor/${id}`);
        const data = await res.json();
        const box  = $('drAbilitiesCheckboxes');
        if (box) {
          box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.checked = (data.abilities || []).includes(cb.value);
            this._drAbilityBorder(cb);
          });
        }
      } catch(e) { console.warn('Could not load doctor abilities', e); }

      // Hide credentials in edit mode
      if ($('drCredentialsPreview')) $('drCredentialsPreview').style.display = 'none';

      const title = $('drModalTitle');
      if (title) title.textContent = `✏️ Edit — ${d.full_name}`;

      const btn = $('drSubmitBtn');
      if (btn) {
        btn.textContent = '✓ Save Changes';
        btn.onclick = () => Actions.updateDoctor(id);
      }

      this.open('modalAddDoctor');
    } catch(e) { toast('Error loading doctor', 'error'); console.error(e); }
  },

  async viewDoctor(id) {
    try {
      const d = await DB.tables.doctors.find(id);
      if (!d) return;

      // Load abilities
      let abilities = [];
      try {
        const ar = await fetch(`/api/abilities/doctor/${id}`);
        const ad = await ar.json();
        abilities = ad.abilities || [];
      } catch(e) {}

      const abilityTags = abilities.length
        ? abilities.map(a => `<span style="background:var(--accent-faint,#ede9fe);color:var(--accent);font-size:.75rem;padding:.15rem .55rem;border-radius:4px;display:inline-block;margin:.15rem">${a}</span>`).join('')
        : '<span style="color:var(--text2);font-size:.82rem">No abilities set</span>';

      const comRows = [
        ['General/Cleaning', d.commission_filling],
        ['Filling',          d.commission_crown],
        ['Root Canal',       d.commission_root_canal],
        ['Extraction',       d.commission_extraction],
        ['Implant',          d.commission_implant],
        ['Orthodontics',     d.commission_orthodontics],
        ['Other',            d.commission_other],
      ].map(([label, val]) =>
        `<div style="display:flex;justify-content:space-between;font-size:.82rem;padding:.2rem 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--text2)">${label}</span>
          <strong style="color:var(--accent)">${val ?? 0}%</strong>
        </div>`
      ).join('');

      $('docDetailBody').innerHTML = `
        <div class="detail-info-grid">
          <div class="detail-info-item"><label>Full Name</label><span>${d.full_name}</span></div>
          <div class="detail-info-item"><label>Specialty</label><span>${d.specialty}</span></div>
          <div class="detail-info-item"><label>Phone</label><span>${d.phone || '—'}</span></div>
          <div class="detail-info-item"><label>Email</label><span>${d.email || '—'}</span></div>
          <div class="detail-info-item"><label>License #</label><span>${d.license_no || '—'}</span></div>
          <div class="detail-info-item"><label>National ID</label><span>${d.national_id || '—'}</span></div>
          <div class="detail-info-item"><label>Room</label><span>${d.room || '—'}</span></div>
          <div class="detail-info-item"><label>Schedule</label><span>${d.schedule || '—'}</span></div>
          <div class="detail-info-item"><label>Hire Date</label><span>${d.hire_date || '—'}</span></div>
          <div class="detail-info-item"><label>Emergency Contact</label><span>${d.emergency_contact || '—'}</span></div>
          <div class="detail-info-item" style="grid-column:1/-1"><label>Address</label><span>${d.address || '—'}</span></div>
          ${d.notes ? `<div class="detail-info-item" style="grid-column:1/-1"><label>Notes</label><span>${d.notes}</span></div>` : ''}
        </div>

        <div style="margin-top:1rem">
          <div style="font-size:.75rem;font-weight:700;text-transform:uppercase;color:var(--text2);margin-bottom:.5rem">🎯 Abilities (${abilities.length})</div>
          <div style="line-height:2">${abilityTags}</div>
        </div>

        <div style="margin-top:1rem">
          <div style="font-size:.75rem;font-weight:700;text-transform:uppercase;color:var(--text2);margin-bottom:.5rem">💰 Commission Rates</div>
          ${comRows}
        </div>

        <div style="display:flex;gap:.5rem;margin-top:1rem;flex-wrap:wrap">
          <button class="btn-icon" onclick="Modals.editDoctor(${id});Modals.close()">✏️ Edit Doctor</button>
          <button class="btn-icon" onclick="App.page('abilities')">🎯 Manage Abilities</button>
        </div>
      `;
      this.open('modalDocDetail');
    } catch(e) { toast('Error loading doctor details', 'error'); console.error(e); }
  },

  /* ── FINANCE ──────────────────────────────────── */
  newTransaction() {
    this._resetTxModal();
    $('tx_date').value = today();
    this.open('modalNewTx');
  },

  _resetTxModal() {
    ['tx_desc','tx_amount','tx_date','tx_type','tx_cat'].forEach(id => $(id) && ($(id).value = ''));
    const foot = document.querySelector('#modalNewTx .modal-foot');
    if (foot) {
      foot.innerHTML = `
        <button class="btn-ghost" onclick="Modals.close()">Cancel</button>
        <button class="btn-primary" onclick="Actions.addTransaction()">✓ Add Transaction</button>
      `;
    }
  },

  async editTransaction(id) {
    try {
      const t = await DB.tables.transactions.find(id);
      if (!t) return;
      this._resetTxModal();

      $('tx_desc').value   = t.description || '';
      $('tx_type').value   = t.type || 'income';
      $('tx_cat').value    = t.category || '';
      $('tx_amount').value = t.amount || 0;
      $('tx_date').value   = t.date || '';

      const foot = document.querySelector('#modalNewTx .modal-foot');
      if (foot) {
        foot.innerHTML = `
          <button class="btn-ghost" onclick="Modals.close()">Cancel</button>
          <button class="btn-primary" onclick="Actions.updateTransaction(${id})">✓ Update Transaction</button>
        `;
      }
      this.open('modalNewTx');
    } catch(e) {
      console.error(e);
      toast('Error loading transaction for edit', 'error');
    }
  },

  async viewTransaction(id) {
    try {
      const t = await DB.tables.transactions.find(id);
      if (!t) return;
      $('txDetailBody').innerHTML = `
        <div class="detail-info-grid">
          <div class="detail-info-item"><label>Description</label><span>${t.description}</span></div>
          <div class="detail-info-item"><label>Type</label><span>${UI.statusBadge(t.type === 'income' ? 'confirmed' : 'cancelled')}</span></div>
          <div class="detail-info-item"><label>Category</label><span>${t.category}</span></div>
          <div class="detail-info-item"><label>Amount</label><span style="color:${t.type === 'income' ? 'var(--green)' : 'var(--red)'}">${fmt(t.amount)}</span></div>
          <div class="detail-info-item"><label>Date</label><span>${t.date}</span></div>
        </div>
      `;
      this.open('modalTxDetail');
    } catch(e) {
      console.error(e);
      toast('Error loading transaction details', 'error');
    }
  },

  /* ── INVENTORY ────────────────────────────────── */
  addInventory() {
    this._resetInvModal();
    this.open('modalAddInv');
  },

  _resetInvModal() {
    ['inv_name','inv_qty','inv_min','inv_price','inv_supplier'].forEach(id => $(id) && ($(id).value = ''));
    $('inv_cat').value = 'consumable';
    const foot = document.querySelector('#modalAddInv .modal-foot');
    if (foot) {
      foot.innerHTML = `
        <button class="btn-ghost" onclick="Modals.close()">Cancel</button>
        <button class="btn-primary" onclick="Actions.addInventoryItem()">✓ Add Item</button>
      `;
    }
  },

  async editInventory(id) {
    try {
      const i = await DB.tables.inventory.find(id);
      if (!i) return;
      this._resetInvModal();
      $('inv_name').value     = i.item_name;
      $('inv_cat').value      = i.category;
      $('inv_qty').value      = i.quantity;
      $('inv_min').value      = i.min_stock;
      $('inv_price').value    = i.unit_price;
      $('inv_supplier').value = i.supplier || '';

      const foot = document.querySelector('#modalAddInv .modal-foot');
      if (foot) {
        foot.innerHTML = `
          <button class="btn-ghost" onclick="Modals.close()">Cancel</button>
          <button class="btn-primary" onclick="Actions.updateInventory(${id})">✓ Update Item</button>
        `;
      }
      this.open('modalAddInv');
    } catch(e) { toast('Error loading item', 'error'); }
  },

  async viewInventory(id) {
    try {
      const i = await DB.tables.inventory.find(id);
      if (!i) return;
      $('invDetailBody').innerHTML = `
        <div class="detail-info-grid">
          <div class="detail-info-item"><label>Item Name</label><span>${i.item_name}</span></div>
          <div class="detail-info-item"><label>Category</label><span>${i.category}</span></div>
          <div class="detail-info-item"><label>Quantity</label><span>${i.quantity}</span></div>
          <div class="detail-info-item"><label>Min Stock</label><span>${i.min_stock}</span></div>
          <div class="detail-info-item"><label>Unit Price</label><span>${fmt(i.unit_price)}</span></div>
          <div class="detail-info-item"><label>Supplier</label><span>${i.supplier || '—'}</span></div>
        </div>
      `;
      this.open('modalInvDetail');
    } catch(e) { toast('Error loading item details', 'error'); }
  },

  /* ── PATIENT DETAIL ───────────────────────────── */
  async viewPatient(id) {
    try {
      const p = await DB.tables.patients.find(id);
      if (!p) return;
      $('detailPatientName').textContent = `🦷 ${p.full_name}`;

      $('detailOverview').innerHTML = `
        ${p.no_show_count > 0 ? `
        <div style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:10px;padding:.75rem 1rem;margin-bottom:1rem;display:flex;align-items:center;gap:.75rem">
          <span style="font-size:1.3rem">⚠️</span>
          <div>
            <div style="color:#f59e0b;font-weight:700;font-size:.9rem">Rebooking Flag — ${p.no_show_count} No-Show${p.no_show_count > 1 ? 's' : ''}</div>
            <div style="color:var(--text2);font-size:.78rem">This patient has missed ${p.no_show_count} appointment${p.no_show_count > 1 ? 's' : ''} without notice. Consider confirming before scheduling.</div>
          </div>
        </div>` : ''}
        <div class="detail-info-grid">
          <div class="detail-info-item"><label>Patient No.</label><span style="color:var(--accent)">${p.patient_no}</span></div>
          <div class="detail-info-item"><label>Phone</label><span>${p.phone}</span></div>
          <div class="detail-info-item"><label>Date of Birth</label><span>${p.date_of_birth || '—'}</span></div>
          <div class="detail-info-item"><label>Age</label><span>${p.age || '—'}</span></div>
          <div class="detail-info-item"><label>Gender</label><span>${p.gender || '—'}</span></div>
          <div class="detail-info-item"><label>Blood Type</label><span>${p.blood_type || '—'}</span></div>
          <div class="detail-info-item"><label>Email</label><span>${p.email || '—'}</span></div>
          <div class="detail-info-item"><label>Insurance</label><span>${p.insurance || 'None'}</span></div>
          <div class="detail-info-item"><label>Payment</label><span>${p.payment_method || '—'}</span></div>
        </div>
        <div class="form-grid">
          ${p.medical_conditions ? `<div class="detail-info-item full" style="grid-column:1/-1"><label>Medical Conditions</label><span style="color:var(--orange)">${p.medical_conditions}</span></div>` : ''}
          ${p.allergies ? `<div class="detail-info-item" style="grid-column:1/-1"><label>Allergies</label><span style="color:var(--red)">${p.allergies}</span></div>` : ''}
          ${p.dental_concerns ? `<div class="detail-info-item" style="grid-column:1/-1"><label>Dental Concerns</label><span>${p.dental_concerns}</span></div>` : ''}
        </div>
        <div style="margin-top:1rem;display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn-primary" onclick="Modals.newAppointment(${p.id})">📅 Book Appointment</button>
          <button class="btn-icon" onclick="WaitingPage.addToQueue(${p.id},'${p.full_name.replace(/'/g,"\\'").replace(/"/g,'&quot;')}').then(()=>UI.updateBadges());Modals.close()">⏳ Add to Waiting Room</button>
          <button class="btn-icon" onclick="Modals.printPatientFile(${p.id})">📋 Print Medical File</button>
          <button class="btn-icon" onclick="Modals.xrayGallery(${p.id})">🩻 X-Ray Gallery</button>
          <button class="btn-icon" onclick="InstallmentsPage.openNew()">💰 Payment Plan</button>
        </div>
      `;

      const docs  = await DB.tables.doctors.all();
      const dcMap = Object.fromEntries(docs.map(d => [d.id, d]));

      const allTx = await DB.tables.treatments.all();
      const txs   = allTx.filter(t => String(t.patient_id) === String(id));
      $('detailTreatments').innerHTML = txs.length === 0
        ? '<div class="empty-state"><div>🦷</div><p>No treatments recorded</p></div>'
        : '<table class="data-table"><thead><tr><th>Date</th><th>Tooth</th><th>Treatment</th><th>Cost</th><th>Doctor</th><th>Notes</th><th>Actions</th></tr></thead><tbody>'
          + txs.map(t => `<tr><td>${t.date}</td><td>${t.tooth_number || '—'}</td><td>${t.treatment_type}</td><td style="color:var(--green)">${fmt(t.cost)}</td><td>${dcMap[t.doctor_id]?.full_name || 'Unknown'}</td><td style="color:var(--text2);font-size:.8rem">${t.procedure_notes || '—'}</td>
          <td><div class="actions">
            <button class="action-btn" onclick="Modals.printReceipt(${t.id})" title="Print Receipt">🧾</button>
            <button class="action-btn" onclick="Modals.printPrescription(${t.id})" title="Print Prescription">℞</button>
          </div></td>
          </tr>`).join('')
          + '</tbody></table>';

      const allApts = await DB.tables.appointments.all();
      const apts    = allApts.filter(a => String(a.patient_id) === String(id));
      $('detailAppointments').innerHTML = apts.length === 0
        ? '<div class="empty-state"><div>📅</div><p>No appointments</p></div>'
        : '<table class="data-table"><thead><tr><th>Date</th><th>Time</th><th>Doctor</th><th>Treatment</th><th>Status</th><th>Priority</th><th>Discount</th></tr></thead><tbody>'
          + apts.sort((a, b) => a.date > b.date ? -1 : 1).map(a =>
              `<tr><td>${a.date}</td><td>${a.time}</td><td>${dcMap[a.doctor_id]?.full_name || 'Unknown'}</td><td>${a.treatment_type || '—'}</td><td>${UI.statusBadge(a.status)}</td><td>${UI.priorityBadge(a.priority)}</td><td>${a.discount_code ? `<span class="badge badge-normal">🏷 ${a.discount_code}</span>` : '—'}</td></tr>`
            ).join('')
          + '</tbody></table>';

      const total = txs.reduce((s, t) => s + Number(t.cost), 0);
      const plans = await DB.installments.byPatient(id).catch(() => []);
      const activePlan = plans.find(pl => pl.status === 'active');
      $('detailBilling').innerHTML = `
        <div class="finance-summary" style="margin-bottom:1rem">
          <div class="fin-card"><div class="fin-label">Total Charged</div><div class="fin-value income">${fmt(total)}</div></div>
          <div class="fin-card"><div class="fin-label">Payment Method</div><div class="fin-value net" style="font-size:1.1rem">${p.payment_method || '—'}</div></div>
          <div class="fin-card"><div class="fin-label">Insurance</div><div class="fin-value net" style="font-size:1.1rem">${p.insurance || 'None'}</div></div>
        </div>
        ${activePlan ? `<div style="padding:.75rem;background:var(--surface2);border-radius:var(--radius-sm);margin-bottom:1rem;border-left:3px solid var(--accent)">
          <strong>💰 Active Payment Plan</strong> — ${fmt(activePlan.total_amount)} in ${activePlan.num_installments} installments
          <br><span style="font-size:.8rem;color:var(--text2)">
            Paid: ${(activePlan.payments||[]).filter(p=>p.status==='paid').length}/${activePlan.num_installments}
            ${activePlan.payments?.find(p=>p.status==='pending') ? ' · Next due: '+activePlan.payments.find(p=>p.status==='pending').due_date : ''}
          </span>
          <button class="action-btn" style="margin-left:.75rem;font-size:.75rem" onclick="InstallmentsPage._showPlan(${activePlan.id})">View Plan</button>
        </div>` : `<button class="btn-icon" style="margin-bottom:1rem" onclick="InstallmentsPage.openNew()">💰 Create Payment Plan</button>`}
        <table class="data-table"><thead><tr><th>Date</th><th>Treatment</th><th>Amount</th><th>Receipt</th></tr></thead><tbody>
          ${txs.map(b => `<tr><td>${b.date}</td><td>${b.treatment_type}</td><td style="color:var(--green)">${fmt(b.cost)}</td>
            <td><button class="action-btn" onclick="Modals.printReceipt(${b.id})">🧾 Print</button></td></tr>`).join('')}
        </tbody></table>
      `;

      // Load xray gallery count
      const xrays = await DB.xrays.byPatient(id).catch(() => []);
      const legacyXray = p.xray_image && !p.xray_image.startsWith('/images/') ? p.xray_image : null;
      const allXrayCount = xrays.length + (legacyXray ? 1 : 0);

      $('detailXray').innerHTML = `
        <div style="text-align:center;padding:1.5rem">
          <div style="font-size:3rem;margin-bottom:.5rem">🩻</div>
          <div style="font-size:1.1rem;font-weight:600;margin-bottom:.5rem">${allXrayCount} X-ray${allXrayCount !== 1 ? 's' : ''} on file</div>
          <button class="btn-primary" onclick="Modals.xrayGallery(${id})" style="margin:.5rem">📂 Open X-Ray Gallery</button>
          ${legacyXray ? `<div style="margin-top:1.5rem"><div style="font-size:.8rem;color:var(--text2);margin-bottom:.5rem">Legacy X-ray (${p.xray_date || 'no date'})</div>
            <img src="${legacyXray}" style="max-width:100%;max-height:300px;border-radius:8px;object-fit:contain"></div>` : ''}
        </div>`;

      // Dental Chart tab - inline mini chart view
      $('detailChart').innerHTML = `
        <div style="text-align:center;padding:1.5rem">
          <div style="font-size:3rem;margin-bottom:.5rem">🦷</div>
          <p style="color:var(--text2);margin-bottom:1rem">View full treatment history overlaid on a dental chart. Treated teeth are highlighted.</p>
          <button class="btn-primary" onclick="DentalChart.open(${id})">🗺 Open Interactive Dental Chart</button>
          <div style="margin-top:1.5rem">
            ${txs.length ? `<p style="font-size:.85rem;color:var(--text2)">Teeth with recorded treatments:</p>
            <div style="display:flex;flex-wrap:wrap;gap:.5rem;justify-content:center;margin-top:.5rem">
              ${[...new Set(txs.flatMap(t => t.tooth_number ? t.tooth_number.split(',').map(s=>s.trim()).filter(Boolean) : []))].map(n =>
                `<span style="background:var(--accent);color:#fff;padding:.2rem .5rem;border-radius:999px;font-size:.8rem">#${n}</span>`
              ).join('')}
            </div>` : '<p style="font-size:.85rem;color:var(--text2)">No tooth-specific treatments recorded yet.</p>'}
          </div>
        </div>`;

      this.open('modalPatientDetail');
    } catch(e) {
      console.error(e);
      toast('Failed to load patient details', 'error');
    }
  },

  /* ── USERS / PASSWORDS ────────────────────────── */
  newUser() {
    this._resetUserModal();
    this.open('modalNewUser');
  },

  _resetUserModal() {
    ['nu_user','nu_pass'].forEach(id => $(id) && ($(id).value = ''));
    if ($('nu_role')) $('nu_role').value = 'receptionist';
    const foot = $('userModalFoot');
    if (foot) {
      foot.innerHTML = `
        <button class="btn-ghost" onclick="Modals.close()">Cancel</button>
        <button class="btn-primary" onclick="Actions.addUser()">✓ Create User</button>
      `;
    }
  },

  async editUser(id) {
    try {
      const u = await DB.tables.users.find(id);
      if (!u) return;
      this._resetUserModal();
      $('nu_user').value = u.username;
      $('nu_pass').value = u.password || '';
      if ($('nu_role')) $('nu_role').value = u.role;

      const foot = $('userModalFoot');
      if (foot) {
        foot.innerHTML = `
          <button class="btn-ghost" onclick="Modals.close()">Cancel</button>
          <button class="btn-primary" onclick="Actions.updateUser(${id})">✓ Update User</button>
        `;
      }
      this.open('modalNewUser');
    } catch(e) { toast('Error loading user', 'error'); }
  },

  async viewUser(id) {
    try {
      const u = await DB.tables.users.find(id);
      if (!u) return;
      const session = DB.auth.current();
      const isAdmin = session?.role === 'admin';
      $('userDetailBody').innerHTML = `
        <div class="detail-info-grid">
          <div class="detail-info-item"><label>Username</label><span><strong>${u.username}</strong></span></div>
          <div class="detail-info-item"><label>Role</label><span><span class="badge ${u.role === 'admin' ? 'badge-urgent' : 'badge-info'}">${u.role}</span></span></div>
          <div class="detail-info-item"><label>Password</label><span>
            ${isAdmin && u.password
              ? `<code style="letter-spacing:2px;user-select:all">${u.password}</code>`
              : `<span style="letter-spacing:3px">••••••</span>`}
          </span></div>
          <div class="detail-info-item"><label>Doctor ID</label><span>${u.doctor_id || '—'}</span></div>
          <div class="detail-info-item"><label>Last Login</label><span>${u.last_login ? u.last_login.split('T')[0] : '—'}</span></div>
        </div>
        ${isAdmin ? `
        <div style="margin-top:1rem;display:flex;gap:.5rem">
          <button class="btn-primary" onclick="Modals.close();Modals.editUser(${id})">✏ Edit</button>
          <button class="btn-ghost danger" onclick="Modals.close();Actions.deleteUser(${id})">🗑 Delete</button>
        </div>` : ''}
      `;
      this.open('modalUserDetail');
    } catch(e) { toast('Error loading user details', 'error'); }
  },

  /* ── DISCOUNT CODES ───────────────────────────── */
  newDiscountCode() {
    this._resetDiscountModal();
    this.open('modalNewDiscountCode');
  },

  _resetDiscountModal() {
    ['dc_code','dc_value','dc_desc'].forEach(id => $(id) && ($(id).value = ''));
    if ($('dc_type'))   $('dc_type').value   = 'percent';
    if ($('dc_active')) $('dc_active').value = '1';
    const foot = $('discountModalFoot');
    if (foot) {
      foot.innerHTML = `
        <button class="btn-ghost" onclick="Modals.close()">Cancel</button>
        <button class="btn-primary" onclick="Actions.addDiscountCode()">✓ Save Code</button>
      `;
    }
  },

  async editDiscountCode(id) {
    try {
      const dc = await DB.tables.discount_codes.find(id);
      if (!dc) return;
      this._resetDiscountModal();
      $('dc_code').value  = dc.code;
      $('dc_type').value  = dc.discount_type;
      $('dc_value').value = dc.value;
      $('dc_desc').value  = dc.description || '';
      if ($('dc_active')) $('dc_active').value = dc.is_active ? '1' : '0';

      const foot = $('discountModalFoot');
      if (foot) {
        foot.innerHTML = `
          <button class="btn-ghost" onclick="Modals.close()">Cancel</button>
          <button class="btn-primary" onclick="Actions.updateDiscountCode(${id})">✓ Update Code</button>
        `;
      }
      this.open('modalNewDiscountCode');
    } catch(e) { toast('Error loading discount code', 'error'); }
  },

  async viewDiscountCode(id) {
    try {
      const dc = await DB.tables.discount_codes.find(id);
      if (!dc) return;
      $('discountDetailBody').innerHTML = `
        <div class="detail-info-grid">
          <div class="detail-info-item"><label>Code</label><span><code style="font-size:1.1rem;letter-spacing:2px;color:var(--accent)">${dc.code}</code></span></div>
          <div class="detail-info-item"><label>Type</label><span>${dc.discount_type === 'percent' ? 'Percentage (%)' : 'Fixed Amount (E£)'}</span></div>
          <div class="detail-info-item"><label>Value</label><span style="color:var(--green);font-weight:700">${dc.discount_type === 'percent' ? dc.value + '%' : 'E£' + Number(dc.value).toLocaleString()}</span></div>
          <div class="detail-info-item"><label>Status</label><span><span class="badge ${dc.is_active ? 'badge-confirmed' : 'badge-cancelled'}">${dc.is_active ? 'Active' : 'Inactive'}</span></span></div>
          <div class="detail-info-item full"><label>Description</label><span>${dc.description || '—'}</span></div>
          <div class="detail-info-item"><label>Created</label><span>${dc.created_at ? dc.created_at.split('T')[0] : '—'}</span></div>
        </div>
        <div style="margin-top:1rem;display:flex;gap:.5rem">
          <button class="btn-primary" onclick="Modals.close();Modals.editDiscountCode(${dc.id})">✏ Edit</button>
          <button class="btn-ghost danger" onclick="Modals.close();Actions.deleteDiscountCode(${dc.id})">🗑 Delete</button>
        </div>
      `;
      this.open('modalDiscountDetail');
    } catch(e) { toast('Error loading discount code', 'error'); }
  },

  /* ── ADD PATIENT TO WAITING QUEUE ────────────────── */
  async addPatientToQueue() {
    try {
      const patients = await DB.tables.patients.all();
      const queue    = await DB.waiting.all().catch(() => []);
      const inQueueIds = new Set(queue.map(q => String(q.patient_id)));

      $('queue_patient').innerHTML = '<option value="">Select patient…</option>' +
        patients
          .filter(p => !inQueueIds.has(String(p.id)))
          .map(p => `<option value="${p.id}">${p.full_name}${p.phone ? ' — ' + p.phone : ''}</option>`)
          .join('');

      if ($('queue_notes')) $('queue_notes').value = '';
      this.open('modalAddToQueue');
    } catch(e) { toast('Error loading patients', 'error'); console.error(e); }
  },

  /* ── CONFIRM TREATMENT MODAL ──────────────────────── */
  async confirmTreatment(apptId) {
    try {
      const appt = await DB.tables.appointments.find(apptId);
      if (!appt) { toast('Appointment not found', 'error'); return; }

      const patient = await DB.tables.patients.find(appt.patient_id).catch(() => null);
      const doctor  = await DB.tables.doctors.find(appt.doctor_id).catch(() => null);
      const patName = patient?.full_name || `Patient #${appt.patient_id}`;
      const drName  = doctor?.full_name  || `Doctor #${appt.doctor_id}`;

      // Store appt id for actions
      $('modalConfirmTreatment').dataset.apptId = apptId;

      $('confirmTxInfo').innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">
          <div><span style="color:var(--text2);font-size:.8rem">Patient</span><br><strong>${patName}</strong></div>
          <div><span style="color:var(--text2);font-size:.8rem">Doctor</span><br><strong>${drName}</strong></div>
          <div><span style="color:var(--text2);font-size:.8rem">Treatment</span><br>${appt.treatment_type || '—'}</div>
          <div><span style="color:var(--text2);font-size:.8rem">Date</span><br>${appt.date}</div>
          ${appt.payment_method ? `<div><span style="color:var(--text2);font-size:.8rem">Payment</span><br>${appt.payment_method}</div>` : ''}
          ${appt.discount_code ? `<div><span style="color:var(--text2);font-size:.8rem">Discount Code</span><br><span class="badge badge-normal">🏷 ${appt.discount_code}</span></div>` : ''}
        </div>
      `;

      // Pre-fill discount code from appointment
      if ($('ct_discount_code')) $('ct_discount_code').value = appt.discount_code || '';
      if ($('ct_cost'))          $('ct_cost').value = '';
      if ($('ct_discount_info')) { $('ct_discount_info').style.display = 'none'; $('ct_discount_info').textContent = ''; }
      if ($('ct_final_amount'))  $('ct_final_amount').textContent = 'E£ 0.00';

      // Store validated discount data
      $('modalConfirmTreatment').dataset.discountPct   = '';
      $('modalConfirmTreatment').dataset.discountFixed = '';

      // Live cost update
      const costInput = $('ct_cost');
      if (costInput) {
        costInput.oninput = () => Actions._updateFinalAmount();
      }

      // If appointment already has a discount code, auto-validate
      if (appt.discount_code) {
        await Actions.validateDiscountCode(true);
      }

      this.open('modalConfirmTreatment');
    } catch(e) { toast('Error loading appointment', 'error'); console.error(e); }
  },

  /* ── RECEIPT FORM (manual entry, prints via iframe) ──── */
  async printReceipt(treatmentId) {
    try {
      const t  = await DB.tables.treatments.find(treatmentId);
      const p  = await DB.tables.patients.find(t.patient_id);
      const d  = t.doctor_id ? await DB.tables.doctors.find(t.doctor_id).catch(()=>null) : null;
      const settings  = await DB.settings.get().catch(()=>({}));
      const clinicName  = settings?.clinic_name  || settings?.clinic?.name    || 'DentCare Pro';
      const clinicPhone = settings?.clinic_phone || settings?.clinic?.phone   || '';
      const clinicAddr  = settings?.clinic_address||settings?.clinic?.address || '';
      const currency    = settings?.clinic?.currency || settings?.currency    || 'EGP';

      let receiptNo = '';
      try { const r = await DB.fetch(`/receipts/number/${treatmentId}`); receiptNo = r.receipt_no; }
      catch(e){ receiptNo = `RX-${new Date().getFullYear()}-${String(treatmentId).padStart(5,'0')}`; }

      // Remove any stale modal
      document.getElementById('modalReceiptForm')?.remove();

      const modal = document.createElement('div');
      modal.id        = 'modalReceiptForm';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-head">
          <h3>🧾 Receipt — ${p?.full_name || 'Patient'}</h3>
          <button class="close-btn" onclick="Modals.closeReceipt()">×</button>
        </div>
        <div class="modal-body">

          <!-- Patient info strip -->
          <div style="background:var(--surface2);border-radius:10px;padding:.75rem 1rem;margin-bottom:1.25rem;display:grid;grid-template-columns:1fr 1fr;gap:.4rem .75rem;font-size:.83rem">
            <div><span style="color:var(--muted)">Patient:</span> <strong>${p?.full_name||'—'}</strong></div>
            <div><span style="color:var(--muted)">No:</span> <strong>${p?.patient_no||'—'}</strong></div>
            <div><span style="color:var(--muted)">Phone:</span> <strong>${p?.phone||'—'}</strong></div>
            <div><span style="color:var(--muted)">Receipt #:</span> <strong>${receiptNo}</strong></div>
          </div>

          <!-- Manual entry fields -->
          <div class="form-grid">
            <div class="form-group">
              <label>Date</label>
              <input id="rf_date" type="date" value="${t.date||new Date().toISOString().slice(0,10)}">
            </div>
            <div class="form-group">
              <label>Treatment / Service</label>
              <input id="rf_treatment" value="${(t.treatment_type||'').replace(/"/g,'&quot;')}" placeholder="Treatment performed">
            </div>
            <div class="form-group">
              <label>Doctor</label>
              <input id="rf_doctor" value="${d?d.full_name:''}" placeholder="Doctor name">
            </div>
            <div class="form-group">
              <label>Tooth / Area</label>
              <input id="rf_tooth" value="${t.tooth_number||''}" placeholder="e.g. 14, 15">
            </div>
            <div class="form-group">
              <label>Amount (${currency})</label>
              <input id="rf_amount" type="number" min="0" step="0.01" value="${t.cost||''}" placeholder="0.00">
            </div>
            <div class="form-group">
              <label>Discount (%)</label>
              <input id="rf_discount" type="number" min="0" max="100" step="1" value="0" placeholder="0">
            </div>
            <div class="form-group">
              <label>Payment Method</label>
              <select id="rf_pay">
                <option value="Cash">💵 Cash</option>
                <option value="Card">💳 Card</option>
                <option value="Insurance">🏥 Insurance</option>
                <option value="Installment">📆 Installment</option>
                <option value="Bank Transfer">🏦 Bank Transfer</option>
              </select>
            </div>
            <div class="form-group">
              <label>Payment Status</label>
              <select id="rf_status">
                <option value="Paid">✅ Paid</option>
                <option value="Partial">⚠️ Partial</option>
                <option value="Pending">🕐 Pending</option>
              </select>
            </div>
            <div class="form-group full">
              <label>Notes (appear on receipt)</label>
              <textarea id="rf_notes" rows="2" style="resize:vertical" placeholder="Any additional notes…"></textarea>
            </div>
          </div>

          <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:.5rem;flex-wrap:wrap">
            <button class="btn-icon" onclick="Modals.closeReceipt()">Cancel</button>
            <button class="btn-primary" onclick="Modals._doPrintReceipt('${receiptNo}','${clinicName}','${clinicPhone}','${clinicAddr}','${currency}','${p?.full_name||''}','${p?.patient_no||''}','${p?.phone||''}')">🖨️ Print Receipt</button>
          </div>
        </div>`;

      // Nuke any other open modals first — prevents stacking
      this._nukeOverlay();
      modal.dataset.dynamic = '1';
      $('modalOverlay').appendChild(modal);
      $('modalOverlay').classList.add('open');
    } catch(e) { toast('Error opening receipt form','error'); console.error(e); }
  },

  closeReceipt() {
    this._nukeOverlay();
  },

  _doPrintReceipt(receiptNo, clinicName, clinicPhone, clinicAddr, currency, patName, patNo, patPhone) {
    const date      = $('rf_date')?.value      || '';
    const treatment = $('rf_treatment')?.value || '';
    const doctor    = $('rf_doctor')?.value    || '';
    const tooth     = $('rf_tooth')?.value     || '';
    const amount    = parseFloat($('rf_amount')?.value  || 0);
    const disc      = parseFloat($('rf_discount')?.value|| 0);
    const discAmt   = disc > 0 ? (amount * disc / 100) : 0;
    const total     = amount - discAmt;
    const payMethod = $('rf_pay')?.value    || 'Cash';
    const status    = $('rf_status')?.value || 'Paid';
    const notes     = $('rf_notes')?.value  || '';

    const statusColor = status==='Paid' ? '#15803d' : status==='Partial' ? '#854d0e' : '#991b1b';
    const statusBg    = status==='Paid' ? '#dcfce7' : status==='Partial' ? '#fef9c3' : '#fee2e2';
    const stampColor  = status==='Paid' ? '#7c3aed' : '#d97706';

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Receipt ${receiptNo}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',sans-serif;max-width:420px;margin:0 auto;padding:1.5rem;color:#1a1a1a;background:#fff}
.hd{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem}
.clinic{font-size:1.25rem;font-weight:700;color:#7c3aed}
.clinic-sub{font-size:.75rem;color:#666;margin-top:.2rem;line-height:1.6}
.stamp{width:65px;height:65px;border:3px solid ${stampColor};border-radius:50%;display:flex;align-items:center;justify-content:center;color:${stampColor};font-weight:900;font-size:.7rem;text-align:center;opacity:.8;flex-shrink:0}
.band{background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;text-align:center;padding:.45rem;border-radius:8px;font-weight:700;letter-spacing:2px;font-size:.85rem;margin-bottom:.4rem}
.rno{font-size:.7rem;color:#999;text-align:right;margin-bottom:.6rem}
.div{border:none;border-top:2px dashed #e5e7eb;margin:.65rem 0}
.div2{border:none;border-top:1px solid #e5e7eb;margin:.6rem 0}
.row{display:flex;justify-content:space-between;margin:.28rem 0;font-size:.86rem;gap:.5rem}
.lbl{color:#6b7280}.val{font-weight:500;text-align:right;word-break:break-word}
.totals{background:#f5f3ff;border-radius:8px;padding:.7rem 1rem;margin:.4rem 0}
.big{font-size:1.05rem;font-weight:700}.big .val{color:#7c3aed}
.disc .val{color:#16a34a}
.badge{display:inline-block;padding:.2rem .7rem;border-radius:999px;font-size:.75rem;font-weight:700;background:${statusBg};color:${statusColor}}
.notes{background:#fafafa;border:1px dashed #d1d5db;border-radius:6px;padding:.5rem .75rem;font-size:.78rem;color:#555;margin-top:.3rem}
.sig{display:flex;justify-content:flex-end;margin-top:1.5rem}
.sig-line{border-top:1px solid #374151;width:150px;text-align:center;padding-top:.25rem;font-size:.72rem;color:#555}
.footer{margin-top:1rem;padding-top:.6rem;border-top:1px dashed #ddd;text-align:center;font-size:.68rem;color:#bbb}
@media print{@page{margin:.4cm;size:A5}}
</style></head><body>
<div class="hd">
  <div>
    <div class="clinic">🦷 ${clinicName}</div>
    <div class="clinic-sub">${clinicPhone?'📞 '+clinicPhone+'<br>':''}${clinicAddr}</div>
  </div>
  <div class="stamp">${status.toUpperCase()}</div>
</div>
<div class="band">RECEIPT &nbsp;/&nbsp; إيصال دفع</div>
<div class="rno">No: ${receiptNo} &nbsp;|&nbsp; ${new Date().toLocaleDateString('en-GB')}</div>
<hr class="div">
<div class="row"><span class="lbl">Date / التاريخ</span><span class="val">${date}</span></div>
<div class="row"><span class="lbl">Patient / المريض</span><span class="val"><strong>${patName}</strong></span></div>
${patNo?`<div class="row"><span class="lbl">Patient No.</span><span class="val">${patNo}</span></div>`:''}
${patPhone?`<div class="row"><span class="lbl">Phone</span><span class="val">${patPhone}</span></div>`:''}
${doctor?`<div class="row"><span class="lbl">Doctor / الطبيب</span><span class="val">${doctor}</span></div>`:''}
<hr class="div">
${treatment?`<div class="row"><span class="lbl">Treatment / العلاج</span><span class="val">${treatment}</span></div>`:''}
${tooth?`<div class="row"><span class="lbl">Tooth(s) / الأسنان</span><span class="val">${tooth}</span></div>`:''}
<hr class="div">
<div class="totals">
  <div class="row"><span class="lbl">Amount / المبلغ</span><span class="val">${amount.toLocaleString()} ${currency}</span></div>
  ${disc>0?`<div class="row disc"><span class="lbl">Discount (${disc}%)</span><span class="val">−${discAmt.toLocaleString()} ${currency}</span></div>`:''}
  <hr class="div2">
  <div class="row big"><span>Total / الإجمالي</span><span class="val">${total.toLocaleString()} ${currency}</span></div>
</div>
<div class="row"><span class="lbl">Payment / الدفع</span><span class="val">${payMethod}</span></div>
<div class="row"><span class="lbl">Status / الحالة</span><span class="val"><span class="badge">${status}</span></span></div>
${notes?`<div class="notes">${notes}</div>`:''}
<div class="sig"><div class="sig-line">${doctor||'Doctor Signature'}</div></div>
<div class="footer">
  Thank you for choosing ${clinicName} &nbsp;·&nbsp; شكراً لاختيارك ${clinicName}<br>
  <span style="font-size:.6rem">${receiptNo} · ${new Date().toLocaleString()}</span>
</div>
<script>document.fonts.ready.then(()=>window.print())<\/script>
</body></html>`;

    let frame = document.getElementById('_receiptFrame');
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = '_receiptFrame';
      frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:none';
      document.body.appendChild(frame);
    }
    frame.srcdoc = html;
    frame.onload = () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch(e){} };
  },

  /* ── PRESCRIPTION FORM (manual entry, prints via iframe) ─ */
  async printPrescription(treatmentId) {
    try {
      const t  = await DB.tables.treatments.find(treatmentId);
      const p  = await DB.tables.patients.find(t.patient_id);
      const d  = t.doctor_id ? await DB.tables.doctors.find(t.doctor_id).catch(()=>null) : null;
      const settings  = await DB.settings.get().catch(()=>({}));
      const clinicName  = settings?.clinic_name  || settings?.clinic?.name    || 'DentCare Pro';
      const clinicPhone = settings?.clinic_phone || settings?.clinic?.phone   || '';
      const clinicAddr  = settings?.clinic_address||settings?.clinic?.address || '';

      document.getElementById('modalPrescForm')?.remove();

      const modal = document.createElement('div');
      modal.id        = 'modalPrescForm';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-head">
          <h3>℞ Prescription — ${p?.full_name||'Patient'}</h3>
          <button class="close-btn" onclick="Modals.closeReceipt()">×</button>
        </div>
        <div class="modal-body">

          <!-- Patient info strip -->
          <div style="background:var(--surface2);border-radius:10px;padding:.75rem 1rem;margin-bottom:1.25rem;display:grid;grid-template-columns:1fr 1fr;gap:.4rem .75rem;font-size:.83rem">
            <div><span style="color:var(--muted)">Patient:</span> <strong>${p?.full_name||'—'}</strong></div>
            <div><span style="color:var(--muted)">No:</span> <strong>${p?.patient_no||'—'}</strong></div>
            <div><span style="color:var(--muted)">Phone:</span> <strong>${p?.phone||'—'}</strong></div>
            <div><span style="color:var(--muted)">Treatment:</span> <strong>${t.treatment_type||'—'}</strong></div>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label>Date</label>
              <input id="px_date" type="date" value="${t.date||new Date().toISOString().slice(0,10)}">
            </div>
            <div class="form-group">
              <label>Doctor Name</label>
              <input id="px_doctor" value="${d?d.full_name:''}" placeholder="Doctor name">
            </div>
            <div class="form-group full">
              <label>Diagnosis / التشخيص</label>
              <input id="px_diag" value="${(t.diagnosis||'').replace(/"/g,'&quot;')}" placeholder="Clinical diagnosis…">
            </div>
            <div class="form-group full">
              <label>Medicines / الأدوية <span style="color:var(--danger)">*</span></label>
              <textarea id="px_rx" rows="6" style="resize:vertical;font-size:.88rem;line-height:1.7"
                placeholder="Write each medicine on a new line, e.g.:&#10;Amoxicillin 500mg — 3 times/day — 7 days&#10;Ibuprofen 400mg — as needed for pain&#10;Chlorhexidine mouthwash — twice/day">${t.prescription||''}</textarea>
            </div>
            <div class="form-group">
              <label>Follow-up Date</label>
              <input id="px_fu" type="date" value="${t.follow_up_date||''}">
            </div>
            <div class="form-group">
              <label>Doctor License No.</label>
              <input id="px_lic" value="${d?.license_no||''}" placeholder="License number">
            </div>
            <div class="form-group full">
              <label>Additional Notes</label>
              <textarea id="px_notes" rows="2" style="resize:vertical" placeholder="Allergies, special instructions…">${t.procedure_notes||''}</textarea>
            </div>
          </div>

          <div style="display:flex;gap:.5rem;justify-content:flex-end;margin-top:.5rem;flex-wrap:wrap">
            <button class="btn-icon" onclick="Modals.closeReceipt()">Cancel</button>
            <button class="btn-primary" onclick="Modals._doPrintPrescription('${clinicName}','${clinicPhone}','${clinicAddr}','${p?.full_name||''}','${p?.patient_no||''}','${t.treatment_type||''}')">🖨️ Print Prescription</button>
          </div>
        </div>`;

      // Nuke any other open modals first — prevents stacking
      this._nukeOverlay();
      modal.dataset.dynamic = '1';
      $('modalOverlay').appendChild(modal);
      $('modalOverlay').classList.add('open');
    } catch(e) { toast('Error opening prescription form','error'); console.error(e); }
  },

  _doPrintPrescription(clinicName, clinicPhone, clinicAddr, patName, patNo, treatmentType) {
    const date   = $('px_date')?.value   || '';
    const doctor = $('px_doctor')?.value || '';
    const diag   = $('px_diag')?.value   || treatmentType;
    const rx     = $('px_rx')?.value     || '';
    const fu     = $('px_fu')?.value     || '';
    const lic    = $('px_lic')?.value    || '';
    const notes  = $('px_notes')?.value  || '';

    if (!rx.trim()) { toast('Please enter the medicines first', 'warning'); return; }

    const rxLines = rx.split('\n')
      .map(l=>l.trim()).filter(Boolean)
      .map(l=>`<div class="rx-item">• ${l}</div>`).join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Prescription</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'DM Sans',sans-serif;max-width:520px;margin:1rem auto;padding:1.75rem 2rem;color:#1a1a1a;background:#fff;border:2px solid #7c3aed;border-radius:14px}
.hd{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem}
.clinic{font-size:1.25rem;font-weight:700;color:#7c3aed}
.clinic-sub{font-size:.75rem;color:#666;margin-top:.2rem;line-height:1.6}
.rx-sym{font-size:2.8rem;color:#7c3aed;font-style:italic;font-weight:900;line-height:1}
hr{border:none;border-top:1px solid #e5e7eb;margin:.8rem 0}
.lbl{font-size:.68rem;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:.1rem}
.val{font-size:.88rem;font-weight:600;margin-bottom:.65rem}
.rx-label{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#7c3aed;margin-bottom:.5rem}
.rx-box{border:1.5px solid #7c3aed;border-radius:8px;padding:1rem 1.25rem;min-height:90px;background:#faf8ff;margin-bottom:.85rem}
.rx-item{font-size:.88rem;line-height:1.85;border-bottom:1px dotted #e5e7eb;padding:.1rem 0}
.rx-item:last-child{border:none}
.fu{background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:.45rem .75rem;font-size:.8rem;font-weight:500;color:#15803d;margin-bottom:.65rem}
.notes-box{font-size:.78rem;color:#555;margin-bottom:.5rem}
.sig{display:flex;justify-content:flex-end;margin-top:2.5rem}
.sig-line{border-top:1px solid #374151;width:190px;text-align:center;padding-top:.3rem;font-size:.75rem;color:#555}
.footer{margin-top:1rem;padding-top:.65rem;border-top:1px dashed #e5e7eb;text-align:center;font-size:.66rem;color:#bbb}
@media print{body{border:none;border-radius:0;margin:0;padding:1rem}@page{margin:.4cm;size:A5}}
</style></head><body>
<div class="hd">
  <div>
    <div class="clinic">🦷 ${clinicName}</div>
    <div class="clinic-sub">${clinicPhone?'📞 '+clinicPhone+'<br>':''}${clinicAddr?clinicAddr+'<br>':''}Dental Prescription</div>
  </div>
  <div class="rx-sym">℞</div>
</div>
<hr>
<div class="lbl">Patient Name</div><div class="val">${patName}</div>
${patNo?`<div class="lbl">Patient No.</div><div class="val">${patNo}</div>`:''}
<div class="lbl">Date</div><div class="val">${date}</div>
${diag?`<div class="lbl">Diagnosis</div><div class="val">${diag}</div>`:''}
<hr>
<div class="rx-label">℞ &nbsp; Medicines / الأدوية</div>
<div class="rx-box">${rxLines}</div>
${fu?`<div class="fu">📅 Follow-up: <strong>${fu}</strong></div>`:''}
${notes?`<div class="notes-box"><strong>Notes:</strong> ${notes.replace(/\n/g,'<br>')}</div>`:''}
<div class="sig">
  <div class="sig-line">${doctor||'Doctor Signature'}${lic?`<br><small>Lic: ${lic}</small>`:''}</div>
</div>
<div class="footer">${clinicName} · ${new Date().toLocaleString()}</div>
<script>document.fonts.ready.then(()=>window.print())<\/script>
</body></html>`;

    let frame = document.getElementById('_prescFrame');
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = '_prescFrame';
      frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:none';
      document.body.appendChild(frame);
    }
    frame.srcdoc = html;
    frame.onload = () => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch(e){} };
  },

  /* ── PATIENT FULL MEDICAL FILE ────────────────────────── */
  async printPatientFile(patientId) {
    try {
      toast('Generating medical file…', 'info');
      const [patient, treatments, appointments, xrays] = await Promise.all([
        DB.tables.patients.find(patientId),
        DB.fetch(`/treatments?patient_id=${patientId}`),
        DB.fetch(`/appointments?patient_id=${patientId}`),
        DB.xrays.byPatient(patientId).catch(() => [])
      ]);
      const doctors = await DB.tables.doctors.all();
      const dcMap = Object.fromEntries(doctors.map(d => [d.id, d.full_name]));

      const txRows = treatments.map(t => `
        <tr><td>${t.date}</td><td>${dcMap[t.doctor_id]||'—'}</td><td>${t.treatment_type}</td>
        <td>${t.tooth_number||'—'}</td><td>${fmt(t.cost)}</td><td>${t.diagnosis||'—'}</td>
        <td>${t.prescription||'—'}</td></tr>`).join('') || '<tr><td colspan="7">No treatments</td></tr>';

      const apptRows = appointments.map(a => `
        <tr><td>${a.date}</td><td>${a.time}</td><td>${dcMap[a.doctor_id]||'—'}</td>
        <td>${a.treatment_type||'—'}</td><td>${a.status}</td></tr>`).join('') || '<tr><td colspan="5">No appointments</td></tr>';

      const settings = await DB.settings.get().catch(() => ({}));
      const clinicName = settings?.clinic_name || 'DentCare Pro';

      const win = window.open('', '_blank');
      win.document.write(`<!DOCTYPE html><html><head>
        <title>Medical File — ${patient.full_name}</title>
        <style>
          body{font-family:Arial,sans-serif;padding:2rem;color:#1a1a1a;font-size:.9rem}
          h1{color:#7c3aed}h2{color:#7c3aed;margin-top:2rem;border-bottom:2px solid #7c3aed;padding-bottom:.25rem}
          table{width:100%;border-collapse:collapse;margin:.75rem 0}
          th{background:#7c3aed;color:#fff;padding:.4rem;text-align:left;font-size:.8rem}
          td{padding:.35rem;border-bottom:1px solid #eee;font-size:.8rem}
          .info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem;margin:.75rem 0}
          .info-item label{font-size:.72rem;color:#888;display:block}
          .info-item span{font-weight:600}
          @media print{@page{margin:1cm}}
        </style></head><body>
        <h1>🦷 ${clinicName} — Patient Medical File</h1>
        <p>Generated: ${new Date().toLocaleString()} · Patient #${patient.patient_no}</p>
        <h2>Personal Information</h2>
        <div class="info-grid">
          <div class="info-item"><label>Full Name</label><span>${patient.full_name}</span></div>
          <div class="info-item"><label>Phone</label><span>${patient.phone||'—'}</span></div>
          <div class="info-item"><label>Date of Birth</label><span>${patient.date_of_birth||'—'}</span></div>
          <div class="info-item"><label>Age</label><span>${patient.age||'—'}</span></div>
          <div class="info-item"><label>Gender</label><span>${patient.gender||'—'}</span></div>
          <div class="info-item"><label>Blood Type</label><span>${patient.blood_type||'—'}</span></div>
          <div class="info-item"><label>Insurance</label><span>${patient.insurance||'—'}</span></div>
          <div class="info-item"><label>Email</label><span>${patient.email||'—'}</span></div>
          <div class="info-item"><label>Address</label><span>${patient.address||'—'}</span></div>
          <div class="info-item"><label>Medical Conditions</label><span>${patient.medical_conditions||'None'}</span></div>
          <div class="info-item"><label>Allergies</label><span>${patient.allergies||'None'}</span></div>
          <div class="info-item"><label>Dental Concerns</label><span>${patient.dental_concerns||'—'}</span></div>
        </div>
        <h2>Treatment History (${treatments.length})</h2>
        <table><thead><tr><th>Date</th><th>Doctor</th><th>Treatment</th><th>Teeth</th><th>Cost</th><th>Diagnosis</th><th>Prescription</th></tr></thead>
        <tbody>${txRows}</tbody></table>
        <h2>Appointment History (${appointments.length})</h2>
        <table><thead><tr><th>Date</th><th>Time</th><th>Doctor</th><th>Treatment</th><th>Status</th></tr></thead>
        <tbody>${apptRows}</tbody></table>
        ${xrays.length ? `<h2>X-Ray Gallery (${xrays.length})</h2>
          <div style="display:flex;flex-wrap:wrap;gap:1rem">
          ${xrays.map(x=>`<div style="text-align:center;width:150px"><img src="${x.url}" style="width:150px;height:120px;object-fit:cover;border-radius:6px"><div style="font-size:.7rem;color:#666">${x.xray_date}</div></div>`).join('')}
          </div>` : ''}
        <script>window.onload=()=>window.print()</script>
      </body></html>`);
      win.document.close();
    } catch(e) { toast('Error generating medical file', 'error'); console.error(e); }
  },

  /* ── XRAY GALLERY ─────────────────────────────────────── */
  async xrayGallery(patientId) {
    let xrays = await DB.xrays.byPatient(patientId).catch(() => []);
    const patient = await DB.tables.patients.find(patientId).catch(() => null);

    const render = (list) => {
      const container = $('xrayGalleryGrid');
      if (!container) return;
      container.innerHTML = list.length === 0
        ? `<p style="color:var(--text2);text-align:center;padding:2rem">No X-rays uploaded yet</p>`
        : list.map(x => `
          <div style="position:relative">
            <img src="${x.url}" style="width:100%;height:120px;object-fit:cover;border-radius:8px;cursor:pointer"
                 onclick="window.open('${x.url}','_blank')">
            <div style="font-size:.75rem;color:var(--text2);margin-top:.25rem">${x.xray_date}${x.notes?'<br>'+x.notes:''}</div>
            <button style="position:absolute;top:4px;right:4px;background:var(--red);color:#fff;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:.7rem;line-height:1"
                    onclick="XrayGallery._delete(${x.id},${patientId})">✕</button>
          </div>`).join('');
    };

    // Make XrayGallery actions accessible
    window.XrayGallery = {
      async _delete(xrayId, pid) {
        if (!confirm('Delete this X-ray?')) return;
        try {
          await DB.xrays.delete(xrayId);
          xrays = await DB.xrays.byPatient(pid);
          render(xrays);
          toast('X-ray deleted', 'info');
        } catch(e) { toast('Delete failed', 'error'); }
      },
      async _upload(pid) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
          const file = e.target.files[0];
          if (!file) return;
          try {
            const reader = new FileReader();
            reader.onload = async (ev) => {
              // Static mode: base64 IS the URL
              const url = ev.target.result;
              const xrayDate = $('xrayGalleryDate')?.value || today();
              const notes    = $('xrayGalleryNotes')?.value || '';
              await DB.xrays.add({ patient_id: pid, url, xray_date: xrayDate, notes });
              xrays = await DB.xrays.byPatient(pid);
              render(xrays);
              toast('X-ray uploaded ✓', 'success');
            };
            reader.readAsDataURL(file);
          } catch(err) { toast('Upload failed: '+err.message, 'error'); }
        };
        input.click();
      }
    };

    const html = `
    <div id="xrayGalleryModal" class="modal-overlay open" onclick="if(event.target===this)this.remove()">
      <div class="modal" style="max-width:700px;max-height:90vh;overflow-y:auto">
        <div class="modal-head">
          <h3>🩻 X-Ray Gallery — ${patient?.full_name || ''}</h3>
          <button class="close-btn" onclick="$('xrayGalleryModal').remove()">✕</button>
        </div>
        <div class="modal-body">
          <div style="display:flex;gap:.75rem;margin-bottom:1rem;align-items:flex-end;flex-wrap:wrap">
            <div class="form-group" style="flex:1;min-width:130px"><label>X-ray Date</label><input id="xrayGalleryDate" type="date" value="${today()}"></div>
            <div class="form-group" style="flex:2;min-width:160px"><label>Notes</label><input id="xrayGalleryNotes" placeholder="Optional notes…"></div>
            <button class="btn-primary" onclick="XrayGallery._upload(${patientId})">📤 Upload X-ray</button>
          </div>
          <div id="xrayGalleryGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem"></div>
        </div>
        <div class="modal-foot"><button class="btn-ghost" onclick="$('xrayGalleryModal').remove()">Close</button></div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    render(xrays);
  },

  /* ── FOLLOW-UP ALERTS CHECK ───────────────────────────── */
  async checkFollowUps() {
    try {
      // Use reminders API for follow-ups (faster, server-filtered)
      const [due, overduePayments] = await Promise.all([
        DB.reminders.followups(3).catch(() => null),
        DB.reminders.overdueInstallments().catch(() => [])
      ]);

      // Fallback: query locally if API fails
      let followUps = due;
      if (!followUps) {
        const treatments = await DB.tables.treatments.all();
        const today_str  = today();
        const soon       = new Date();
        soon.setDate(soon.getDate() + 3);
        const soonStr    = soon.toISOString().split('T')[0];
        const patients   = await DB.tables.patients.all();
        const ptMap      = Object.fromEntries(patients.map(p => [p.id, p.full_name]));
        followUps = treatments
          .filter(t => t.follow_up === 1 && t.follow_up_date && t.follow_up_date >= today_str && t.follow_up_date <= soonStr)
          .map(t => ({ ...t, patient_name: ptMap[t.patient_id] || 'Patient #' + t.patient_id }));
      }

      if (!followUps.length && !overduePayments.length) {
        toast('No follow-ups or overdue payments due', 'info');
        return;
      }

      const today_str = today();

      const followUpHtml = followUps.length ? `
        <div style="font-size:.85rem;font-weight:600;color:var(--text2);margin-bottom:.5rem">🔄 Follow-up Reminders</div>
        ${followUps.map(t => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:.5rem;border-bottom:1px solid var(--border)">
            <div>
              <strong>${t.patient_name}</strong>
              <span style="color:var(--text2);font-size:.85rem"> · ${t.treatment_type}</span>
              ${t.patient_phone ? `<br><span style="font-size:.75rem;color:var(--text2)">${t.patient_phone}</span>` : ''}
            </div>
            <div style="text-align:right">
              <span style="color:${t.follow_up_date === today_str ? 'var(--red)' : 'var(--orange)'};font-weight:600">
                ${t.follow_up_date === today_str ? 'TODAY' : t.follow_up_date}
              </span>
              ${t.patient_phone ? `<br><button class="action-btn" style="font-size:.7rem;margin-top:.2rem"
                onclick="Modals.sendWhatsAppReminder('${t.patient_phone}','${(t.patient_name||'').replace(/'/g,"\\'")}','${t.follow_up_date}','—','${(t.doctor_name||'').replace(/'/g,"\\'")}')">💬 WA</button>` : ''}
            </div>
          </div>`).join('')}
      ` : '';

      const overdueHtml = overduePayments.length ? `
        <div style="font-size:.85rem;font-weight:600;color:var(--text2);margin:1rem 0 .5rem">💰 Overdue Installments</div>
        ${overduePayments.slice(0, 5).map(p => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:.5rem;border-bottom:1px solid var(--border)">
            <div>
              <strong>${p.patient_name || '—'}</strong>
              <span style="color:var(--text2);font-size:.85rem"> · Installment #${p.installment_no}</span>
            </div>
            <span style="color:var(--red);font-weight:600">${fmt(p.amount)} — due ${p.due_date}</span>
          </div>`).join('')}
        ${overduePayments.length > 5 ? `<div style="font-size:.8rem;color:var(--text2);padding:.5rem">+${overduePayments.length-5} more…</div>` : ''}
      ` : '';

      const html = `
      <div id="followUpAlert" class="modal-overlay open" onclick="if(event.target===this)this.remove()">
        <div class="modal modal-sm">
          <div class="modal-head"><h3>🔔 Alerts & Reminders</h3><button class="close-btn" onclick="$('followUpAlert').remove()">✕</button></div>
          <div class="modal-body" style="max-height:60vh;overflow-y:auto">
            ${followUpHtml}${overdueHtml}
          </div>
          <div class="modal-foot">
            <button class="btn-ghost" onclick="$('followUpAlert').remove()">Dismiss</button>
            ${followUps.length ? `<button class="btn-primary" onclick="App.page('treatments');$('followUpAlert').remove()">View Treatments</button>` : ''}
          </div>
        </div>
      </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
    } catch(e) { console.error('checkFollowUps error:', e); }
  },

  /* ── WHATSAPP / SMS APPOINTMENT REMINDER ─────────────── */
  sendWhatsAppReminder(phone, patientName, date, time, doctorName) {
    const clinicName = document.querySelector('.brand-name')?.textContent || 'DentCare Pro';
    // Normalize patient phone — add Egypt country code if needed
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '20' + cleanPhone.slice(1);
    if (!cleanPhone.startsWith('20') && cleanPhone.length === 10) cleanPhone = '20' + cleanPhone;

    const msgEn = `Hello ${patientName},\n\nThis is a reminder from ${clinicName}.\n\nYour appointment is scheduled for:\n📅 Date: ${date}\n🕐 Time: ${time}\n👨‍⚕️ Doctor: ${doctorName}\n\nPlease arrive 10 minutes early. Call us if you need to reschedule.\n\nThank you!`;
    const msgAr = `مرحباً ${patientName},\n\nتذكير من ${clinicName}\n\nموعدك:\n📅 التاريخ: ${date}\n🕐 الوقت: ${time}\n👨‍⚕️ الدكتور: ${doctorName}\n\nيرجى الحضور قبل 10 دقائق. شكراً لك!`;
    const isAr  = document.body.classList.contains('lang-ar');
    const msg   = encodeURIComponent(isAr ? msgAr : msgEn);

    // Use clinic WhatsApp number if available (opens wa.me with pre-filled message)
    const waNum = window._clinicSettings?.clinic?.whatsapp
      ? window._clinicSettings.clinic.whatsapp.replace(/\D/g, '')
      : cleanPhone;

    const url = `https://wa.me/${cleanPhone}?text=${msg}`;
    window.open(url, '_blank');
  },

  /* ── ARABIC / LANGUAGE TOGGLE (handled by CSS class on body) */
  /* Keep toggleArabic as an alias for backward compatibility */
  toggleArabic() { this.toggleLanguage(); },

  /* ── BILINGUAL TOGGLE: cycles EN ↔ AR ─────────────────────────── */
  toggleLanguage() {
    const body  = document.body;
    const wasAr = body.classList.contains('lang-ar');

    // Toggle: EN → AR → EN
    const nextLang = wasAr ? 'en' : 'ar';

    // Remove all lang classes (also cleans up any legacy lang-fr)
    body.classList.remove('lang-ar', 'lang-fr');

    // Apply new lang class
    if (nextLang === 'ar') body.classList.add('lang-ar');

    // Persist choice
    localStorage.setItem('dentcare_lang', nextLang);

    // Toast notification
    const toastMsgs = {
      ar: 'تم التبديل إلى العربية 🌐',
      en: 'Switched to English 🌐'
    };
    toast(toastMsgs[nextLang] || toastMsgs.en, 'success');

    // Update all translatable elements (data-en / data-ar)
    document.querySelectorAll('[data-en]').forEach(el => {
      el.textContent = (nextLang === 'ar')
        ? (el.dataset.ar || el.dataset.en)
        : el.dataset.en;
    });

    // Update lang toggle button label: show the NEXT language the button will switch to
    const btn = document.getElementById('langToggleBtn');
    if (btn) {
      btn.textContent = (nextLang === 'ar') ? '🌐 EN' : '🌐 AR';
    }

    // Update RTL direction for Arabic only
    document.documentElement.dir = (nextLang === 'ar') ? 'rtl' : 'ltr';

    // Update page title for current page
    const pageTitleEl = document.getElementById('pageTitle');
    if (pageTitleEl) {
      const pageTitles = {
        en: {
          dashboard: 'Dashboard', patients: 'Patients', appointments: 'Appointments',
          treatments: 'Treatments', doctors: 'Doctors', finance: 'Finance',
          inventory: 'Inventory', analytics: 'Analytics', settings: 'Settings',
          waiting: 'Waiting Room', calendar: 'Calendar', commissions: 'Commissions',
          installments: 'Payment Plans', passwords: 'Passwords', messages: 'Messages',
          backup: 'Backup & Restore', discount_codes: 'Discount Codes'
        },
        ar: {
          dashboard: 'لوحة التحكم', patients: 'المرضى', appointments: 'المواعيد',
          treatments: 'العلاجات', doctors: 'الأطباء', finance: 'المالية',
          inventory: 'المخزون', analytics: 'التحليلات', settings: 'الإعدادات',
          waiting: 'غرفة الانتظار', calendar: 'التقويم', commissions: 'العمولات',
          installments: 'خطط الدفع', passwords: 'كلمات المرور', messages: 'الرسائل',
          backup: 'النسخ الاحتياطي', discount_codes: 'أكواد الخصم'
        }
      };
      const cur    = typeof App !== 'undefined' ? App.currentPage : 'dashboard';
      const titles = pageTitles[nextLang] || pageTitles.en;
      if (titles[cur]) pageTitleEl.textContent = titles[cur];
    }
  }
};
