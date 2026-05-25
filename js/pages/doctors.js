/* ═══════════════════════════════════════════════════════
   DentCare Pro — Doctors Page
   ═══════════════════════════════════════════════════════ */

const DoctorsPage = {
  async render() {
    const docs = await DB.tables.doctors.all();

    /* fetch ratings for all doctors in parallel */
    const ratingMap = {};
    if (typeof Ratings !== 'undefined') {
      await Promise.all(docs.map(async d => {
        ratingMap[d.id] = await Ratings.getDoctorRating(d.id);
      }));
    }

    /* ── Doctor Orrery ── */
    if (typeof DoctorOrrery !== 'undefined' && document.getElementById('orreryMount')) {
      const orreyDocs = docs.map(d => ({
        full_name:     d.full_name,
        specialty:     d.specialty,
        patient_count: d.patient_count || 5,
        status:        d.status
      }));
      requestAnimationFrame(() => DoctorOrrery.mount('orreryMount', orreyDocs));
    }

    $('doctorsGrid').innerHTML = docs.map((d,i)=>{
      const initials = d.full_name.split(' ').filter(w=>w.match(/^[A-Z]/)).map(w=>w[0]).join('').slice(0,2);
      const ratingHtml = typeof Ratings !== 'undefined'
        ? `<div class="dr-rating">${Ratings.starsHtml(ratingMap[d.id]?.avg)} ${ratingMap[d.id] ? `<span style="font-size:.72rem;color:var(--text3)">(${ratingMap[d.id].count})</span>` : ''}</div>`
        : '';
      return `
        <div class="doctor-card" style="--i:${i}">
          <div class="dr-avatar">${initials}</div>
          <div class="dr-name">${d.full_name}</div>
          <div class="dr-spec">${d.specialty}</div>
          ${ratingHtml}
          <div class="dr-info">
            <span>📞 ${d.phone||'—'}</span>
            <span>🚪 ${d.room||'—'}</span>
            <span>🕐 ${d.schedule||'—'}</span>
            <span>🪪 ${d.license_no||'—'}</span>
            ${d.national_id ? `<span>🆔 ${d.national_id}</span>` : ''}
            ${d.hire_date   ? `<span>📅 Hired: ${d.hire_date}</span>` : ''}
          </div>
          <div style="display:flex;gap:.3rem;flex-wrap:wrap;justify-content:center;margin:.35rem 0;font-size:.7rem">
            ${d.commission_filling!=null?`<span style="background:var(--surface2);padding:.1rem .4rem;border-radius:4px;color:var(--accent)">Fill ${d.commission_filling}%</span>`:''}
            ${d.commission_implant!=null?`<span style="background:var(--surface2);padding:.1rem .4rem;border-radius:4px;color:var(--accent)">Impl ${d.commission_implant}%</span>`:''}
          </div>
          <div class="dr-status">${UI.statusBadge(d.status==='present'?'confirmed':'cancelled')}</div>
          <div class="actions" style="margin-top:.75rem">
            <button class="action-btn" onclick="Modals.viewDoctor(${d.id})">👁 View</button>
            <button class="action-btn" onclick="Modals.editDoctor(${d.id})">✏️ Edit</button>
            <button class="action-btn" onclick="App.page('abilities')" title="Abilities">🎯</button>
            <button class="action-btn danger" onclick="Actions.deleteDoctor(${d.id})">🗑</button>
          </div>
        </div>
      `;
    }).join('');
  },
  exportExcel() {
    DB.tables.doctors.all().then(rows => UI.exportExcel(rows, 'doctors'));
  },
  exportJson() {
    DB.tables.doctors.all().then(rows => UI.exportJson(rows, 'doctors'));
  },
  importFile() {
    UI.importFile(async rows => {
      const res = await DB.tables.doctors.bulk(rows);
      toast(`Imported ${res.inserted} doctors`, 'success');
      this.render();
    });
  }
};
