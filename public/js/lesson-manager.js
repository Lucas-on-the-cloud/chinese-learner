class LessonManager {
  constructor(db) {
    this.db = db;
    this.lessons = [];
    this.booksMeta = new Map(); // book code → { display_name, description, cover_url }
    this.BUILTIN = [
      {
        id: 1, book: 'B1', title: 'Thói quen sinh viên', desc: 'Cuộc sống đại học',
        zh: `大學生的生活習慣普通不是很好，尤其是上網，每天晚上差不多十點以後就進入了「上網高峰」時段，在網路上跟同學聊天、玩線上遊戲，不知不覺就已經深夜了。\n到了學期最後，不少大學生開夜車趕報告，交了報告以後，就又得準備期末考，許多人因此健康亮起了紅燈。\n台大社工系三年級學生張敬發起了「健康」運動，希望大學生要為自己的健康負起責任，要改掉夜生活的壞習慣，建立起正常的作息時間。`,
        py: `Dàxuéshēng de shēnghuó xíguàn pǔtōng bù shì hěn hǎo, yóuqí shì shàngwǎng, měitiān wǎnshàng chàbùduō shí diǎn yǐhòu jiù jìnrùle "shàngwǎng gāofēng" shíduàn.\nDàole xuéqī zuìhòu, bùshǎo dàxuéshēng kāi yèchē gǎn bàogào, jiāo le bàogào yǐhòu, jiù yòu děi zhǔnbèi qīmò kǎo.\nTáidà shè gōng xì sān niánjí xuéshēng Zhāng Jìng fāqǐ le "jiànkāng" yùndòng.`,
        vi: `Thói quen sinh hoạt của sinh viên đại học thường không tốt, đặc biệt là việc lên mạng.\nĐến cuối học kỳ, nhiều sinh viên phải thức đêm chạy báo cáo, sức khỏe bật đèn đỏ.\nTrương Kính đã khởi xướng phong trào "sức khỏe".`
      },
      {
        id: 2, book: 'B1', title: 'Xin học bổng', desc: 'Thủ tục & hồ sơ',
        zh: `我家的經濟情況不是很好，上高中、大學的時候，為了減輕父母的負擔，我靠申請獎學金來付學費。\n申請獎學金要先填寫一張獎學金申請表，還要準備一份成績單、一份上課出席紀錄表，以及學生證影印本，另外要寫一篇自傳文章、一份學習計畫，當然還要有一封老師的推薦信。`,
        py: `Wǒ jiā de jīngjì qíngkuàng bù shì hěn hǎo, wèile jiǎnqīng fùmǔ de fùdān, wǒ kào shēnqǐng jiǎngxuéjīn lái fù xuéfèi.\nShēnqǐng jiǎngxuéjīn yào xiān tiánxiě shēnqǐng biǎo, zhǔnbèi chéngjìdān, chūxí jìlù, xuéshēngzhèng yǐngyìnběn, zìzhuàn, xuéxí jìhuà, tuījiànxìn.`,
        vi: `Hoàn cảnh kinh tế gia đình không tốt, tôi dựa vào học bổng để trả học phí.\nCần: đơn, bảng điểm, bảng điểm danh, thẻ SV, tự truyện, kế hoạch, thư giới thiệu.`
      },
      {
        id: 3, book: 'B1', title: 'CLB Guitar', desc: 'Tuyển thành viên',
        zh: `吉他社招生\n目標：學彈吉他、自彈自唱、能上台表演\n說明：學習中外民歌；吉他可以免費借用；社員買吉他打折；教學免費`,
        py: `Jítā shè zhāoshēng\nMùbiāo: Xué tán jítā, zì tán zì chàng\nShuōmíng: Xuéxí míngē; miǎnfèi jièyòng; dǎzhé; miǎnfèi jiàoxué`,
        vi: `Tuyển thành viên CLB Guitar.\nMục tiêu: Học đánh guitar, tự đàn tự hát.\nGuitar mượn miễn phí; giảm giá; dạy miễn phí.`
      },
      {
        id: 4, book: 'B1', title: 'Đi làm hay đi học', desc: 'Tiểu Vương',
        zh: `小王不愛念書，看到書就想睡，他一心只想著打工賺錢，可是他爸媽認為他這個年紀應該以課業為重。\n因為有工作就能賺錢，甚至能自己付學費，小王覺得打工很有成就感。\n其實，並不是每個人都適合讀書做研究，不想念書的年輕人不如先工作，等更成熟了也許會有不同的學習動力。`,
        py: `Xiǎo Wáng bù ài niànshū, tā yīxīn zhǐ xiǎngzhe dǎgōng zhuànqián.\nYǒu gōngzuò jiù néng zhuànqián, Xiǎo Wáng juédé hěn yǒu chéngjiùgǎn.\nBìng bùshì měi gèrén dōu shìhé dúshū, bùrú xiān gōngzuò.`,
        vi: `Tiểu Vương không thích học, chỉ muốn đi làm kiếm tiền.\nCó việc là kiếm được tiền, cậu thấy rất có thành tựu.\nKhông phải ai cũng phù hợp nghiên cứu, thà đi làm trước.`
      }
    ];
  }

  async load() {
    const [data, meta] = await Promise.all([this.db.getLessons(), this.db.getBooksMeta()]);
    this.lessons = (data && data.length)
      ? data.map(l => ({ id: l.id, book: l.book || 'B1', title: l.title, desc: l.description, zh: l.chinese, py: l.pinyin, vi: l.vietnamese }))
      : [...this.BUILTIN];
    this.booksMeta.clear();
    meta.forEach(b => this.booksMeta.set(b.name, b));
  }

  // Returns the group key (prefix before " · ") for a title
  _groupKey(title) {
    const sep = title.indexOf(' · ');
    return sep > -1 ? title.slice(0, sep) : title;
  }

  renderGrid() {
    const GRADIENTS = [
      ['#0d1b4b', '#1e3a8a'],
      ['#064e3b', '#065f46'],
      ['#4c1d95', '#5b21b6'],
      ['#7f1d1d', '#991b1b'],
      ['#0c4a6e', '#075985'],
    ];
    const EMOJIS = ['📘', '📗', '📒', '📕', '📙'];
    const books = [...new Set(this.lessons.map(l => l.book || 'B1'))].sort();

    const html = books.map((book, bi) => {
      // All lessons in this book with their global index
      const bookEntries = this.lessons
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => (l.book || 'B1') === book);

      // Group by prefix
      const groupMap = new Map();
      bookEntries.forEach(({ l, i }) => {
        const key = this._groupKey(l.title);
        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key).push(i);
      });

      const emoji   = EMOJIS[bi % EMOJIS.length];
      const open    = bi === 0;
      const bMeta   = this.booksMeta.get(book) || {};
      const bTitle  = bMeta.display_name || `Quyển sách ${book}`;
      const bDesc   = bMeta.description  || '';
      const bCover  = bMeta.cover_url    || '';
      const bThumb  = bCover
        ? `<img src="${bCover}" class="bk-hdr-thumb" alt="">`
        : `<span>${emoji}</span>`;

      const cardsHTML = [...groupMap.entries()].map(([groupKey, indices], gi) => {
        const first = this.lessons[indices[0]];
        const wm    = (first.zh || '').match(/[一-鿿]/)?.[0] || '讀';
        const [c1, c2] = GRADIENTS[gi % GRADIENTS.length];

        // Sub-reading labels ("Hình 1", "Hình 2", …)
        const subs = indices
          .map(i => {
            const t   = this.lessons[i].title;
            const sep = t.indexOf(' · ');
            if (sep < 0) return '';
            const rest = t.slice(sep + 3);
            const dash = rest.indexOf(' — ');
            return dash > -1 ? rest.slice(0, dash) : rest;
          })
          .filter(Boolean);

        const subLine = subs.length
          ? subs.join(', ')
          : (first.desc || '');

        const preview = (first.zh || '').replace(/\n/g, '').slice(0, 36);
        const indicesJSON = JSON.stringify(indices);
        const countLabel  = indices.length > 1 ? `${indices.length} bài đọc` : 'Bài đọc';

        return `<div class="lgc" onclick="app.openGroup(${indicesJSON})">
          <div class="lgc-thumb" style="background:linear-gradient(135deg,${c1},${c2})">
            <span class="lgc-wm">${wm}</span>
            <span class="lgc-badge">${countLabel}</span>
          </div>
          <div class="lgc-body">
            <div class="lgc-title">${groupKey}</div>
            ${subLine ? `<div class="lgc-sub">${subLine}</div>` : ''}
            <div class="lgc-zh">${preview}</div>
          </div>
        </div>`;
      }).join('');

      return `
        <div class="book-header" data-open="${open}" onclick="app.lessons.toggleBook(this)">
          <span class="bk-hdr-left">
            ${bThumb}
            <span>
              <span class="bk-hdr-name">${bTitle} <span class="bk-hdr-count">(${bookEntries.length} bài)</span></span>
              ${bDesc ? `<span class="bk-hdr-desc">${bDesc}</span>` : ''}
            </span>
          </span>
          <span class="book-arrow">${open ? '▾' : '▸'}</span>
        </div>
        <div class="book-lessons"${open ? '' : ' style="display:none"'}>
          <div class="lesson-group-grid">${cardsHTML}</div>
        </div>`;
    }).join('');

    document.getElementById('lesson-grid').innerHTML = html;
  }

  toggleBook(header) {
    const isOpen = header.dataset.open === 'true';
    const lessons = header.nextElementSibling;
    header.dataset.open = String(!isOpen);
    header.querySelector('.book-arrow').textContent = isOpen ? '▸' : '▾';
    lessons.style.display = isOpen ? 'none' : 'block';
  }

  renderBooksGrid(container) {
    const GRADIENTS = [
      ['#0d1b4b','#1e3a8a'], ['#064e3b','#065f46'],
      ['#4c1d95','#5b21b6'], ['#7f1d1d','#991b1b'], ['#0c4a6e','#075985'],
    ];
    const EMOJIS = ['📘','📗','📒','📕','📙'];

    const fromLessons = [...new Set(this.lessons.map(l => l.book || 'B1'))];
    const fromMeta    = [...this.booksMeta.keys()];
    const allCodes    = [...new Set([...fromLessons, ...fromMeta])].sort();

    if (!allCodes.length) {
      container.innerHTML = '<p style="color:var(--text-2);padding:3rem;text-align:center">Chưa có sách nào. Thêm sách trong Cài đặt.</p>';
      return;
    }

    container.innerHTML = allCodes.map((code, bi) => {
      const meta    = this.booksMeta.get(code) || {};
      const title   = meta.display_name || `Quyển sách ${code}`;
      const desc    = meta.description  || '';
      const cover   = meta.cover_url    || '';
      const [c1,c2] = GRADIENTS[bi % GRADIENTS.length];
      const emoji   = EMOJIS[bi % EMOJIS.length];
      const count   = this.lessons.filter(l => (l.book || 'B1') === code).length;
      const wm      = (this.lessons.find(l => (l.book||'B1') === code)?.zh || '').match(/[一-鿿]/)?.[0] || '讀';

      const coverHtml = cover
        ? `<img src="${cover}" class="bk-card-img" alt="${title}">`
        : `<div class="bk-card-img bk-card-grad" style="background:linear-gradient(150deg,${c1},${c2})">
             <span class="bk-card-wm">${wm}</span>
             <span class="bk-card-emoji">${emoji}</span>
           </div>`;

      return `<div class="bk-card" onclick="location.href='/book.html?b=${encodeURIComponent(code)}'">
        ${coverHtml}
        <div class="bk-card-body">
          <div class="bk-card-title">${title}</div>
          ${desc ? `<div class="bk-card-desc">${desc}</div>` : ''}
          <div class="bk-card-count">${count > 0 ? count + ' bài học' : 'Chưa có bài'}</div>
        </div>
      </div>`;
    }).join('');
  }

  get(index) { return this.lessons[index]; }
}
