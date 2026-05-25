/* ═══════════════════════════════════════════════════════
   DentCare Pro — UI Helpers & Utilities
   ═══════════════════════════════════════════════════════ */

const $ = id => document.getElementById(id);
const fmt = n => 'E£ ' + Number(n).toLocaleString('en-EG', {minimumFractionDigits:0,maximumFractionDigits:0});
const today = () => new Date().toISOString().split('T')[0];

function toast(msg, type='info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = {success:'✓', error:'✗', info:'ℹ'};
  el.innerHTML = `<span>${icons[type]||'•'}</span><span>${msg}</span>`;
  $('toastContainer').appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toastOut .3s ease forwards';
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

function animateCount(el, target, duration=800) {
  const start = 0, startTime = performance.now();
  const isFloat = String(target).includes('.');
  function step(now) {
    const prog = Math.min((now-startTime)/duration, 1);
    const ease = 1 - Math.pow(1-prog, 3);
    const val = start + (target-start)*ease;
    el.textContent = isFloat ? fmt(val) : Math.round(val).toLocaleString();
    if (prog < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function startClock() {
  const el = $('liveTime');
  function tick() {
    const d = new Date();
    el.textContent = d.toLocaleString('en-EG', {weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  tick(); setInterval(tick, 60000);
}

/* ── UI namespace ──────────────────────────────────── */
const UI = {
  async updateBadges() {
    try {
      const patients = await DB.tables.patients.all();
      const todayAppts = await DB.helpers.todayAppts();
      const inventory = await DB.tables.inventory.all();
      
      $('badgePatients').textContent = patients.length;
      $('badgeAppts').textContent = todayAppts.length;

      // Waiting room badge — from real DB
      try {
        const queue = await DB.waiting.all();
        const wBadge = $('badgeWaiting');
        if (wBadge) {
          wBadge.textContent = queue.length;
          wBadge.style.display = queue.length > 0 ? '' : 'none';
        }
      } catch(e) { /* badge stays hidden */ }
      
      const lowStock = inventory.filter(i => i.quantity <= i.min_stock).length;
      $('badgeInventory').textContent = lowStock;
      $('badgeInventory').style.display = lowStock > 0 ? '' : 'none';

      // Messages badge (pending forgot-password requests)
      if (typeof MessagesPage !== 'undefined') MessagesPage.updateBadge();
    } catch (e) {
      console.error('Failed to update badges', e);
    }
  },

  priorityBadge: p => `<span class="badge badge-${p}">${p}</span>`,
  statusBadge:   s => `<span class="badge badge-${s}">${s}</span>`,

  detailTab(name, btn) {
    document.querySelectorAll('.detail-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.dtab').forEach(b => b.classList.remove('active'));
    $(`detail${name.charAt(0).toUpperCase()+name.slice(1)}`).classList.add('active');
    btn.classList.add('active');
  },

  // ── Global Export/Import ──────────────────────────
  exportExcel(data, filename) {
    if (typeof XLSX === 'undefined') { toast('SheetJS not loaded','error'); return; }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${filename}_${today()}.xlsx`);
    toast('Excel exported ✓', 'success');
  },

  exportJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}_${today()}.json`;
    a.click();
    toast('JSON exported ✓', 'success');
  },

  importFile(processor) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.xlsx,.xls,.json';
    inp.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const ext = file.name.split('.').pop().toLowerCase();
      
      if (ext === 'json') {
        const text = await file.text();
        try {
          const parsed = JSON.parse(text);
          await processor(Array.isArray(parsed) ? parsed : (parsed.data||[]));
        } catch(e) { toast('Invalid JSON','error'); }
      } else {
        if (typeof XLSX === 'undefined') { toast('SheetJS not loaded','error'); return; }
        const buf = await file.arrayBuffer();
        const wb  = XLSX.read(buf, {type:'array'});
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws);
        await processor(raw);
      }
    };
    inp.click();
  }
};
