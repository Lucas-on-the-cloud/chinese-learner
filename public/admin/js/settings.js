// ── Settings functions ──────────────────────────
function adminInitSettings() {
  const cfg = window.app.config;
  const statusEl = document.getElementById('key-status');
  const provEl   = document.getElementById('api-provider');
  const keyEl    = document.getElementById('api-key-input');
  if (provEl) provEl.value = cfg.getProvider();
  const k = cfg.getKey();
  if (keyEl && k) keyEl.value = k.slice(0, 16) + '…';
  if (statusEl) {
    statusEl.textContent = k ? '✓ Đã lưu API key' : 'Chưa có API key';
    statusEl.className   = 's-key-status ' + (k ? 'ok' : 'miss');
  }
  const gcpKey    = localStorage.getItem('api_key_gcp') || '';
  const gcpKeyEl  = document.getElementById('gcp-key-input');
  const gcpStatus = document.getElementById('gcp-key-status');
  if (gcpKeyEl && gcpKey) gcpKeyEl.value = gcpKey.slice(0, 8) + '…';
  if (gcpStatus) {
    gcpStatus.textContent = gcpKey ? '✓ Đã lưu GCP Vision key' : 'Chưa có GCP key';
    gcpStatus.className   = 's-key-status ' + (gcpKey ? 'ok' : 'miss');
  }
}

function saveGCPKey() {
  const k = document.getElementById('gcp-key-input').value.trim();
  if (!k) return;
  localStorage.setItem('api_key_gcp', k);
  showMsg('gcp-key-status', '✓ Đã lưu GCP Vision key', 'ok');
}

function adminSaveKey() {
  const p = document.getElementById('api-provider').value;
  const k = document.getElementById('api-key-input').value.trim();
  if (!k) return;
  window.app.config.saveKey(p, k);
  const statusEl = document.getElementById('key-status');
  statusEl.textContent = '✓ Đã lưu';
  statusEl.className = 's-key-status ok';
}

function adminBkPreview(url) { imgPreview(url, 'bk-preview', 'bk-preview-img'); }
function adminBkFile(input) { imgFileChange(input, 'bk-cover-url', 'bk-preview', 'bk-preview-img', 480); }
function adminBkClear() { imgClear('bk-cover-url', 'bk-cover-file', 'bk-preview'); }

async function adminSaveBook() {
  const name    = document.getElementById('bk-code').value.trim().toUpperCase();
  const display = document.getElementById('bk-title').value.trim();
  const desc    = document.getElementById('bk-desc').value.trim();
  const cover   = document.getElementById('bk-cover-url').value.trim();
  if (!name) { adminMsg('bk-msg', 'Nhập mã sách.', 'err'); return; }
  const btn = document.getElementById('bk-save-btn');
  btn.disabled = true; btn.textContent = 'Đang lưu…';
  const { error } = await _adminDb.upsertBook({ name, display_name: display||null, description: desc||null, cover_url: cover||null });
  btn.disabled = false; btn.textContent = '💾 Lưu sách';
  if (error) { adminMsg('bk-msg', 'Lỗi: ' + error.message, 'err'); return; }
  adminMsg('bk-msg', '✓ Đã lưu: ' + (display || name), 'ok');
  ['bk-code','bk-title','bk-desc'].forEach(id => document.getElementById(id).value = '');
  adminBkClear();
}
