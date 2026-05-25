/* ═══════════════════════════════════════════════════════
   DentCare Pro — Doctor Commission Report Page
   ═══════════════════════════════════════════════════════ */

const CommissionsPage = {
  _data: null,

  async render() {
    await this._load();
    this._renderSummary();
  },

  async _load(params = {}) {
    try {
      this._data = await DB.commissions.report(params);
    } catch(e) {
      this._data = { rows: [], summary: [] };
      console.error('Commission load error:', e);
    }
  },

  async filter() {
    const doctorId = $('cm_doctor')?.value || '';
    const year     = $('cm_year')?.value || '';
    const month    = $('cm_month')?.value || '';
    const params   = {};
    if (doctorId) params.doctor_id = doctorId;
    if (year)     params.year = year;
    if (month)    params.month = month;
    await this._load(params);
    this._renderSummary();
  },

  _renderSummary() {
    const body = $('commissionBody');
    if (!body || !this._data) return;
    const { summary } = this._data;

    // Summary cards
    const cards = $('commissionSummaryCards');
    if (cards && summary.length) {
      const totalRevenue    = summary.reduce((s,d) => s + d.total_revenue, 0);
      const totalCommission = summary.reduce((s,d) => s + d.total_commission, 0);
      const totalTreatments = summary.reduce((s,d) => s + d.count, 0);
      const topDoctor = summary[0];
      cards.innerHTML = `
        <div class="fin-card"><div class="fin-label">Total Revenue</div><div class="fin-value income">${fmt(totalRevenue)}</div></div>
        <div class="fin-card"><div class="fin-label">Total Commissions</div><div class="fin-value" style="color:var(--accent)">${fmt(totalCommission)}</div></div>
        <div class="fin-card"><div class="fin-label">Total Treatments</div><div class="fin-value">${totalTreatments}</div></div>
        <div class="fin-card"><div class="fin-label">Top Earner</div><div class="fin-value" style="color:var(--yellow);font-size:1rem">${topDoctor?.doctor_name || '—'}</div></div>
      `;
    } else if (cards) { cards.innerHTML = ''; }

    if (!summary.length) {
      body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div>💊</div><p>No commission data found for selected filters</p></div></td></tr>`;
      return;
    }

    const totalRevenue    = summary.reduce((s,d) => s + d.total_revenue, 0);
    const totalCommission = summary.reduce((s,d) => s + d.total_commission, 0);

    body.innerHTML = summary.map(d => {
      const avgRate = d.treatments.length
        ? (d.treatments.reduce((s,t)=>s+t.commission_rate,0)/d.treatments.length).toFixed(1)
        : '—';
      return `
      <tr>
        <td><strong>${d.doctor_name}</strong></td>
        <td>${d.count} treatments</td>
        <td style="color:var(--green);font-weight:600">${fmt(d.total_revenue)}</td>
        <td style="color:var(--text2)">${avgRate}%</td>
        <td style="color:var(--accent);font-weight:600">${fmt(d.total_commission)}</td>
        <td>
          <button class="action-btn" onclick="CommissionsPage._showDetails(${d.doctor_id})">Details</button>
          <button class="action-btn" onclick="CommissionsPage._printDoctor(${d.doctor_id})">🖨 Print</button>
        </td>
      </tr>`;
    }).join('') + `
      <tr style="border-top:2px solid var(--border);font-weight:700">
        <td>TOTAL</td>
        <td>${summary.reduce((s,d)=>s+d.count,0)} treatments</td>
        <td style="color:var(--green)">${fmt(totalRevenue)}</td>
        <td></td>
        <td style="color:var(--accent)">${fmt(totalCommission)}</td>
        <td></td>
      </tr>`;
  },

  _showDetails(doctorId) {
    const doc = this._data.summary.find(d => d.doctor_id == doctorId);
    if (!doc) return;

    const rows = doc.treatments.map(t => `
      <tr>
        <td>${t.date}</td>
        <td>${t.patient_name}</td>
        <td>${t.treatment_type}</td>
        <td>${t.tooth_number || '—'}</td>
        <td>${fmt(t.cost)}</td>
        <td>${t.commission_rate}%</td>
        <td style="color:var(--accent);font-weight:600">${fmt(t.commission)}</td>
      </tr>`).join('');

    const html = `
    <div id="commDetailModal" class="modal-overlay open" onclick="if(event.target===this)this.remove()">
      <div class="modal" style="max-width:800px;max-height:90vh;overflow-y:auto">
        <div class="modal-head">
          <h3>💊 Commission Details — ${doc.doctor_name}</h3>
          <button class="close-btn" onclick="$('commDetailModal').remove()">✕</button>
        </div>
        <div class="modal-body">
          <div style="display:flex;gap:1rem;margin-bottom:1rem">
            <div class="fin-card" style="flex:1"><div class="fin-label">Total Revenue</div><div class="fin-value income">${fmt(doc.total_revenue)}</div></div>
            <div class="fin-card" style="flex:1"><div class="fin-label">Commission Earned</div><div class="fin-value" style="color:var(--accent)">${fmt(doc.total_commission)}</div></div>
            <div class="fin-card" style="flex:1"><div class="fin-label">Treatments</div><div class="fin-value">${doc.count}</div></div>
          </div>
          <table class="data-table"><thead><tr>
            <th>Date</th><th>Patient</th><th>Treatment</th><th>Teeth</th><th>Cost</th><th>Rate</th><th>Commission</th>
          </tr></thead><tbody>${rows}</tbody></table>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" onclick="$('commDetailModal').remove()">Close</button>
          <button class="btn-primary" onclick="CommissionsPage._printDoctor(${doctorId})">🖨️ Print Report</button>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
  },

  _printDoctor(doctorId) {
    const doc = this._data.summary.find(d => d.doctor_id == doctorId);
    if (!doc) return;
    const filterYear  = $('cm_year')?.value  || 'All Years';
    const filterMonth = $('cm_month')?.value ? `Month ${$('cm_month').value}` : 'All Months';

    const rows = doc.treatments.map(t => `
      <tr>
        <td>${t.date}</td><td>${t.patient_name}</td><td>${t.treatment_type}</td>
        <td>${t.tooth_number||'—'}</td><td>${fmt(t.cost)}</td><td>${t.commission_rate}%</td><td>${fmt(t.commission)}</td>
      </tr>`).join('');

    const clinicName = document.querySelector('.brand-name')?.textContent || 'DentCare Pro';
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Commission Report — ${doc.doctor_name}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:2rem;color:#1a1a1a}
      h1{color:#7c3aed;margin-bottom:.25rem}
      table{width:100%;border-collapse:collapse;margin-top:1rem}
      th{background:#7c3aed;color:#fff;padding:.5rem;text-align:left}
      td{padding:.4rem;border-bottom:1px solid #eee}
      .summary{display:flex;gap:2rem;margin:1.5rem 0;padding:1rem;background:#f9f9f9;border-radius:8px}
      .summary div{text-align:center}
      .summary .val{font-size:1.4rem;font-weight:700;color:#7c3aed}
      .summary .lbl{font-size:.8rem;color:#666}
      @media print{button{display:none}}
    </style></head><body>
    <h1>${clinicName}</h1>
    <p><strong>Commission Report: ${doc.doctor_name}</strong> &nbsp;|&nbsp; ${filterYear} / ${filterMonth}</p>
    <p>Generated: ${new Date().toLocaleDateString()}</p>
    <div class="summary">
      <div><div class="val">${fmt(doc.total_revenue)}</div><div class="lbl">Total Revenue</div></div>
      <div><div class="val">${fmt(doc.total_commission)}</div><div class="lbl">Commission Earned</div></div>
      <div><div class="val">${doc.count}</div><div class="lbl">Treatments</div></div>
    </div>
    <table><thead><tr><th>Date</th><th>Patient</th><th>Treatment</th><th>Teeth</th><th>Cost</th><th>Rate</th><th>Commission</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="font-weight:700"><td colspan="4">TOTAL</td><td>${fmt(doc.total_revenue)}</td><td></td><td>${fmt(doc.total_commission)}</td></tr></tfoot>
    </table>
    <script>window.onload=()=>window.print()</script>
    </body></html>`);
    win.document.close();
  },

  printReport() {
    if (!this._data || !this._data.summary.length) { toast('No data to print', 'warning'); return; }
    const { summary } = this._data;
    const filterYear  = $('cm_year')?.value  || 'All Years';
    const filterMonth = $('cm_month')?.value ? `Month ${$('cm_month').value}` : 'All Months';
    const totalRevenue    = summary.reduce((s,d) => s + d.total_revenue, 0);
    const totalCommission = summary.reduce((s,d) => s + d.total_commission, 0);
    const clinicName = document.querySelector('.brand-name')?.textContent || 'DentCare Pro';

    const rows = summary.map(d => `
      <tr>
        <td>${d.doctor_name}</td><td>${d.count}</td>
        <td>${fmt(d.total_revenue)}</td><td>${fmt(d.total_commission)}</td>
      </tr>`).join('');

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Commission Report</title>
    <style>
      body{font-family:Arial,sans-serif;padding:2rem;color:#1a1a1a}
      h1{color:#7c3aed}
      table{width:100%;border-collapse:collapse;margin-top:1rem}
      th{background:#7c3aed;color:#fff;padding:.5rem;text-align:left}
      td{padding:.4rem;border-bottom:1px solid #eee}
      tfoot tr{font-weight:700;border-top:2px solid #7c3aed}
      .kpis{display:flex;gap:2rem;margin:1.5rem 0}
      .kpis div{text-align:center;flex:1;background:#f9f9f9;border-radius:8px;padding:1rem}
      .kpis .v{font-size:1.4rem;font-weight:700;color:#7c3aed}
      .kpis .l{font-size:.8rem;color:#666;margin-top:.25rem}
      @media print{button{display:none}}
    </style></head><body>
    <h1>🦷 ${clinicName}</h1>
    <p><strong>Doctor Commission Report</strong> — ${filterYear} / ${filterMonth}</p>
    <p style="color:#888;font-size:.85rem">Generated: ${new Date().toLocaleString()}</p>
    <div class="kpis">
      <div><div class="v">${fmt(totalRevenue)}</div><div class="l">Total Revenue</div></div>
      <div><div class="v">${fmt(totalCommission)}</div><div class="l">Total Commissions</div></div>
      <div><div class="v">${summary.reduce((s,d)=>s+d.count,0)}</div><div class="l">Total Treatments</div></div>
    </div>
    <table>
      <thead><tr><th>Doctor</th><th>Treatments</th><th>Revenue</th><th>Commission</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>TOTAL</td><td>${summary.reduce((s,d)=>s+d.count,0)}</td><td>${fmt(totalRevenue)}</td><td>${fmt(totalCommission)}</td></tr></tfoot>
    </table>
    <script>window.onload=()=>window.print()</script>
    </body></html>`);
    win.document.close();
  },

  exportExcel() {
    if (!this._data) return;
    UI.exportExcel(this._data.rows, 'commissions');
  }
};
