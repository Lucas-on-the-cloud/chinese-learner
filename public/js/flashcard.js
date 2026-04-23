class FlashcardManager {
  constructor(db) {
    this.db         = db;
    this.cards      = [];
    this.studying   = [];
    this.studyIdx   = 0;
    this.mode       = 'browse';
    this.studyLbl   = '';
    this._keyHandler = this._handleKey.bind(this);
  }

  _handleKey(e) {
    if (this.mode !== 'study') return;
    if (e.code === 'Space') {
      e.preventDefault();
      document.getElementById('fc')?.classList.toggle('flipped');
    } else if (e.code === 'ArrowLeft') {
      this.navigate(-1);
    } else if (e.code === 'ArrowRight') {
      this.navigate(1);
    }
  }

  async load() {
    const data = await this.db.getFlashcards();
    if (data) this.cards = data.map(f => ({
      char:          f.char,
      pinyin:        f.pinyin        || '',
      meaning:       f.meaning       || '',
      lesson_id:     f.lesson_id     ?? null,
      lesson_title:  f.lesson_title  || 'Chưa phân loại',
      book:          f.book          || 'B1'
    }));
  }

  has(char) { return this.cards.some(f => f.char === char); }

  async add(vocabIndex) {
    const v = app.vocab.items[vocabIndex];
    const L = app.currentLesson;
    if (!v || this.has(v.char)) return;
    const card = {
      char: v.char, pinyin: v.pinyin || '', meaning: v.meaning || '',
      lesson_id: L?.id ?? null, lesson_title: L?.title || '', book: L?.book || 'B1'
    };
    await this.db.addFlashcard(card);
    this.cards.push(card);
    const btn = document.getElementById('fb' + vocabIndex);
    if (btn) { btn.textContent = '✓'; btn.classList.add('added'); }
  }

  async addBulk() {
    const L = app.currentLesson;
    const newItems = app.vocab.items.filter(v => !this.has(v.char));
    if (!newItems.length) return;
    const rows = newItems.map(v => ({
      char: v.char, pinyin: v.pinyin || '', meaning: v.meaning || '',
      lesson_id: L?.id ?? null, lesson_title: L?.title || '', book: L?.book || 'B1'
    }));
    const { error } = await this.db.addFlashcards(rows);
    if (error) { alert('Lỗi: ' + error.message); return; }
    rows.forEach(r => this.cards.push(r));
    app.vocab.render();
  }

  startStudy(book, lessonKey) {
    let cards;
    if (lessonKey === '__all__') {
      cards = this.cards;
      this.studyLbl = `Tất cả · ${cards.length} thẻ`;
    } else if (lessonKey === '__book__') {
      cards = this.cards.filter(c => (c.book || 'B1') === book);
      this.studyLbl = `Quyển ${book} · ${cards.length} thẻ`;
    } else if (lessonKey === '__uncat__') {
      cards = this.cards.filter(c => c.lesson_id == null);
      this.studyLbl = `Chưa phân loại · ${cards.length} thẻ`;
    } else {
      cards = this.cards.filter(c => c.lesson_id === lessonKey);
      this.studyLbl = (cards[0]?.lesson_title || '') + ` · ${cards.length} thẻ`;
    }
    if (!cards.length) return;
    this.studying = cards;
    this.studyIdx = 0;
    this.mode = 'study';
    document.addEventListener('keydown', this._keyHandler);
    this.render();
  }

  navigate(dir) {
    this.studyIdx = (this.studyIdx + dir + this.studying.length) % this.studying.length;
    this.render();
  }

  backToBrowse() {
    document.removeEventListener('keydown', this._keyHandler);
    this.mode = 'browse';
    this.render();
  }

  render() {
    if (this.mode === 'study') this._renderStudy();
    else this._renderBrowse();
  }

  _renderBrowse() {
    const area = document.getElementById('fc-area');
    document.getElementById('fc-count').textContent = this.cards.length + ' thẻ';

    if (!this.cards.length) {
      area.innerHTML = `<div class="empty-state"><div class="big">學</div><p>Chưa có flashcard.<br>Mở bài đọc và thêm từ vựng.</p></div>`;
      return;
    }

    const EMOJIS = ['📘', '📗', '📒', '📕', '📙'];
    const books  = [...new Set(this.cards.map(c => c.book || 'B1'))].sort();

    const booksHTML = books.map((book, bi) => {
      const bookCards = this.cards.filter(c => (c.book || 'B1') === book);
      const emoji = EMOJIS[bi % EMOJIS.length];

      const lessonMap = new Map();
      bookCards.forEach(c => {
        const key = c.lesson_id ?? '__uncat__';
        if (!lessonMap.has(key)) lessonMap.set(key, { title: c.lesson_title || 'Chưa phân loại', id: c.lesson_id });
        lessonMap.get(key);
      });
      // rebuild with counts
      const lessonCounts = new Map();
      bookCards.forEach(c => {
        const key = c.lesson_id ?? '__uncat__';
        lessonCounts.set(key, (lessonCounts.get(key) || 0) + 1);
      });

      const lessonsHTML = [...lessonCounts.entries()].map(([key, count]) => {
        const title = bookCards.find(c => (c.lesson_id ?? '__uncat__') === key)?.lesson_title || 'Chưa phân loại';
        const keyArg = (key === '__uncat__') ? `'__uncat__'` : key;
        return `<div class="fc-lesson-row">
          <span class="fc-lesson-name">📖 ${title}</span>
          <span class="fc-lesson-right">
            <span class="fc-cnt">${count} thẻ</span>
            <button class="fc-study-btn" onclick="app.flashcards.startStudy('${book}', ${keyArg})">▶ Học</button>
          </span>
        </div>`;
      }).join('');

      return `<div class="fc-book-section">
        <div class="fc-book-hd">
          <span class="fc-book-name">${emoji} Quyển sách ${book} <span class="fc-cnt">(${bookCards.length} thẻ)</span></span>
          <button class="fc-study-btn" onclick="app.flashcards.startStudy('${book}', '__book__')">▶ Học tất cả</button>
        </div>
        <div class="fc-lesson-list">${lessonsHTML}</div>
      </div>`;
    }).join('');

    area.innerHTML = `<div class="fc-browse">
      ${booksHTML}
      <div class="fc-browse-footer">
        <button class="fc-study-btn fc-study-all" onclick="app.flashcards.startStudy('', '__all__')">▶ Học tất cả ${this.cards.length} thẻ</button>
        <button class="clear-btn" onclick="app.flashcards.clear()">🗑 Xóa tất cả</button>
      </div>
    </div>`;
  }

  _renderStudy() {
    const area = document.getElementById('fc-area');
    const c = this.studying[this.studyIdx];
    document.getElementById('fc-count').textContent = this.cards.length + ' thẻ';
    area.innerHTML = `
      <div class="fc-study-hd">
        <button class="back-btn" onclick="app.flashcards.backToBrowse()">← Danh sách</button>
        <span class="fc-study-lbl">${this.studyLbl}</span>
      </div>
      <div class="flashcard-wrap">
        <div class="flashcard" id="fc" onclick="document.getElementById('fc').classList.toggle('flipped')">
          <div class="flashcard-inner">
            <div class="flashcard-front"><div class="fc-char">${c.char}</div><div class="fc-hint">Nhấn để xem</div></div>
            <div class="flashcard-back"><div class="fc-pinyin-back">${c.pinyin}</div><div class="fc-meaning-back">${c.meaning}</div><div class="fc-char-back">${c.char}</div></div>
          </div>
        </div>
        <button class="vocab-btn write-btn" style="font-size:11px;padding:5px 14px" onclick="app.handwriting.open('${esc(c.char)}','${esc(c.pinyin)}','${esc(c.meaning)}')">✏️ Viết</button>
        <div class="fc-nav">
          <button class="fc-nav-btn" onclick="app.flashcards.navigate(-1)">‹</button>
          <span class="fc-progress">${this.studyIdx + 1} / ${this.studying.length}</span>
          <button class="fc-nav-btn" onclick="app.flashcards.navigate(1)">›</button>
        </div>
      </div>`;
  }

  async clear() {
    if (!confirm('Xóa tất cả flashcard?')) return;
    document.removeEventListener('keydown', this._keyHandler);
    await this.db.clearFlashcards();
    this.cards = []; this.studying = []; this.studyIdx = 0; this.mode = 'browse';
    this.render();
  }
}
