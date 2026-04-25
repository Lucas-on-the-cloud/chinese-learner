class FileImporter {
  constructor() {
    this.sections = [];
    this.book     = 'B1';
  }

  handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      this.sections = this.parse(e.target.result);
      document.getElementById('import-file').value = '';
      if (!this.sections.length) {
        alert('Không tìm thấy bài đọc nào.\nKiểm tra file có nhãn "Văn bản tiếng Trung gốc", "Pinyin", "Bản dịch tiếng Việt" không.');
        return;
      }
      this._renderPreview();
      document.getElementById('import-overlay').classList.add('open');
      document.body.style.overflow = 'hidden';
    };
    reader.readAsText(file, 'UTF-8');
  }

  parse(text) {
    text = text.replace(/^﻿/, '');               // strip BOM
    const blocks = text.split(/_{6,}/).map(b => b.trim()).filter(Boolean);
    const results = [];

    blocks.forEach(block => {
      const lines = block.split('\n').map(l => l.trim());
      const nz    = lines.filter(Boolean);
      if (nz.length < 4) return;

      const zhIdx = nz.findIndex(l => /văn bản tiếng trung/i.test(l));
      const pyIdx = nz.findIndex(l => /^pinyin$/i.test(l));
      const viIdx = nz.findIndex(l => /bản dịch tiếng việt/i.test(l));
      if (zhIdx === -1 || pyIdx === -1 || viIdx === -1) return;

      // title = first non-empty line before the first label
      const title = nz.slice(0, zhIdx)
        .map(l => l.replace(/^[🔵🔴🟡🟢🔷▶#*\-\s]+/, '').trim())
        .find(Boolean) || nz[0];

      const zh = nz.slice(zhIdx + 1, pyIdx).join('\n').trim();
      const py = nz.slice(pyIdx + 1, viIdx).join('\n').trim();
      const vi = nz.slice(viIdx + 1).join('\n').trim();

      if (!zh) return;
      results.push({ title, zh, py, vi });
    });

    return results;
  }

  _renderPreview() {
    document.getElementById('import-book').value = this.book;
    document.getElementById('import-count').textContent = `${this.sections.length} bài đọc`;
    document.getElementById('import-cards').innerHTML = this.sections.map((s, i) => `
      <div class="imp-card" id="icard-${i}">
        <div class="imp-card-hd">
          <span class="imp-num">${i + 1}</span>
          <input class="imp-title" value="${esc(s.title)}" oninput="app.importer.sections[${i}].title=this.value">
          <button class="imp-del" onclick="app.importer.removeSection(${i})">✕</button>
        </div>
        <div class="imp-fields">
          <label class="imp-lbl">漢字 (phồn thể)</label>
          <textarea class="imp-ta" rows="4" oninput="app.importer.sections[${i}].zh=this.value">${s.zh}</textarea>
          <label class="imp-lbl">Pinyin</label>
          <textarea class="imp-ta" rows="4" oninput="app.importer.sections[${i}].py=this.value">${s.py}</textarea>
          <label class="imp-lbl">Tiếng Việt</label>
          <textarea class="imp-ta" rows="4" oninput="app.importer.sections[${i}].vi=this.value">${s.vi}</textarea>
        </div>
      </div>`
    ).join('');
  }

  removeSection(i) {
    this.sections.splice(i, 1);
    this._renderPreview();
  }

  async saveAll() {
    const book = document.getElementById('import-book').value || 'B1';
    const toSave = this.sections.filter(s => s.zh.trim());
    if (!toSave.length) return;

    const btn = document.getElementById('import-save-btn');
    btn.disabled = true; btn.textContent = 'Đang lưu...';

    let saved = 0;
    for (const s of toSave) {
      const { error } = await app.lessons.db.addLesson({
        title:       s.title,
        description: s.zh.slice(0, 40) + '...',
        chinese:     s.zh,
        pinyin:      s.py,
        vietnamese:  s.vi,
        book
      });
      if (!error) saved++;
    }

    btn.textContent = `✓ Đã lưu ${saved}/${toSave.length} bài`;
    await app.init();
    setTimeout(() => { this.close(); app.showView('lessons'); }, 900);
  }

  close() {
    document.getElementById('import-overlay').classList.remove('open');
    document.body.style.overflow = '';
  }
}
