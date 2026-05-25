/* ═══════════════════════════════════════════════════════
   DentCare Pro — Inventory Page
   ═══════════════════════════════════════════════════════ */

const InventoryPage = {
  async render() { 
    const inv = await DB.tables.inventory.all();
    this.renderTable(inv);

    /* 3D molecule — build per-category data */
    if (typeof Molecule3D !== 'undefined') {
      const CAT_COLORS = {
        tools:       '#06d6a0',
        medication:  '#00d4ff',
        consumable:  '#ff8c42',
        implants:    '#b388ff',
        hygiene:     '#ffd166',
        xray:        '#ff4466',
        other:       '#7b84a3'
      };
      const counts = {};
      inv.forEach(i => {
        const key = (i.category || 'other').toLowerCase().replace(/[^a-z]/g, '');
        counts[key] = (counts[key] || 0) + 1;
      });
      const cats = Object.entries(counts).map(([name, count]) => ({
        name,
        count,
        color: parseInt((CAT_COLORS[name] || CAT_COLORS.other).replace('#',''), 16),
        r: 0.22 + Math.min(count / 20, 1) * 0.25
      }));
      if (!cats.length) cats.push(
        { name:'Tools',  color: 0x06d6a0, r: 0.42 },
        { name:'Meds',   color: 0x00d4ff, r: 0.30 },
        { name:'Supplies', color: 0xff8c42, r: 0.28 }
      );

      /* render legend */
      const legend = document.getElementById('mol3dLegend');
      if (legend) {
        legend.innerHTML = cats.slice(0, 6).map(c => {
          const hex = '#' + c.color.toString(16).padStart(6,'0');
          return `<div class="mol3d-dot">
            <div class="mol3d-dot-circle" style="background:${hex}"></div>
            ${c.name} (${c.count})
          </div>`;
        }).join('');
      }

      requestAnimationFrame(() => Molecule3D.mount('mol3dMount', cats));
    }
  },
  async search(q) { 
    const inv = await DB.tables.inventory.all();
    const filtered = inv.filter(i=>i.item_name.toLowerCase().includes(q.toLowerCase()));
    this.renderTable(filtered);
  },
  renderTable(rows) {
    $('invBody').innerHTML = rows.length === 0
      ? `<tr><td colspan="8"><div class="empty-state"><div>📦</div><p>No items found</p></div></td></tr>`
      : rows.map(i=>{
        const low = i.quantity <= i.min_stock;
        return `
          <tr>
            <td><strong>${i.item_name}</strong></td>
            <td><span class="badge badge-normal">${i.category}</span></td>
            <td style="color:${low?'var(--red)':'var(--text)'}"><strong>${i.quantity}</strong></td>
            <td style="color:var(--text2)">${i.min_stock}</td>
            <td>${fmt(i.unit_price)}</td>
            <td style="color:var(--text2)">${i.supplier||'—'}</td>
            <td>${low?'<span class="badge badge-emergency">Low Stock</span>':'<span class="badge badge-confirmed">OK</span>'}</td>
            <td><div class="actions">
              <button class="action-btn" onclick="Modals.viewInventory(${i.id})">View</button>
              <button class="action-btn" onclick="Modals.editInventory(${i.id})">Edit</button>
              <button class="action-btn danger" onclick="Actions.deleteInventory(${i.id})">Del</button>
            </div></td>
          </tr>
        `;
      }).join('');
  },
  exportExcel() {
    DB.tables.inventory.all().then(rows => UI.exportExcel(rows, 'inventory'));
  },
  exportJson() {
    DB.tables.inventory.all().then(rows => UI.exportJson(rows, 'inventory'));
  },
  importFile() {
    UI.importFile(async rows => {
      const res = await DB.tables.inventory.bulk(rows);
      toast(`Imported ${res.inserted} items`, 'success');
      this.render();
    });
  }
};
