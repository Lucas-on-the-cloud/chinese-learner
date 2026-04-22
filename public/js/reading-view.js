class ReadingView {
  constructor() {
    this.lesson = null;
  }

  open(lesson) {
    this.lesson = lesson;
    document.getElementById('r-title').textContent = lesson.title;
    document.getElementById('r-desc').textContent = lesson.desc || '';
    document.getElementById('chat-msgs').innerHTML = '<div class="chat-msg system">Hỏi bất kỳ điều gì về bài đọc này.</div>';
    document.querySelectorAll('.text-tab').forEach((t, j) => t.classList.toggle('active', j === 0));
    document.getElementById('text-paired').style.display = 'block';
    document.getElementById('text-vi').style.display = 'none';
    this._renderInterleaved();
    this._renderVietnamese();
  }

  setMode(btn, mode) {
    document.querySelectorAll('.text-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('text-paired').style.display = (mode === 'paired' || mode === 'all') ? 'block' : 'none';
    document.getElementById('text-vi').style.display   = (mode === 'vietnamese' || mode === 'all') ? 'block' : 'none';
    app.selection.clear();
  }

  _wrapChars(text, prefix, cls) {
    let i = 0;
    return [...text].map(c => {
      if (c === '\n') return '<br>';
      const id = i++;
      return `<span class="${cls}-char" data-g="${prefix}" data-i="${id}" onclick="app.selection.charClick('${prefix}',${id})">${c}</span>`;
    }).join('');
  }

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
}
