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
      '<div class="chat-msg system">Hỏi bất kỳ điều gì về bài đọc này.<br><span style="font-size:10px;opacity:.7">Gõ "add 詞, 詞, 詞" để thêm từ vào danh sách từ vựng.</span></div>';
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

    // "add 漢字, 漢字, ..." command — add one or many words to vocab
    const addMatch = msg.match(/^add\s+(.+)/i);
    if (addMatch) {
      const words = addMatch[1]
        .split(/[,，、]/)
        .map(w => w.trim())
        .filter(w => /[一-鿿㐀-䶿]/.test(w));
      if (words.length) {
        words.forEach(w => app.vocab.addUserEntry(w));
        const labels = words.map(w => `「${w}」`).join(' ');
        msgs.innerHTML += `<div class="chat-msg system">✓ Đã thêm ${words.length} từ: ${labels}</div>`;
        msgs.scrollTop = msgs.scrollHeight;
        return;
      }
    }

    this.history.push({ role: 'user', content: msg });

    if (!app.config.getKey()) {
      msgs.innerHTML += `<div class="chat-msg system">⚠ Chưa có API key.</div>`;
      msgs.scrollTop = msgs.scrollHeight;
      return;
    }

    const loadId = 'cl-' + Date.now();
    msgs.innerHTML += `<div class="chat-msg bot" id="${loadId}"></div>`;
    msgs.scrollTop = msgs.scrollHeight;

    const sys = `Bạn là trợ lý dạy tiếng Trung phồn thể Đài Loan (繁體中文，台灣) cho người Việt. Trả lời dựa trên ngữ cảnh bài đọc. Khi viết chữ Hán phải dùng phồn thể. Ngắn gọn.\n\nBÀI ĐỌC:\n${lesson.zh}\n\nPINYIN:\n${lesson.py}\n\nTIẾNG VIỆT:\n${lesson.vi}`;
    try {
      const el = document.getElementById(loadId);
      const reply = await this.ai.callStream(sys, null, 800, this.history, chunk => {
        if (el) { el.textContent += chunk; msgs.scrollTop = msgs.scrollHeight; }
      });
      this.history.push({ role: 'assistant', content: reply });
    } catch (e) {
      const el = document.getElementById(loadId);
      if (el) el.outerHTML = `<div class="chat-msg system">❌ ${e.message}</div>`;
    }
    msgs.scrollTop = msgs.scrollHeight;
  }
}
