/* ═══════════════════════════════════════════════════════
   DentCare Pro — Dashboard Page (Redesigned)
   ═══════════════════════════════════════════════════════ */

let _dashRevenueChart = null;

const DashboardPage = {
  async render() {
    try {
      const [stats, patients, doctors, tx, appts] = await Promise.all([
        DB.helpers.stats(),
        DB.tables.patients.all(),
        DB.tables.doctors.all(),
        DB.tables.transactions.all(),
        DB.helpers.todayAppts()
      ]);

      const ptMap = Object.fromEntries(patients.map(p => [p.id, p]));
      const dcMap = Object.fromEntries(doctors.map(d => [d.id, d]));

      /* ── KPI Cards ─────────────────────────────────── */
      const onDuty = doctors.filter(d => d.status === 'present').length;
      const totalRev = tx.filter(t => t.type === 'income').reduce((s,t)=>s+t.amount,0);
      const now = new Date();
      const newThisMonth = patients.filter(p => {
        const d = new Date(p.created_at||p.registered_at||0);
        return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
      }).length;
      const completedToday = appts.filter(a => a.status === 'completed').length;

      const kpis = [
        { label:'Total Patients',   value:stats.patients,                icon:'👥', sub:`↑ ${newThisMonth} this month`,   c:'var(--accent)',  subc:'var(--accent)' },
        { label:"Today's Appts",    value:stats.todayAppts,              icon:'📅', sub:`${completedToday} completed`,     c:'var(--accent2)', subc:'var(--text2)' },
        { label:'Doctors on Duty',  value:`${onDuty}/${doctors.length}`, icon:'⚕️',  sub:'Active today',                  c:'var(--green)',   subc:'var(--text2)' },
        { label:'Total Revenue',    value:`E£${fmt(totalRev)}`,          icon:'💰', sub:'↑ Growing',                       c:'var(--yellow)',  subc:'var(--green)' },
      ];
      $('dashKpiGrid').innerHTML = kpis.map((k,i) => `
        <div class="dash-kpi-card" style="--i:${i};--c:${k.c}">
          <div class="dkpi-icon">${k.icon}</div>
          <div class="dkpi-value" style="color:${k.c}">${k.value}</div>
          <div class="dkpi-label">${k.label}</div>
          <div class="dkpi-sub" style="color:${k.subc}">${k.sub}</div>
        </div>
      `).join('');

      /* ── Today's Schedule Table ────────────────────── */
      $('dashSchedBody').innerHTML = appts.length === 0
        ? `<tr><td colspan="5" class="empty-td">No appointments today — Schedule one</td></tr>`
        : appts.map(a => `
            <tr>
              <td><span class="appt-time">${a.time}</span></td>
              <td>${ptMap[a.patient_id]?.full_name || '—'}</td>
              <td>${dcMap[a.doctor_id]?.full_name || '—'}</td>
              <td>${UI.statusBadge(a.status)}</td>
              <td><div class="actions">
                <button class="action-btn" onclick="Modals.viewAppointmentDetail(${a.id})">View</button>
                <button class="action-btn" onclick="Modals.editAppointment(${a.id})">Edit</button>
                <button class="action-btn danger" onclick="Actions.deleteAppt(${a.id})">Del</button>
              </div></td>
            </tr>
          `).join('');

      /* Stagger row entrance animations */
      if (typeof staggerTableRows === 'function') staggerTableRows('dashSchedBody');

      /* ── Revenue Trend Chart ───────────────────────── */
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const revByMonth = Array(12).fill(0);
      tx.filter(t => t.type === 'income').forEach(t => {
        const m = new Date(t.date || t.created_at || 0).getMonth();
        if (m >= 0 && m < 12) revByMonth[m] += t.amount;
      });

      if (_dashRevenueChart) { _dashRevenueChart.destroy(); _dashRevenueChart = null; }
      const ctx = document.getElementById('dashRevenueChart');
      if (ctx) {
        _dashRevenueChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: months,
            datasets: [{
              label: 'Revenue',
              data: revByMonth,
              borderColor: '#00d4ff',
              backgroundColor: 'rgba(0,212,255,0.08)',
              borderWidth: 2.5,
              pointBackgroundColor: '#00d4ff',
              pointRadius: 4,
              pointHoverRadius: 6,
              tension: 0.4,
              fill: true
            }]
          },
          options: {
            responsive: true,
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: c => ' E£' + c.parsed.y.toLocaleString() } }
            },
            scales: {
              x: { grid:{color:'rgba(255,255,255,0.04)'}, ticks:{color:'#7b84a3',font:{size:11}} },
              y: {
                grid: {color:'rgba(255,255,255,0.04)'},
                ticks: {
                  color:'#7b84a3', font:{size:11},
                  callback: v => 'E£'+(v>=1000?(v/1000).toFixed(0)+'k':v)
                }
              }
            }
          }
        });
      }

    } catch(e) {
      console.error('Dashboard error:', e);
      toast('Failed to load dashboard', 'error');
    }

    /* ── 3D Tooth – mount after DOM is painted ── */
    if (typeof Tooth3D !== 'undefined') {
      requestAnimationFrame(() => Tooth3D.mount());
    }

  }
};
