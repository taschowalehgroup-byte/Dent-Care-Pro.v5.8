/* ═══════════════════════════════════════════════════════
   DentCare Pro — Calendar Page
   Full monthly calendar with appointments from the DB
   ═══════════════════════════════════════════════════════ */

const CalendarPage = {
  _year:  new Date().getFullYear(),
  _month: new Date().getMonth(), // 0-based
  _appointments: [],
  _patients: [],
  _doctors: [],

  async render() {
    await this._loadData();
    this._buildCalendar();
  },

  async _loadData() {
    try {
      const session = DB.auth.current();
      let apptPromise;
      if (session?.role === 'doctor' && session?.doctor_id) {
        apptPromise = DB.fetch(`/appointments?doctor_id=${session.doctor_id}`);
      } else {
        apptPromise = DB.tables.appointments.all();
      }
      [this._appointments, this._patients, this._doctors] = await Promise.all([
        apptPromise,
        DB.tables.patients.all(),
        DB.tables.doctors.all()
      ]);
    } catch(e) {
      this._appointments = [];
      this._patients     = [];
      this._doctors      = [];
    }
  },

  _buildCalendar() {
    const wrap = $('calendarWrap');
    if (!wrap) return;

    const year  = this._year;
    const month = this._month;
    const monthNames = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
    const dayNames   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    // Group appointments by date string
    const apptMap = {};
    this._appointments.forEach(a => {
      if (!apptMap[a.date]) apptMap[a.date] = [];
      apptMap[a.date].push(a);
    });

    const ptMap  = Object.fromEntries(this._patients.map(p => [p.id, p]));
    const dcMap  = Object.fromEntries(this._doctors.map(d => [d.id, d]));

    const firstDay  = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr    = new Date().toISOString().split('T')[0];

    // Status colour map
    const statusColor = {
      confirmed: 'var(--primary)',
      pending:   '#f59e0b',
      completed: '#22c55e',
      cancelled: 'var(--red)',
    };

    let grid = '';
    // Blank cells before 1st
    for (let i = 0; i < firstDay; i++) grid += `<div class="cal-cell cal-empty"></div>`;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dayAppts = apptMap[dateStr] || [];
      const isToday  = dateStr === todayStr;

      const apptHtml = dayAppts.slice(0, 3).map(a => {
        const pt   = ptMap[a.patient_id];
        const name = pt ? pt.full_name.split(' ')[0] : 'Patient';
        const col  = statusColor[a.status] || 'var(--accent)';
        return `<div class="cal-appt" style="background:${col}20;border-left:3px solid ${col};color:${col}"
                     title="${pt?.full_name||''} — ${a.treatment_type||''} @ ${a.time}"
                     onclick="CalendarPage._showDayDetail('${dateStr}')">
                  <span>${a.time}</span> ${name}
                </div>`;
      }).join('');

      const more = dayAppts.length > 3
        ? `<div class="cal-more" onclick="CalendarPage._showDayDetail('${dateStr}')">+${dayAppts.length-3} more</div>`
        : '';

      grid += `
        <div class="cal-cell ${isToday ? 'cal-today' : ''}" onclick="CalendarPage._showDayDetail('${dateStr}')">
          <div class="cal-day-num ${isToday ? 'today-num' : ''}">${d}</div>
          ${apptHtml}
          ${more}
        </div>`;
    }

    wrap.innerHTML = `
      <div class="cal-header">
        <button class="cal-nav" onclick="CalendarPage._prevMonth()">‹</button>
        <div>
          <h3 class="cal-title">${monthNames[month]} ${year}</h3>
          <p class="cal-sub">${this._appointments.filter(a=>a.date?.startsWith(year+'-'+String(month+1).padStart(2,'0'))).length} appointments this month</p>
        </div>
        <button class="cal-nav" onclick="CalendarPage._nextMonth()">›</button>
      </div>

      <div class="cal-legend">
        <span style="border-left:3px solid var(--primary);padding-left:6px">Confirmed</span>
        <span style="border-left:3px solid #f59e0b;padding-left:6px">Pending</span>
        <span style="border-left:3px solid #22c55e;padding-left:6px">Completed</span>
        <span style="border-left:3px solid var(--red);padding-left:6px">Cancelled</span>
      </div>

      <div class="cal-grid">
        ${dayNames.map(n=>`<div class="cal-head-cell">${n}</div>`).join('')}
        ${grid}
      </div>

      <!-- Day Detail Panel -->
      <div id="calDayPanel" class="cal-day-panel hidden"></div>
    `;
  },

  _prevMonth() {
    if (this._month === 0) { this._month = 11; this._year--; }
    else this._month--;
    this._buildCalendar();
  },

  _nextMonth() {
    if (this._month === 11) { this._month = 0; this._year++; }
    else this._month++;
    this._buildCalendar();
  },

  _showDayDetail(dateStr) {
    const panel = $('calDayPanel');
    if (!panel) return;

    const dayAppts = this._appointments.filter(a => a.date === dateStr);
    const ptMap    = Object.fromEntries(this._patients.map(p => [p.id, p]));
    const dcMap    = Object.fromEntries(this._doctors.map(d => [d.id, d]));

    if (dayAppts.length === 0) {
      panel.innerHTML = `
        <div class="cal-panel-head">
          <strong>${dateStr}</strong>
          <button onclick="$('calDayPanel').classList.add('hidden')">✕</button>
        </div>
        <div class="empty-state" style="padding:2rem"><div>📅</div><p>No appointments on this day</p></div>`;
      panel.classList.remove('hidden');
      return;
    }

    panel.innerHTML = `
      <div class="cal-panel-head">
        <strong>📅 ${dateStr} — ${dayAppts.length} appointment${dayAppts.length>1?'s':''}</strong>
        <button onclick="$('calDayPanel').classList.add('hidden')">✕</button>
      </div>
      <table class="data-table" style="margin-top:.5rem">
        <thead><tr><th>Time</th><th>Patient</th><th>Doctor</th><th>Treatment</th><th>Status</th></tr></thead>
        <tbody>
          ${dayAppts.sort((a,b)=>a.time>b.time?1:-1).map(a=>`
            <tr>
              <td style="color:var(--accent);font-weight:600">${a.time}</td>
              <td><strong>${ptMap[a.patient_id]?.full_name||'Unknown'}</strong></td>
              <td>${dcMap[a.doctor_id]?.full_name||'Unknown'}</td>
              <td>${a.treatment_type||'—'}</td>
              <td>${UI.statusBadge(a.status)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
    panel.classList.remove('hidden');
  }
};
