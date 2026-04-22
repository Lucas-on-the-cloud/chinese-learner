class SelectionManager {
  constructor() {
    this.start  = -1;
    this.end    = -1;
    this.target = '';
  }

  charClick(group, idx) {
    const all = document.querySelectorAll(`[data-g="${group}"]`);
    if (this.start === -1 || this.target !== group) {
      this._clearVisual();
      this.target = group; this.start = idx; this.end = -1;
      all[idx].classList.add('selecting');
      this._updateBar();
    } else if (this.end === -1) {
      this.end = idx;
      if (this.end < this.start) { const t = this.start; this.start = this.end; this.end = t; }
      all.forEach((s, i) => s.classList.toggle('selecting', i >= this.start && i <= this.end));
      this._updateBar();
    } else {
      this._clearVisual();
      this.target = group; this.start = idx; this.end = -1;
      all[idx].classList.add('selecting');
      this._updateBar();
    }
  }

  getText() {
    const all = document.querySelectorAll(`[data-g="${this.target}"]`);
    const end = this.end === -1 ? this.start : this.end;
    let t = '';
    for (let i = this.start; i <= end; i++) t += all[i].textContent;
    return t;
  }

  highlight(cls) {
    if (this.start === -1) return;
    const all = document.querySelectorAll(`[data-g="${this.target}"]`);
    const end = this.end === -1 ? this.start : this.end;
    for (let i = this.start; i <= end; i++) {
      all[i].classList.remove('hl-1', 'hl-2', 'hl-3', 'hl-4', 'selecting');
      all[i].classList.add(cls);
    }
    this.clear();
  }

  removeHighlight() {
    if (this.start === -1) return;
    const all = document.querySelectorAll(`[data-g="${this.target}"]`);
    const end = this.end === -1 ? this.start : this.end;
    for (let i = this.start; i <= end; i++)
      all[i].classList.remove('hl-1', 'hl-2', 'hl-3', 'hl-4', 'selecting');
    this.clear();
  }

  addToVocab() {
    const t = this.getText();
    if (!t) return;
    app.vocab.addUserEntry(t);
    this.clear();
  }

  clear() {
    this.start = -1; this.end = -1;
    this._clearVisual();
    document.getElementById('sel-bar').classList.remove('show');
  }

  _clearVisual() {
    document.querySelectorAll('.zh-char.selecting,.vi-char.selecting')
      .forEach(s => s.classList.remove('selecting'));
  }

  _updateBar() {
    const t = this.getText();
    const bar = document.getElementById('sel-bar');
    if (!t) { bar.classList.remove('show'); return; }
    document.getElementById('sel-word').textContent = t;
    bar.classList.add('show');
  }
}
