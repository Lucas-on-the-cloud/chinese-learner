class VocabManager {
  constructor(ai) {
    this.ai    = ai;
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

  addUserEntry(char) {
    if (this.items.some(v => v.char === char)) return;
    this.items.push({ char, pinyin: '', meaning: '(bạn thêm)', example: '', level: '', userAdded: true });
    this.render();
  }

  async generate() {
    const lesson = app.currentLesson;
    if (!lesson) return;
    const btn = document.getElementById('gen-btn');
    const ld  = document.getElementById('ai-ld');
    btn.disabled = true;
    ld.classList.add('show');
    document.getElementById('vocab-list').innerHTML = '';
    const userAdded = this.items.filter(v => v.userAdded);
    this.items = [];
    document.getElementById('ai-lt').textContent = 'AI đang phân tích...';

    try {
      const raw = await this.ai.call(
        `Bạn là giáo viên tiếng Trung cho người Việt. Từ vựng quan trọng trong bài để hiểu hiểu ngữ cảnh của bài đọc.\nJSON thuần, KHÔNG markdown:\n[{"char":"字","pinyin":"zì","meaning":"nghĩa","example":"ví dụ trong bài","exPinyin":"pinyin ví dụ","exMeaning":"nghĩa ví dụ","level":"cơ bản"}]\nlevel: "cơ bản"/"trung cấp"/"nâng cao". example phải là câu từ BÀI ĐỌC.`,
        `Đoạn văn:\n${lesson.zh}\n\nPinyin:\n${lesson.py}\n\nTiếng Việt:\n${lesson.vi}\n\nJSON thuần.`
      );
      ld.classList.remove('show');
      if (!raw) {
        this.items = [...(this.DEMO[lesson.id] || this.DEMO[1]), ...userAdded];
        this.render(); btn.textContent = '✓ Demo';
      } else {
        const parsed = JSON.parse(raw.trim().replace(/^```json\s*/, '').replace(/\s*```$/, ''));
        this.items = [...parsed, ...userAdded];
        this.render(); btn.textContent = `✓ ${parsed.length} từ`;
      }
    } catch (e) {
      ld.classList.remove('show');
      console.error(e);
      this.items = [...(this.DEMO[lesson.id] || this.DEMO[1]), ...userAdded];
      this.render(); btn.textContent = '⚠ ' + e.message.slice(0, 30);
    }
    document.getElementById('csv-btn').style.display = 'inline-block';
    document.getElementById('ws-btn').style.display  = 'inline-block';
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
