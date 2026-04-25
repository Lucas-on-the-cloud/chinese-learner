class SelectionManager {
  constructor() {
    this._text  = '';
    this._spans = [];
    document.addEventListener('mouseup',   e => this._onMouseUp(e));
    document.addEventListener('mousedown', e => {
      if (!e.target.closest('#sel-bar')) this.clear();
    });
  }

  _onMouseUp(e) {
    if (e.target.closest('#sel-bar')) return;
    // delay so the browser finalises the selection before we read it
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;

      const range    = sel.getRangeAt(0);
      const allSpans = [...document.querySelectorAll('.zh-char, .vi-char')];
      const selected = allSpans.filter(s => range.intersectsNode(s));
      if (!selected.length) return;

      this._text  = selected.map(s => s.textContent).join('');
      this._spans = selected;
      selected.forEach(s => s.classList.add('selecting'));

      const rect = range.getBoundingClientRect();
      this._showBar(rect);
    }, 0);
  }

  getText() { return this._text; }

  highlight(cls) {
    this._spans.forEach(s => {
      s.classList.remove('hl-1', 'hl-2', 'hl-3', 'hl-4', 'selecting');
      s.classList.add(cls);
    });
    this.clear();
  }

  removeHighlight() {
    this._spans.forEach(s =>
      s.classList.remove('hl-1', 'hl-2', 'hl-3', 'hl-4', 'selecting')
    );
    this.clear();
  }

  addToVocab() {
    if (!this._text) return;
    app.vocab.addUserEntry(this._text);
    this.clear();
  }

  clear() {
    this._clearVisual();
    this._text  = '';
    this._spans = [];
    const bar = document.getElementById('sel-bar');
    if (bar) bar.classList.remove('show');
    window.getSelection()?.removeAllRanges();
  }

  _clearVisual() {
    document.querySelectorAll('.zh-char.selecting, .vi-char.selecting')
      .forEach(s => s.classList.remove('selecting'));
  }

  _showBar(rect) {
    const bar = document.getElementById('sel-bar');
    if (!bar) return;
    document.getElementById('sel-word').textContent = this._text;
    const midX     = (rect.left + rect.right) / 2;
    const hw       = 160;
    const clampedX = Math.max(hw + 8, Math.min(window.innerWidth - hw - 8, midX));
    bar.style.left      = clampedX + 'px';
    bar.style.top       = (rect.top - 10) + 'px';
    bar.style.transform = 'translate(-50%, -100%)';
    bar.classList.add('show');
  }
}
