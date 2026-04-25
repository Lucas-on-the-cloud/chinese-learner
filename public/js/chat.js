class ChatManager {
  constructor(ai) {
    this.ai      = ai;
    this.history = [];
    this.isOpen  = false;
  }

  reset() {
    this.history = [];
    this.isOpen  = false;
    document.getElementById('chat-float-panel').classList.remove('open');
    document.getElementById('chat-msgs').innerHTML =
      '<div class="chat-msg system">Hỏi bất kỳ điều gì về bài đọc này.</div>';
  }

  show() { document.getElementById('chat-widget').classList.add('active'); }
  hide() { document.getElementById('chat-widget').classList.remove('active'); }

  toggle() {
    this.isOpen = !this.isOpen;
    document.getElementById('chat-float-panel').classList.toggle('open', this.isOpen);
    if (this.isOpen) {
      const msgs = document.getElementById('chat-msgs');
      msgs.scrollTop = msgs.scrollHeight;
      setTimeout(() => document.getElementById('chat-input').focus(), 50);
    }
  }

  async send() {
    const lesson = app.currentLesson;
    const inp    = document.getElementById('chat-input');
    const msg    = inp.value.trim();
    if (!msg) return;
    inp.value = '';

    if (!this.isOpen) this.toggle();

    const msgs = document.getElementById('chat-msgs');
    msgs.innerHTML += `<div class="chat-msg user">${msg}</div>`;
    msgs.scrollTop = msgs.scrollHeight;
    this.history.push({ role: 'user', content: msg });

    if (!app.config.getKey()) {
      msgs.innerHTML += `<div class="chat-msg system">⚠ Chưa có API key.</div>`;
      msgs.scrollTop = msgs.scrollHeight;
      return;
    }

    const loadId = 'cl-' + Date.now();
    msgs.innerHTML += `<div class="chat-msg bot" id="${loadId}">⏳ ...</div>`;
    msgs.scrollTop = msgs.scrollHeight;

    const sys = `Bạn là trợ lý dạy tiếng Trung cho người Việt. Trả lời dựa trên bài đọc. Ngắn gọn.\n\nBÀI ĐỌC:\n${lesson.zh}\n\nPINYIN:\n${lesson.py}\n\nTIẾNG VIỆT:\n${lesson.vi}`;
    try {
      const reply = await this.ai.call(sys, null, 800, this.history);
      this.history.push({ role: 'assistant', content: reply });
      const el = document.getElementById(loadId);
      if (el) el.innerHTML = reply +
        `<div class="msg-actions"><button class="msg-add-btn" onclick="app.chat.addVocabFromMsg(this)">📚 Lưu từ vựng</button></div>`;
    } catch (e) {
      const el = document.getElementById(loadId);
      if (el) el.outerHTML = `<div class="chat-msg system">❌ ${e.message}</div>`;
    }
    msgs.scrollTop = msgs.scrollHeight;
  }

  async addVocabFromMsg(btn) {
    const msgEl  = btn.closest('.chat-msg');
    // grab only text nodes (skip the msg-actions div)
    const msgText = [...msgEl.childNodes]
      .filter(n => n.nodeType === Node.TEXT_NODE || (n.nodeType === Node.ELEMENT_NODE && !n.classList.contains('msg-actions')))
      .map(n => n.textContent)
      .join('').trim();
    if (!msgText) return;

    btn.disabled    = true;
    btn.textContent = '...';
    try {
      const raw = await app.ai.call(
        `Trích xuất 1-3 từ vựng tiếng Trung quan trọng nhất. JSON thuần, không markdown:\n[{"char":"字","pinyin":"zì","meaning":"nghĩa tiếng Việt","example":"câu ví dụ","exPinyin":"pinyin ví dụ","exMeaning":"nghĩa câu ví dụ","level":"cơ bản"}]`,
        `Đoạn: ${msgText}`,
        600
      );
      const parsed = JSON.parse(raw.trim().replace(/^```json\s*/, '').replace(/\s*```$/, ''));
      let added = 0;
      parsed.forEach(v => {
        if (!app.vocab.items.some(i => i.char === v.char)) {
          app.vocab.items.push({ ...v, userAdded: true });
          added++;
        }
      });
      app.vocab.render();
      document.getElementById('ws-btn').style.display  = app.vocab.items.length ? 'inline-block' : 'none';
      document.getElementById('csv-btn').style.display = app.vocab.items.length ? 'inline-block' : 'none';
      btn.textContent = added ? `✓ Lưu ${added} từ` : '✓ Đã có';
    } catch (e) {
      btn.textContent = '❌';
      btn.disabled    = false;
    }
  }
}
