/* ═══════════════════════════════════════════════════════
   DentCare Pro — Prescription Manager Page
   • Lists all treatments that have (or can have) a prescription
   • Entry form to write / edit the prescription text
   • Preview & print a professional Rx document using iframe
   ═══════════════════════════════════════════════════════ */

const PrescriptionPage = {
  _rows:     [],
  _patients: [],
  _doctors:  [],
  _filter:   '',
  _showAll:  false,   // when false, only show rows that have a prescription

  /* ── Bootstrap ──────────────────────────────────────── */
  async render() {
    await this._load();
    this._renderTable();
  },

  async _load() {
    try {
      [this._rows, this._patients, this._doctors] = await Promise.all([
        DB.tables.treatments.all(),
        DB.tables.patients.all(),
        DB.tables.doctors.all()
      ]);
    } catch(e) { this._rows = []; this._patients = []; this._doctors = []; }
  },

  /* ── Search / filter ────────────────────────────────── */
  search(q) { this._filter = q; this._renderTable(); },

  toggleAll(show) {
    this._showAll = show;
    this._renderTable();
  },

  /* ── Table rendering ────────────────────────────────── */
  _renderTable() {
    const body = $('prescBody');
    if (!body) return;

    const ptMap = Object.fromEntries(this._patients.map(p => [p.id, p]));
    const dcMap = Object.fromEntries(this._doctors.map(d => [d.id, d]));

    let rows = [...this._rows].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    if (!this._showAll) {
      // Show rows with a prescription — but include all rows if none have one
      const withRx = rows.filter(r => r.prescription);
      if (withRx.length) rows = withRx;
    }

    const q = (this._filter || '').toLowerCase();
    if (q) {
      rows = rows.filter(r =>
        (ptMap[r.patient_id]?.full_name || '').toLowerCase().includes(q) ||
        (r.treatment_type || '').toLowerCase().includes(q) ||
        (r.prescription || '').toLowerCase().includes(q)
      );
    }

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div>℞</div><p>No prescriptions found</p></div></td></tr>`;
      return;
    }

    body.innerHTML = rows.map(t => {
      const pt      = ptMap[t.patient_id];
      const dc      = dcMap[t.doctor_id];
      const hasRx   = !!(t.prescription);
      const preview = hasRx
        ? (t.prescription.length > 40 ? t.prescription.slice(0, 40) + '…' : t.prescription)
        : '<em style="color:var(--muted)">—</em>';

      return `<tr>
        <td><strong>${pt?.full_name || 'Unknown'}</strong><br>
            <small style="color:var(--muted)">${pt?.patient_no || ''}</small></td>
        <td>${dc?.full_name || '—'}</td>
        <td>${t.treatment_type}</td>
        <td>${t.date || '—'}</td>
        <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${preview}</td>
        <td>${hasRx
          ? '<span style="background:#dcfce7;color:#15803d;padding:.15rem .5rem;border-radius:4px;font-size:.75rem;font-weight:600">Has Rx</span>'
          : '<span style="background:#f3f4f6;color:#6b7280;padding:.15rem .5rem;border-radius:4px;font-size:.75rem">None</span>'}</td>
        <td>
          <div class="actions">
            <button class="action-btn accent" onclick="PrescriptionPage.openEntry(${t.id})" title="${hasRx ? 'Edit Prescription' : 'Write Prescription'}">
              ${hasRx ? '✏️ Edit' : '✍️ Write'}
            </button>
            ${hasRx ? `
            <button class="action-btn" onclick="PrescriptionPage.preview(${t.id})" title="Preview">👁️ Preview</button>
            <button class="action-btn" onclick="PrescriptionPage.print(${t.id})" title="Print">🖨️ Print</button>` : ''}
          </div>
        </td>
      </tr>`;
    }).join('');
  },

  /* ── Prescription Entry Modal ───────────────────────── */
  async openEntry(treatmentId) {
    try {
      const t  = this._rows.find(r => r.id === treatmentId);
      const pt = this._patients.find(p => p.id === t?.patient_id);
      const dc = this._doctors.find(d => d.id === t?.doctor_id);
      if (!t) return;

      const overlay = document.getElementById('modalOverlay');
      if (!overlay) return;

      const old = document.getElementById('modalPrescEntry');
      if (old) old.remove();

      const modal = document.createElement('div');
      modal.id        = 'modalPrescEntry';
      modal.className = 'modal';
      modal.style.cssText = 'display:flex;max-width:580px;width:95%';

      modal.innerHTML = `
        <div class="modal-head">
          <h3>℞ Prescription — ${pt?.full_name || 'Patient'}</h3>
          <button class="close-btn" onclick="Modals._nukeOverlay()">×</button>
        </div>
        <div class="modal-body" style="display:grid;gap:1rem">

          <div style="background:var(--surface2);border-radius:var(--radius);padding:.75rem 1rem;display:grid;grid-template-columns:1fr 1fr;gap:.5rem;font-size:.85rem">
            <div><span style="color:var(--muted)">Patient:</span> <strong>${pt?.full_name || '—'}</strong></div>
            <div><span style="color:var(--muted)">Date:</span> <strong>${t.date || '—'}</strong></div>
            <div><span style="color:var(--muted)">Treatment:</span> <strong>${t.treatment_type}</strong></div>
            <div><span style="color:var(--muted)">Doctor:</span> <strong>${dc?.full_name || '—'}</strong></div>
          </div>

          <div class="form-group">
            <label>Diagnosis / التشخيص</label>
            <input id="px_diag" value="${(t.diagnosis || '').replace(/"/g, '&quot;')}" placeholder="Clinical diagnosis…">
          </div>

          <div class="form-group">
            <label>Prescription / الوصفة الطبية <span style="color:var(--danger)">*</span></label>
            <textarea id="px_rx" rows="6"
              placeholder="Enter medications, dosages, and instructions…&#10;e.g. Amoxicillin 500mg — 3×/day for 7 days&#10;     Ibuprofen 400mg — as needed for pain"
              style="resize:vertical;font-family:monospace;font-size:.88rem">${t.prescription || ''}</textarea>
            <small style="color:var(--muted)">Each medication on its own line. Include dosage and duration.</small>
          </div>

          <div class="form-group">
            <label>Follow-up Date</label>
            <input id="px_fu" type="date" value="${t.follow_up_date || ''}">
          </div>

          <div class="form-group">
            <label>Additional Notes</label>
            <textarea id="px_notes" rows="2" style="resize:vertical"
              placeholder="Allergies to note, special instructions…">${t.procedure_notes || ''}</textarea>
          </div>

          <div style="display:flex;gap:.5rem;justify-content:flex-end;flex-wrap:wrap">
            <button class="btn-icon" onclick="Modals._nukeOverlay()">Cancel</button>
            <button class="btn-icon" onclick="PrescriptionPage.saveEntry(${treatmentId})">💾 Save</button>
            <button class="btn-primary" onclick="PrescriptionPage.saveAndPrint(${treatmentId})">🖨️ Save & Print</button>
          </div>
        </div>`;

      // Clear any existing modals before opening
      document.querySelectorAll('#modalOverlay .modal').forEach(m => {
        if (m.dataset && m.dataset.dynamic === '1') m.remove();
        else m.style.display = 'none';
      });
      modal.dataset.dynamic = '1';
      overlay.appendChild(modal);
      overlay.classList.add('open');
      modal.style.display = 'flex';

    } catch(e) {
      console.error(e);
      toast('Error opening prescription entry', 'error');
    }
  },

  /* ── Save prescription back to treatment ────────────── */
  async saveEntry(treatmentId) {
    try {
      const rx    = $('px_rx')?.value?.trim() || '';
      const diag  = $('px_diag')?.value?.trim() || '';
      const fu    = $('px_fu')?.value  || '';
      const notes = $('px_notes')?.value || '';

      if (!rx) { toast('Prescription text is required', 'warning'); return false; }

      await DB.fetch(`/treatments/${treatmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prescription:    rx,
          diagnosis:       diag,
          follow_up_date:  fu,
          procedure_notes: notes
        })
      });

      const idx = this._rows.findIndex(r => r.id === treatmentId);
      if (idx !== -1) {
        this._rows[idx] = {
          ...this._rows[idx],
          prescription:    rx,
          diagnosis:       diag,
          follow_up_date:  fu,
          procedure_notes: notes
        };
      }

      toast('Prescription saved ✓', 'success');
      Modals._nukeOverlay();
      this._renderTable();
      return true;
    } catch(e) {
      console.error(e);
      toast('Error saving prescription', 'error');
      return false;
    }
  },

  async saveAndPrint(treatmentId) {
    const ok = await this.saveEntry(treatmentId);
    if (ok) await this.print(treatmentId);
  },

  /* ── In-page preview ────────────────────────────────── */
  async preview(treatmentId) {
    const html = await this._buildPrescHTML(treatmentId, false);
    if (!html) return;

    const old = document.getElementById('modalPrescPreview');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id        = 'modalPrescPreview';
    modal.className = 'modal';
    modal.style.cssText = 'display:flex;max-width:560px;width:95%';
    modal.innerHTML = `
      <div class="modal-head">
        <h3>℞ Prescription Preview</h3>
        <button class="close-btn" onclick="Modals._nukeOverlay()">×</button>
      </div>
      <div class="modal-body" style="padding:0;overflow:hidden;border-radius:0 0 var(--radius) var(--radius)">
        <iframe srcdoc="${html.replace(/"/g, '&quot;')}"
                style="width:100%;height:560px;border:none"></iframe>
      </div>`;

    const overlay = document.getElementById('modalOverlay');
    overlay.appendChild(modal);
    overlay.classList.add('open');
    modal.style.display = 'flex';
  },

  /* ── Print via hidden iframe ────────────────────────── */
  async print(treatmentId) {
    try {
      const html = await this._buildPrescHTML(treatmentId, true);
      if (!html) return;

      let frame = document.getElementById('_prescPrintFrame');
      if (!frame) {
        frame = document.createElement('iframe');
        frame.id  = '_prescPrintFrame';
        frame.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:none';
        document.body.appendChild(frame);
      }

      frame.srcdoc = html;
      frame.onload = () => {
        try { frame.contentWindow.focus(); frame.contentWindow.print(); }
        catch(e) { console.warn('Print error', e); }
      };
    } catch(e) {
      console.error(e);
      toast('Error printing prescription', 'error');
    }
  },

  /* ── Build prescription HTML ────────────────────────── */
  async _buildPrescHTML(treatmentId, forPrint = false) {
    try {
      const t = this._rows.find(r => r.id === treatmentId);
      if (!t) { toast('Treatment not found', 'error'); return null; }
      if (!t.prescription) { toast('No prescription for this treatment', 'warning'); return null; }

      const pt       = this._patients.find(p => p.id === t.patient_id);
      const dc       = this._doctors.find(d => d.id === t.doctor_id);
      const settings = await DB.settings.get().catch(() => ({}));
      const clinicName  = settings?.clinic_name   || settings?.clinic?.name    || 'DentCare Pro';
      const clinicPhone = settings?.clinic_phone  || settings?.clinic?.phone   || '';
      const clinicAddr  = settings?.clinic_address|| settings?.clinic?.address || '';

      // Format prescription lines with bullet markers
      const rxLines = (t.prescription || '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => `<div class="rx-item">• ${line}</div>`)
        .join('');

      const dob = pt?.date_of_birth || pt?.dob || '';
      let age = pt?.age || '';
      if (!age && dob) {
        const agYrs = Math.floor((Date.now() - new Date(dob)) / (365.25 * 86400000));
        if (!isNaN(agYrs) && agYrs > 0) age = agYrs;
      }

      return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Prescription — ${pt?.full_name || 'Patient'}</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{
    font-family:'DM Sans',sans-serif;
    max-width:520px;margin:0 auto;padding:1.75rem;
    color:#1a1a1a;background:#fff;min-height:100vh;
    border:2px solid #7c3aed;border-radius:12px;
    margin-top:1rem;
  }
  /* ── Header ── */
  .hd{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem}
  .clinic-name{font-size:1.35rem;font-weight:700;color:#7c3aed}
  .clinic-sub{font-size:.78rem;color:#666;margin-top:.2rem;line-height:1.6}
  .rx-sym{font-size:2.8rem;color:#7c3aed;font-style:italic;font-weight:900;line-height:1}
  hr{border:none;border-top:1px solid #e5e7eb;margin:.85rem 0}
  /* ── Fields ── */
  .lbl{font-size:.7rem;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:.1rem}
  .val{font-size:.9rem;font-weight:600;margin-bottom:.75rem}
  /* ── Rx box ── */
  .rx-title{
    font-size:.75rem;font-weight:700;text-transform:uppercase;
    letter-spacing:1px;color:#7c3aed;margin-bottom:.5rem
  }
  .rx-box{
    border:1.5px solid #7c3aed;border-radius:8px;
    padding:1rem 1.25rem;min-height:100px;
    background:#faf8ff;margin:0 0 1rem
  }
  .rx-item{
    font-size:.9rem;line-height:1.8;color:#1a1a1a;
    padding:.15rem 0;border-bottom:1px dotted #e5e7eb
  }
  .rx-item:last-child{border-bottom:none}
  /* ── Follow-up ── */
  .fu-box{
    background:#f0fdf4;border:1px solid #86efac;
    border-radius:6px;padding:.5rem .75rem;
    font-size:.82rem;font-weight:500;color:#15803d;
    margin-bottom:.75rem
  }
  /* ── Sig ── */
  .sig-wrap{display:flex;justify-content:flex-end;margin-top:2.5rem}
  .sig-line{border-top:1px solid #374151;width:200px;padding-top:.35rem;text-align:center;font-size:.78rem;color:#555}
  /* ── Footer ── */
  .footer{margin-top:1rem;text-align:center;font-size:.7rem;color:#bbb;border-top:1px dashed #e5e7eb;padding-top:.75rem}
  /* ── Print btn ── */
  .print-btn{
    display:block;margin:1.25rem auto 0;
    padding:.5rem 2rem;background:#7c3aed;color:#fff;
    border:none;border-radius:8px;cursor:pointer;
    font-size:.9rem;font-family:inherit;font-weight:600
  }
  @media print{
    .print-btn{display:none}
    html,body{background:#fff;border:none;border-radius:0;margin:0;padding:1rem}
    @page{margin:.5cm;size:A5}
  }
</style>
</head>
<body>

<!-- Header -->
<div class="hd">
  <div>
    <div class="clinic-name">🦷 ${clinicName}</div>
    <div class="clinic-sub">
      ${clinicPhone ? '📞 ' + clinicPhone + '<br>' : ''}
      ${clinicAddr ? clinicAddr + '<br>' : ''}
      Dental Prescription
    </div>
  </div>
  <div class="rx-sym">℞</div>
</div>
<hr>

<!-- Patient Info -->
<div class="lbl">Patient Name</div>
<div class="val">${pt?.full_name || '—'}</div>
${age ? `<div class="lbl">Age</div><div class="val">${age} years</div>` : ''}
<div class="lbl">Date</div>
<div class="val">${t.date || new Date().toLocaleDateString()}</div>
<div class="lbl">Diagnosis</div>
<div class="val">${t.diagnosis || t.treatment_type}</div>

<hr>

<!-- Prescription -->
<div class="rx-title">℞ &nbsp; Prescription / الوصفة الطبية</div>
<div class="rx-box">${rxLines}</div>

${t.follow_up_date ? `<div class="fu-box">📅 Follow-up appointment: <strong>${t.follow_up_date}</strong></div>` : ''}
${t.procedure_notes ? `<div style="font-size:.8rem;color:#555;margin-bottom:.5rem"><strong>Notes:</strong> ${t.procedure_notes.replace(/\n/g,'<br>')}</div>` : ''}

<!-- Signature -->
<div class="sig-wrap">
  <div class="sig-line">
    ${dc ? dc.full_name : 'Doctor Signature'}
    ${dc?.license_no ? '<br><small>Lic: ' + dc.license_no + '</small>' : ''}
  </div>
</div>

<!-- Footer -->
<div class="footer">
  ${clinicName} · ${new Date().toLocaleString()}
</div>

${forPrint
  ? `<script>document.fonts.ready.then(()=>window.print())<\/script>`
  : `<button class="print-btn" onclick="window.print()">🖨️ Print</button>`}

</body>
</html>`;
    } catch(e) {
      console.error(e);
      toast('Error building prescription', 'error');
      return null;
    }
  }
};
