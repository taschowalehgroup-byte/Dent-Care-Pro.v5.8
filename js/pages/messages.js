/* ═══════════════════════════════════════════════════════
   DentCare Pro — Messages Page (Admin Only)
   Handles forgot-password requests from users
   ═══════════════════════════════════════════════════════ */

const MessagesPage = {

  getRequests() {
    return JSON.parse(localStorage.getItem('dentcare_pw_requests') || '[]');
  },

  saveRequests(msgs) {
    localStorage.setItem('dentcare_pw_requests', JSON.stringify(msgs));
  },

  async render() {
    this.renderTable();
    this.updateBadge();
  },

  async getPasswordForUser(username) {
    try {
      const users = await DB.tables.users.all();
      const user  = users.find(u => u.username === username);
      return user ? user.password : null;
    } catch(e) {
      return null;
    }
  },

  renderTable() {
    const body = $('messagesBody');
    if (!body) return;

    const msgs = this.getRequests();

    if (msgs.length === 0) {
      body.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div>✉️</div><p>No messages yet</p></div></td></tr>`;
      return;
    }

    // Sort: pending first, then by time descending
    const sorted = [...msgs].sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return b.id - a.id;
    });

    body.innerHTML = sorted.map(msg => {
      const isPending = msg.status === 'pending';
      const statusBadge = isPending
        ? `<span class="badge danger">Pending</span>`
        : msg.status === 'sent'
          ? `<span class="badge info">Password Sent</span>`
          : `<span class="badge" style="background:var(--border);color:var(--text-muted)">Declined</span>`;

      const actions = isPending
        ? `<div class="actions">
            <button class="action-btn" onclick="MessagesPage.sendPassword(${msg.id})" style="background:var(--primary);color:#fff">Send Password</button>
            <button class="action-btn danger" onclick="MessagesPage.declineRequest(${msg.id})">Decline</button>
           </div>`
        : `<div class="actions"><button class="action-btn" onclick="MessagesPage.deleteMessage(${msg.id})">Delete</button></div>`;

      return `
        <tr>
          <td><strong>${msg.username}</strong></td>
          <td style="max-width:280px;white-space:normal">${msg.message}</td>
          <td style="white-space:nowrap;color:var(--text-muted);font-size:0.85em">${msg.time}</td>
          <td>${statusBadge}</td>
          <td>${actions}</td>
        </tr>
      `;
    }).join('');
  },

  async sendPassword(id) {
    const msgs = this.getRequests();
    const msg = msgs.find(m => m.id === id);
    if (!msg) return;

    const pw = await this.getPasswordForUser(msg.username);
    if (!pw) {
      toast(`Could not find password for "${msg.username}"`, 'error');
      return;
    }

    // Show a modal-style toast with the password
    toast(`Password for "${msg.username}" is: ${pw}  (shown for admin reference)`, 'success');

    // Mark as sent
    msg.status = 'sent';
    msg.message += ` — Password has been noted by admin.`;
    this.saveRequests(msgs);
    this.renderTable();
    this.updateBadge();
  },

  declineRequest(id) {
    const msgs = this.getRequests();
    const msg = msgs.find(m => m.id === id);
    if (!msg) return;
    msg.status = 'declined';
    this.saveRequests(msgs);
    this.renderTable();
    this.updateBadge();
    toast('Request declined', 'info');
  },

  deleteMessage(id) {
    let msgs = this.getRequests();
    msgs = msgs.filter(m => m.id !== id);
    this.saveRequests(msgs);
    this.renderTable();
    this.updateBadge();
    toast('Message deleted', 'info');
  },

  updateBadge() {
    const badge = $('badgeMessages');
    if (!badge) return;
    const msgs = this.getRequests();
    const pending = msgs.filter(m => m.status === 'pending').length;
    if (pending > 0) {
      badge.textContent = pending;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  },

  clearAll() {
    if (!confirm('Clear all messages?')) return;
    this.saveRequests([]);
    this.render();
    toast('All messages cleared', 'info');
  },

  exportExcel() {
    UI.exportExcel(this.getRequests(), 'messages');
  },

  exportJson() {
    UI.exportJson(this.getRequests(), 'messages');
  }
};
