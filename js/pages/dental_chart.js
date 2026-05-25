/* ═══════════════════════════════════════════════════════
   DentCare Pro — Interactive Dental Chart (Tooth Map)
   Standard adult dentition: upper 1-16, lower 17-32 (Universal)
   ═══════════════════════════════════════════════════════ */

const DentalChart = {
  // Map of tooth number → {name, type}
  _teeth: {
    1:'UR3rd Molar',2:'UR2nd Molar',3:'UR1st Molar',4:'UR2nd Premolar',
    5:'UR1st Premolar',6:'UR Canine',7:'UR Lateral Incisor',8:'UR Central Incisor',
    9:'UL Central Incisor',10:'UL Lateral Incisor',11:'UL Canine',12:'UL1st Premolar',
    13:'UL2nd Premolar',14:'UL1st Molar',15:'UL2nd Molar',16:'UL3rd Molar',
    17:'LL3rd Molar',18:'LL2nd Molar',19:'LL1st Molar',20:'LL2nd Premolar',
    21:'LL1st Premolar',22:'LL Canine',23:'LL Lateral Incisor',24:'LL Central Incisor',
    25:'LR Central Incisor',26:'LR Lateral Incisor',27:'LR Canine',28:'LR1st Premolar',
    29:'LR2nd Premolar',30:'LR1st Molar',31:'LR2nd Molar',32:'LR3rd Molar'
  },

  _selectedTeeth:   new Set(),
  _toothConditions: {},  // { toothNo: condition }
  _patientId:       null,
  _callback:        null,

  CONDITIONS: [
    { key: 'healthy',     label: 'Healthy',         color: '#22c55e' },
    { key: 'caries',      label: 'Caries/Decay',    color: '#ef4444' },
    { key: 'filled',      label: 'Filled',          color: '#3b82f6' },
    { key: 'crown',       label: 'Crown',           color: '#a855f7' },
    { key: 'missing',     label: 'Missing/Extracted',color: '#6b7280' },
    { key: 'implant',     label: 'Implant',         color: '#f59e0b' },
    { key: 'rct',         label: 'Root Canal',      color: '#ec4899' },
    { key: 'bridge',      label: 'Bridge',          color: '#06b6d4' },
    { key: 'sensitive',   label: 'Sensitive',       color: '#fb923c' },
  ],

  async open(patientId, callback) {
    this._patientId = patientId;
    this._callback  = callback || null;
    this._selectedTeeth.clear();

    // Load existing conditions from treatments
    this._toothConditions = {};
    try {
      const txs = await DB.fetch(`/treatments?patient_id=${patientId}`);
      txs.forEach(t => {
        if (t.tooth_number) {
          t.tooth_number.split(',').forEach(tn => {
            const n = parseInt(tn.trim());
            if (n && !this._toothConditions[n]) {
              this._toothConditions[n] = { condition: 'treated', treatment: t.treatment_type, date: t.date };
            }
          });
        }
      });
    } catch(e) { /* skip */ }

    this._render();
  },

  _render() {
    const existing = $('dentalChartModal');
    if (existing) existing.remove();

    const condLegend = this.CONDITIONS.map(c =>
      `<div style="display:flex;align-items:center;gap:.35rem;cursor:pointer" onclick="DentalChart._setActiveCondition('${c.key}')">
        <div id="condBtn_${c.key}" style="width:14px;height:14px;border-radius:3px;background:${c.color};border:2px solid transparent"></div>
        <span style="font-size:.75rem">${c.label}</span>
      </div>`
    ).join('');

    const html = `
    <div id="dentalChartModal" class="modal-overlay open" onclick="if(event.target===this)this.remove()">
      <div class="modal" style="max-width:820px;max-height:95vh;overflow-y:auto">
        <div class="modal-head">
          <h3>🦷 Dental Chart</h3>
          <button class="close-btn" onclick="$('dentalChartModal').remove()">✕</button>
        </div>
        <div class="modal-body" style="padding:1rem">

          <!-- Legend / Condition Picker -->
          <div style="background:var(--surface2);border-radius:var(--radius-sm);padding:.75rem;margin-bottom:1rem">
            <div style="font-size:.8rem;font-weight:600;color:var(--text2);margin-bottom:.5rem">Click condition, then click tooth(s):</div>
            <div style="display:flex;flex-wrap:wrap;gap:.75rem 1.25rem">${condLegend}</div>
          </div>
          <div id="activeCondLabel" style="font-size:.85rem;color:var(--accent);font-weight:600;margin-bottom:.75rem;min-height:1.2em"></div>

          <!-- Upper Jaw label -->
          <div style="text-align:center;font-size:.7rem;color:var(--text2);margin-bottom:.25rem">← Right &nbsp;&nbsp;&nbsp;&nbsp; UPPER JAW &nbsp;&nbsp;&nbsp;&nbsp; Left →</div>

          <!-- Upper teeth row (1-16) -->
          <div id="upperTeethRow" style="display:flex;justify-content:center;gap:3px;margin-bottom:.25rem"></div>
          <!-- Tooth numbers upper -->
          <div id="upperNumsRow"  style="display:flex;justify-content:center;gap:3px;margin-bottom:1.5rem"></div>

          <!-- Lower tooth numbers -->
          <div id="lowerNumsRow"  style="display:flex;justify-content:center;gap:3px;margin-top:1.5rem"></div>
          <!-- Lower teeth row (17-32) -->
          <div id="lowerTeethRow" style="display:flex;justify-content:center;gap:3px;margin-bottom:.25rem"></div>
          <!-- Lower Jaw label -->
          <div style="text-align:center;font-size:.7rem;color:var(--text2);margin-top:.25rem">← Right &nbsp;&nbsp;&nbsp;&nbsp; LOWER JAW &nbsp;&nbsp;&nbsp;&nbsp; Left →</div>

          <!-- Tooltip -->
          <div id="toothTooltip" style="display:none;position:fixed;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:.5rem .75rem;font-size:.8rem;z-index:9999;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,.3)"></div>

          <!-- 3D X-Ray Depth Viewer -->
          <div style="margin-top:1rem">
            <div style="font-size:.8rem;font-weight:600;color:var(--text2);margin-bottom:.4rem">🔬 X-Ray Depth Viewer</div>
            <div id="xrayViewerMount" style="width:100%"></div>
          </div>

          <!-- Selected teeth -->
          <div id="chartSelectedInfo" style="margin-top:1rem;padding:.75rem;background:var(--surface2);border-radius:var(--radius-sm);min-height:2rem;font-size:.85rem;color:var(--text2)">
            No teeth selected. Click teeth to select them for treatment recording.
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn-ghost" onclick="$('dentalChartModal').remove()">Close</button>
          <button class="btn-icon"  onclick="DentalChart._clearSelection()">Clear Selection</button>
          <button class="btn-primary" onclick="DentalChart._useSelection()">✓ Use Selected Teeth</button>
        </div>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    this._drawTeeth();
    this._activeCondition = null;
    /* ── 3D X-Ray Depth Viewer ── */
    if (typeof XRayViewer !== 'undefined') {
      requestAnimationFrame(() => XRayViewer.mount('xrayViewerMount'));
    }
  },

  _activeCondition: null,

  _setActiveCondition(key) {
    this._activeCondition = key;
    // Highlight active condition button
    this.CONDITIONS.forEach(c => {
      const btn = $(`condBtn_${c.key}`);
      if (btn) btn.style.border = c.key === key ? '2px solid var(--text)' : '2px solid transparent';
    });
    const cond = this.CONDITIONS.find(c => c.key === key);
    const label = $('activeCondLabel');
    if (label && cond) label.textContent = `Active: ${cond.label} — click teeth to mark`;
  },

  _getToothColor(num) {
    const cond = this._toothConditions[num];
    if (cond) {
      if (cond.condition === 'treated') return '#6366f1'; // purple for treated (from DB)
      const c = this.CONDITIONS.find(x => x.key === cond.condition);
      if (c) return c.color;
    }
    if (this._selectedTeeth.has(num)) return '#f59e0b';
    return 'var(--surface2)';
  },

  _drawTeeth() {
    const upper = Array.from({length:16}, (_,i) => i+1);
    const lower = Array.from({length:16}, (_,i) => i+17);

    const makeTooth = (num, isUpper) => {
      const size   = (num >= 6 && num <= 11) || (num >= 22 && num <= 27) ? 22 : num % 16 < 4 || num % 16 > 12 ? 26 : 28;
      const height = isUpper ? size + 4 : size + 4;
      const color  = this._getToothColor(num);
      const cond   = this._toothConditions[num];
      const hasInfo = !!cond;
      return `<div
        id="tooth_${num}"
        onclick="DentalChart._clickTooth(${num})"
        onmouseenter="DentalChart._showTip(${num}, event)"
        onmouseleave="DentalChart._hideTip()"
        style="
          width:${size}px;height:${height}px;
          background:${color};
          border-radius:${isUpper ? '50% 50% 30% 30%' : '30% 30% 50% 50%'};
          border:1px solid ${this._selectedTeeth.has(num) ? '#f59e0b' : hasInfo ? 'rgba(255,255,255,.3)' : 'var(--border)'};
          cursor:pointer;
          transition:transform .1s,filter .1s;
          position:relative;
          box-shadow:${hasInfo ? '0 0 0 2px rgba(255,255,255,.2)' : 'none'};
        "
        title="${num}: ${this._teeth[num]}"
      ></div>`;
    };

    const makeNum = (num) =>
      `<div style="width:${28}px;text-align:center;font-size:9px;color:var(--text2);line-height:1">${num}</div>`;

    $('upperTeethRow').innerHTML = upper.map(n => makeTooth(n, true)).join('');
    $('upperNumsRow').innerHTML  = upper.map(n => makeNum(n)).join('');
    $('lowerNumsRow').innerHTML  = lower.map(n => makeNum(n)).join('');
    $('lowerTeethRow').innerHTML = lower.map(n => makeTooth(n, false)).join('');
  },

  _clickTooth(num) {
    if (this._activeCondition) {
      // Set condition on tooth
      const cond = this.CONDITIONS.find(c => c.key === this._activeCondition);
      this._toothConditions[num] = { condition: this._activeCondition, label: cond?.label || '' };
      // Also add to selected
      this._selectedTeeth.add(num);
    } else {
      // Toggle selection
      if (this._selectedTeeth.has(num)) {
        this._selectedTeeth.delete(num);
      } else {
        this._selectedTeeth.add(num);
      }
    }
    this._redrawTooth(num);
    this._updateSelectedInfo();
  },

  _redrawTooth(num) {
    const el     = $(`tooth_${num}`);
    if (!el) return;
    const isUpper = num <= 16;
    const size   = (num >= 6 && num <= 11) || (num >= 22 && num <= 27) ? 22 : num % 16 < 4 || num % 16 > 12 ? 26 : 28;
    const color  = this._getToothColor(num);
    const hasInfo = !!this._toothConditions[num];
    el.style.background  = color;
    el.style.border      = `1px solid ${this._selectedTeeth.has(num) ? '#f59e0b' : hasInfo ? 'rgba(255,255,255,.3)' : 'var(--border)'}`;
    el.style.boxShadow   = hasInfo ? '0 0 0 2px rgba(255,255,255,.2)' : 'none';
  },

  _updateSelectedInfo() {
    const info = $('chartSelectedInfo');
    if (!info) return;
    if (!this._selectedTeeth.size) {
      info.textContent = 'No teeth selected.';
      return;
    }
    const nums    = [...this._selectedTeeth].sort((a,b) => a-b);
    const details = nums.map(n => {
      const cond = this._toothConditions[n];
      const condLabel = cond ? ` [${cond.label || cond.condition}]` : '';
      return `<strong>#${n}</strong> ${this._teeth[n]}${condLabel}`;
    }).join(', ');
    info.innerHTML = `Selected (${nums.length}): ${details}`;
  },

  _showTip(num, event) {
    const tip  = $('toothTooltip');
    if (!tip) return;
    const cond = this._toothConditions[num];
    const condText = cond ? `<br>Condition: <strong style="color:${this.CONDITIONS.find(c=>c.key===cond.condition)?.color||'#fff'}">${cond.label||cond.treatment||cond.condition}</strong>${cond.date?' ('+cond.date+')':''}` : '';
    tip.innerHTML  = `#${num} — ${this._teeth[num]}${condText}`;
    tip.style.display = 'block';
    tip.style.left  = (event.clientX + 12) + 'px';
    tip.style.top   = (event.clientY - 10) + 'px';
  },

  _hideTip() {
    const tip = $('toothTooltip');
    if (tip) tip.style.display = 'none';
  },

  _clearSelection() {
    this._selectedTeeth.clear();
    this._activeCondition = null;
    this._drawTeeth();
    this._updateSelectedInfo();
    const label = $('activeCondLabel');
    if (label) label.textContent = '';
  },

  _useSelection() {
    if (!this._selectedTeeth.size) { toast('No teeth selected', 'warning'); return; }
    const nums = [...this._selectedTeeth].sort((a,b) => a-b).join(', ');
    if (this._callback) {
      this._callback(nums);
      $('dentalChartModal').remove();
      return;
    }
    // Default: fill any visible tooth_number input
    const inputs = document.querySelectorAll('#tooth_number, #editTooth, input[name="tooth_number"]');
    inputs.forEach(inp => { inp.value = nums; });
    // Also fill modal confirm treatment tooth field if open
    const confTooth = $('confToothNumber');
    if (confTooth) confTooth.value = nums;
    $('dentalChartModal').remove();
    toast(`Teeth selected: ${nums}`, 'success');
  }
};
