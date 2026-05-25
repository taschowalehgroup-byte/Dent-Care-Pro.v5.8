/* ═══════════════════════════════════════════════════════
   DentCare Pro — CRUD Action Handlers
   ═══════════════════════════════════════════════════════ */

const Actions = {
  async registerPatient() {
    try {
      const name  = $('np_name').value.trim();
      const phone = $('np_phone').value.trim();
      if (!name || !phone) { toast('Name and phone are required', 'error'); return }
      const dob = $('np_dob').value;
      const age = dob ? Math.floor((Date.now()-new Date(dob))/(365.25*24*3600*1000)) : null;

      const patient_no = await DB.helpers.nextPatientNo();

      await DB.tables.patients.insert({
        patient_no,
        full_name: name, phone,
        date_of_birth: dob, age,
        gender: $('np_gender').value,
        email: $('np_email').value,
        occupation: $('np_occupation').value,
        blood_type: $('np_blood').value,
        insurance: $('np_insurance').value,
        referral_source: $('np_ref').value,
        payment_method: $('np_pay').value,
        medical_conditions: $('np_conditions').value,
        allergies: $('np_allergies').value,
        dental_concerns: $('np_concerns').value,
        address: $('np_address').value,
        price: 0,
        xray_image: Modals._xrayUrl || Modals._xrayBase64 || null,
        xray_date:  $('np_xray_date')?.value  || null,
        xray_notes: $('np_xray_notes')?.value || null
      });
      Modals._clearXray();
      Modals.close();
      toast(`Patient ${name} registered!`, 'success');
      if (App.currentPage === 'patients') await Pages.patients.render();
      if (App.currentPage === 'waiting')  await Pages.waiting.render();
      await UI.updateBadges();
    } catch(e) { toast('Failed to register patient','error'); console.error(e); }
  },

  async updatePatient(id) {
    try {
      const name  = $('np_name').value.trim();
      const phone = $('np_phone').value.trim();
      if (!name || !phone) { toast('Name and phone are required', 'error'); return }
      const dob = $('np_dob').value;
      const age = dob ? Math.floor((Date.now()-new Date(dob))/(365.25*24*3600*1000)) : null;

      await DB.tables.patients.update(id, {
        full_name: name, phone,
        date_of_birth: dob, age,
        gender: $('np_gender').value,
        email: $('np_email').value,
        occupation: $('np_occupation').value,
        blood_type: $('np_blood').value,
        insurance: $('np_insurance').value,
        referral_source: $('np_ref').value,
        payment_method: $('np_pay').value,
        medical_conditions: $('np_conditions').value,
        allergies: $('np_allergies').value,
        dental_concerns: $('np_concerns').value,
        address: $('np_address').value,
        xray_image: Modals._xrayUrl || Modals._xrayBase64 || null,
        xray_date:  $('np_xray_date')?.value  || null,
        xray_notes: $('np_xray_notes')?.value || null
      });
      Modals.close();
      toast(`Patient ${name} updated!`, 'success');
      if (App.currentPage === 'patients') await Pages.patients.render();
      if (App.currentPage === 'dashboard') await Pages.dashboard.render();
    } catch(e) { toast('Failed to update patient','error'); console.error(e); }
  },

  async deletePatient(id) {
    if (!confirm('Delete this patient and all their records?')) return;
    try {
      // Remove from waiting room too
      try { await DB.waiting.removeByPatient(id); } catch(e) {}
      await DB.tables.patients.delete(id);
      toast('Patient deleted', 'error');
      await Pages.patients.render();
      await UI.updateBadges();
    } catch(e) { toast('Error deleting patient','error'); console.error(e); }
  },

  async scheduleAppt() {
    try {
      const pid = parseInt($('ap_patient').value);
      const did = parseInt($('ap_doctor').value);
      const date = $('ap_date').value;
      const time = $('ap_time').value;
      if (!pid||!did||!date||!time) { toast('Patient, doctor, date and time are required','error'); return }

      const payMethod = $('ap_pay_method')?.value || null;
      const discountCode = $('ap_discount_code')?.value?.trim() || null;

      const treatType   = $('ap_type').value;
      const apptCost    = parseFloat($('ap_cost')?.value || 0);

      // Calculate doctor commission snapshot at booking time
      let commRate = 0, commAmt = 0;
      if (did && apptCost > 0) {
        try {
          const doc = await DB.tables.doctors.find(did);
          const typeMap = {
            'General Checkup':'commission_filling','Cleaning/Scaling':'commission_filling',
            'Filling':'commission_crown','Root Canal':'commission_root_canal',
            'Extraction':'commission_extraction','Implant':'commission_implant',
            'Orthodontics':'commission_orthodontics','Crown/Bridge':'commission_crown'
          };
          const field = typeMap[treatType] || 'commission_other';
          commRate = parseFloat(doc[field] || doc.commission_other || 15);
          commAmt  = parseFloat((apptCost * commRate / 100).toFixed(2));
        } catch(e) {}
      }

      const appt = await DB.tables.appointments.insert({
        patient_id: pid, doctor_id: did,
        date, time,
        duration_min: parseInt($('ap_dur').value)||30,
        priority: $('ap_priority').value,
        treatment_type: treatType,
        chief_complaint: $('ap_complaint').value,
        notes: $('ap_notes').value,
        status: 'scheduled',
        discount_code: discountCode || null,
        payment_method: payMethod || null,
        cost:                    apptCost  || null,
        doctor_commission_pct:   commRate  || null,
        doctor_commission_amt:   commAmt   || null,
      });

      // ── Auto-promote from waiting room if patient had appointment + payment ──
      if (payMethod) {
        try {
          const queue = await DB.waiting.all();
          const inQueue = queue.find(q => String(q.patient_id) === String(pid));
          if (inQueue) {
            await DB.waiting.removeByPatient(pid);
            toast(`${inQueue.full_name} moved from waiting room to confirmed ✓`, 'success');
            // Also update patient payment method
            try { await DB.tables.patients.update(pid, { payment_method: payMethod }); } catch(e) {}
          }
        } catch(e) {}
      }

      Modals.close();
      toast('Appointment scheduled!','success');
      if (App.currentPage==='appointments') await Pages.appointments.render();
      if (App.currentPage==='calendar') await Pages.calendar.render();
      if (App.currentPage==='dashboard') await Pages.dashboard.render();
      if (App.currentPage==='waiting') await Pages.waiting.render();
      await UI.updateBadges();
    } catch(e) { toast('Error scheduling appointment','error'); console.error(e); }
  },

  async updateAppt(id) {
    try {
      const pid = parseInt($('ap_patient').value);
      const did = parseInt($('ap_doctor').value);
      const date = $('ap_date').value;
      const time = $('ap_time').value;
      if (!pid||!did||!date||!time) { toast('Patient, doctor, date and time are required','error'); return }

      const payMethod    = $('ap_pay_method')?.value || null;
      const discountCode = $('ap_discount_code')?.value?.trim() || null;
      const treatType    = $('ap_type').value;
      const apptCost     = parseFloat($('ap_cost')?.value || 0);

      let commRate = 0, commAmt = 0;
      if (did && apptCost > 0) {
        try {
          const doc = await DB.tables.doctors.find(did);
          const typeMap = {
            'General Checkup':'commission_filling','Cleaning/Scaling':'commission_filling',
            'Filling':'commission_crown','Root Canal':'commission_root_canal',
            'Extraction':'commission_extraction','Implant':'commission_implant',
            'Orthodontics':'commission_orthodontics','Crown/Bridge':'commission_crown'
          };
          commRate = parseFloat(doc[typeMap[treatType] || 'commission_other'] || 15);
          commAmt  = parseFloat((apptCost * commRate / 100).toFixed(2));
        } catch(e) {}
      }

      await DB.tables.appointments.update(id, {
        patient_id: pid, doctor_id: did,
        date, time,
        duration_min:          parseInt($('ap_dur').value)||30,
        priority:              $('ap_priority').value,
        treatment_type:        treatType,
        chief_complaint:       $('ap_complaint').value,
        notes:                 $('ap_notes').value,
        discount_code:         discountCode || null,
        payment_method:        payMethod    || null,
        cost:                  apptCost     || null,
        doctor_commission_pct: commRate     || null,
        doctor_commission_amt: commAmt      || null,
      });

      // Auto-promote from waiting room if payment method now set
      if (payMethod) {
        try {
          const queue = await DB.waiting.all();
          const inQueue = queue.find(q => String(q.patient_id) === String(pid));
          if (inQueue) {
            await DB.waiting.removeByPatient(pid);
            toast(`${inQueue.full_name} moved from waiting room ✓`, 'success');
          }
        } catch(e) {}
      }

      Modals.close();
      toast('Appointment updated!','success');
      if (App.currentPage==='appointments') await Pages.appointments.render();
      if (App.currentPage==='calendar') await Pages.calendar.render();
      if (App.currentPage==='dashboard') await Pages.dashboard.render();
      if (App.currentPage==='waiting') await Pages.waiting.render();
    } catch(e) { toast('Error updating appointment','error'); console.error(e); }
  },

  async updateApptStatus(id) {
    try {
      const statuses = ['scheduled','confirmed','completed','cancelled','no-show'];
      const appt = await DB.tables.appointments.find(id);
      if (!appt || appt.error) return;
      const idx = statuses.indexOf(appt.status);
      const next = statuses[(idx+1)%statuses.length];
      await DB.tables.appointments.update(id,{status:next});
      toast(`Status → ${next}`,'info');
      await Pages.appointments.renderTable();
    } catch(e) { toast('Error updating status','error'); console.error(e); }
  },

  async deleteAppt(id) {
    if (!confirm('Delete this appointment?')) return;
    try {
      await DB.tables.appointments.delete(id);
      toast('Appointment deleted','error');
      await Pages.appointments.renderTable();
      await UI.updateBadges();
    } catch(e) { toast('Error deleting appt','error'); console.error(e); }
  },

  async cancelAppt(id) {
    if (!confirm('Cancel this appointment?')) return;
    try {
      await DB.tables.appointments.update(id, { status: 'cancelled' });
      toast('Appointment cancelled', 'info');
      await Pages.appointments.renderTable();
      if (App.currentPage === 'calendar') await Pages.calendar.render();
      if (App.currentPage === 'dashboard') await Pages.dashboard.render();
      await UI.updateBadges();
    } catch(e) { toast('Error cancelling appointment', 'error'); console.error(e); }
  },

  async markNoShow(id) {
    if (!confirm('Mark this patient as no-show? Their rebooking priority will be flagged.')) return;
    try {
      // Mark appointment as no-show
      const appt = await DB.tables.appointments.find(id);
      await DB.tables.appointments.update(id, { status: 'no-show' });

      // Increment no_show_count on the patient record
      if (appt?.patient_id) {
        const patient = await DB.tables.patients.find(appt.patient_id);
        if (patient) {
          const count = (patient.no_show_count || 0) + 1;
          await DB.tables.patients.update(appt.patient_id, { no_show_count: count });
        }
      }
      toast('Marked as no-show. Patient rebooking priority flagged ⚠️', 'warning');
      await Pages.appointments.renderTable();
      if (App.currentPage === 'dashboard') await Pages.dashboard.render();
      await UI.updateBadges();
    } catch(e) { toast('Error marking no-show', 'error'); console.error(e); }
  },

  /* ── Confirm Treatment → proper modal with discount code ── */
  async confirmTreatment(apptId) {
    await Modals.confirmTreatment(apptId);
  },

  /* ── Called when user clicks "Confirm & Add to Finance" in the modal ── */
  async confirmTreatmentModal() {
    try {
      const modal  = $('modalConfirmTreatment');
      const apptId = parseInt(modal?.dataset.apptId);
      if (!apptId) { toast('No appointment selected', 'error'); return; }

      const appt = await DB.tables.appointments.find(apptId);
      if (!appt) { toast('Appointment not found', 'error'); return; }

      const costRaw = parseFloat($('ct_cost')?.value);
      if (!costRaw || costRaw <= 0) { toast('Please enter a valid cost', 'error'); return; }

      // Calculate final cost with discount
      const discountPct   = parseFloat(modal.dataset.discountPct)   || 0;
      const discountFixed = parseFloat(modal.dataset.discountFixed)  || 0;
      const codeApplied   = $('ct_discount_code')?.value?.trim()?.toUpperCase() || '';

      let finalCost    = costRaw;
      let discountNote = '';
      if (discountPct > 0) {
        finalCost    = costRaw * (1 - discountPct / 100);
        discountNote = ` (${codeApplied}: ${discountPct}% off)`;
      } else if (discountFixed > 0) {
        finalCost    = Math.max(0, costRaw - discountFixed);
        discountNote = ` (${codeApplied}: E£${discountFixed} off)`;
      }

      const patient = await DB.tables.patients.find(appt.patient_id).catch(() => null);
      const patName = patient?.full_name || `Patient #${appt.patient_id}`;
      const payMethod = appt.payment_method || patient?.payment_method || 'cash';

      // 1. Mark appointment completed + store discount code
      await DB.tables.appointments.update(apptId, {
        status:       'completed',
        discount_code: codeApplied || appt.discount_code || null
      });

      // 2. Insert treatment record
      await DB.tables.treatments.insert({
        patient_id:      appt.patient_id,
        doctor_id:       appt.doctor_id,
        appointment_id:  apptId,
        treatment_type:  appt.treatment_type || 'General',
        cost:            finalCost,
        date:            appt.date,
        diagnosis:       appt.chief_complaint || '',
        procedure_notes: appt.notes || '',
        status:          'completed'
      });

      // 3. Auto-add to finance (income)
      const desc = `${appt.treatment_type || 'Treatment'} — ${patName}${discountNote}`;
      await DB.tables.transactions.insert({
        description: desc,
        type:        'income',
        category:    'Treatment',
        amount:      finalCost,
        date:        appt.date,
        patient_id:  appt.patient_id,
        doctor_id:   appt.doctor_id
      });

      // 4. Remove from waiting room if present
      try { await DB.waiting.removeByPatient(appt.patient_id); } catch(e) {}

      Modals.close();
      toast(`✅ Treatment confirmed! E£${finalCost.toLocaleString('en-EG', {minimumFractionDigits:2, maximumFractionDigits:2})} added to finance`, 'success', 5000);

      if (App.currentPage === 'appointments') await Pages.appointments.render();
      if (App.currentPage === 'finance')      await Pages.finance.renderAll();
      if (App.currentPage === 'treatments')   await Pages.treatments.render();
      if (App.currentPage === 'dashboard')    await Pages.dashboard.render();
      if (App.currentPage === 'waiting')      await WaitingPage.render();
      await UI.updateBadges();

      /* Prompt for patient satisfaction rating */
      setTimeout(() => {
        if (typeof Ratings !== 'undefined') {
          Ratings.prompt(patName, appt.doctor_id, apptId);
        }
      }, 800);
    } catch(e) { toast('Error confirming treatment', 'error'); console.error(e); }
  },

  /* ── Live discount code validation in confirm-treatment modal ── */
  async validateDiscountCode(silent = false) {
    try {
      const codeEl   = $('ct_discount_code');
      const infoEl   = $('ct_discount_info');
      const modal    = $('modalConfirmTreatment');
      const code     = codeEl?.value?.trim();

      if (!code) {
        if (infoEl) { infoEl.style.display = 'none'; infoEl.textContent = ''; }
        modal.dataset.discountPct   = '';
        modal.dataset.discountFixed = '';
        this._updateFinalAmount();
        return;
      }

      const result = await DB.tables.discount_codes.validate(code);

      if (!result || !result.valid) {
        if (!silent) toast(`Code "${code}" is invalid or inactive`, 'error');
        if (infoEl) {
          infoEl.style.display = 'block';
          infoEl.style.color   = 'var(--red)';
          infoEl.textContent   = `✗ Code "${code}" not found or inactive`;
        }
        modal.dataset.discountPct   = '';
        modal.dataset.discountFixed = '';
        this._updateFinalAmount();
        return;
      }

      if (result.discount_type === 'percent') {
        modal.dataset.discountPct   = result.value;
        modal.dataset.discountFixed = '';
        if (infoEl) {
          infoEl.style.display = 'block';
          infoEl.style.color   = 'var(--green)';
          infoEl.textContent   = `✓ ${result.value}% discount applied${result.description ? ' — ' + result.description : ''}`;
        }
      } else {
        modal.dataset.discountPct   = '';
        modal.dataset.discountFixed = result.value;
        if (infoEl) {
          infoEl.style.display = 'block';
          infoEl.style.color   = 'var(--green)';
          infoEl.textContent   = `✓ E£${result.value} discount applied${result.description ? ' — ' + result.description : ''}`;
        }
      }

      this._updateFinalAmount();
      if (!silent) toast(`Discount code "${code}" applied ✓`, 'success');
    } catch(e) { toast('Error validating discount code', 'error'); console.error(e); }
  },

  /* ── Recalculate and display final amount in confirm-treatment modal ── */
  _updateFinalAmount() {
    const modal        = $('modalConfirmTreatment');
    const costRaw      = parseFloat($('ct_cost')?.value) || 0;
    const discountPct  = parseFloat(modal?.dataset.discountPct)   || 0;
    const discountFixed= parseFloat(modal?.dataset.discountFixed)  || 0;
    const finalEl      = $('ct_final_amount');
    if (!finalEl) return;

    let final = costRaw;
    if (discountPct > 0)   final = costRaw * (1 - discountPct / 100);
    if (discountFixed > 0) final = Math.max(0, costRaw - discountFixed);

    finalEl.textContent = `E£ ${final.toLocaleString('en-EG', { minimumFractionDigits:2, maximumFractionDigits:2 })}`;
  },

  /* ── Add existing patient to waiting room (from modal) ── */
  async addPatientToQueue() {
    try {
      const pid = parseInt($('queue_patient')?.value);
      if (!pid) { toast('Please select a patient', 'error'); return; }
      const notes = $('queue_notes')?.value?.trim() || null;

      const patient = await DB.tables.patients.find(pid).catch(() => null);
      const name    = patient?.full_name || `Patient #${pid}`;

      await DB.waiting.add(pid, notes);
      Modals.close();
      toast(`${name} added to waiting room ✓`, 'success');
      if (App.currentPage === 'waiting') await WaitingPage.render();
      await UI.updateBadges();
    } catch(e) {
      if (e?.message?.includes('409') || e?.message?.includes('already')) {
        toast('This patient is already in the waiting room', 'info');
      } else {
        toast('Error adding patient to queue', 'error');
        console.error(e);
      }
    }
  },

  /* ── Discount Codes CRUD ─────────────────────────── */
  async addDiscountCode() {
    try {
      const code  = $('dc_code')?.value?.trim().toUpperCase();
      const value = parseFloat($('dc_value')?.value);
      if (!code)        { toast('Code is required', 'error'); return; }
      if (isNaN(value)) { toast('Value is required', 'error'); return; }

      await DB.tables.discount_codes.insert({
        code,
        discount_type: $('dc_type')?.value || 'percent',
        value,
        description:   $('dc_desc')?.value?.trim() || '',
        is_active:     parseInt($('dc_active')?.value ?? '1')
      });
      Modals.close();
      toast(`Discount code "${code}" created!`, 'success');
      if (App.currentPage === 'discount_codes') await Pages.discount_codes.render();
    } catch(e) { toast('Error creating discount code', 'error'); console.error(e); }
  },

  async updateDiscountCode(id) {
    try {
      const code  = $('dc_code')?.value?.trim().toUpperCase();
      const value = parseFloat($('dc_value')?.value);
      if (!code)        { toast('Code is required', 'error'); return; }
      if (isNaN(value)) { toast('Value is required', 'error'); return; }

      await DB.tables.discount_codes.update(id, {
        code,
        discount_type: $('dc_type')?.value || 'percent',
        value,
        description:   $('dc_desc')?.value?.trim() || '',
        is_active:     parseInt($('dc_active')?.value ?? '1')
      });
      Modals.close();
      toast(`Discount code "${code}" updated!`, 'success');
      if (App.currentPage === 'discount_codes') await Pages.discount_codes.render();
    } catch(e) { toast('Error updating discount code', 'error'); console.error(e); }
  },

  async deleteDiscountCode(id) {
    if (!confirm('Delete this discount code?')) return;
    try {
      await DB.tables.discount_codes.delete(id);
      toast('Discount code deleted', 'info');
      if (App.currentPage === 'discount_codes') await Pages.discount_codes.render();
    } catch(e) { toast('Error deleting discount code', 'error'); console.error(e); }
  },

  async addDoctor() {
    // Validate required fields and show inline errors
    const nameEl = $('dr_name');
    const specEl = $('dr_spec');
    const nameErr = $('dr_name_err');
    const specErr = $('dr_spec_err');

    const name = nameEl?.value?.trim() || '';
    const spec = specEl?.value?.trim() || '';

    let valid = true;
    if (!name) {
      if (nameErr) nameErr.style.display = 'block';
      nameEl?.classList?.add('input-error');
      valid = false;
    } else {
      if (nameErr) nameErr.style.display = 'none';
      nameEl?.classList?.remove('input-error');
    }
    if (!spec) {
      if (specErr) specErr.style.display = 'block';
      specEl?.classList?.add('input-error');
      valid = false;
    } else {
      if (specErr) specErr.style.display = 'none';
      specEl?.classList?.remove('input-error');
    }
    if (!valid) { toast('Please fill in all required fields', 'warning'); return; }

    try {
      const cleanName = name.replace(/^Dr\.?\s*/i, '');

      // Collect abilities
      const abilities = [...document.querySelectorAll('#drAbilitiesCheckboxes input:checked')]
        .map(cb => cb.value);

      const doctor = await DB.tables.doctors.insert({
        full_name:              `Dr. ${cleanName}`,
        specialty:              spec,
        phone:                  $('dr_phone')?.value        || '',
        email:                  $('dr_email')?.value        || '',
        license_no:             $('dr_lic')?.value          || '',
        national_id:            $('dr_national_id')?.value  || '',
        room:                   $('dr_room')?.value         || '',
        schedule:               $('dr_sched')?.value        || '',
        address:                $('dr_address')?.value      || '',
        emergency_contact:      $('dr_emergency')?.value    || '',
        hire_date:              $('dr_hire_date')?.value    || '',
        notes:                  $('dr_notes')?.value        || '',
        status: 'present',
        commission_filling:     parseFloat($('dr_com_filling')?.value || 20),
        commission_crown:       parseFloat($('dr_com_crown')?.value   || 20),
        commission_root_canal:  parseFloat($('dr_com_root')?.value    || 20),
        commission_extraction:  parseFloat($('dr_com_ext')?.value     || 20),
        commission_implant:     parseFloat($('dr_com_imp')?.value     || 25),
        commission_orthodontics:parseFloat($('dr_com_ortho')?.value   || 20),
        commission_other:       parseFloat($('dr_com_misc')?.value    || 15),
      });

      // Save abilities
      if (abilities.length) {
        await fetch(`/api/abilities/doctor/${doctor.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ abilities })
        });
      }

      const userAccount = await DB.tables.users.insert({
        role:             'doctor',
        doctor_id:        doctor.id,
        doctor_full_name: cleanName
      });

      Modals.close();
      const uname = userAccount.username || '—';
      const pass  = userAccount.password  || '—';
      toast(
        `✅ Dr. ${cleanName} added! Login → <strong>${uname}</strong> / <strong>${pass}</strong>`,
        'success', 8000
      );
      if (App.currentPage === 'doctors')    await Pages.doctors.render();
      if (App.currentPage === 'abilities')  await Pages.abilities.render();
    } catch(e) { toast('Error adding doctor', 'error'); console.error(e); }
  },

  async _previewDoctorUsername(nameInput) {
    const preview = $('drCredentialsPreview');
    const uField  = $('drPreviewUsername');
    const pField  = $('drPreviewPassword');
    if (!preview || !uField || !pField) return;

    const clean = nameInput.trim().replace(/^Dr\.?\s*/i, '');
    if (!clean) { preview.style.display = 'none'; return; }

    const parts    = clean.split(/\s+/).filter(w => /^[a-zA-Z]/.test(w));
    const initials = ((parts[0]?.[0] || 'X') + (parts[1]?.[0] || 'X')).toUpperCase();
    const existing = await DB.tables.users.all().catch(() => []);
    const taken    = new Set(existing.map(u => u.username));
    let num = 1;
    while (taken.has(`${initials}-${String(num).padStart(2, '0')}`)) num++;
    const previewUser = `${initials}-${String(num).padStart(2, '0')}`;

    if (!pField.dataset.generated) {
      const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      const l1 = letters[Math.floor(Math.random() * letters.length)];
      const l2 = letters[Math.floor(Math.random() * letters.length)];
      const n  = String(Math.floor(Math.random() * 90) + 10);
      pField.textContent       = `${l1}${l2}-${n}`;
      pField.dataset.generated = '1';
    }

    uField.textContent     = previewUser;
    preview.style.display  = 'block';
  },

  async updateDoctor(id) {
    const nameEl = $('dr_name');
    const specEl = $('dr_spec');
    const nameErr = $('dr_name_err');
    const specErr = $('dr_spec_err');

    const name = nameEl?.value?.trim() || '';
    const spec = specEl?.value?.trim() || '';
    let valid = true;
    if (!name) { if (nameErr) nameErr.style.display='block'; nameEl?.classList?.add('input-error'); valid=false; }
    else        { if (nameErr) nameErr.style.display='none';  nameEl?.classList?.remove('input-error'); }
    if (!spec)  { if (specErr) specErr.style.display='block'; specEl?.classList?.add('input-error'); valid=false; }
    else        { if (specErr) specErr.style.display='none';  specEl?.classList?.remove('input-error'); }
    if (!valid) { toast('Name and specialty are required', 'warning'); return; }

    try {
      const cleanName = name.replace(/^Dr\.?\s*/i, '');

      // Collect abilities
      const abilities = [...document.querySelectorAll('#drAbilitiesCheckboxes input:checked')]
        .map(cb => cb.value);

      await DB.tables.doctors.update(id, {
        full_name:              `Dr. ${cleanName}`,
        specialty:              spec,
        phone:                  $('dr_phone')?.value        || '',
        email:                  $('dr_email')?.value        || '',
        license_no:             $('dr_lic')?.value          || '',
        national_id:            $('dr_national_id')?.value  || '',
        room:                   $('dr_room')?.value         || '',
        schedule:               $('dr_sched')?.value        || '',
        address:                $('dr_address')?.value      || '',
        emergency_contact:      $('dr_emergency')?.value    || '',
        hire_date:              $('dr_hire_date')?.value    || '',
        notes:                  $('dr_notes')?.value        || '',
        commission_filling:     parseFloat($('dr_com_filling')?.value || 20),
        commission_crown:       parseFloat($('dr_com_crown')?.value   || 20),
        commission_root_canal:  parseFloat($('dr_com_root')?.value    || 20),
        commission_extraction:  parseFloat($('dr_com_ext')?.value     || 20),
        commission_implant:     parseFloat($('dr_com_imp')?.value     || 25),
        commission_orthodontics:parseFloat($('dr_com_ortho')?.value   || 20),
        commission_other:       parseFloat($('dr_com_misc')?.value    || 15),
      });

      // Save abilities
      await fetch(`/api/abilities/doctor/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ abilities })
      });

      Modals.close();
      toast(`Dr. ${cleanName} updated ✓`, 'success');
      if (App.currentPage === 'doctors')   await Pages.doctors.render();
      if (App.currentPage === 'abilities') await Pages.abilities.render();
    } catch(e) { toast('Error updating doctor', 'error'); console.error(e); }
  },

  async toggleDoctorStatus(id) {
    try {
      const doc = await DB.tables.doctors.find(id);
      if (!doc || doc.error) return;
      const next = doc.status==='present'?'absent':'present';
      await DB.tables.doctors.update(id,{status:next});
      toast(`${doc.full_name} → ${next}`,'info');
      await Pages.doctors.render();
    } catch(e) { toast('Error updating status','error'); console.error(e); }
  },

  async deleteDoctor(id) {
    if (!confirm('Remove this doctor?')) return;
    try {
      await DB.tables.doctors.delete(id);
      toast('Doctor removed','error');
      await Pages.doctors.render();
    } catch(e) { toast('Error deleting doctor','error'); console.error(e); }
  },

  async addTransaction() {
    try {
      const desc   = $('tx_desc').value.trim();
      const amount = parseFloat($('tx_amount').value);
      const date   = $('tx_date').value;
      if (!desc||!amount||!date) { toast('All fields required','error'); return }
      await DB.tables.transactions.insert({
        description: desc, type: $('tx_type').value,
        category: $('tx_cat').value, amount, date, patient_id: null
      });
      Modals.close();
      toast('Transaction added!','success');
      if (App.currentPage==='finance') await Pages.finance.renderAll();
      if (App.currentPage==='dashboard') await Pages.dashboard.render();
    } catch(e) { toast('Error adding transaction','error'); console.error(e); }
  },

  async updateTransaction(id) {
    try {
      const desc   = $('tx_desc').value.trim();
      const amount = parseFloat($('tx_amount').value);
      const date   = $('tx_date').value;
      if (!desc||!amount||!date) { toast('All fields required','error'); return }
      await DB.tables.transactions.update(id, {
        description: desc, type: $('tx_type').value,
        category: $('tx_cat').value, amount, date
      });
      Modals.close();
      toast('Transaction updated!','success');
      if (App.currentPage==='finance') await Pages.finance.renderAll();
      if (App.currentPage==='dashboard') await Pages.dashboard.render();
    } catch(e) { toast('Error updating transaction','error'); console.error(e); }
  },

  async deleteTransaction(id) {
    if (!confirm('Delete this transaction?')) return;
    try {
      await DB.tables.transactions.delete(id);
      toast('Transaction deleted','error');
      await Pages.finance.renderAll();
    } catch(e) { toast('Error deleting transaction','error'); console.error(e); }
  },

  async addInventoryItem() {
    try {
      const name = $('inv_name').value.trim();
      const qty  = parseInt($('inv_qty').value);
      if (!name||isNaN(qty)) { toast('Name and quantity required','error'); return }
      await DB.tables.inventory.insert({
        item_name: name, category: $('inv_cat').value,
        quantity: qty, min_stock: parseInt($('inv_min').value)||5,
        unit_price: parseFloat($('inv_price').value)||0,
        supplier: $('inv_supplier').value
      });
      Modals.close();
      toast(`${name} added to inventory!`,'success');
      if (App.currentPage==='inventory') await Pages.inventory.render();
      await UI.updateBadges();
    } catch(e) { toast('Error adding item','error'); console.error(e); }
  },

  async updateInventory(id) {
    try {
      const name = $('inv_name').value.trim();
      const qty  = parseInt($('inv_qty').value);
      if (!name||isNaN(qty)) { toast('Name and quantity required','error'); return }
      await DB.tables.inventory.update(id, {
        item_name: name, category: $('inv_cat').value,
        quantity: qty, min_stock: parseInt($('inv_min').value)||5,
        unit_price: parseFloat($('inv_price').value)||0,
        supplier: $('inv_supplier').value,
        last_updated: new Date().toISOString()
      });
      Modals.close();
      toast(`${name} updated!`,'success');
      if (App.currentPage==='inventory') await Pages.inventory.render();
      await UI.updateBadges();
    } catch(e) { toast('Error updating item','error'); console.error(e); }
  },

  async updateInvQty(id) {
    try {
      const item = await DB.tables.inventory.find(id);
      if (!item || item.error) return;
      const newQty = prompt(`Update quantity for "${item.item_name}" (current: ${item.quantity}):`, item.quantity);
      if (newQty === null) return;
      const qty = parseInt(newQty);
      if (isNaN(qty)||qty<0) { toast('Invalid quantity','error'); return }
      await DB.tables.inventory.update(id,{quantity:qty, last_updated:new Date().toISOString()});
      toast(`Quantity updated to ${qty}`,'success');
      await Pages.inventory.render();
      await UI.updateBadges();
    } catch(e) { toast('Error updating quantity','error'); console.error(e); }
  },

  async deleteInventory(id) {
    if (!confirm('Remove this item from inventory?')) return;
    try {
      await DB.tables.inventory.delete(id);
      toast('Item removed','error');
      await Pages.inventory.render();
      await UI.updateBadges();
    } catch(e) { toast('Error deleting item','error'); console.error(e); }
  },

  async addUser() {
    try {
      const u = $('nu_user').value.trim();
      const p = $('nu_pass').value.trim();
      if (!u||!p) { toast('Username and password required','error'); return }
      await DB.tables.users.insert({ username: u, password: p, role: $('nu_role').value });
      Modals.close();
      toast(`User ${u} created!`,'success');
      if (App.currentPage==='passwords') await Pages.passwords.render();
    } catch(e) { toast('Error adding user','error'); console.error(e); }
  },

  async updateUser(id) {
    try {
      const u = $('nu_user').value.trim();
      const p = $('nu_pass').value.trim();
      if (!u) { toast('Username is required','error'); return }
      const payload = { username: u, role: $('nu_role').value };
      if (p) payload.password = p; // only update password if a new one was entered
      await DB.tables.users.update(id, payload);
      Modals.close();
      toast(`User ${u} updated!`,'success');
      if (App.currentPage==='passwords') await Pages.passwords.render();
    } catch(e) { toast('Error updating user','error'); console.error(e); }
  },

  async deleteUser(id) {
    if (!confirm('Delete this user account?')) return;
    try {
      await DB.tables.users.delete(id);
      toast('User deleted','error');
      await Pages.passwords.render();
    } catch(e) { toast('Error deleting user','error'); console.error(e); }
  }
};
