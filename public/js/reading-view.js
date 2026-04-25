class ReadingView {
  constructor() {
    this.lesson     = null;
    this.sectionIdx = 0;
  }

  open(lesson) {
    this.lesson     = lesson;
    this.sectionIdx = 0;

    document.getElementById('r-title').textContent = lesson.title;
    document.getElementById('r-desc').textContent  = lesson.desc || '';
    document.getElementById('chat-msgs').innerHTML = '<div class="chat-msg system">Hỏi bất kỳ điều gì về bài đọc này.</div>';
    document.querySelectorAll('.text-tab').forEach((t, j) => t.classList.toggle('active', j === 0));
    document.getElementById('text-paired').style.display = 'block';
    document.getElementById('text-vi').style.display     = 'none';

    if (lesson.sections) {
      this._renderActiveSection();
    } else {
      this._hideSectionNav();
      this._renderInterleaved();
      this._renderVietnamese();
    }
  }

  setMode(btn, mode) {
    document.querySelectorAll('.text-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('text-paired').style.display =
      (mode === 'paired' || mode === 'all') ? 'block' : 'none';
    document.getElementById('text-vi').style.display =
      (mode === 'vietnamese' || mode === 'all') ? 'block' : 'none';
    document.getElementById('rp-text-area')?.classList.toggle('split', mode === 'all');
    app.selection.clear();
  }

  // ── Section navigation ────────────────────────
  navigateSection(dir) {
    const total = this.lesson.sections.length;
    this.sectionIdx = Math.max(0, Math.min(total - 1, this.sectionIdx + dir));

    const sec = this.lesson.sections[this.sectionIdx];

    // Update active lesson text so vocab AI and chat use this section
    app.currentLesson.id = sec.id;
    app.currentLesson.zh = sec.zh;
    app.currentLesson.py = sec.py;
    app.currentLesson.vi = sec.vi;

    // Reset vocab state for new section
    app.vocab.items = [];
    app.selection.clear();
    document.getElementById('vocab-list').innerHTML    = '';
    document.getElementById('csv-btn').style.display    = 'none';
    document.getElementById('ws-btn').style.display     = 'none';
    document.getElementById('addall-btn').style.display = 'none';
    const genBtn = document.getElementById('gen-btn');
    genBtn.disabled    = false;
    genBtn.textContent = 'Phân tích & tạo từ vựng';

    // Reset chat for new section context
    app.chat.reset();

    this._renderActiveSection();

    // Load cached vocab for this section (async, non-blocking)
    app.vocab.load(app.currentLesson);
  }

  _renderActiveSection() {
    const sections = this.lesson.sections;
    const total    = sections.length;
    const i        = this.sectionIdx;
    const sec      = sections[i];

    // Section nav UI
    const nav = document.getElementById('sec-nav');
    if (nav) {
      nav.style.display = 'flex';
      document.getElementById('sec-label').innerHTML =
        `${sec.title} <span class="sec-nav-count">(${i + 1} / ${total})</span>`;
      document.getElementById('sec-prev').disabled = i === 0;
      document.getElementById('sec-next').disabled = i === total - 1;
    }

    // Reading content for this section only
    const zhLines = sec.zh.split('\n').filter(l => l.trim());
    const pyLines = sec.py.split('\n').filter(l => l.trim());
    document.getElementById('text-paired').innerHTML = zhLines.map((zh, li) =>
      `<div class="il-pair">
        <div class="il-zh">${this._wrapChars(zh, 'zh' + li, 'zh')}</div>
        <div class="il-py">${pyLines[li] || ''}</div>
      </div>`
    ).join('');

    document.getElementById('text-vi').innerHTML = this._wrapChars(sec.vi, 'vi', 'vi');
  }

  _hideSectionNav() {
    const nav = document.getElementById('sec-nav');
    if (nav) nav.style.display = 'none';
  }

  // ── Single-lesson render ──────────────────────
  _renderInterleaved() {
    const zhLines = this.lesson.zh.split('\n').filter(l => l.trim());
    const pyLines = this.lesson.py.split('\n').filter(l => l.trim());
    document.getElementById('text-paired').innerHTML = zhLines.map((zh, li) =>
      `<div class="il-pair">
        <div class="il-zh">${this._wrapChars(zh, 'zh' + li, 'zh')}</div>
        <div class="il-py">${pyLines[li] || ''}</div>
      </div>`
    ).join('');
  }

  _renderVietnamese() {
    document.getElementById('text-vi').innerHTML = this._wrapChars(this.lesson.vi, 'vi', 'vi');
  }

  // ── Shared ────────────────────────────────────
  _wrapChars(text, prefix, cls) {
    let i = 0;
    return [...text].map(c => {
      if (c === '\n') return '<br>';
      const id = i++;
      return `<span class="${cls}-char" data-g="${prefix}" data-i="${id}">${c}</span>`;
    }).join('');
  }
}
