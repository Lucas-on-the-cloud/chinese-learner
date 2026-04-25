class FileImporter {
  constructor() {
    this.sections   = [];
    this.book       = 'B1';
    this.lessonName = '';
    this.currentIdx = 0;
  }

  // ── Entry point (supports multiple files) ─────
  handleFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;

    this.sections   = [];
    this.currentIdx = 0;
    this.lessonName = files.length === 1
      ? this._nameFromFile(files[0])
      : '';

    this._resetSaveBtn();
    this._showLoading();
    this._processFiles(files);
  }

  async _processFiles(files) {
    const allSections = [];

    for (let fi = 0; fi < files.length; fi++) {
      const file   = files[fi];
      const prefix = this._nameFromFile(file);
      this._updateLoadingMsg(
        files.length > 1
          ? `📄 ${fi + 1}/${files.length}: ${file.name}`
          : (app.config.getKey() ? '✨ AI đang phân tích file...' : 'Đang đọc file...')
      );

      const text = await this._readFile(file);
      let sections = [];
      if (app.config.getKey()) sections = await this._parseWithAI(text);
      if (!sections.length)    sections = this._parseWithRegex(text);

      // For multi-file, prefix each section title with its file name
      if (files.length > 1) {
        sections.forEach(s => { s.title = `${prefix} · ${s.title}`; });
      }
      allSections.push(...sections);
    }

    document.getElementById('import-file').value = '';
    this.sections = allSections;
    this.currentIdx = 0;

    if (!this.sections.length) {
      document.getElementById('import-cards').innerHTML =
        `<div class="imp-empty">❌ Không tìm thấy bài đọc nào.<br>Kiểm tra lại file hoặc đảm bảo có API key.</div>`;
      return;
    }

    document.getElementById('import-lesson-name').value = this.lessonName;
    await this._loadBooks();
    this._renderCard();
  }

  // ── AI parser ─────────────────────────────────
  async _parseWithAI(text) {
    try {
      const raw = await app.ai.call(
        `Bạn là trợ lý xử lý dữ liệu tiếng Trung phồn thể (繁體中文, Đài Loan).
Trích xuất TẤT CẢ bài đọc từ file. Trả về JSON thuần, KHÔNG markdown:
[{
  "title": "Hình X — ...",
  "zh": ["câu/đoạn tiếng Trung 1", "câu/đoạn tiếng Trung 2", "..."],
  "py": ["pinyin tương ứng câu 1", "pinyin tương ứng câu 2", "..."],
  "vi": "toàn bộ bản dịch tiếng Việt"
}]

QUY TẮC BẮT BUỘC:
- "zh" và "py" là MẢNG (array), KHÔNG phải chuỗi.
- zh[i] và py[i] phải là cùng một câu — tương ứng tuyệt đối.
- Số phần tử zh và py phải BẰNG NHAU.
- Mỗi phần tử là một câu/đoạn, KHÔNG chứa ký tự xuống dòng.
- Giữ nguyên 100% nội dung, không rút gọn.`,
        `Nội dung file:\n${text}`,
        8000
      );
      if (!raw) return [];
      const parsed = JSON.parse(raw.trim().replace(/^```json\s*/, '').replace(/\s*```$/, ''));
      if (!Array.isArray(parsed)) return [];
      return parsed.map(s => ({
        title: s.title || '',
        zh: Array.isArray(s.zh) ? s.zh.join('\n') : (s.zh || ''),
        py: Array.isArray(s.py) ? s.py.join('\n') : (s.py || ''),
        vi: Array.isArray(s.vi) ? s.vi.join('\n') : (s.vi || '')
      })).filter(s => s.zh && s.title);
    } catch (e) {
      console.warn('AI parse failed, falling back to regex:', e.message);
      return [];
    }
  }

  // ── Regex parser (fallback) ───────────────────
  _parseWithRegex(text) {
    const lines = text.split('\n').map(l => l.trim());
    const isSep = l => /^_{4,}$/.test(l);
    const raw   = [];
    let cur     = null;

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
      const zh = pick(ls.slice(zhIdx + 1, pyIdx));
      const py = pick(ls.slice(pyIdx + 1, viIdx));
      const vi = pick(ls.slice(viIdx + 1));
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

  // ── Render ────────────────────────────────────
  _showLoading() {
    document.getElementById('import-lesson-name').value = this.lessonName;
    document.getElementById('import-count').textContent = '';
    document.getElementById('import-prev').disabled     = true;
    document.getElementById('import-next').disabled     = true;
    document.getElementById('import-cards').innerHTML   =
      `<div class="imp-loading">
        <div class="spinner" style="width:28px;height:28px;border-width:3px;border-color:#e8d5a0;border-top-color:var(--gold)"></div>
        <div id="imp-load-msg" style="font-size:13px;color:var(--muted)">Đang chuẩn bị...</div>
      </div>`;
    document.getElementById('import-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  _updateLoadingMsg(msg) {
    const el = document.getElementById('imp-load-msg');
    if (el) el.textContent = msg;
  }

  _renderCard() {
    const total = this.sections.length;
    const i     = this.currentIdx;
    const s     = this.sections[i];

    document.getElementById('import-count').textContent = `${i + 1} / ${total}`;
    document.getElementById('import-prev').disabled     = i === 0;
    document.getElementById('import-next').disabled     = i === total - 1;

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

  // ── Save ──────────────────────────────────────
  async saveAll() {
    const book   = document.getElementById('import-book').value || 'B1';
    const prefix = (document.getElementById('import-lesson-name').value || '').trim();
    const toSave = this.sections.filter(s => s.zh.trim());
    if (!toSave.length) return;

    const btn = document.getElementById('import-save-btn');
    btn.disabled = true; btn.textContent = 'Đang lưu...';

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
    setTimeout(() => {
      this.close();
      app.showView('lessons');
    }, 900);
  }

  // ── Helpers ───────────────────────────────────
  _nameFromFile(file) {
    const m = file.name.match(/(\d+\.\d+)/);
    return m ? `Bài ${m[1]}` : file.name.replace(/\.txt$/i, '');
  }

  _readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result.replace(/^﻿/, ''));
      reader.onerror = reject;
      reader.readAsText(file, 'UTF-8');
    });
  }

  _resetSaveBtn() {
    const btn = document.getElementById('import-save-btn');
    if (btn) { btn.disabled = false; btn.textContent = '💾 Lưu tất cả vào Supabase'; }
  }

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
    this._resetSaveBtn();
    document.getElementById('import-overlay').classList.remove('open');
    document.body.style.overflow = '';
  }
}
