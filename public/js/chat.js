class ChatManager {
  constructor(ai) {
    this.ai      = ai;
    this.history = [];
  }

  reset() { this.history = []; }

  async send() {
    const lesson = app.currentLesson;
    const inp    = document.getElementById('chat-input');
    const msg    = inp.value.trim();
    if (!msg) return;
    inp.value = '';

    const msgs = document.getElementById('chat-msgs');
    msgs.innerHTML += `<div class="chat-msg user">${msg}</div>`;
    msgs.scrollTop = msgs.scrollHeight;
    this.history.push({ role: 'user', content: msg });

    if (!app.config.getKey()) {
      msgs.innerHTML += `<div class="chat-msg system">⚠ Chưa có API key.</div>`;
      msgs.scrollTop = msgs.scrollHeight;
      return;
    }

    msgs.innerHTML += `<div class="chat-msg bot" id="cl">⏳ ...</div>`;
    msgs.scrollTop = msgs.scrollHeight;

    const sys = `Bạn là trợ lý dạy tiếng Trung cho người Việt. Trả lời dựa trên bài đọc. Ngắn gọn.\n\nBÀI ĐỌC:\n${lesson.zh}\n\nPINYIN:\n${lesson.py}\n\nTIẾNG VIỆT:\n${lesson.vi}`;
    try {
      const reply = await this.ai.call(sys, null, 800, this.history);
      this.history.push({ role: 'assistant', content: reply });
      document.getElementById('cl').outerHTML = `<div class="chat-msg bot">${reply}</div>`;
    } catch (e) {
      document.getElementById('cl').outerHTML = `<div class="chat-msg system">❌ ${e.message}</div>`;
    }
    msgs.scrollTop = msgs.scrollHeight;
  }
}
