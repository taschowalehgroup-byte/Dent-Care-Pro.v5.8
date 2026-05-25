/* ═══════════════════════════════════════════════════════
   DentCare Pro — Waiting Room Page
   All data saved to SQLite + waiting_room.json via API.
   No localStorage — survives refresh, restart, all devices.
   ═══════════════════════════════════════════════════════ */

const WaitingPage = {

  /* ── Add patient to waiting room ─────────────────── */
  async addToQueue(patientId, patientName) {
    try {
      await DB.waiting.add(patientId);
      toast(`${patientName} added to waiting room ✓`, 'success');
      if (App.currentPage === 'waiting') await this.render();
      await UI.updateBadges();
      return true;
    } catch(e) {
      if (e.message && e.message.includes('409')) {
        toast(`${patientName} is already in the waiting room`, 'info');
      } else {
        // Catch duplicate from server
        toast(`${patientName} is already in the waiting room`, 'info');
      }
      return false;
    }
  },

  /* ── Remove by waiting_room row id ───────────────── */
  async removeById(id) {
    try {
      await DB.waiting.remove(id);
      toast('Removed from waiting room', 'info');
      await this.render();
      await UI.updateBadges();
    } catch(e) { toast('Error removing from waiting room', 'error'); console.error(e); }
  },

  /* ── Remove by patient_id (used from patients page) ─ */
  async removeByPatient(patientId) {
    try {
      await DB.waiting.removeByPatient(patientId);
      await UI.updateBadges();
    } catch(e) { console.error(e); }
  },

  /* ── Called after appointment + payment confirmed ─── */
  async promoteToPatient(patientId) {
    await this.removeByPatient(patientId);
  },

  /* ── Check if patient is in queue (for patients page badge) ── */
  async isInQueue(patientId) {
    try {
      const queue = await DB.waiting.all();
      return queue.some(q => String(q.patient_id) === String(patientId));
    } catch(e) { return false; }
  },

  /* ── Clear entire waiting room (end of day) ──────── */
  async clearAll() {
    if (!confirm('Clear the entire waiting room? This removes all patients from the queue.')) return;
    try {
      await DB.waiting.clearAll();
      toast('Waiting room cleared', 'info');
      await this.render();
      await UI.updateBadges();
    } catch(e) { toast('Error clearing waiting room', 'error'); console.error(e); }
  },

  /* ── Render ───────────────────────────────────────── */
  async render() {
    const body = $('waitingBody');
    if (!body) return;

    let queue = [];
    try { queue = await DB.waiting.all(); } catch(e) { console.error(e); }

    const countEl = $('waitingCount');
    if (countEl) countEl.textContent = queue.length;

    /* update orb count display */
    const orbCount = document.getElementById('orb3dCount');
    if (orbCount) {
      orbCount.textContent = queue.length;
      const c = queue.length === 0 ? 'var(--accent)' : queue.length <= 3 ? 'var(--green)' : queue.length <= 6 ? 'var(--yellow)' : 'var(--red)';
      orbCount.style.color = c;
    }
    /* remount orb with new count so pulse speed + color updates */
    if (typeof OrbWidget !== 'undefined') {
      requestAnimationFrame(() => OrbWidget.mount('orb3dMount', queue.length));
    }

    if (queue.length === 0) {
      body.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div>🪑</div><p>Waiting room is empty</p></div></td></tr>`;
      return;
    }

    const now = Date.now();
    body.innerHTML = queue.map((q, idx) => {
      const arrivedMs  = new Date(q.arrived_at).getTime();
      const waited     = Math.round((now - arrivedMs) / 60000);
      const badgeCls   = waited > 30 ? 'badge-urgent' : waited > 15 ? 'badge-normal' : 'badge-confirmed';
      const arrivedFmt = new Date(q.arrived_at).toLocaleTimeString('en-EG', { hour: '2-digit', minute: '2-digit' });

      return `
        <tr>
          <td style="font-weight:700;color:var(--accent)">${idx + 1}</td>
          <td>
            <strong>${q.full_name || 'Unknown'}</strong>
            ${q.phone ? `<div style="color:var(--text2);font-size:.8rem">${q.phone}</div>` : ''}
            ${q.notes ? `<div style="color:var(--text3);font-size:.75rem;font-style:italic">${q.notes}</div>` : ''}
          </td>
          <td style="color:var(--text2)">${arrivedFmt}</td>
          <td><span class="badge ${badgeCls}">${waited < 1 ? 'Just arrived' : waited + ' min'}</span></td>
          <td>
            <div class="actions">
              <button class="action-btn" onclick="Modals.viewPatient(${q.patient_id})">View</button>
              <button class="action-btn accent" onclick="Modals.newAppointment(${q.patient_id})">+ Appt</button>
              <button class="action-btn danger" onclick="WaitingPage.removeById(${q.id})">Remove</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }
};
