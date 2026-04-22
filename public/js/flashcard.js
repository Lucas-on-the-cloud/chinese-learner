class FlashcardManager {
  constructor(db) {
    this.db    = db;
    this.cards = [];
    this.index = 0;
  }

  async load() {
    const data = await this.db.getFlashcards();
    if (data) this.cards = data.map(f => ({ char: f.char, pinyin: f.pinyin, meaning: f.meaning }));
  }

  has(char) { return this.cards.some(f => f.char === char); }

  async add(vocabIndex) {
    const v = app.vocab.items[vocabIndex];
    if (!v || this.has(v.char)) return;
    await this.db.addFlashcard({ char: v.char, pinyin: v.pinyin || '', meaning: v.meaning || '' });
    this.cards.push({ char: v.char, pinyin: v.pinyin || '', meaning: v.meaning || '' });
    const btn = document.getElementById('fb' + vocabIndex);
    if (btn) { btn.textContent = '✓'; btn.classList.add('added'); }
  }

  navigate(dir) {
    this.index = (this.index + dir + this.cards.length) % this.cards.length;
    this.render();
  }

  render() {
    const area = document.getElementById('fc-area');
    document.getElementById('fc-count').textContent = this.cards.length + ' thẻ';
    if (!this.cards.length) {
      area.innerHTML = `<div class="empty-state"><div class="big">學</div><p>Chưa có flashcard.</p></div>`;
      return;
    }
    if (this.index >= this.cards.length) this.index = 0;
    const c = this.cards[this.index];
    area.innerHTML = `<div class="flashcard-wrap">
      <div class="flashcard" id="fc" onclick="document.getElementById('fc').classList.toggle('flipped')">
        <div class="flashcard-inner">
          <div class="flashcard-front"><div class="fc-char">${c.char}</div><div class="fc-hint">Nhấn để xem</div></div>
          <div class="flashcard-back"><div class="fc-pinyin-back">${c.pinyin}</div><div class="fc-meaning-back">${c.meaning}</div><div class="fc-char-back">${c.char}</div></div>
        </div>
      </div>
      <button class="vocab-btn write-btn" style="font-size:11px;padding:5px 14px" onclick="app.handwriting.open('${esc(c.char)}','${esc(c.pinyin)}','${esc(c.meaning)}')">✏️ Viết</button>
      <div class="fc-nav">
        <button class="fc-nav-btn" onclick="app.flashcards.navigate(-1)">‹</button>
        <span class="fc-progress">${this.index + 1}/${this.cards.length}</span>
        <button class="fc-nav-btn" onclick="app.flashcards.navigate(1)">›</button>
      </div>
    </div>`;
  }

  async clear() {
    if (!confirm('Xóa tất cả flashcard?')) return;
    await this.db.clearFlashcards();
    this.cards = []; this.index = 0; this.render();
  }
}
