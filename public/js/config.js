class ConfigManager {
  getProvider() { return localStorage.getItem('api_provider') || 'anthropic'; }
  getKey()      { return localStorage.getItem('api_key_' + this.getProvider()) || ''; }

  saveKey() {
    const p = document.getElementById('api-provider').value;
    const k = document.getElementById('api-key-input').value.trim();
    if (!k) return;
    localStorage.setItem('api_provider', p);
    localStorage.setItem('api_key_' + p, k);
    this.updateUI();
    alert('✓ Lưu ' + p + ' key');
  }

  updateUI() {
    const p = this.getProvider(), k = this.getKey();
    const statusEl  = document.getElementById('key-status');
    const provEl    = document.getElementById('api-provider');
    const keyEl     = document.getElementById('api-key-input');
    if (statusEl) {
      statusEl.textContent = k ? `✓ ${p} key OK` : 'Chưa có key';
      statusEl.className   = 'key-status ' + (k ? 'ok' : 'miss');
    }
    if (provEl) provEl.value = p;
    if (keyEl && k) keyEl.value = k.slice(0, 16) + '...';
    document.querySelectorAll('.provider-badge').forEach(b => {
      b.textContent = p === 'openai' ? 'OpenAI' : 'Claude';
      b.className   = 'provider-badge ' + p;
    });
  }
}
