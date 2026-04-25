class VocabManager {
  constructor(ai, db) {
    this.ai    = ai;
    this.db    = db;
    this.items = [];
    this.DEMO  = {
      1: [
        { char: '生活習慣', pinyin: 'shēnghuó xíguàn', meaning: 'thói quen sinh hoạt', example: '大學生的生活習慣普通不是很好', exPinyin: 'dàxuéshēng de shēnghuó xíguàn pǔtōng bù shì hěn hǎo', exMeaning: 'Thói quen SH của SV thường không tốt', level: 'trung cấp' },
        { char: '上網',     pinyin: 'shàngwǎng',        meaning: 'lên mạng',           example: '尤其是上網',                   exPinyin: 'yóuqí shì shàngwǎng',                                    exMeaning: 'đặc biệt là lên mạng',                level: 'cơ bản'   },
        { char: '深夜',     pinyin: 'shēnyè',           meaning: 'đêm khuya',          example: '不知不覺就已經深夜了',         exPinyin: 'bùzhī bùjué jiù yǐjīng shēnyè le',                      exMeaning: 'không hay biết đã khuya',             level: 'cơ bản'   },
        { char: '期末考',   pinyin: 'qīmò kǎo',         meaning: 'thi cuối kỳ',        example: '就又得準備期末考',             exPinyin: 'jiù yòu děi zhǔnbèi qīmò kǎo',                          exMeaning: 'lại phải chuẩn bị thi cuối kỳ',       level: 'trung cấp' },
        { char: '健康',     pinyin: 'jiànkāng',         meaning: 'sức khỏe',           example: '健康亮起了紅燈',               exPinyin: 'jiànkāng liàngqǐ le hóngdēng',                          exMeaning: 'sức khỏe bật đèn đỏ',                level: 'cơ bản'   },
        { char: '開夜車',   pinyin: 'kāi yèchē',        meaning: 'thức đêm',           example: '不少大學生開夜車趕報告',       exPinyin: 'bùshǎo dàxuéshēng kāi yèchē gǎn bàogào',               exMeaning: 'nhiều SV thức đêm chạy báo cáo',      level: 'trung cấp' }
      ],
      2: [
        { char: '獎學金',   pinyin: 'jiǎngxuéjīn', meaning: 'học bổng',  example: '申請獎學金來付學費',   exPinyin: 'shēnqǐng jiǎngxuéjīn lái fù xuéfèi',    exMeaning: 'xin học bổng trả học phí',  level: 'trung cấp' },
        { char: '申請',     pinyin: 'shēnqǐng',    meaning: 'nộp đơn',   example: '申請獎學金',           exPinyin: 'shēnqǐng jiǎngxuéjīn',                  exMeaning: 'xin học bổng',              level: 'cơ bản'   },
        { char: '成績單',   pinyin: 'chéngjìdān',  meaning: 'bảng điểm', example: '準備一份成績單',       exPinyin: 'zhǔnbèi yī fèn chéngjìdān',             exMeaning: 'chuẩn bị bảng điểm',        level: 'trung cấp' },
        { char: '填寫',     pinyin: 'tiánxiě',     meaning: 'điền vào',  example: '填寫一張申請表',       exPinyin: 'tiánxiě yī zhāng shēnqǐng biǎo',       exMeaning: 'điền đơn',                  level: 'cơ bản'   }
      ],
      3: [
        { char: '吉他', pinyin: 'jítā',    meaning: 'guitar',    example: '學彈吉他',   exPinyin: 'xué tán jítā',   exMeaning: 'học đánh guitar',    level: 'cơ bản'   },
        { char: '免費', pinyin: 'miǎnfèi', meaning: 'miễn phí',  example: '免費借用',   exPinyin: 'miǎnfèi jièyòng', exMeaning: 'mượn miễn phí',     level: 'cơ bản'   },
        { char: '打折', pinyin: 'dǎzhé',   meaning: 'giảm giá',  example: '買吉他打折', exPinyin: 'mǎi jítā dǎzhé', exMeaning: 'mua guitar giảm giá', level: 'trung cấp' }
      ],
      4: [
        { char: '打工',   pinyin: 'dǎgōng',      meaning: 'làm thêm',  example: '一心只想著打工賺錢',   exPinyin: 'yīxīn zhǐ xiǎngzhe dǎgōng zhuànqián',    exMeaning: 'chỉ nghĩ đi làm kiếm tiền',      level: 'cơ bản'   },
        { char: '成就感', pinyin: 'chéngjiùgǎn', meaning: 'thành tựu', example: '覺得打工很有成就感',   exPinyin: 'juédé dǎgōng hěn yǒu chéngjiùgǎn',       exMeaning: 'thấy làm thêm có thành tựu',      level: 'trung cấp' },
        { char: '成熟',   pinyin: 'chéngshú',    meaning: 'chín chắn', example: '等更成熟了',           exPinyin: 'děng gèng chéngshú le',                   exMeaning: 'khi chín chắn hơn',               level: 'trung cấp' },
        { char: '動力',   pinyin: 'dònglì',      meaning: 'động lực',  example: '不同的學習動力',       exPinyin: 'bùtóng de xuéxí dònglì',                  exMeaning: 'động lực học tập khác',           level: 'cơ bản'   }
      ]
    };
  }

  async load(lesson) {
    if (!this.db || !lesson) return;
    const cached = await this.db.getVocab(lesson.id);
    if (!cached || !cached.length) return;
    this.items = cached;
    this.render();
    const btn = document.getElementById('gen-btn');
    btn.textContent = '↺ Tạo lại';
    document.getElementById('csv-btn').style.display    = 'inline-block';
    document.getElementById('ws-btn').style.display     = 'inline-block';
    document.getElementById('addall-btn').style.display = 'inline-block';
  }

  async addAll() {
    const btn = document.getElementById('addall-btn');
    btn.disabled = true;
    await app.flashcards.addBulk();
    btn.disabled = false;
    btn.textContent = '✓ Đã thêm';
    setTimeout(() => { btn.textContent = '＋ Flash tất cả'; }, 2000);
  }

  addUserEntry(char) {
    if (this.items.some(v => v.char === char)) return;
    const entry = { char, pinyin: '…', meaning: '(đang tra cứu...)', example: '', level: '', userAdded: true };
    this.items.push(entry);
    this.render();
    this._enrichEntry(entry);
  }

  async _enrichEntry(entry) {
    if (!app.config.getKey()) {
      entry.meaning = '(bạn thêm)'; entry.pinyin = '';
      this.render(); this._saveToDb(); return;
    }
    try {
      const raw = await app.ai.call(
        `Tra từ tiếng Trung phồn thể Đài Loan (繁體中文). Trả về JSON thuần (không markdown):\n{"pinyin":"...","meaning":"nghĩa tiếng Việt ngắn","example":"câu ví dụ ngắn bằng phồn thể","exPinyin":"pinyin ví dụ","exMeaning":"nghĩa câu ví dụ","level":"cơ bản"}`,
        `Từ: ${entry.char}`, 400
      );
      if (!raw) { entry.meaning = '(bạn thêm)'; entry.pinyin = ''; this.render(); this._saveToDb(); return; }
      const data = JSON.parse(raw.trim().replace(/^```json\s*/, '').replace(/\s*```$/, ''));
      Object.assign(entry, data);
      this.render();
    } catch {
      entry.meaning = '(bạn thêm)'; entry.pinyin = '';
      this.render();
    }
    this._saveToDb();
  }

  async _saveToDb() {
    const lessonId = app.currentLesson?.id;
    if (!lessonId || !this.items.length) return;
    await this.db.saveVocab(lessonId, this.items);
  }

  async generate() {
    const lesson = app.currentLesson;
    if (!lesson) return;
    if (this.items.length > 0 && !confirm('Bài này đã có từ vựng. Tạo lại bằng AI?')) return;
    const btn = document.getElementById('gen-btn');
    const ld  = document.getElementById('ai-ld');
    btn.disabled = true;
    ld.classList.add('show');
    document.getElementById('vocab-list').innerHTML = '';
    const userAdded = this.items.filter(v => v.userAdded);
    this.items = [];
    document.getElementById('ai-lt').textContent = 'AI đang phân tích...';

    const SYSTEM_PROMPT = `Bạn là giáo viên tiếng Trung phồn thể Đài Loan (繁體中文，台灣) chuyên giúp người Việt đọc hiểu. Nhiệm vụ: phân tích bài đọc và tạo danh sách 15-25 từ/cụm từ THIẾT YẾU để học viên nắm được ngữ cảnh, nhân vật, tình huống và thông điệp của bài TRƯỚC KHI đọc.

NGUYÊN TẮC BẮT BUỘC:
- Chỉ chọn từ/cụm từ có TỪ 2 CHỮ TRỞ LÊN. Tuyệt đối không chọn từ đơn 1 chữ.
- Tập trung vào 3 loại từ cấu thành câu chuyện:
  * CHỦ NGỮ (名詞/danh từ chỉ người, sự vật, khái niệm trung tâm của bài)
  * ĐỘNG TỪ / CỤM ĐỘNG TỪ (động từ hành động hoặc trạng thái quyết định diễn biến câu chuyện)
  * TÂN NGỮ (đối tượng bị tác động, kết quả, mục tiêu trong bài)
- Ưu tiên thành ngữ, cụm cố định, collocations xuất hiện trong bài
- KHÔNG chọn: từ hư (的、了、在、是、也、都), từ quá cơ bản mà người học trung cấp đã biết

Yêu cầu bắt buộc:
- Số lượng: 15-25 mục
- example PHẢI là câu/cụm NGUYÊN VĂN từ bài đọc chứa từ đó
- exMeaning giải thích nghĩa trong ngữ cảnh câu, không chỉ dịch từng chữ

Trả về JSON thuần (KHÔNG markdown, KHÔNG giải thích):
[{"char":"生活習慣","pinyin":"shēnghuó xíguàn","meaning":"thói quen sinh hoạt","example":"大學生的生活習慣普通不是很好","exPinyin":"dàxuéshēng de shēnghuó xíguàn pǔtōng bù shì hěn hǎo","exMeaning":"Thói quen sinh hoạt của sinh viên thường không tốt","level":"trung cấp"}]
level: "cơ bản" / "trung cấp" / "nâng cao"`;

    try {
      const raw = await this.ai.call(
        SYSTEM_PROMPT,
        `Bài đọc tiếng Trung:\n${lesson.zh}\n\nPinyin:\n${lesson.py}\n\nDịch tiếng Việt:\n${lesson.vi}\n\nHãy tạo 15-25 từ/cụm từ THIẾT YẾU giúp hiểu ngữ cảnh bài. JSON thuần.`,
        3500
      );
      ld.classList.remove('show');
      if (!raw) {
        this.items = [...(this.DEMO[lesson.id] || this.DEMO[1]), ...userAdded];
        this.render(); btn.textContent = '✓ Demo';
      } else {
        const parsed = JSON.parse(raw.trim().replace(/^```json\s*/, '').replace(/\s*```$/, ''));
        this.items = [...parsed, ...userAdded];
        this.render();
        btn.textContent = `✓ ${parsed.length} từ`;
        if (this.db) {
          await this.db.saveVocab(lesson.id, parsed);
          setTimeout(() => { btn.textContent = '↺ Tạo lại'; btn.disabled = false; }, 1500);
        }
      }
    } catch (e) {
      ld.classList.remove('show');
      console.error(e);
      this.items = [...(this.DEMO[lesson.id] || this.DEMO[1]), ...userAdded];
      this.render(); btn.textContent = '⚠ ' + e.message.slice(0, 30);
    }
    document.getElementById('csv-btn').style.display    = 'inline-block';
    document.getElementById('ws-btn').style.display     = 'inline-block';
    document.getElementById('addall-btn').style.display = 'inline-block';
  }

  render() {
    const bgMap = { 'cơ bản': '#e6f4f0', 'trung cấp': '#fdf6e3', 'nâng cao': '#fde8e6' };
    const txMap = { 'cơ bản': '#0f6e56', 'trung cấp': '#b8860b', 'nâng cao': '#c0392b' };
    document.getElementById('vocab-list').innerHTML = this.items.map((w, i) => {
      const inFC = app.flashcards.has(w.char);
      const bg = bgMap[w.level] || '#f3ede3';
      const tx = txMap[w.level] || '#7a6e60';
      return `<div class="vocab-item${w.userAdded ? ' user-added' : ''}">
        <div class="vocab-char" onclick="app.handwriting.open('${esc(w.char)}','${esc(w.pinyin)}','${esc(w.meaning)}')">${w.char}</div>
        <div class="vocab-details">
          <div class="vocab-pinyin">${w.pinyin || ''}${w.level ? ` <span style="background:${bg};color:${tx};font-size:9px;padding:1px 5px;border-radius:3px">${w.level}</span>` : ''}</div>
          <div class="vocab-meaning">${w.meaning || ''}</div>
          ${w.example ? `<div class="vocab-example">${w.example}</div>` : ''}
        </div>
        <div class="vocab-actions">
          <button class="vocab-btn write-btn" onclick="app.handwriting.open('${esc(w.char)}','${esc(w.pinyin)}','${esc(w.meaning)}')">✏️</button>
          <button class="vocab-btn${inFC ? ' added' : ''}" id="fb${i}" onclick="app.flashcards.add(${i})">${inFC ? '✓' : '+'}</button>
        </div>
      </div>`;
    }).join('');
  }

  exportCSV() {
    const lesson = app.currentLesson;
    if (!this.items.length || !lesson) return;
    const header = 'Từ vựng,Pinyin,Nghĩa,Ví dụ,Pinyin ví dụ,Nghĩa ví dụ';
    const q = s => `"${(s || '').replace(/"/g, '""')}"`;
    const rows = this.items.map(v =>
      [q(v.char), q(v.pinyin), q(v.meaning), q(v.example), q(v.exPinyin), q(v.exMeaning)].join(',')
    );
    const csv = '﻿' + header + '\n' + rows.join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `vocab_${lesson.title.replace(/\s/g, '_')}.csv`;
    a.click();
  }
}
