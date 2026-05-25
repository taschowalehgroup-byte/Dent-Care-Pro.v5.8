/* ═══════════════════════════════════════════════════════
   DentCare Pro — Appointments Page
   Doctors see only their own patients' appointments.
   Admin/manager/receptionist see all.
   ═══════════════════════════════════════════════════════ */

const AppointmentsPage = {
  _filter: 'all',

  async render() { await this.renderTable(); },

  async filter(f, btn) {
    this._filter = f;
    document.querySelectorAll('#apptFilters .ftab').forEach(b => b.classList.remove('active'));
    btn?.classList.add('active');
    await this.renderTable();
  },

  async _fetchAppointments() {
    const session = DB.auth.current();
    if (session?.role === 'doctor' && session?.doctor_id) {
      return DB.fetch(`/appointments?doctor_id=${session.doctor_id}`);
    }
    return DB.tables.appointments.all();
  },

  async renderTable() {
    let rows = await this._fetchAppointments();
    if (this._filter !== 'all') rows = rows.filter(a => a.status === this._filter);
    rows.sort((a, b) => a.date > b.date ? -1 : 1);

    const pts   = await DB.tables.patients.all();
    const docs  = await DB.tables.doctors.all();
    const ptMap = Object.fromEntries(pts.map(p  => [p.id, p]));
    const dcMap = Object.fromEntries(docs.map(d => [d.id, d]));

    $('apptBody').innerHTML = rows.length === 0
      ? `<tr><td colspan="11"><div class="empty-state"><div>📅</div><p>No appointments found</p></div></td></tr>`
      : rows.map(a => {
          const cost    = a.cost ? Number(a.cost).toLocaleString() + ' EGP' : '—';
          const commAmt = a.doctor_commission_amt
            ? `<span style="color:var(--accent)">${Number(a.doctor_commission_amt).toLocaleString()} EGP</span><br><small style="color:var(--text2)">(${a.doctor_commission_pct ?? 0}%)</small>`
            : '—';
          return `
        <tr>
          <td><strong>${ptMap[a.patient_id]?.full_name || 'Unknown'}</strong></td>
          <td style="color:var(--text2)">${dcMap[a.doctor_id]?.full_name || 'Unknown'}</td>
          <td>${a.date}</td>
          <td style="color:var(--accent)">${a.time}</td>
          <td>${a.treatment_type || '—'}</td>
          <td>${UI.priorityBadge(a.priority)}</td>
          <td><strong style="color:var(--green)">${cost}</strong></td>
          <td>${commAmt}</td>
          <td>${UI.statusBadge(a.status)}${a.status === 'no-show' ? ' <span style="font-size:.7rem;color:var(--orange,#f59e0b)">⚠️ flagged</span>' : ''}</td>
          <td>${a.discount_code ? `<span class="badge badge-normal" title="Discount applied">🏷 ${a.discount_code}</span>` : '<span style="color:var(--text3)">—</span>'}</td>
          <td><div class="actions">
            <button class="action-btn" onclick="Modals.viewAppointmentDetail(${a.id})">View</button>
            <button class="action-btn" onclick="Modals.editAppointment(${a.id})">Edit</button>
            ${a.status !== 'completed' && a.status !== 'cancelled' ? `<button class="action-btn accent" onclick="Actions.confirmTreatment(${a.id})" title="Confirm treatment & add to finance">✓ Confirm</button>` : ''}
            ${a.status !== 'cancelled' && a.status !== 'completed' && a.status !== 'no-show' ? `<button class="action-btn" onclick="Actions.cancelAppt(${a.id})" style="color:var(--red);border-color:var(--red)" title="Cancel appointment">✕ Cancel</button>` : ''}
            ${a.status === 'scheduled' || a.status === 'confirmed' ? `<button class="action-btn" onclick="Actions.markNoShow(${a.id})" style="color:var(--orange,#f59e0b);border-color:var(--orange,#f59e0b)" title="Mark as no-show">👻 No-Show</button>` : ''}
            <button class="action-btn danger" onclick="Actions.deleteAppt(${a.id})">Del</button>
          </div></td>
        </tr>`;
      }).join('');
  },
  exportExcel() {
    this._fetchAppointments().then(rows => UI.exportExcel(rows, 'appointments'));
  },
  exportJson() {
    this._fetchAppointments().then(rows => UI.exportJson(rows, 'appointments'));
  },
  importFile() {
    UI.importFile(async rows => {
      const res = await DB.tables.appointments.bulk(rows);
      toast(`Imported ${res.inserted} appointments`, 'success');
      this.renderTable();
    });
  },

  async sendTodayReminders() {
    try {
      const all  = await DB.tables.appointments.all();
      const t    = today();
      const todayAppts = all.filter(a => a.date === t && a.status !== 'cancelled' && a.status !== 'completed');
      if (!todayAppts.length) { toast('No active appointments for today', 'info'); return; }

      const [patients, doctors] = await Promise.all([
        DB.tables.patients.all(),
        DB.tables.doctors.all()
      ]);
      const ptMap = Object.fromEntries(patients.map(p => [p.id, p]));
      const dcMap = Object.fromEntries(doctors.map(d => [d.id, d]));

      const withPhone = todayAppts.filter(a => ptMap[a.patient_id]?.phone);
      if (!withPhone.length) { toast('No patients with phone numbers for today', 'warning'); return; }

      // Show a confirmation dialog listing who will be messaged
      const listHtml = withPhone.map(a => {
        const p = ptMap[a.patient_id];
        const d = dcMap[a.doctor_id];
        return `<div style="padding:.4rem 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between">
          <span><strong>${p.full_name}</strong> · ${p.phone}</span>
          <span style="color:var(--text2);font-size:.85rem">${a.time} · ${d?.full_name||'—'}</span>
        </div>`;
      }).join('');

      const html = `
      <div id="reminderBulkModal" class="modal-overlay open" onclick="if(event.target===this)this.remove()">
        <div class="modal modal-sm">
          <div class="modal-head"><h3>💬 Today's WhatsApp Reminders</h3><button class="close-btn" onclick="$('reminderBulkModal').remove()">✕</button></div>
          <div class="modal-body">
            <p style="color:var(--text2);font-size:.85rem;margin-bottom:.75rem">
              ${withPhone.length} patient(s) will be messaged. WhatsApp will open for each one.
            </p>
            ${listHtml}
          </div>
          <div class="modal-foot">
            <button class="btn-ghost" onclick="$('reminderBulkModal').remove()">Cancel</button>
            <button class="btn-primary" onclick="AppointmentsPage._sendReminderSequence(${JSON.stringify(withPhone.map(a=>a.id))})">Send All Reminders</button>
          </div>
        </div>
      </div>`;
      document.body.insertAdjacentHTML('beforeend', html);

      // Store data for sequence
      this._reminderData = { appts: withPhone, ptMap, dcMap };
    } catch(e) { toast('Error: '+e.message, 'error'); }
  },

  _reminderData: null,
  _sendReminderSequence(ids) {
    $('reminderBulkModal')?.remove();
    if (!this._reminderData) return;
    const { appts, ptMap, dcMap } = this._reminderData;
    let i = 0;
    const sendNext = () => {
      if (i >= ids.length) { toast(`Sent ${ids.length} reminders ✓`, 'success'); return; }
      const a = appts.find(x => x.id === ids[i]);
      if (a) {
        const p = ptMap[a.patient_id];
        const d = dcMap[a.doctor_id];
        Modals.sendWhatsAppReminder(p.phone, p.full_name, a.date, a.time, d?.full_name||'');
      }
      i++;
      setTimeout(sendNext, 1500); // stagger to allow WA to open
    };
    sendNext();
  }
};
