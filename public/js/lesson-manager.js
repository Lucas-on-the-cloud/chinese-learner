class LessonManager {
  constructor(db) {
    this.db = db;
    this.lessons = [];
    this.BUILTIN = [
      {
        id: 1, title: 'Thói quen sinh viên', desc: 'Cuộc sống đại học',
        zh: `大學生的生活習慣普通不是很好，尤其是上網，每天晚上差不多十點以後就進入了「上網高峰」時段，在網路上跟同學聊天、玩線上遊戲，不知不覺就已經深夜了。\n到了學期最後，不少大學生開夜車趕報告，交了報告以後，就又得準備期末考，許多人因此健康亮起了紅燈。\n台大社工系三年級學生張敬發起了「健康」運動，希望大學生要為自己的健康負起責任，要改掉夜生活的壞習慣，建立起正常的作息時間。`,
        py: `Dàxuéshēng de shēnghuó xíguàn pǔtōng bù shì hěn hǎo, yóuqí shì shàngwǎng, měitiān wǎnshàng chàbùduō shí diǎn yǐhòu jiù jìnrùle "shàngwǎng gāofēng" shíduàn.\nDàole xuéqī zuìhòu, bùshǎo dàxuéshēng kāi yèchē gǎn bàogào, jiāo le bàogào yǐhòu, jiù yòu děi zhǔnbèi qīmò kǎo.\nTáidà shè gōng xì sān niánjí xuéshēng Zhāng Jìng fāqǐ le "jiànkāng" yùndòng.`,
        vi: `Thói quen sinh hoạt của sinh viên đại học thường không tốt, đặc biệt là việc lên mạng.\nĐến cuối học kỳ, nhiều sinh viên phải thức đêm chạy báo cáo, sức khỏe bật đèn đỏ.\nTrương Kính đã khởi xướng phong trào "sức khỏe".`
      },
      {
        id: 2, title: 'Xin học bổng', desc: 'Thủ tục & hồ sơ',
        zh: `我家的經濟情況不是很好，上高中、大學的時候，為了減輕父母的負擔，我靠申請獎學金來付學費。\n申請獎學金要先填寫一張獎學金申請表，還要準備一份成績單、一份上課出席紀錄表，以及學生證影印本，另外要寫一篇自傳文章、一份學習計畫，當然還要有一封老師的推薦信。`,
        py: `Wǒ jiā de jīngjì qíngkuàng bù shì hěn hǎo, wèile jiǎnqīng fùmǔ de fùdān, wǒ kào shēnqǐng jiǎngxuéjīn lái fù xuéfèi.\nShēnqǐng jiǎngxuéjīn yào xiān tiánxiě shēnqǐng biǎo, zhǔnbèi chéngjìdān, chūxí jìlù, xuéshēngzhèng yǐngyìnběn, zìzhuàn, xuéxí jìhuà, tuījiànxìn.`,
        vi: `Hoàn cảnh kinh tế gia đình không tốt, tôi dựa vào học bổng để trả học phí.\nCần: đơn, bảng điểm, bảng điểm danh, thẻ SV, tự truyện, kế hoạch, thư giới thiệu.`
      },
      {
        id: 3, title: 'CLB Guitar', desc: 'Tuyển thành viên',
        zh: `吉他社招生\n目標：學彈吉他、自彈自唱、能上台表演\n說明：學習中外民歌；吉他可以免費借用；社員買吉他打折；教學免費`,
        py: `Jítā shè zhāoshēng\nMùbiāo: Xué tán jítā, zì tán zì chàng\nShuōmíng: Xuéxí míngē; miǎnfèi jièyòng; dǎzhé; miǎnfèi jiàoxué`,
        vi: `Tuyển thành viên CLB Guitar.\nMục tiêu: Học đánh guitar, tự đàn tự hát.\nGuitar mượn miễn phí; giảm giá; dạy miễn phí.`
      },
      {
        id: 4, title: 'Đi làm hay đi học', desc: 'Tiểu Vương',
        zh: `小王不愛念書，看到書就想睡，他一心只想著打工賺錢，可是他爸媽認為他這個年紀應該以課業為重。\n因為有工作就能賺錢，甚至能自己付學費，小王覺得打工很有成就感。\n其實，並不是每個人都適合讀書做研究，不想念書的年輕人不如先工作，等更成熟了也許會有不同的學習動力。`,
        py: `Xiǎo Wáng bù ài niànshū, tā yīxīn zhǐ xiǎngzhe dǎgōng zhuànqián.\nYǒu gōngzuò jiù néng zhuànqián, Xiǎo Wáng juédé hěn yǒu chéngjiùgǎn.\nBìng bùshì měi gèrén dōu shìhé dúshū, bùrú xiān gōngzuò.`,
        vi: `Tiểu Vương không thích học, chỉ muốn đi làm kiếm tiền.\nCó việc là kiếm được tiền, cậu thấy rất có thành tựu.\nKhông phải ai cũng phù hợp nghiên cứu, thà đi làm trước.`
      }
    ];
  }

  async load() {
    const data = await this.db.getLessons();
    this.lessons = (data && data.length)
      ? data.map(l => ({ id: l.id, title: l.title, desc: l.description, zh: l.chinese, py: l.pinyin, vi: l.vietnamese }))
      : [...this.BUILTIN];
  }

  renderGrid() {
    document.getElementById('lesson-grid').innerHTML = this.lessons.map((l, i) =>
      `<div class="lesson-card" onclick="app.openLesson(${i})">
        <div class="lesson-num">${i + 1}</div>
        <div class="lesson-info"><h3>${l.title}</h3><p>${l.desc || ''}</p></div>
        <div class="lesson-arrow">›</div>
      </div>`
    ).join('');
  }

  async addLesson() {
    const t = document.getElementById('up-title').value.trim();
    const z = document.getElementById('up-zh').value.trim();
    const p = document.getElementById('up-py').value.trim();
    const v = document.getElementById('up-vi').value.trim();
    if (!t || !z) { alert('Nhập tiêu đề và tiếng Trung.'); return false; }

    const { error } = await this.db.addLesson({
      title: t, description: z.slice(0, 40) + '...',
      chinese: z, pinyin: p, vietnamese: v
    });
    if (error) { alert('Lỗi: ' + error.message); return false; }

    ['up-title', 'up-zh', 'up-py', 'up-vi'].forEach(id => document.getElementById(id).value = '');
    alert('✓ Đã lưu: ' + t);
    return true;
  }

  get(index) { return this.lessons[index]; }
}
