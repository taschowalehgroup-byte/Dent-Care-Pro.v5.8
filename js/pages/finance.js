/* ═══════════════════════════════════════════════════════
   DentCare Pro — Finance Page
   ─────────────────────────────────────────────────────
   CRUD (add/edit/delete transactions) → Node.js / SQLite
   Calculations & Analytics              → Node.js engine
   ═══════════════════════════════════════════════════════ */

const FinancePage = {
  _filter: 'all',

  async render() { await this.renderAll(); },

  async filter(f, btn) {
    this._filter = f;
    document.querySelectorAll('#finFilters .ftab').forEach(b => b.classList.remove('active'));
    btn?.classList.add('active');
    await this.renderAll();
  },

  async renderAll() {
    await Promise.all([
      this._renderTransactions(),
      this._renderSummary()
    ]);

    /* 3D coin stacks — build monthly revenue array */
    if (typeof CoinStack3D !== 'undefined') {
      try {
        const tx = await DB.tables.transactions.all();
        const revByMonth = Array(12).fill(0);
        tx.filter(t => t.type === 'income').forEach(t => {
          const m = new Date(t.date || t.created_at || 0).getMonth();
          if (m >= 0 && m <= 11) revByMonth[m] += t.amount;
        });
        requestAnimationFrame(() => CoinStack3D.mount('coin3dMount', revByMonth));
      } catch(e) {
        requestAnimationFrame(() => CoinStack3D.mount('coin3dMount', null));
      }
    }

  },

  /* ── Transactions table ─────────────────────────────────────── */
  async _renderTransactions() {
    const tx = await DB.tables.transactions.all();
    let rows = tx;
    if (this._filter !== 'all') rows = tx.filter(t => t.type === this._filter);
    rows.sort((a, b) => a.date > b.date ? -1 : 1);

    $('financeBody').innerHTML = rows.length === 0
      ? `<tr><td colspan="6"><div class="empty-state"><div>💰</div><p>No transactions</p></div></td></tr>`
      : rows.map(t => `
        <tr>
          <td>${t.date}</td>
          <td><strong>${t.description}</strong></td>
          <td style="color:var(--text2)">${t.category || '—'}</td>
          <td>${UI.statusBadge(t.type === 'income' ? 'confirmed' : 'cancelled')}</td>
          <td style="font-weight:600;color:${t.type === 'income' ? 'var(--green)' : 'var(--red)'}">
            ${t.type === 'expense' ? '-' : '+'} ${fmt(t.amount)}
          </td>
          <td><div class="actions">
            <button class="action-btn" onclick="Modals.viewTransaction(${t.id})">View</button>
            <button class="action-btn" onclick="Modals.editTransaction(${t.id})">Edit</button>
            <button class="action-btn danger" onclick="Actions.deleteTransaction(${t.id})">Del</button>
          </div></td>
        </tr>
      `).join('');
  },

  /* ── Summary cards ──────────────────────────────────────────── */
  async _renderSummary() {
    const summaryEl = $('financeSummary');
    if (!summaryEl) return;

    try {
      const data = await this._apiFetch('/summary');
      summaryEl.innerHTML = `
        <div class="fin-card">
          <div class="fin-label">Total Income</div>
          <div class="fin-value income">${fmt(data.income)}</div>
          <div style="font-size:.75rem;color:var(--text2);margin-top:.25rem">${data.count_income} tx · avg ${fmt(data.avg_income)}</div>
        </div>
        <div class="fin-card">
          <div class="fin-label">Total Expense</div>
          <div class="fin-value expense">${fmt(data.expense)}</div>
          <div style="font-size:.75rem;color:var(--text2);margin-top:.25rem">${data.count_expense} tx · avg ${fmt(data.avg_expense)}</div>
        </div>
        <div class="fin-card">
          <div class="fin-label">Net Profit</div>
          <div class="fin-value net" style="color:${data.net >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(data.net)}</div>
          <div style="font-size:.75rem;color:var(--text2);margin-top:.25rem">Margin: ${data.profit_margin}%</div>
        </div>
        <div class="fin-card" style="cursor:pointer;border:1px solid var(--accent)" onclick="FinancePage.showAnalytics()">
          <div class="fin-label">📊 Analytics</div>
          <div class="fin-value" style="font-size:1rem;color:var(--accent)">View Full Report →</div>
          <div style="font-size:.75rem;color:var(--text2);margin-top:.25rem">Monthly · Categories · Forecast · Tax</div>
        </div>
      `;
    } catch(e) {
      const tx      = await DB.tables.transactions.all();
      const income  = tx.filter(t => t.type === 'income' ).reduce((s, t) => s + t.amount, 0);
      const expense = tx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      summaryEl.innerHTML = `
        <div class="fin-card"><div class="fin-label">Total Income</div><div class="fin-value income">${fmt(income)}</div></div>
        <div class="fin-card"><div class="fin-label">Total Expense</div><div class="fin-value expense">${fmt(expense)}</div></div>
        <div class="fin-card"><div class="fin-label">Net Profit</div><div class="fin-value net">${fmt(income - expense)}</div></div>
        <div class="fin-card" style="cursor:pointer;border:1px solid var(--accent)" onclick="FinancePage.showAnalytics()">
          <div class="fin-label">📊 Analytics</div>
          <div class="fin-value" style="font-size:1rem;color:var(--accent)">View Full Report →</div>
        </div>
      `;
    }
  },

  /* ── Full Analytics Modal ───────────────────────────────────── */
  async showAnalytics() {
    const existing = $('finAnalyticsModal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', `
      <div id="finAnalyticsModal" class="modal-overlay open" onclick="if(event.target===this)this.remove()" style="z-index:9999">
        <div class="modal" style="max-width:840px;max-height:90vh;overflow-y:auto">
          <div class="modal-head">
            <h3>📊 Finance Analytics</h3>
            <button class="close-btn" onclick="document.getElementById('finAnalyticsModal').remove()">×</button>
          </div>
          <div class="modal-body" id="analyticsBody">
            <div style="text-align:center;padding:2rem;color:var(--text2)">⏳ Loading analytics…</div>
          </div>
        </div>
      </div>
    `);

    try {
      const currentYear = new Date().getFullYear();
      const [summary, monthly, cats, topPat, topDoc, tax, forecast] = await Promise.all([
        this._apiFetch('/summary'),
        this._apiFetch(`/monthly?year=${currentYear}`),
        this._apiFetch('/categories'),
        this._apiFetch('/top-patients?limit=5'),
        this._apiFetch('/top-doctors?limit=5'),
        this._apiFetch(`/tax-estimate?year=${currentYear}`),
        this._apiFetch('/forecast?months=3').catch(() => null)
      ]);

      const yearOpts = [...Array(5)].map((_, i) => {
        const y = currentYear - i;
        return `<option value="${y}" ${i === 0 ? 'selected' : ''}>${y}</option>`;
      }).join('');

      $('analyticsBody').innerHTML = `
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;flex-wrap:wrap">
          <label style="color:var(--text2);font-size:.9rem">Year:</label>
          <select id="analyticsYear" onchange="FinancePage._reloadMonthly()" style="background:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.3rem .75rem">${yearOpts}</select>
          <button class="btn-icon" onclick="FinancePage._reloadAll()">↺ Refresh</button>
        </div>

        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1.5rem">
          <div class="fin-card"><div class="fin-label">Income</div><div class="fin-value income">${fmt(summary.income)}</div><div style="font-size:.75rem;color:var(--text2)">${summary.count_income} transactions</div></div>
          <div class="fin-card"><div class="fin-label">Expense</div><div class="fin-value expense">${fmt(summary.expense)}</div><div style="font-size:.75rem;color:var(--text2)">${summary.count_expense} transactions</div></div>
          <div class="fin-card"><div class="fin-label">Net · ${summary.profit_margin}% margin</div><div class="fin-value net" style="color:${summary.net >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(summary.net)}</div></div>
        </div>

        <h4 style="color:var(--text);margin-bottom:.75rem">📅 Monthly Breakdown <span id="monthlyYearLabel">(${monthly.year})</span></h4>
        <div id="monthlyTableWrap">${this._buildMonthlyTable(monthly.months)}</div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin:1.5rem 0">
          <div>
            <h4 style="color:var(--green);margin-bottom:.5rem">Income by Category</h4>
            ${this._buildCatTable(cats.income, 'income')}
          </div>
          <div>
            <h4 style="color:var(--red);margin-bottom:.5rem">Expense by Category</h4>
            ${this._buildCatTable(cats.expense, 'expense')}
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-bottom:1.5rem">
          <div>
            <h4 style="margin-bottom:.5rem">👤 Top Patients by Spend</h4>
            <table class="data-table"><thead><tr><th>Patient</th><th>Visits</th><th>Total</th></tr></thead><tbody>
              ${topPat.patients.length ? topPat.patients.map(p => `<tr><td><strong>${p.full_name || '—'}</strong></td><td>${p.visits}</td><td style="color:var(--green)">${fmt(p.total_spent)}</td></tr>`).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text2)">No data</td></tr>'}
            </tbody></table>
          </div>
          <div>
            <h4 style="margin-bottom:.5rem">👨‍⚕️ Top Doctors by Revenue</h4>
            <table class="data-table"><thead><tr><th>Doctor</th><th>Tx</th><th>Revenue</th></tr></thead><tbody>
              ${topDoc.doctors.length ? topDoc.doctors.map(d => `<tr><td><strong>${d.full_name || '—'}</strong></td><td>${d.treatments}</td><td style="color:var(--green)">${fmt(d.revenue)}</td></tr>`).join('') : '<tr><td colspan="3" style="text-align:center;color:var(--text2)">No data</td></tr>'}
            </tbody></table>
          </div>
        </div>

        <h4 style="margin-bottom:.75rem">🧾 Tax Estimate (${tax.year})</h4>
        <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:1rem;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.75rem;margin-bottom:1.5rem">
          <div><div style="color:var(--text2);font-size:.8rem">Gross Income</div><strong>${fmt(tax.gross_income)}</strong></div>
          <div><div style="color:var(--text2);font-size:.8rem">Net Taxable</div><strong>${fmt(tax.net_taxable)}</strong></div>
          <div><div style="color:var(--text2);font-size:.8rem">VAT (14%)</div><strong style="color:var(--orange)">${fmt(tax.vat_14pct)}</strong></div>
          <div><div style="color:var(--text2);font-size:.8rem">Income Tax Est.</div><strong style="color:var(--red)">${fmt(tax.income_tax)}</strong></div>
          <div><div style="color:var(--text2);font-size:.8rem">Total Tax Est.</div><strong style="color:var(--red);font-size:1.1rem">${fmt(tax.total_tax_est)}</strong></div>
          <div><div style="color:var(--text2);font-size:.8rem">Effective Rate</div><strong>${tax.effective_rate}%</strong></div>
          <div style="grid-column:1/-1"><div style="color:var(--text3);font-size:.72rem">${tax.note}</div></div>
        </div>

        ${forecast ? `
        <h4 style="margin-bottom:.75rem">🔮 Revenue Forecast</h4>
        <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:1rem;margin-bottom:1rem">
          <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem">
            <span class="badge ${forecast.trend === 'up' ? 'badge-confirmed' : forecast.trend === 'down' ? 'badge-cancelled' : 'badge-normal'}">
              ${forecast.trend === 'up' ? '📈 Upward' : forecast.trend === 'down' ? '📉 Downward' : '➡ Flat'} trend
            </span>
            <span style="font-size:.8rem;color:var(--text2)">slope: ${forecast.slope > 0 ? '+' : ''}${fmt(forecast.slope)}/month</span>
          </div>
          <div style="display:flex;gap:1rem;flex-wrap:wrap">
            ${forecast.forecast.map(f => `
              <div class="fin-card" style="min-width:130px;flex:1">
                <div class="fin-label">${f.month}</div>
                <div class="fin-value income" style="font-size:1.05rem">${fmt(f.predicted)}</div>
                <div style="font-size:.7rem;color:var(--text3)">Predicted</div>
              </div>`).join('')}
          </div>
        </div>` : ''}
      `;
    } catch(e) {
      $('analyticsBody').innerHTML = `
        <div class="empty-state">
          <div style="font-size:3rem">📊</div>
          <p>Could not load analytics.</p>
          <p style="font-size:.85rem;color:var(--text2)">${e.message}</p>
        </div>
      `;
    }
  },

  async _reloadMonthly() {
    const year = $('analyticsYear')?.value || new Date().getFullYear();
    try {
      const monthly = await this._apiFetch(`/monthly?year=${year}`);
      const wrap = $('monthlyTableWrap');
      if (wrap) wrap.innerHTML = this._buildMonthlyTable(monthly.months);
      const lbl = $('monthlyYearLabel');
      if (lbl) lbl.textContent = `(${year})`;
    } catch(e) {}
  },

  async _reloadAll() {
    const modal = $('finAnalyticsModal');
    if (modal) modal.remove();
    await this.showAnalytics();
  },

  _buildMonthlyTable(months) {
    const hasData = months.some(m => m.income > 0 || m.expense > 0);
    if (!hasData) return `<div class="empty-state"><div>📅</div><p>No transactions for this year</p></div>`;
    return `<div style="overflow-x:auto"><table class="data-table">
      <thead><tr><th>Month</th><th style="color:var(--green)">Income</th><th style="color:var(--red)">Expense</th><th>Net</th></tr></thead>
      <tbody>${months.map(m => `
        <tr style="${m.income === 0 && m.expense === 0 ? 'opacity:.35' : ''}">
          <td><strong>${m.month}</strong></td>
          <td style="color:var(--green)">${m.income > 0 ? fmt(m.income) : '—'}</td>
          <td style="color:var(--red)">${m.expense > 0 ? fmt(m.expense) : '—'}</td>
          <td style="font-weight:600;color:${m.net >= 0 ? 'var(--green)' : 'var(--red)'}">${m.income > 0 || m.expense > 0 ? fmt(m.net) : '—'}</td>
        </tr>`).join('')}
      </tbody></table></div>`;
  },

  _buildCatTable(items, type) {
    if (!items || items.length === 0) return `<div style="color:var(--text2);font-size:.85rem;padding:.5rem">No data</div>`;
    const color = type === 'income' ? 'var(--green)' : 'var(--red)';
    return `<table class="data-table" style="font-size:.85rem"><tbody>
      ${items.map(c => `<tr>
        <td>${c.category || 'Uncategorized'}</td>
        <td style="color:${color};font-weight:600">${fmt(c.total)}</td>
        <td style="color:var(--text2)">${c.percent}%</td>
      </tr>`).join('')}
    </tbody></table>`;
  },

  async _apiFetch(path) {
    const res  = await fetch(`/api/finance-analytics${path}`);
    if (!res.ok) throw new Error(`Analytics error: ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  },

  exportExcel() { DB.tables.transactions.all().then(rows => UI.exportExcel(rows, 'finance')); },
  exportJson()  { DB.tables.transactions.all().then(rows => UI.exportJson(rows,  'finance')); },
  importFile() {
    UI.importFile(async rows => {
      const res = await DB.tables.transactions.bulk(rows);
      toast(`Imported ${res.inserted} transactions`, 'success');
      this.renderAll();
    });
  }
};
