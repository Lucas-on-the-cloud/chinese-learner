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
    this.vocab       = new VocabManager(this.ai);
    this.flashcards  = new FlashcardManager(db);
    this.chat        = new ChatManager(this.ai);
    this.handwriting = new HandwritingModal();
    this.worksheet   = new WorksheetManager();
    this.currentLesson = null;
  }

  async init() {
    await this.lessons.load();
    await this.flashcards.load();
    this.lessons.renderGrid();
    this.flashcards.render();
    this.config.updateUI();
  }

  showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('view-' + name).classList.add('active');
    document.querySelectorAll('.nav-tab')[{ lessons: 0, flashcards: 1, upload: 2 }[name]].classList.add('active');
    if (name === 'flashcards') this.flashcards.render();
    this.selection.clear();
  }

  openLesson(index) {
    this.currentLesson = this.lessons.get(index);
    this.vocab.items   = [];
    this.selection.clear();
    this.chat.reset();
    document.getElementById('vocab-list').innerHTML    = '';
    document.getElementById('csv-btn').style.display  = 'none';
    document.getElementById('ws-btn').style.display   = 'none';
    const btn = document.getElementById('gen-btn');
    btn.disabled   = false;
    btn.textContent = 'Phân tích & tạo từ vựng';
    this.reading.open(this.currentLesson);
    // Reading is a sub-view; keep lessons nav tab active
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('view-reading').classList.add('active');
    document.querySelectorAll('.nav-tab')[0].classList.add('active');
    this.config.updateUI();
  }

  async submitLesson() {
    const ok = await this.lessons.addLesson();
    if (ok) { await this.init(); this.showView('lessons'); }
  }
}

const app = new ChineseApp();
app.init();
