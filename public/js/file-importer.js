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
        alert('Không tìm thấy bài đọc nào.\nKiểm tra file có dòng "Hình 3", "Hình 4"... không.');
        return;
      }
      this._renderPreview();
      this._loadBooks();
      document.getElementById('import-overlay').classList.add('open');
      document.body.style.overflow = 'hidden';
    };
    reader.readAsText(file, 'UTF-8');
  }

  // Split by "Hình X" lines — each Hình becomes one lesson
  parse(text) {
    text = text.replace(/^﻿/, ''); // strip BOM
    const lines = text.split('\n').map(l => l.trim());

    // Group lines under each "Hình X" heading
    const raw = [];
    let cur = null;
    for (const line of lines) {
      if (/^Hình\s+\d+/i.test(line)) {
        if (cur) raw.push(cur);
        cur = { title: line, lines: [] };
      } else if (cur) {
        cur.lines.push(line);
      }
    }
    if (cur) raw.push(cur);

    return raw.map(sec => {
      const ls = sec.lines;
      const zhIdx = ls.findIndex(l => /văn bản tiếng trung/i.test(l));
      const pyIdx = ls.findIndex(l => /^pinyin/i.test(l));
      const viIdx = ls.findIndex(l => /bản dịch tiếng việt/i.test(l));
      if (zhIdx === -1 || pyIdx === -1 || viIdx === -1) return null;

      const zh = ls.slice(zhIdx + 1, pyIdx).filter(Boolean).join('\n').trim();
      const py = ls.slice(pyIdx + 1, viIdx).filter(Boolean).join('\n').trim();
      const vi = ls.slice(viIdx + 1).filter(Boolean).join('\n').trim();
      if (!zh) return null;

      return { title: sec.title, zh, py, vi };
    }).filter(Boolean);
  }

  async _loadBooks() {
    const books = await app.lessons.db.getBooks();
    const sel = document.getElementById('import-book');
    sel.innerHTML = books.map(b => `<option value="${b}">${b}</option>`).join('');
    if (books.includes(this.book)) sel.value = this.book;
    else { this.book = books[0]; sel.value = this.book; }
  }

  _h(s) {
    // Escape HTML for safe insertion into innerHTML
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  _renderPreview() {
    document.getElementById('import-book').value = this.book;
    document.getElementById('import-count').textContent = `${this.sections.length} bài đọc`;
    document.getElementById('import-cards').innerHTML = this.sections.map((s, i) => `
      <div class="imp-card" id="icard-${i}">
        <div class="imp-card-hd">
          <span class="imp-num">${i + 1}</span>
          <input class="imp-title" value="${this._h(s.title)}" oninput="app.importer.sections[${i}].title=this.value">
          <button class="imp-del" onclick="app.importer.removeSection(${i})">✕</button>
        </div>
        <div class="imp-fields">
          <label class="imp-lbl">漢字 (phồn thể)</label>
          <textarea class="imp-ta" rows="4" oninput="app.importer.sections[${i}].zh=this.value">${this._h(s.zh)}</textarea>
          <label class="imp-lbl">Pinyin</label>
          <textarea class="imp-ta" rows="4" oninput="app.importer.sections[${i}].py=this.value">${this._h(s.py)}</textarea>
          <label class="imp-lbl">Tiếng Việt</label>
          <textarea class="imp-ta" rows="4" oninput="app.importer.sections[${i}].vi=this.value">${this._h(s.vi)}</textarea>
        </div>
      </div>`
    ).join('');
  }

  removeSection(i) {
    this.sections.splice(i, 1);
    this._renderPreview();
  }

  async saveAll() {
    const book   = document.getElementById('import-book').value || 'B1';
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
