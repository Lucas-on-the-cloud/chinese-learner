class HandwritingModal {
  constructor() {
    this.writer    = null;
    this.mode      = 'a';
    this.chars     = [];
    this.charIndex = 0;
    this.done      = [];
  }

  open(word, pinyin, meaning) {
    this.chars     = [...word];
    this.charIndex = 0;
    this.done      = this.chars.map(() => false);
    this.mode      = 'a';
    document.getElementById('hw-title').textContent = word;
    document.getElementById('hw-py').textContent    = pinyin;
    document.getElementById('hw-mg').textContent    = meaning;
    document.getElementById('hw-sc').textContent    = '';
    document.getElementById('mt-a').classList.add('active');
    document.getElementById('mt-q').classList.remove('active');
    document.getElementById('hw-ca').style.display = 'flex';
    document.getElementById('hw-cq').style.display = 'none';
    this._renderNav();
    document.getElementById('hw-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    this._loadChar(0);
  }

  selectChar(i) {
    this.charIndex = i;
    this._renderNav();
    this._loadChar(i);
  }

  setMode(mode) {
    this.mode = mode;
    document.getElementById('mt-a').classList.toggle('active', mode === 'a');
    document.getElementById('mt-q').classList.toggle('active', mode === 'q');
    document.getElementById('hw-ca').style.display = mode === 'a' ? 'flex' : 'none';
    document.getElementById('hw-cq').style.display = mode === 'q' ? 'flex' : 'none';
    document.getElementById('hw-sc').textContent   = '';
    if (this.writer) {
      try { this.writer.cancelQuiz(); this.writer.showCharacter({ duration: 0 }); } catch (e) {}
    }
  }

  animate() {
    if (this.writer) { this.writer.showCharacter({ duration: 0 }); this.writer.animateCharacter(); }
  }

  loop() {
    if (this.writer) this.writer.loopCharacterAnimation();
  }

  quiz() {
    if (!this.writer) return;
    this.writer.hideCharacter({ duration: 0 });
    this.writer.showOutline({ duration: 0 });
    document.getElementById('hw-sc').textContent = `Viết: ${this.chars[this.charIndex]} (${this.charIndex + 1}/${this.chars.length})`;
    this.writer.quiz({
      showHintAfterMisses: 3,
      markStrokeCorrectAfterMisses: 5,
      onMistake: d => {
        document.getElementById('hw-sc').textContent = `❌ ${d.totalMistakes} lỗi — còn ${d.strokesRemaining} nét`;
        document.getElementById('hw-sc').className   = 'hw-score bad';
      },
      onCorrectStroke: d => {
        document.getElementById('hw-sc').textContent = `✓ Còn ${d.strokesRemaining} nét`;
        document.getElementById('hw-sc').className   = 'hw-score good';
      },
      onComplete: d => {
        this.done[this.charIndex] = true;
        this._renderNav();
        if (this.charIndex < this.chars.length - 1) {
          document.getElementById('hw-sc').textContent = `✓ Xong "${this.chars[this.charIndex]}"!`;
          setTimeout(() => { this.charIndex++; this._renderNav(); this._loadChar(this.charIndex); }, 700);
        } else {
          document.getElementById('hw-sc').textContent = this.chars.length > 1
            ? `🎉 Xong "${this.chars.join('')}"!`
            : (d.totalMistakes === 0 ? '🎉!!' : `✅ ${d.totalMistakes} lỗi`);
          document.getElementById('hw-sc').className = 'hw-score good';
        }
      }
    });
  }

  reset() {
    this.done      = this.chars.map(() => false);
    this.charIndex = 0;
    this._renderNav();
    this._loadChar(0);
    document.getElementById('hw-sc').textContent = '';
  }

  close() {
    if (this.writer) { try { this.writer.cancelQuiz(); } catch (e) {} }
    document.getElementById('hw-overlay').classList.remove('open');
    document.body.style.overflow = '';
  }

  _renderNav() {
    document.getElementById('hw-nav').innerHTML = this.chars.map((c, i) =>
      `<div class="hw-pip${i === this.charIndex ? ' active' : ''}${this.done[i] ? ' done' : ''}" onclick="app.handwriting.selectChar(${i})">${c}</div>`
    ).join('');
  }

  _loadChar(i) {
    const t = document.getElementById('hw-target');
    Array.from(t.children).forEach(c => { if (!c.classList.contains('hw-grid')) c.remove(); });
    if (this.writer) { try { this.writer.cancelQuiz(); } catch (e) {} this.writer = null; }
    setTimeout(() => {
      this.writer = HanziWriter.create('hw-target', this.chars[i], {
        width: 200, height: 200, padding: 12, showOutline: true,
        strokeColor: '#1a1208', outlineColor: '#ddd5c8', drawingColor: '#c0392b',
        drawingWidth: 5, highlightColor: '#1a6b5a', radicalColor: '#b8860b',
        strokeAnimationSpeed: 1, delayBetweenStrokes: 350,
        showHintAfterMisses: 3, markStrokeCorrectAfterMisses: 5, highlightOnComplete: true
      });
      if (this.mode === 'q') this.quiz();
    }, 50);
  }
}
