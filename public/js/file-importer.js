class FileImporter {
  constructor() {
    this.sections   = [];
    this.book       = 'B1';
    this.lessonName = '';
    this.currentIdx = 0;
  }

  handleFile(file) {
    if (!file) return;
    // Auto-detect lesson name from filename e.g. "8.2 Q2.txt" → "Bài 8.2"
    const nameMatch = file.name.match(/(\d+\.\d+)/);
    this.lessonName = nameMatch ? `Bài ${nameMatch[1]}` : file.name.replace(/\.txt$/i, '');

    const reader = new FileReader();
    reader.onload = e => {
      this.sections   = this.parse(e.target.result);
      this.currentIdx = 0;
      document.getElementById('import-file').value = '';
      if (!this.sections.length) {
        alert('Không tìm thấy bài đọc nào.\nKiểm tra file có dòng "Hình 3", "Hình 4"... không.');
        return;
      }
      this._loadBooks();
      this._renderCard();
      document.getElementById('import-lesson-name').value = this.lessonName;
      document.getElementById('import-overlay').classList.add('open');
      document.body.style.overflow = 'hidden';
    };
    reader.readAsText(file, 'UTF-8');
  }

  parse(text) {
    text = text.replace(/^﻿/, '');
    const lines  = text.split('\n').map(l => l.trim());
    const isSep  = l => /^_{4,}$/.test(l);
    const raw    = [];
    let cur      = null;

    for (const line of lines) {
      if (/Hình\s+\d+/i.test(line)) {
        if (cur) raw.push(cur);
        const clean = line.replace(/^[^\wĂăÂâĐđÊêÔôƠơƯư]*/, '').trim();
        cur = { title: clean, lines: [] };
      } else if (cur) {
        cur.lines.push(line);
      }
    }
    if (cur) raw.push(cur);

    return raw.map(sec => {
      const ls    = sec.lines;
      const zhIdx = ls.findIndex(l => /văn bản tiếng trung/i.test(l));
      const pyIdx = ls.findIndex(l => /^pinyin/i.test(l));
      const viIdx = ls.findIndex(l => /bản dịch tiếng việt/i.test(l));
      if (zhIdx === -1 || pyIdx === -1 || viIdx === -1) return null;

      const pick = arr => arr.filter(l => l && !isSep(l)).join('\n').trim();
      const zh   = pick(ls.slice(zhIdx + 1, pyIdx));
      const py   = pick(ls.slice(pyIdx + 1, viIdx));
      const vi   = pick(ls.slice(viIdx + 1));
      if (!zh) return null;

      return { title: sec.title, zh, py, vi };
    }).filter(Boolean);
  }

  // ── Navigation ────────────────────────────────
  prevCard() {
    if (this.currentIdx > 0) { this.currentIdx--; this._renderCard(); }
  }

  nextCard() {
    if (this.currentIdx < this.sections.length - 1) { this.currentIdx++; this._renderCard(); }
  }

  removeCurrent() {
    this.sections.splice(this.currentIdx, 1);
    if (!this.sections.length) { this.close(); return; }
    if (this.currentIdx >= this.sections.length) this.currentIdx = this.sections.length - 1;
    this._renderCard();
  }

  // ── Render one card ───────────────────────────
  _renderCard() {
    const total = this.sections.length;
    const i     = this.currentIdx;
    const s     = this.sections[i];

    document.getElementById('import-count').textContent  = `${i + 1} / ${total}`;
    document.getElementById('import-prev').disabled      = i === 0;
    document.getElementById('import-next').disabled      = i === total - 1;

    document.getElementById('import-cards').innerHTML = `
      <div class="imp-card">
        <div class="imp-card-hd">
          <span class="imp-num">${i + 1}</span>
          <input class="imp-title" value="${this._h(s.title)}" oninput="app.importer.sections[${i}].title=this.value">
        </div>
        <div class="imp-fields">
          <div class="imp-field-zh">
            <label class="imp-lbl">漢字 (phồn thể)</label>
            <textarea class="imp-ta zh" oninput="app.importer.sections[${i}].zh=this.value">${this._h(s.zh)}</textarea>
          </div>
          <div class="imp-field-py">
            <label class="imp-lbl py">Pinyin</label>
            <textarea class="imp-ta" oninput="app.importer.sections[${i}].py=this.value">${this._h(s.py)}</textarea>
          </div>
          <div class="imp-field-vi">
            <label class="imp-lbl vi">Tiếng Việt</label>
            <textarea class="imp-ta" oninput="app.importer.sections[${i}].vi=this.value">${this._h(s.vi)}</textarea>
          </div>
        </div>
      </div>`;
  }

  // ── Save all ──────────────────────────────────
  async saveAll() {
    const book   = document.getElementById('import-book').value || 'B1';
    const toSave = this.sections.filter(s => s.zh.trim());
    if (!toSave.length) return;

    const btn = document.getElementById('import-save-btn');
    btn.disabled = true; btn.textContent = 'Đang lưu...';

    const prefix = this.lessonName.trim();
    let saved = 0;
    for (const s of toSave) {
      const fullTitle = prefix ? `${prefix} · ${s.title}` : s.title;
      const { error } = await app.lessons.db.addLesson({
        title:       fullTitle,
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

  // ── Helpers ───────────────────────────────────
  async _loadBooks() {
    const books = await app.lessons.db.getBooks();
    const sel   = document.getElementById('import-book');
    sel.innerHTML = books.map(b => `<option value="${b}">${b}</option>`).join('');
    if (books.includes(this.book)) sel.value = this.book;
    else { this.book = books[0]; sel.value = this.book; }
  }

  _h(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  close() {
    document.getElementById('import-overlay').classList.remove('open');
    document.body.style.overflow = '';
  }
}
