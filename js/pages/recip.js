/* ═══════════════════════════════════════════════════════
   DentCare Pro — Recip (Receipt Manager) Page
   • Browse all treatment receipts for every patient
   • Enter / edit receipt data inline
   • Preview & print a beautiful A5 receipt
   ═══════════════════════════════════════════════════════ */

const RecipPage = {
  _rows:      [],   // treatments
  _patients:  [],
  _doctors:   [],
  _filter:    '',

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

  /* ── Table rendering ────────────────────────────────── */
  _renderTable() {
    const body = $('recipBody');
    if (!body) return;

    const ptMap = Object.fromEntries(this._patients.map(p => [p.id, p]));
    const dcMap = Object.fromEntries(this._doctors.map(d => [d.id, d]));

    let rows = [...this._rows].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const q  = (this._filter || '').toLowerCase();
    if (q) {
      rows = rows.filter(r =>
        (ptMap[r.patient_id]?.full_name || '').toLowerCase().includes(q) ||
        (r.treatment_type || '').toLowerCase().includes(q) ||
        (r.date || '').includes(q)
      );
    }

    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div>🧾</div><p>No treatments found</p></div></td></tr>`;
      return;
    }

    body.innerHTML = rows.map(t => {
      const pt   = ptMap[t.patient_id];
      const dc   = dcMap[t.doctor_id];
      const cost = t.cost ? Number(t.cost).toLocaleString() + ' EGP' : '—';

      return `<tr>
        <td><strong>${pt?.full_name || 'Unknown'}</strong><br>
            <small style="color:var(--muted)">${pt?.patient_no || ''}</small></td>
        <td>${dc?.full_name || '—'}</td>
        <td>${t.treatment_type}</td>
        <td>${t.date || '—'}</td>
        <td><strong style="color:var(--accent)">${cost}</strong></td>
        <td>${UI.statusBadge(t.status || 'completed')}</td>
        <td>
          <div class="actions">
            <button class="action-btn accent" onclick="RecipPage.openEntry(${t.id})" title="Enter / Edit Receipt Data">✏️ Entry</button>
            <button class="action-btn" onclick="RecipPage.preview(${t.id})" title="Preview Receipt">👁️ Preview</button>
            <button class="action-btn" onclick="RecipPage.print(${t.id})" title="Print Receipt">🖨️ Print</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  },

  /* ── Receipt Entry Modal ────────────────────────────── */
  async openEntry(treatmentId) {
    try {
      const t  = this._rows.find(r => r.id === treatmentId);
      const pt = this._patients.find(p => p.id === t?.patient_id);
      if (!t) return;

      // Fetch or generate receipt number
      let receiptNo = '';
      try {
        const res = await DB.fetch(`/receipts/number/${treatmentId}`);
        receiptNo = res.receipt_no;
      } catch(e) {
        receiptNo = `RX-${new Date().getFullYear()}-${String(treatmentId).padStart(5,'0')}`;
      }

      const settings = await DB.settings.get().catch(() => ({}));
      const currency = settings?.clinic?.currency || settings?.currency || 'EGP';

      const overlay = document.getElementById('modalOverlay');
      if (!overlay) return;

      // Remove any existing recip modal
      const old = document.getElementById('modalRecipEntry');
      if (old) old.remove();

      const modal = document.createElement('div');
      modal.id        = 'modalRecipEntry';
      modal.className = 'modal';
      modal.style.cssText = 'display:flex;max-width:540px;width:95%';

      modal.innerHTML = `
        <div class="modal-head">
          <h3>🧾 Receipt Entry — ${pt?.full_name || 'Patient'}</h3>
          <button class="close-btn" onclick="Modals._nukeOverlay()">×</button>
        </div>
        <div class="modal-body" style="display:grid;gap:1rem">

          <div style="background:var(--surface2);border-radius:var(--radius);padding:.75rem 1rem;display:grid;grid-template-columns:1fr 1fr;gap:.5rem;font-size:.85rem">
            <div><span style="color:var(--muted)">Receipt No:</span> <strong>${receiptNo}</strong></div>
            <div><span style="color:var(--muted)">Date:</span> <strong>${t.date || '—'}</strong></div>
            <div><span style="color:var(--muted)">Treatment:</span> <strong>${t.treatment_type}</strong></div>
            <div><span style="color:var(--muted)">Patient No:</span> <strong>${pt?.patient_no || '—'}</strong></div>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label>Amount Paid (${currency})</label>
              <input id="re_amount" type="number" min="0" step="0.01"
                     value="${t.cost || ''}" placeholder="0.00">
            </div>
            <div class="form-group">
              <label>Payment Method</label>
              <select id="re_pay">
                <option value="Cash"         ${(pt?.payment_method||t.payment_method||'Cash')==='Cash'?'selected':''}>💵 Cash</option>
                <option value="Card"         ${(pt?.payment_method||t.payment_method||'')==='Card'?'selected':''}>💳 Card</option>
                <option value="Insurance"    ${(pt?.payment_method||t.payment_method||'')==='Insurance'?'selected':''}>🏥 Insurance</option>
                <option value="Installment"  ${(pt?.payment_method||t.payment_method||'')==='Installment'?'selected':''}>📆 Installment</option>
                <option value="Bank Transfer"${(pt?.payment_method||t.payment_method||'')==='Bank Transfer'?'selected':''}>🏦 Bank Transfer</option>
              </select>
            </div>
            <div class="form-group">
              <label>Payment Status</label>
              <select id="re_status">
                <option value="paid"    ${(t.status||'completed')==='completed'||t.status==='paid'?'selected':''}>✅ Paid</option>
                <option value="partial" ${t.status==='partial'?'selected':''}>⚠️ Partial</option>
                <option value="pending" ${t.status==='pending'?'selected':''}>🕐 Pending</option>
              </select>
            </div>
            <div class="form-group">
              <label>Discount (%)</label>
              <input id="re_discount" type="number" min="0" max="100" step="1"
                     value="${t.discount || 0}" placeholder="0">
            </div>
            <div class="form-group full">
              <label>Receipt Notes</label>
              <textarea id="re_notes" rows="2"
                        placeholder="Any additional notes to appear on receipt…"
                        style="resize:vertical">${t.receipt_notes || ''}</textarea>
            </div>
          </div>

          <div style="display:flex;gap:.5rem;justify-content:flex-end;flex-wrap:wrap">
            <button class="btn-icon" onclick="Modals._nukeOverlay()">Cancel</button>
            <button class="btn-icon" onclick="RecipPage.saveEntry(${treatmentId}, '${receiptNo}')">💾 Save</button>
            <button class="btn-primary" onclick="RecipPage.saveAndPrint(${treatmentId}, '${receiptNo}')">🖨️ Save & Print</button>
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
      toast('Error opening receipt entry', 'error');
    }
  },

  /* ── Save entry data back to the treatment ──────────── */
  async saveEntry(treatmentId, receiptNo) {
    try {
      const amount   = parseFloat($('re_amount')?.value  || 0);
      const payMethod= $('re_pay')?.value    || 'Cash';
      const status   = $('re_status')?.value || 'paid';
      const discount = parseFloat($('re_discount')?.value || 0);
      const notes    = $('re_notes')?.value  || '';

      // Map receipt status → treatment status
      const tStatus = status === 'paid' ? 'completed' : status;

      await DB.fetch(`/treatments/${treatmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cost:           amount,
          payment_method: payMethod,
          status:         tStatus,
          discount:       discount,
          receipt_notes:  notes
        })
      });

      // Refresh local data
      const idx = this._rows.findIndex(r => r.id === treatmentId);
      if (idx !== -1) {
        this._rows[idx] = {
          ...this._rows[idx],
          cost:           amount,
          payment_method: payMethod,
          status:         tStatus,
          discount,
          receipt_notes:  notes
        };
      }

      toast('Receipt data saved ✓', 'success');
      Modals._nukeOverlay();
      this._renderTable();
    } catch(e) {
      console.error(e);
      toast('Error saving receipt data', 'error');
    }
  },

  async saveAndPrint(treatmentId, receiptNo) {
    await this.saveEntry(treatmentId, receiptNo);
    await this.print(treatmentId);
  },

  /* ── In-page preview (no popup) ─────────────────────── */
  async preview(treatmentId) {
    const html = await this._buildReceiptHTML(treatmentId, false);
    if (!html) return;

    const old = document.getElementById('modalRecipPreview');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id        = 'modalRecipPreview';
    modal.className = 'modal';
    modal.style.cssText = 'display:flex;max-width:480px;width:95%';
    modal.innerHTML = `
      <div class="modal-head">
        <h3>🧾 Receipt Preview</h3>
        <button class="close-btn" onclick="Modals._nukeOverlay()">×</button>
      </div>
      <div class="modal-body" style="padding:0;overflow:hidden;border-radius:0 0 var(--radius) var(--radius)">
        <iframe srcdoc="${html.replace(/"/g, '&quot;')}"
                style="width:100%;height:520px;border:none"></iframe>
      </div>`;

    const overlay = document.getElementById('modalOverlay');
    overlay.appendChild(modal);
    overlay.classList.add('open');
    modal.style.display = 'flex';
  },

  /* ── Print using iframe (no popup window needed) ────── */
  async print(treatmentId) {
    try {
      const html = await this._buildReceiptHTML(treatmentId, true);
      if (!html) return;

      // Use a hidden iframe for printing — avoids popup blocker
      let frame = document.getElementById('_recipPrintFrame');
      if (!frame) {
        frame = document.createElement('iframe');
        frame.id  = '_recipPrintFrame';
        frame.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:none';
        document.body.appendChild(frame);
      }

      frame.srcdoc = html;
      frame.onload = () => {
        try {
          frame.contentWindow.focus();
          frame.contentWindow.print();
        } catch(e) { console.warn('Print error', e); }
      };
    } catch(e) {
      console.error(e);
      toast('Error printing receipt', 'error');
    }
  },

  /* ── Build receipt HTML string ──────────────────────── */
  async _buildReceiptHTML(treatmentId, forPrint = false) {
    try {
      const t = this._rows.find(r => r.id === treatmentId);
      if (!t) { toast('Treatment not found', 'error'); return null; }

      const pt       = this._patients.find(p => p.id === t.patient_id);
      const dc       = this._doctors.find(d => d.id === t.doctor_id);
      const settings = await DB.settings.get().catch(() => ({}));

      const clinicName  = settings?.clinic_name   || settings?.clinic?.name    || 'DentCare Pro';
      const clinicPhone = settings?.clinic_phone  || settings?.clinic?.phone   || '';
      const clinicAddr  = settings?.clinic_address|| settings?.clinic?.address || '';
      const currency    = settings?.clinic?.currency || settings?.currency      || 'EGP';

      let receiptNo = '';
      try {
        const res = await DB.fetch(`/receipts/number/${treatmentId}`);
        receiptNo = res.receipt_no;
      } catch(e) {
        receiptNo = `RX-${new Date().getFullYear()}-${String(treatmentId).padStart(5,'0')}`;
      }

      const isAr   = document.body.classList.contains('lang-ar');
      const cost   = Number(t.cost || 0);
      const disc   = Number(t.discount || 0);
      const discAmt= disc > 0 ? (cost * disc / 100) : 0;
      const total  = cost - discAmt;
      const payStatus = t.status === 'completed' || t.status === 'paid' ? 'paid' : (t.status || 'pending');
      const payMethod = t.payment_method || pt?.payment_method || 'Cash';
      const notes     = t.receipt_notes || '';

      const badgeColor = payStatus === 'paid'
        ? 'background:#dcfce7;color:#15803d'
        : payStatus === 'partial'
          ? 'background:#fef9c3;color:#854d0e'
          : 'background:#fee2e2;color:#991b1b';

      const badgeLabel = payStatus === 'paid'
        ? (isAr ? 'مدفوع ✓' : 'PAID ✓')
        : payStatus === 'partial'
          ? (isAr ? 'جزئي' : 'PARTIAL')
          : (isAr ? 'معلق' : 'PENDING');

      return `<!DOCTYPE html>
<html dir="${isAr ? 'rtl' : 'ltr'}" lang="${isAr ? 'ar' : 'en'}">
<head>
<meta charset="UTF-8">
<title>Receipt ${receiptNo}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{background:#f8f7ff}
  body{
    font-family:${isAr ? "'Cairo'" : "'DM Sans'"}, sans-serif;
    max-width:420px;
    margin:0 auto;
    padding:1.5rem;
    color:#1a1a1a;
    direction:${isAr ? 'rtl' : 'ltr'};
    background:#fff;
    min-height:100vh;
  }
  /* ── Header ── */
  .hd{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem}
  .clinic-name{font-size:1.3rem;font-weight:700;color:#7c3aed;margin-bottom:.2rem}
  .clinic-sub{font-size:.78rem;color:#666;line-height:1.6}
  .stamp{
    width:70px;height:70px;
    border:3px solid ${payStatus==='paid'?'#7c3aed':'#f59e0b'};
    border-radius:50%;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    color:${payStatus==='paid'?'#7c3aed':'#d97706'};
    font-weight:700;font-size:.65rem;text-align:center;
    opacity:.75;flex-shrink:0
  }
  .stamp-big{font-size:.9rem;font-weight:900;display:block}
  /* ── Title band ── */
  .title-band{
    background:linear-gradient(135deg,#7c3aed,#a855f7);
    color:#fff;text-align:center;
    padding:.5rem 1rem;border-radius:8px;
    font-weight:700;letter-spacing:2px;font-size:.9rem;
    margin-bottom:.5rem
  }
  .receipt-no{font-size:.72rem;color:#999;text-align:${isAr?'left':'right'};margin-bottom:.75rem}
  /* ── Divider ── */
  .div{border:none;border-top:2px dashed #e5e7eb;margin:.75rem 0}
  .div-solid{border:none;border-top:1px solid #e5e7eb;margin:.75rem 0}
  /* ── Row ── */
  .row{display:flex;justify-content:space-between;align-items:baseline;margin:.3rem 0;font-size:.87rem;gap:.5rem}
  .row .lbl{color:#6b7280;flex-shrink:0}
  .row .val{font-weight:500;text-align:${isAr?'left':'right'};word-break:break-word}
  /* ── Totals ── */
  .totals{background:#f5f3ff;border-radius:8px;padding:.75rem 1rem;margin:.5rem 0}
  .row.big{font-size:1.1rem;font-weight:700}
  .row.big .val{color:#7c3aed}
  .row.disc .val{color:#16a34a}
  .badge{
    display:inline-block;padding:.25rem .75rem;
    border-radius:999px;font-size:.78rem;font-weight:700;
    ${badgeColor}
  }
  /* ── Notes ── */
  .notes-box{
    background:#fafafa;border:1px dashed #d1d5db;border-radius:6px;
    padding:.6rem .8rem;font-size:.8rem;color:#555;margin-top:.25rem
  }
  /* ── Footer ── */
  .footer{
    margin-top:1.25rem;padding-top:.75rem;
    border-top:1px dashed #ddd;text-align:center;
    font-size:.72rem;color:#9ca3af;line-height:1.7
  }
  /* ── Sig line ── */
  .sig-wrap{display:flex;justify-content:flex-end;margin-top:1.5rem}
  .sig-line{border-top:1px solid #374151;width:160px;padding-top:.3rem;text-align:center;font-size:.75rem;color:#555}
  /* ── Print button ── */
  .print-btn{
    display:block;margin:1.25rem auto 0;
    padding:.5rem 2rem;background:#7c3aed;color:#fff;
    border:none;border-radius:8px;cursor:pointer;
    font-size:.9rem;font-family:inherit;font-weight:600
  }
  @media print{
    .print-btn{display:none}
    html,body{background:#fff}
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
      ${clinicAddr || ''}
    </div>
  </div>
  <div class="stamp">
    <span class="stamp-big">${isAr ? (payStatus === 'paid' ? 'مدفوع' : 'معلق') : (payStatus === 'paid' ? 'PAID' : 'UNPAID')}</span>
  </div>
</div>

<!-- Title -->
<div class="title-band">RECEIPT &nbsp;/&nbsp; إيصال دفع</div>
<div class="receipt-no">No: ${receiptNo} &nbsp;|&nbsp; ${new Date().toLocaleDateString('en-GB')}</div>

<hr class="div">

<!-- Patient Info -->
<div class="row"><span class="lbl">${isAr ? 'التاريخ' : 'Date'}</span><span class="val">${t.date || '—'}</span></div>
<div class="row"><span class="lbl">${isAr ? 'المريض' : 'Patient'}</span><span class="val"><strong>${pt?.full_name || '—'}</strong></span></div>
<div class="row"><span class="lbl">${isAr ? 'رقم المريض' : 'Patient No.'}</span><span class="val">${pt?.patient_no || '—'}</span></div>
${pt?.phone ? `<div class="row"><span class="lbl">${isAr ? 'الهاتف' : 'Phone'}</span><span class="val">${pt.phone}</span></div>` : ''}
${dc ? `<div class="row"><span class="lbl">${isAr ? 'الطبيب' : 'Doctor'}</span><span class="val">${dc.full_name}</span></div>` : ''}

<hr class="div">

<!-- Treatment Info -->
<div class="row"><span class="lbl">${isAr ? 'العلاج' : 'Treatment'}</span><span class="val">${t.treatment_type}</span></div>
${t.tooth_number ? `<div class="row"><span class="lbl">${isAr ? 'الأسنان' : 'Tooth(s)'}</span><span class="val">${t.tooth_number}</span></div>` : ''}
${t.diagnosis ? `<div class="row"><span class="lbl">${isAr ? 'التشخيص' : 'Diagnosis'}</span><span class="val">${t.diagnosis}</span></div>` : ''}
${pt?.insurance ? `<div class="row"><span class="lbl">${isAr ? 'التأمين' : 'Insurance'}</span><span class="val">${pt.insurance}</span></div>` : ''}

<hr class="div">

<!-- Totals -->
<div class="totals">
  <div class="row"><span class="lbl">${isAr ? 'المبلغ' : 'Amount'}</span><span class="val">${cost.toLocaleString()} ${currency}</span></div>
  ${disc > 0 ? `<div class="row disc"><span class="lbl">${isAr ? 'خصم' : 'Discount'} (${disc}%)</span><span class="val">−${discAmt.toLocaleString()} ${currency}</span></div>` : ''}
  <hr class="div-solid">
  <div class="row big"><span>${isAr ? 'الإجمالي' : 'Total'}</span><span class="val">${total.toLocaleString()} ${currency}</span></div>
</div>

<div class="row"><span class="lbl">${isAr ? 'طريقة الدفع' : 'Payment Method'}</span><span class="val">${payMethod}</span></div>
<div class="row"><span class="lbl">${isAr ? 'الحالة' : 'Status'}</span><span class="val"><span class="badge">${badgeLabel}</span></span></div>

${notes ? `<div style="margin-top:.5rem;font-size:.78rem;color:#6b7280">${isAr ? 'ملاحظات' : 'Notes'}:</div><div class="notes-box">${notes}</div>` : ''}

<!-- Signature line -->
<div class="sig-wrap">
  <div class="sig-line">${dc ? dc.full_name : (isAr ? 'توقيع الطبيب' : 'Doctor Signature')}</div>
</div>

<!-- Footer -->
<div class="footer">
  <p>${isAr ? 'شكراً لاختيارك' : 'Thank you for choosing'} ${clinicName}</p>
  <p style="margin-top:.2rem;color:#bbb;font-size:.65rem">${receiptNo} · ${new Date().toLocaleString()}</p>
</div>

${forPrint ? `<script>document.fonts.ready.then(()=>window.print())<\/script>` :
  `<button class="print-btn" onclick="window.print()">🖨️ Print</button>`}

</body>
</html>`;
    } catch(e) {
      console.error(e);
      toast('Error building receipt', 'error');
      return null;
    }
  }
};
