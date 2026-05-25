/* ═══════════════════════════════════════════════════════
   DentCare Pro — Discount Codes Page
   Admin only. Full CRUD + export/import JSON & Excel.
   ═══════════════════════════════════════════════════════ */

const DiscountCodesPage = {

  async render() {
    const rows = await DB.tables.discount_codes.all().catch(() => []);
    this.renderTable(rows);
  },

  renderTable(rows) {
    const body = $('discountBody');
    if (!body) return;

    if (!rows || rows.length === 0) {
      body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div>🏷</div><p>No discount codes yet. Add one to get started.</p></div></td></tr>`;
      return;
    }

    body.innerHTML = rows.map(dc => `
      <tr>
        <td><code style="font-size:1rem;font-weight:700;letter-spacing:1px;color:var(--accent)">${dc.code}</code></td>
        <td><span class="badge ${dc.discount_type === 'percent' ? 'badge-info' : 'badge-normal'}">${dc.discount_type === 'percent' ? '%' : 'E£'} ${dc.discount_type}</span></td>
        <td style="font-weight:600;color:var(--green)">${dc.discount_type === 'percent' ? dc.value + '%' : 'E£' + Number(dc.value).toLocaleString()}</td>
        <td style="color:var(--text2)">${dc.description || '—'}</td>
        <td><span class="badge ${dc.is_active ? 'badge-confirmed' : 'badge-cancelled'}">${dc.is_active ? 'Active' : 'Inactive'}</span></td>
        <td>
          <div class="actions">
            <button class="action-btn" onclick="Modals.viewDiscountCode(${dc.id})">View</button>
            <button class="action-btn" onclick="Modals.editDiscountCode(${dc.id})">Edit</button>
            <button class="action-btn danger" onclick="Actions.deleteDiscountCode(${dc.id})">Del</button>
          </div>
        </td>
      </tr>
    `).join('');
  },

  exportExcel() {
    DB.tables.discount_codes.all().then(rows => UI.exportExcel(rows, 'discount_codes'));
  },

  exportJson() {
    DB.tables.discount_codes.all().then(rows => UI.exportJson(rows, 'discount_codes'));
  },

  importFile() {
    UI.importFile(async rows => {
      let inserted = 0;
      for (const row of rows) {
        try {
          if (!row.code || row.value === undefined) continue;
          await DB.tables.discount_codes.insert({
            code:          String(row.code).toUpperCase(),
            discount_type: row.discount_type || 'percent',
            value:         parseFloat(row.value) || 0,
            description:   row.description || '',
            is_active:     row.is_active !== undefined ? row.is_active : 1
          });
          inserted++;
        } catch(e) { /* skip duplicates */ }
      }
      toast(`Imported ${inserted} discount codes`, 'success');
      this.render();
    });
  }
};
