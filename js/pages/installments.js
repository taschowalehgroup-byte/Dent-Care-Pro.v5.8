/* ═══════════════════════════════════════════════════════
   DentCare Pro — Payment Plans / Installments Page
   ═══════════════════════════════════════════════════════ */

const InstallmentsPage = {
  _plans: [],
  _patients: [],
  _filter: '',

  async render() {
    [this._plans, this._patients] = await Promise.all([
      DB.installments.all().catch(() => []),
      DB.tables.patients.all()
    ]);
    this._renderTable();
  },

  search(q) {
    this._filter = (q || '').toLowerCase();
    this._renderTable();
  },

  _renderTable() {
    const body = $('installBody');
    if (!body) return;

    let plans = this._plans;
    if (this._filter) {
      plans = plans.filter(p => (p.patient_name || '').toLowerCase().includes(this._filter));
    }

    if (!plans.length) {
      body.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div>💰</div><p>No payment plans found</p></div></td></tr>`;
      return;
    }

    body.innerHTML = plans.map(plan => {
      const payments  = plan.payments || [];
      const paid      = payments.filter(p => p.status === 'paid').length;
      const total     = plan.num_installments;
      const pct       = total ? Math.round(paid / total * 100) : 0;
      const paidAmt   = payments.filter(p => p.status === 'paid').reduce((s,p) => s + Number(p.amount), 0);
      const remaining = plan.total_amount - paidAmt;
      const nextDue   = payments.find(p => p.status === 'pending');
      const isOverdue = nextDue && nextDue.due_date < today();
      return `
      <tr>
        <td><strong>${plan.patient_name || '—'}</strong></td>
        <td>${fmt(plan.total_amount)}</td>
        <td>${plan.num_installments} × ${fmt(plan.total_amount / plan.num_installments)}</td>
        <td style="color:var(--green);font-weight:600">${fmt(paidAmt)}</td>
        <td style="color:${remaining > 0 ? 'var(--orange)' : 'var(--green)'};font-weight:600">${fmt(Math.max(0,remaining))}</td>
        <td>
          <div style="display:flex;align-items:center;gap:.5rem">
            <div style="flex:1;height:8px;background:var(--surface2);border-radius:4px;overflow:hidden;min-width:80px">
              <div style="width:${pct}%;height:100%;background:${pct===100?'var(--green)':'var(--accent)'};border-radius:4px"></div>
            </div>
            <span style="font-size:.8rem;color:var(--text2)">${paid}/${total}</span>
          </div>
          ${nextDue ? `<div style="font-size:.75rem;color:${isOverdue?'var(--red)':'var(--orange)'};margin-top:.25rem">${isOverdue?'⚠️ OVERDUE':'Next due'}: ${nextDue.due_date}</div>` : ''}
        </td>
        <td>${UI.statusBadge(plan.status === 'completed' ? 'confirmed' : plan.status === 'active' ? 'scheduled' : 'cancelled')}</td>
        <td><div class="actions">
          <button class="action-btn" onclick="InstallmentsPage._showPlan(${plan.id})">View</button>
          <button class="action-btn" onclick="InstallmentsPage._printPlan(${plan.id})">🖨</button>
          <button class="action-btn danger" onclick="InstallmentsPage._delete(${plan.id})">Del</button>
        </div></td>
      </tr>`;
    }).join('');
  },

  async openNew() {
    const patients = await DB.tables.patients.all();
    const ptOpts = patients.map(p => `<option value="${p.id}">${p.full_name}</option>`).join('');
    const html = `
    <div id="installModal" class="modal-overlay open" onclick="if(event.target===this)this.remove()">
      <div class="modal modal-sm">
        <div class="modal-head"><h3>💰 New Payment Plan</h3><button class="close-btn" onclick="$('installModal').remove()">✕</button></div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-group full"><label>Patient *</label><select id="ip_patient"><option value="">Select…</option>${ptOpts}</select></div>
            <div class="form-group"><label>Total Amount (E£) *</label><input id="ip_total" type="number" min="0" placeholder="0.00"></div>
            <div class="form-group"><label>Number of Installments *</label><input id="ip_num" type="number" min="2" max="24" value="3" placeholder="e.g. 3"></div>
            <div class="form-group"><label>Start Date *</label><input id="ip_start" type="date" value="${today()}"></div>
            <div class="form-group full"><label>Description</label><input id="ip_desc" placeholder="e.g. Crown treatment payment plan"></div>
          </div>
          <div id="ip_preview" style="margin-top:1rem;padding:.75rem;background:var(--surface2);border-radius:var(--radius-sm);font-size:.85rem;color:var(--text2)">
            Enter total and number of installments to see preview
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" onclick="$('installModal').remove()">Cancel</button>
          <button class="btn-primary" onclick="InstallmentsPage._save()">✓ Create Plan</button>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    // Live preview
    const update = () => {
      const total = parseFloat($('ip_total')?.value) || 0;
      const num   = parseInt($('ip_num')?.value)     || 0;
      const prev  = $('ip_preview');
      if (prev && total > 0 && num > 0) {
        const per = (total / num).toFixed(2);
        prev.innerHTML = `<strong>${num} installments</strong> of <strong>E£ ${per}</strong> each · Total: <strong>${fmt(total)}</strong>`;
      }
    };
    $('ip_total')?.addEventListener('input', update);
    $('ip_num')?.addEventListener('input', update);
  },

  async _save() {
    const patient_id       = parseInt($('ip_patient')?.value);
    const total_amount     = parseFloat($('ip_total')?.value);
    const num_installments = parseInt($('ip_num')?.value);
    const start_date       = $('ip_start')?.value;
    const description      = $('ip_desc')?.value;
    if (!patient_id || !total_amount || !num_installments) {
      toast('Patient, total amount and installments required', 'error'); return;
    }
    try {
      await DB.installments.create({ patient_id, total_amount, num_installments, start_date, description });
      toast('Payment plan created ✓', 'success');
      $('installModal')?.remove();
      await this.render();
    } catch(e) { toast('Error: '+e.message, 'error'); }
  },

  _showPlan(planId) {
    const plan = this._plans.find(p => p.id == planId);
    if (!plan) return;
    const pmtRows = (plan.payments || []).map(p => `
      <tr>
        <td>#${p.installment_no}</td>
        <td>${fmt(p.amount)}</td>
        <td>${p.due_date}</td>
        <td>${p.paid_date || '—'}</td>
        <td>${UI.statusBadge(p.status === 'paid' ? 'confirmed' : p.status === 'pending' ? 'scheduled' : 'cancelled')}</td>
        <td>
          ${p.status !== 'paid' ? `<button class="action-btn" onclick="InstallmentsPage._markPaid(${p.id}, ${planId})">Mark Paid</button>` : '✓'}
        </td>
      </tr>`).join('');

    const html = `
    <div id="installViewModal" class="modal-overlay open" onclick="if(event.target===this)this.remove()">
      <div class="modal" style="max-width:640px">
        <div class="modal-head">
          <h3>💰 Payment Plan — ${plan.patient_name}</h3>
          <button class="close-btn" onclick="$('installViewModal').remove()">✕</button>
        </div>
        <div class="modal-body">
          <div style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap">
            <div class="fin-card" style="flex:1"><div class="fin-label">Total</div><div class="fin-value income">${fmt(plan.total_amount)}</div></div>
            <div class="fin-card" style="flex:1"><div class="fin-label">Status</div><div class="fin-value">${plan.status}</div></div>
          </div>
          <table class="data-table"><thead><tr>
            <th>#</th><th>Amount</th><th>Due Date</th><th>Paid On</th><th>Status</th><th>Action</th>
          </tr></thead><tbody>${pmtRows}</tbody></table>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" onclick="$('installViewModal').remove()">Close</button>
          <button class="btn-primary" onclick="InstallmentsPage._printPlan(${planId})">🖨️ Print</button>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  },

  async _markPaid(payId, planId) {
    try {
      await DB.installments.payInstallment(payId, { status: 'paid', paid_date: today() });
      toast('Installment marked as paid ✓', 'success');
      $('installViewModal')?.remove();
      await this.render();
      this._showPlan(planId);
    } catch(e) { toast('Error: '+e.message, 'error'); }
  },

  _printPlan(planId) {
    const plan = this._plans.find(p => p.id == planId);
    if (!plan) return;
    const pmtRows = (plan.payments || []).map(p => `
      <tr><td>#${p.installment_no}</td><td>${fmt(p.amount)}</td><td>${p.due_date}</td>
      <td>${p.paid_date||'—'}</td><td>${p.status}</td></tr>`).join('');
    const clinicName = document.querySelector('.brand-name')?.textContent || 'DentCare Pro';
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Payment Plan — ${plan.patient_name}</title>
    <style>body{font-family:Arial,sans-serif;padding:2rem}h1{color:#7c3aed}table{width:100%;border-collapse:collapse}
    th{background:#7c3aed;color:#fff;padding:.5rem}td{padding:.4rem;border-bottom:1px solid #eee}</style></head><body>
    <h1>${clinicName}</h1><h2>Payment Plan — ${plan.patient_name}</h2>
    <p>Total: ${fmt(plan.total_amount)} · ${plan.num_installments} installments · Started: ${plan.start_date}</p>
    <table><thead><tr><th>#</th><th>Amount</th><th>Due Date</th><th>Paid On</th><th>Status</th></tr></thead>
    <tbody>${pmtRows}</tbody></table>
    <p style="margin-top:2rem;font-size:.8rem;color:#666">Generated ${new Date().toLocaleDateString()}</p>
    <script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
  },

  async _delete(id) {
    if (!confirm('Delete this payment plan and all installment records?')) return;
    try {
      await DB.installments.delete(id);
      toast('Plan deleted', 'info');
      await this.render();
    } catch(e) { toast('Error: '+e.message, 'error'); }
  }
};
