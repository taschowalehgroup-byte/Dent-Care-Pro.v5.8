/* ═══════════════════════════════════════════════════════
   DentCare Pro — Patients Page
   ═══════════════════════════════════════════════════════ */

const PatientsPage = {
  _filter: '',
  _queueSet: new Set(), // cache of patient_ids currently in waiting room

  async render() {
    // Load waiting room state alongside patients so we can show badge per row
    const [pts, queue] = await Promise.all([
      DB.tables.patients.all(),
      DB.waiting.all().catch(() => [])
    ]);
    this._queueSet = new Set(queue.map(q => String(q.patient_id)));
    this.renderTable(pts);

    /* Mount 3D jaw chart */
    if (typeof JawChart3D !== 'undefined') {
      requestAnimationFrame(() => {
        JawChart3D.mount('jaw3dMount', {
          onToothClick(idx) {
            const info = document.getElementById('jaw3dInfo');
            if (!info) return;
            const arch   = idx < 16 ? 'Upper' : 'Lower';
            const pos    = idx < 16 ? idx + 1 : idx - 15;
            const names  = ['Central Incisor','Lateral Incisor','Canine','1st Premolar','2nd Premolar',
                             '1st Molar','2nd Molar','3rd Molar (Wisdom)'];
            const nameIdx = Math.min(Math.floor(Math.abs(pos - 8.5)), 7);
            info.textContent = `Selected: ${arch} #${pos} — ${names[nameIdx]}  ·  Click "View" on a patient below to add treatment`;
          }
        });
      });
    }
  },

  async search(q) {
    this._filter = q;
    const pts = await DB.tables.patients.all();
    const filtered = pts.filter(p =>
      p.full_name.toLowerCase().includes(q.toLowerCase()) ||
      (p.phone && p.phone.includes(q)) ||
      (p.patient_no && p.patient_no.toLowerCase().includes(q.toLowerCase()))
    );
    this.renderTable(filtered);
  },

  renderTable(rows) {
    $('patientBody').innerHTML = rows.length === 0
      ? `<tr><td colspan="9"><div class="empty-state"><div>👤</div><p>No patients found</p></div></td></tr>`
      : rows.map(p => {
          const waiting = this._queueSet.has(String(p.id));
          return `
            <tr>
              <td><code style="color:var(--accent);font-size:.8rem">${p.patient_no || '-'}</code></td>
              <td><strong>${p.full_name}</strong>${p.no_show_count > 0 ? ` <span title="${p.no_show_count} no-show(s) — rebooking flagged" style="background:rgba(245,158,11,.15);color:#f59e0b;border:1px solid rgba(245,158,11,.3);border-radius:20px;font-size:.65rem;padding:.1rem .4rem;font-weight:700;cursor:default">⚠️ ${p.no_show_count} no-show${p.no_show_count > 1 ? 's' : ''}</span>` : ''}</td>
              <td>${p.phone}</td>
              <td>${p.age || '—'}</td>
              <td>${p.gender || '—'}</td>
              <td>${p.insurance || '<span style="color:var(--text3)">None</span>'}</td>
              <td style="color:var(--text2)">${p.created_at?.split('T')[0] || today()}</td>
              <td>
                ${waiting
                  ? `<span class="badge badge-urgent" style="cursor:pointer" title="Click to remove from waiting room"
                       onclick="WaitingPage.removeByPatient(${p.id}).then(()=>PatientsPage.render())">⏳ Waiting</span>`
                  : `<button class="action-btn" style="font-size:.75rem"
                       onclick="WaitingPage.addToQueue(${p.id},'${p.full_name.replace(/'/g,"\\'").replace(/"/g,'&quot;')}').then(()=>PatientsPage.render())">+ Queue</button>`
                }
              </td>
              <td><div class="actions">
                <button class="action-btn" onclick="Modals.viewPatient(${p.id})">View</button>
                <button class="action-btn" onclick="Modals.editPatient(${p.id})">Edit</button>
                <button class="action-btn danger" onclick="Actions.deletePatient(${p.id})">Del</button>
              </div></td>
            </tr>
          `;
        }).join('');
  },

  exportExcel() {
    DB.tables.patients.all().then(rows => UI.exportExcel(rows, 'patients'));
  },
  exportJson() {
    DB.tables.patients.all().then(rows => UI.exportJson(rows, 'patients'));
  },
  importFile() {
    UI.importFile(async rows => {
      let inserted = 0;
      for (const row of rows) {
        try {
          if (!row.full_name && !row['Full Name']) continue;
          const norm = {
            full_name:          row.full_name          || row['Full Name'],
            phone:              row.phone               || row['Phone']               || '',
            date_of_birth:      row.date_of_birth       || row['Date of Birth']       || null,
            gender:             row.gender              || row['Gender']              || null,
            email:              row.email               || row['Email']               || null,
            insurance:          row.insurance           || row['Insurance']           || null,
            medical_conditions: row.medical_conditions  || row['Medical Conditions']  || null,
            allergies:          row.allergies           || row['Allergies']           || null,
            dental_concerns:    row.dental_concerns     || row['Dental Concerns']     || null,
            address:            row.address             || row['Address']             || null,
            blood_type:         row.blood_type          || row['Blood Type']          || null,
            payment_method:     row.payment_method      || row['Payment Method']      || 'cash'
          };
          norm.patient_no = await DB.helpers.nextPatientNo().catch(() => null);
          await DB.tables.patients.insert(norm);
          inserted++;
        } catch(e) { /* skip bad rows */ }
      }
      toast(`Imported ${inserted} patients`, 'success');
      this.render();
      UI.updateBadges();
    });
  }
};
