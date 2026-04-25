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
    if (document.getElementById('lesson-grid')) this.lessons.renderGrid();
    if (document.getElementById('fc-area'))     this.flashcards.render();
    this.config.updateUI();
  }

  showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.app-tab').forEach(t => t.classList.remove('active'));
    const viewEl = document.getElementById('view-' + name);
    if (viewEl) viewEl.classList.add('active');
    const tabMap = { lessons: 0, reading: 0, upload: 1 };
    const tabs = document.querySelectorAll('.app-tab');
    const idx = tabMap[name];
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

    const parts = indices.map(i => this.lessons.get(i));

    const getGroupTitle = (title) => {
      const sep = title.indexOf(' · ');
      return sep > -1 ? title.slice(0, sep) : title;
    };
    const getSubLabel = (title) => {
      const sep = title.indexOf(' · ');
      return sep > -1 ? title.slice(sep + 3) : title;
    };

    // Each section keeps its own DB id so vocab caches independently
    const sections = parts.map(l => ({
      id:    l.id,
      title: getSubLabel(l.title),
      zh:    l.zh,
      py:    l.py,
      vi:    l.vi,
    }));

    const combined = {
      id:       sections[0].id,
      book:     parts[0].book,
      title:    getGroupTitle(parts[0].title),
      desc:     `${parts.length} bài đọc`,
      sections,
      // Active text starts at section 0 — reading-view updates these on navigation
      zh: sections[0].zh,
      py: sections[0].py,
      vi: sections[0].vi,
    };

    this._openWith(combined);
  }

  _openWith(lesson) {
    this.currentLesson = lesson;
    this.vocab.items   = [];
    this.selection.clear();
    this.chat.reset();
    document.getElementById('vocab-list').innerHTML    = '';
    document.getElementById('csv-btn').style.display    = 'none';
    document.getElementById('ws-btn').style.display     = 'none';
    document.getElementById('addall-btn').style.display = 'none';
    const btn = document.getElementById('gen-btn');
    btn.disabled    = false;
    btn.textContent = 'Phân tích & tạo từ vựng';
    this.reading.open(lesson);
    this.chat.show();
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-reading').classList.add('active');
    document.querySelectorAll('.app-tab').forEach(t => t.classList.remove('active'));
    const tabs = document.querySelectorAll('.app-tab');
    if (tabs[0]) tabs[0].classList.add('active');
    this.config.updateUI();
    this.vocab.load(lesson);
  }
}

const app = new ChineseApp();
app.init();
