/* ═══════════════════════════════════════════════════════
   DentCare Pro — Passwords Page
   Only admin can see actual password values.
   All other roles see masked bullets.
   ═══════════════════════════════════════════════════════ */

const PasswordsPage = {
  async render() {
    const users = await DB.tables.users.all();
    this.renderTable(users);
  },

  renderTable(rows) {
    const body = $('passwordBody');
    if (!body) return;

    const session         = DB.auth.current();
    const canSeePasswords = session?.role === 'admin';

    body.innerHTML = rows.length === 0
      ? `<tr><td colspan="4"><div class="empty-state"><div>🔑</div><p>No users found</p></div></td></tr>`
      : rows.map(u => `
        <tr>
          <td><strong>${u.username}</strong></td>
          <td><span class="badge ${u.role === 'admin' ? 'badge-urgent' : 'badge-info'}">${u.role}</span></td>
          <td>
            ${canSeePasswords && u.password
              ? `<code style="letter-spacing:2px;user-select:all">${u.password}</code>`
              : `<span style="color:var(--text2);letter-spacing:3px">••••••</span>`}
          </td>
          <td>
            <div class="actions">
              <button class="action-btn" onclick="Modals.viewUser(${u.id})">View</button>
              ${canSeePasswords ? `
                <button class="action-btn" onclick="Modals.editUser(${u.id})">Edit</button>
                <button class="action-btn danger" onclick="Actions.deleteUser(${u.id})">Del</button>
              ` : ''}
            </div>
          </td>
        </tr>
      `).join('');
  },

  exportExcel() {
    DB.tables.users.all().then(rows => UI.exportExcel(rows.map(u => ({...u, password: undefined})), 'users'));
  },
  exportJson() {
    DB.tables.users.all().then(rows => UI.exportJson(rows.map(u => ({...u, password: undefined})), 'users'));
  },
  importFile() {
    UI.importFile(async rows => {
      let inserted = 0;
      for (const row of rows) {
        try {
          if (!row.username) continue;
          await DB.tables.users.insert({
            username: row.username,
            password: row.password || 'Pass-01',
            role: row.role || 'receptionist'
          });
          inserted++;
        } catch(e) {}
      }
      toast(`Imported ${inserted} users`, 'success');
      this.render();
    });
  },

  async checkResetRequests() {
    try {
      const reqs = await DB.authExtended.resetRequests();
      if (!reqs.length) { toast('No pending password reset requests', 'info'); return; }

      const rows = reqs.map(r => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:.6rem;border-bottom:1px solid var(--border)">
          <div>
            <strong>${r.username}</strong> <span style="font-size:.78rem;color:var(--text2)">(${r.role})</span>
            <br><span style="font-size:.75rem;color:var(--text2)">Token: <code style="background:var(--surface2);padding:.1rem .35rem;border-radius:4px;letter-spacing:.1em">${r.token}</code> · expires ${new Date(r.expires_at).toLocaleTimeString()}</span>
          </div>
          <button class="action-btn" onclick="PasswordsPage._adminResetFor('${r.username}','${r.token}',this)">Reset Password</button>
        </div>`).join('');

      const html = `
      <div id="resetReqModal" class="modal-overlay open" onclick="if(event.target===this)this.remove()">
        <div class="modal modal-sm">
          <div class="modal-head"><h3>🔑 Password Reset Requests</h3><button class="close-btn" onclick="$('resetReqModal').remove()">✕</button></div>
          <div class="modal-body">
            <p style="font-size:.85rem;color:var(--text2);margin-bottom:.75rem">${reqs.length} pending request(s):</p>
            ${rows}
          </div>
          <div class="modal-foot"><button class="btn-ghost" onclick="$('resetReqModal').remove()">Close</button></div>
        </div>
      </div>`;
      document.body.insertAdjacentHTML('beforeend', html);
    } catch(e) { toast('Error fetching requests: '+e.message, 'error'); }
  },

  async _adminResetFor(username, token, btn) {
    const newPass = prompt(`Set new password for "${username}":`);
    if (!newPass || newPass.length < 4) { toast('Password too short', 'warning'); return; }
    try {
      const data = await DB.authExtended.resetPassword(username, token, newPass);
      if (data.success) {
        toast(`Password for "${username}" has been reset ✓`, 'success');
        btn.closest('div[style]').remove();
        this.render();
      } else {
        toast(data.error || 'Reset failed', 'error');
      }
    } catch(e) { toast('Error: '+e.message, 'error'); }
  }
};
