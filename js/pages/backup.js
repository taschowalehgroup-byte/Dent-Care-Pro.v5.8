/* ═══════════════════════════════════════════════════════
   DentCare Pro — Backup Page (Static / Netlify Edition)
   Backups are exported as downloadable JSON files.
   Server-side backup list/restore is not available.
   ═══════════════════════════════════════════════════════ */

const BackupPage = {

  async render() {
    this._renderStats();
    this._renderList();
  },

  _renderStats() {
    const el = $('backupStats');
    if (!el) return;
    el.innerHTML = `
      <div class="fin-card">
        <div class="fin-label">Backup Mode</div>
        <div class="fin-value" style="color:var(--accent);font-size:1.4rem">📥 Download</div>
      </div>
      <div class="fin-card">
        <div class="fin-label">How it Works</div>
        <div style="font-size:.85rem;color:var(--text2);margin-top:.35rem">
          Click <strong>Export Now</strong> to download all current in-memory data as a JSON file.
        </div>
      </div>
      <div class="fin-card">
        <div class="fin-label">Restore</div>
        <div style="font-size:.85rem;color:var(--text2);margin-top:.35rem">
          To restore, upload the exported JSON to your GitHub repo's
          <code>database/JSON/db.json</code> and redeploy.
        </div>
      </div>
      <div class="fin-card">
        <div class="fin-label">⚠️ Data Resets on Refresh</div>
        <div style="font-size:.82rem;color:var(--text2);margin-top:.25rem">
          All changes are in-memory only. Export regularly to avoid data loss.
        </div>
      </div>
    `;
  },

  _renderList() {
    const body = $('backupBody');
    if (!body) return;
    body.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <div>💾</div>
            <p>
              No server-side backups in static mode.<br>
              Use <strong>Export Now</strong> below to download your data as JSON.
            </p>
          </div>
        </td>
      </tr>`;
  },

  /* ── Export all in-memory data as a downloadable JSON ── */
  async createNow() {
    const label = prompt('Export label (optional):', 'manual') ?? 'manual';
    if (label === null) return;
    try {
      toast('Preparing export…', 'info');
      await DB.backup.create(label.trim() || 'manual');
      toast('✅ Export downloaded! Save it somewhere safe.', 'success', 5000);
    } catch(e) { toast('Export failed: ' + e.message, 'error'); }
  },

  download() { this.createNow(); },
  restore()  { toast('Restore: upload the JSON to your GitHub repo and redeploy.', 'info', 6000); },
  delete()   { toast('Delete not supported in static mode.', 'warning'); },
};
