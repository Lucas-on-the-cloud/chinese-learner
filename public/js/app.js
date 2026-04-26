class ChineseApp {
  constructor() {
    const db = new Database(
      'https://prctmferugkxabyizslx.supabase.co',
      'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ'
    );
    this.config      = new ConfigManager();
    this.ai          = new AIService(this.config);
    this.lessons     = new LessonManager(db);
    this.reading     = new ReadingView();
    this.selection   = new SelectionManager();
    this.vocab       = new VocabManager(this.ai, db);
    this.flashcards  = new FlashcardManager(db);
    this.chat        = new ChatManager(this.ai);
    this.handwriting = new HandwritingModal();
    this.worksheet   = new WorksheetManager();
    this.importer    = new FileImporter();
    this.currentLesson = null;
  }

  async init() {
    await this.lessons.load();
    await this.flashcards.load();

    const booksEl = document.getElementById('books-grid');
    if (booksEl) this.lessons.renderBooksGrid(booksEl);
    if (document.getElementById('fc-area')) this.flashcards.render();
    this.config.updateUI();

    // reading.html: open lesson from URL params
    const params   = new URLSearchParams(location.search);
    const idsParam = params.get('ids');
    const idParam  = params.get('id');
    const bParam   = params.get('b');

    if (bParam) {
      const backBtn = document.getElementById('back-btn');
      if (backBtn) backBtn.href = `/subcourse.html?b=${encodeURIComponent(bParam)}`;
    }

    if (idsParam) {
      const ids   = idsParam.split(',').map(Number);
      const parts = ids.map(id => this.lessons.lessons.find(l => l.id === id)).filter(Boolean);
      // Save reading progress — DB first, localStorage as fallback
      if (bParam && ids.length) {
        const key  = `tocfl_progress_${bParam}`;
        const done = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
        ids.forEach(id => done.add(id));
        localStorage.setItem(key, JSON.stringify([...done]));
        // Save to Supabase if session available
        if (window.userSession?.uid) {
          ids.forEach(id => window.userSession.markLessonRead(bParam, id));
        }
      }
      if (parts.length === 1)    this._openWith(parts[0]);
      else if (parts.length > 1) this._openWithGroup(parts);
    } else if (idParam) {
      const lesson = this.lessons.lessons.find(l => l.id === Number(idParam));
      if (lesson) this._openWith(lesson);
    }
  }

  showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.app-tab').forEach(t => t.classList.remove('active'));
    const viewEl = document.getElementById('view-' + name);
    if (viewEl) viewEl.classList.add('active');
    const tabMap = { lessons: 0, upload: 1 };
    const tabs   = document.querySelectorAll('.app-tab');
    const idx    = tabMap[name];
    if (idx !== undefined && tabs[idx]) tabs[idx].classList.add('active');
    if (name !== 'reading') this.chat.hide();
    this.selection.clear();
  }

  openLesson(index) {
    this._openWith(this.lessons.get(index));
  }

  openGroup(indices) {
    if (!Array.isArray(indices)) indices = [indices];
    if (indices.length === 1) { this.openLesson(indices[0]); return; }
    this._openWithGroup(indices.map(i => this.lessons.get(i)));
  }

  _openWithGroup(parts) {
    const sep      = s => s.indexOf(' · ');
    const getTitle = s => sep(s) > -1 ? s.slice(0, sep(s)) : s;
    const getSub   = s => sep(s) > -1 ? s.slice(sep(s) + 3) : s;
    const sections = parts.map(l => ({ id: l.id, title: getSub(l.title), zh: l.zh, py: l.py, vi: l.vi }));
    this._openWith({
      id: sections[0].id, book: parts[0].book,
      title: getTitle(parts[0].title),
      desc:  `${parts.length} bài đọc`,
      sections,
      zh: sections[0].zh, py: sections[0].py, vi: sections[0].vi,
    });
  }

  _openWith(lesson) {
    this.currentLesson = lesson;
    this.vocab.items   = [];
    this.selection.clear();
    this.chat.reset();

    const vl = document.getElementById('vocab-list');
    if (vl) vl.innerHTML = '';
    ['csv-btn','ws-btn','addall-btn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const btn = document.getElementById('gen-btn');
    if (btn) { btn.disabled = false; btn.textContent = 'Phân tích & tạo từ vựng'; }

    this.reading.open(lesson);
    this.chat.show();

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const vr = document.getElementById('view-reading');
    if (vr) vr.classList.add('active');
    document.querySelectorAll('.app-tab').forEach(t => t.classList.remove('active'));
    const tabs = document.querySelectorAll('.app-tab');
    if (tabs[0]) tabs[0].classList.add('active');

    document.title = (lesson.title || 'Bài đọc') + ' — TOCFL FAFA';
    this.config.updateUI();
    this.vocab.load(lesson);
  }
}

const app = new ChineseApp();
app.init();
