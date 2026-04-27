// ── FLASHCARD ADMIN ─────────────────────────────
let fcAllLessons = [];
let fcAllBooks   = [];
let fcSelectedBook   = null;
let fcSelectedLesson = null;
let fcAIResults  = [];

async function loadFCAdmin() {
  // Load books & lessons & template summary
  const [{ data: lessons }, { data: books }, summary] = await Promise.all([
    DB.from('lessons').select('id,title,book,chinese,pinyin,vietnamese').order('id'),
    DB.from('books').select('*').order('name'),
    _adminDb.getFlashcardTemplateSummary(),
  ]);
  fcAllLessons = (lessons || []).map(l => ({
    id: l.id, title: l.title || '', book: l.book || 'B1',
    zh: l.chinese || '', py: l.pinyin || '', vi: l.vietnamese || '',
  }));
  fcAllBooks = books || [];

  // Count templates per book
  const countByBook = {};
  (summary || []).forEach(r => {
    countByBook[r.book_name] = (countByBook[r.book_name] || 0) + 1;
  });

  // Update sidebar count
  const total = Object.values(countByBook).reduce((a,b) => a+b, 0);
  const sbCount = document.getElementById('sb-fc-count');
  if (sbCount) sbCount.textContent = total;

  // Render book list
  const bookNames = [...new Set([
    ...fcAllBooks.map(b => b.name),
    ...fcAllLessons.map(l => l.book),
  ])].sort();

  document.getElementById('fc-book-list').innerHTML = bookNames.map(name => {
    const meta  = fcAllBooks.find(b => b.name === name) || {};
    const label = meta.display_name || name;
    const cnt   = countByBook[name] || 0;
    return `<button onclick="fcSelectBook('${name}')" id="fcb-${name}"
      style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;cursor:pointer;font-family:inherit;font-size:13px;transition:all .15s;text-align:left;width:100%"
      onmouseover="this.style.borderColor='#1a56db'" onmouseout="if(fcSelectedBook!=='${name}')this.style.borderColor='#e5e7eb'">
      <span style="font-weight:500;color:#1f2937">${label}</span>
      <span style="font-size:11px;font-weight:600;color:#6b7280;background:#f3f4f6;padding:2px 8px;border-radius:8px">${cnt} thẻ</span>
    </button>`;
  }).join('');
}

function fcSelectBook(bookName) {
  fcSelectedBook   = bookName;
  fcSelectedLesson = null;
  // Highlight active button
  document.querySelectorAll('[id^="fcb-"]').forEach(b => {
    b.style.background = b.id === 'fcb-' + bookName ? '#eff6ff' : '#fff';
    b.style.borderColor = b.id === 'fcb-' + bookName ? '#1a56db' : '#e5e7eb';
    b.style.color = b.id === 'fcb-' + bookName ? '#1a56db' : '';
  });
  fcRenderLessons(bookName);
}

async function fcRenderLessons(bookName) {
  const meta  = fcAllBooks.find(b => b.name === bookName) || {};
  const label = meta.display_name || bookName;
  const lessons = fcAllLessons.filter(l => l.book === bookName);

  // Load template counts per lesson for this book
  const { data: tpls } = await DB.from('flashcard_templates')
    .select('lesson_id').eq('book_name', bookName);
  const cntByLesson = {};
  (tpls || []).forEach(t => {
    cntByLesson[t.lesson_id] = (cntByLesson[t.lesson_id] || 0) + 1;
  });

  // Group lessons by group key (before " · ")
  const groupMap = new Map();
  lessons.forEach(l => {
    const sep = l.title.indexOf(' · ');
    const key = sep > -1 ? l.title.slice(0, sep).trim() : l.title.trim();
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(l);
  });

  const lessonsHTML = [...groupMap.entries()].map(([groupKey, grp]) => {
    const cnt = grp.reduce((a, l) => a + (cntByLesson[l.id] || 0), 0);
    const ids = grp.map(l => l.id).join(',');
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-radius:8px;border:1px solid #f3f4f6;background:#fafafa;margin-bottom:6px">
      <div>
        <div style="font-size:13px;font-weight:600;color:#1f2937">${groupKey}</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:2px">${grp.length} đoạn đọc · ${cnt} thẻ flashcard</div>
      </div>
      <div style="display:flex;gap:6px">
        ${cnt > 0 ? `<button onclick="fcSelectLesson(${grp[0].id},'${escHtml(groupKey)}')" style="background:#eff6ff;color:#1a56db;border:1px solid #c7d7fd;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit">✏️ Quản lý (${cnt})</button>` : ''}
        <button onclick="fcSelectLesson(${grp[0].id},'${escHtml(groupKey)}')" style="background:#1a56db;color:#fff;border:none;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:600;font-family:inherit">+ Thêm thẻ</button>
      </div>
    </div>`;
  }).join('');

  const bookTotal = (tpls||[]).length;

  document.getElementById('fc-right-area').innerHTML = `
    <div class="s-card" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div class="s-title"><i class="fa-solid fa-book-bookmark" style="color:#1a56db"></i> ${label}</div>
        <span style="font-size:12px;color:#6b7280;background:#f3f4f6;padding:4px 12px;border-radius:8px;font-weight:600">${bookTotal} thẻ tổng cộng</span>
      </div>
      ${lessonsHTML || '<div style="font-size:13px;color:#9ca3af;padding:1rem 0">Chưa có bài học nào trong khóa học con này.</div>'}
    </div>
    <div id="fc-lesson-editor" style="display:none"></div>`;
}

async function fcSelectLesson(lessonId, groupTitle) {
  fcSelectedLesson = lessonId;
  // Find the lesson group
  const lesson = fcAllLessons.find(l => l.id === lessonId);
  if (!lesson) return;

  // Load existing templates for this lesson (all parts in group)
  const groupKey = groupTitle;
  const groupLessons = fcAllLessons.filter(l => {
    const sep = l.title.indexOf(' · ');
    const key = sep > -1 ? l.title.slice(0, sep).trim() : l.title.trim();
    return key === groupKey && l.book === fcSelectedBook;
  });
  const ids = groupLessons.map(l => l.id);

  const { data: existing } = await DB.from('flashcard_templates')
    .select('*').in('lesson_id', ids).order('sort_order').order('id');

  fcRenderLessonEditor(groupTitle, groupLessons, existing || []);
}

function fcRenderLessonEditor(groupTitle, groupLessons, cards) {
  const editorEl = document.getElementById('fc-lesson-editor');
  editorEl.style.display = 'block';
  editorEl.scrollIntoView({ behavior:'smooth', block:'start' });

  const cardsHTML = cards.map((c, i) => `
    <div id="fce-card-${c.id}" style="display:flex;gap:10px;align-items:flex-start;padding:12px;border:1px solid #f3f4f6;border-radius:8px;background:#fafafa;margin-bottom:8px">
      <div style="flex:1;min-width:0">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:6px">
          <input id="fce-char-${c.id}" value="${escHtml(c.char)}" placeholder="漢字" style="padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-family:'Noto Serif TC',serif;font-size:15px">
          <input id="fce-py-${c.id}" value="${escHtml(c.pinyin||'')}" placeholder="Pinyin" style="padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;font-family:inherit">
          <input id="fce-mg-${c.id}" value="${escHtml(c.meaning||'')}" placeholder="Nghĩa tiếng Việt" style="padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;font-family:inherit">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <input id="fce-ezh-${c.id}" value="${escHtml(c.example_zh||'')}" placeholder="Ví dụ (中文)" style="padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-family:'Noto Serif TC',serif;font-size:13px">
          <input id="fce-evi-${c.id}" value="${escHtml(c.example_vi||'')}" placeholder="Ví dụ (Tiếng Việt)" style="padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;font-family:inherit">
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
        <button onclick="fcSaveCard(${c.id},'${escHtml(groupTitle)}')" style="background:#16a34a;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit">💾</button>
        <button onclick="fcDeleteCard(${c.id})" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit">🗑</button>
      </div>
    </div>`).join('');

  editorEl.innerHTML = `
    <div class="s-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div class="s-title"><i class="fa-solid fa-clone" style="color:#1a56db"></i> ${groupTitle} · ${cards.length} thẻ</div>
        <button onclick="document.getElementById('fc-lesson-editor').style.display='none'" style="background:transparent;border:none;color:#9ca3af;font-size:18px;cursor:pointer">×</button>
      </div>

      <!-- Existing cards -->
      <div id="fc-cards-list">
        ${cards.length ? cardsHTML : '<div style="font-size:13px;color:#9ca3af;padding:.5rem 0">Chưa có thẻ nào. Dùng AI hoặc thêm thủ công bên dưới.</div>'}
      </div>

      <!-- AI Generate -->
      <div style="margin-top:20px;padding:16px;background:#eff6ff;border:1px solid #c7d7fd;border-radius:10px">
        <div style="font-size:13px;font-weight:700;color:#1a56db;margin-bottom:10px"><i class="fa-solid fa-sparkles"></i> Tạo từ vựng bằng AI</div>
        <div style="font-size:12px;color:#374151;margin-bottom:8px">Chọn đoạn đọc để AI trích xuất từ vựng:</div>
        <select id="fc-lesson-picker" style="width:100%;padding:8px 10px;border:1px solid #c7d7fd;border-radius:7px;font-family:inherit;font-size:13px;margin-bottom:10px;background:#fff">
          ${groupLessons.map(l => `<option value="${l.id}">${l.title}</option>`).join('')}
        </select>
        <button onclick="fcGenerateAI('${escHtml(groupTitle)}')" id="fc-ai-btn"
          style="background:#1a56db;color:#fff;border:none;padding:9px 20px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;width:100%">
          <i class="fa-solid fa-sparkles"></i> Tạo từ vựng với AI
        </button>
        <div id="fc-ai-result" style="margin-top:12px"></div>
      </div>

      <!-- Manual Add -->
      <div style="margin-top:16px;padding:16px;border:1px solid #e5e7eb;border-radius:10px;background:#fff">
        <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:10px"><i class="fa-solid fa-plus"></i> Thêm thẻ thủ công</div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">
          <input id="fc-new-char" placeholder="漢字 *" style="padding:8px 10px;border:1px solid #e5e7eb;border-radius:7px;font-family:'Noto Serif TC',serif;font-size:15px">
          <input id="fc-new-py" placeholder="Pinyin" style="padding:8px 10px;border:1px solid #e5e7eb;border-radius:7px;font-size:13px;font-family:inherit">
          <input id="fc-new-mg" placeholder="Nghĩa tiếng Việt *" style="padding:8px 10px;border:1px solid #e5e7eb;border-radius:7px;font-size:13px;font-family:inherit">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
          <input id="fc-new-ezh" placeholder="Ví dụ (中文)" style="padding:8px 10px;border:1px solid #e5e7eb;border-radius:7px;font-family:'Noto Serif TC',serif;font-size:13px">
          <input id="fc-new-evi" placeholder="Ví dụ (Tiếng Việt)" style="padding:8px 10px;border:1px solid #e5e7eb;border-radius:7px;font-size:13px;font-family:inherit">
        </div>
        <button onclick="fcAddManual('${escHtml(groupTitle)}')" style="background:#16a34a;color:#fff;border:none;padding:9px 20px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">
          <i class="fa-solid fa-plus"></i> Thêm thẻ
        </button>
      </div>
    </div>`;
}

async function fcGenerateAI(groupTitle) {
  const lessonId = parseInt(document.getElementById('fc-lesson-picker').value);
  const lesson   = fcAllLessons.find(l => l.id === lessonId);
  if (!lesson || !lesson.zh) { alert('Bài học không có nội dung tiếng Trung.'); return; }

  const btn = document.getElementById('fc-ai-btn');
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> AI đang phân tích…';

  // Dùng y chang SYSTEM_PROMPT của vocab-manager.js
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
    const raw = await window.app.ai.call(
      SYSTEM_PROMPT,
      `Bài đọc tiếng Trung:\n${lesson.zh}\n\nPinyin:\n${lesson.py}\n\nDịch tiếng Việt:\n${lesson.vi}\n\nHãy tạo 15-25 từ/cụm từ THIẾT YẾU giúp hiểu ngữ cảnh bài. JSON thuần.`,
      3500
    );
    if (!raw) throw new Error('AI không trả về kết quả');
    const cleaned = raw.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
    const match   = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('Không tìm thấy JSON array');
    fcAIResults = JSON.parse(match[0]);
    fcRenderAIResults(groupTitle, lesson);
  } catch(e) {
    document.getElementById('fc-ai-result').innerHTML =
      `<div style="color:#dc2626;font-size:13px;padding:8px;background:#fef2f2;border-radius:6px">Lỗi: ${e.message}</div>`;
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-sparkles"></i> Tạo từ vựng với AI';
  }
}

function fcRenderAIResults(groupTitle, lesson) {
  const resEl = document.getElementById('fc-ai-result');
  if (!fcAIResults.length) { resEl.innerHTML = '<div style="font-size:13px;color:#9ca3af">Không tạo được từ vựng.</div>'; return; }

  const bgMap = { 'cơ bản': '#e6f4f0', 'trung cấp': '#fdf6e3', 'nâng cao': '#fde8e6' };
  const txMap = { 'cơ bản': '#0f6e56', 'trung cấp': '#b8860b', 'nâng cao': '#c0392b' };

  const rowsHTML = fcAIResults.map((v, i) => {
    const bg = bgMap[v.level] || '#f3f4f6';
    const tx = txMap[v.level] || '#6b7280';
    return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;margin-bottom:6px">
      <input type="checkbox" id="fc-ai-chk-${i}" checked style="margin-top:5px;flex-shrink:0;width:16px;height:16px;cursor:pointer">
      <div style="flex:1;min-width:0">
        <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin-bottom:4px">
          <span style="font-family:'Noto Serif TC',serif;font-size:18px;font-weight:700;color:#0d1b4b">${v.char||''}</span>
          <span style="font-size:12px;color:#6b7280;font-style:italic">${v.pinyin||''}</span>
          <span style="font-size:13px;font-weight:600;color:#374151">${v.meaning||''}</span>
          ${v.level ? `<span style="font-size:10px;font-weight:700;padding:1px 7px;border-radius:4px;background:${bg};color:${tx}">${v.level}</span>` : ''}
        </div>
        ${v.example ? `<div style="font-size:12px;font-family:'Noto Serif TC',serif;color:#374151;margin-bottom:2px">「${v.example}」</div>` : ''}
        ${v.exPinyin ? `<div style="font-size:11px;color:#9ca3af;font-style:italic;margin-bottom:2px">${v.exPinyin}</div>` : ''}
        ${v.exMeaning ? `<div style="font-size:12px;color:#6b7280">${v.exMeaning}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  resEl.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <span style="font-size:12px;font-weight:700;color:#374151">AI gợi ý ${fcAIResults.length} từ vựng — chọn thẻ muốn lưu:</span>
      <label style="font-size:12px;color:#6b7280;cursor:pointer;display:flex;align-items:center;gap:5px">
        <input type="checkbox" id="fc-ai-chk-all" checked onchange="fcAIToggleAll(this.checked)">
        Chọn tất cả
      </label>
    </div>
    ${rowsHTML}
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
      <button onclick="fcSaveAISelected('${escHtml(groupTitle)}',${lesson.id},'${escHtml(lesson.title)}')"
        style="background:#16a34a;color:#fff;border:none;padding:9px 20px;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">
        💾 Lưu những thẻ đã chọn
      </button>
      <button onclick="document.getElementById('fc-ai-result').innerHTML=''"
        style="background:transparent;border:1px solid #e5e7eb;padding:9px 14px;border-radius:7px;font-size:13px;cursor:pointer;font-family:inherit;color:#6b7280">
        Huỷ
      </button>
    </div>`;
}

function fcAIToggleAll(checked) {
  fcAIResults.forEach((_, i) => {
    const chk = document.getElementById('fc-ai-chk-' + i);
    if (chk) chk.checked = checked;
  });
}

async function fcSaveAISelected(groupTitle, lessonId, lessonTitle) {
  const selected = fcAIResults.filter((_, i) => document.getElementById('fc-ai-chk-' + i)?.checked);
  if (!selected.length) { alert('Chưa chọn thẻ nào.'); return; }

  // Map vocab-manager fields → flashcard_templates fields
  const rows = selected.map((v, i) => ({
    book_name:    fcSelectedBook,
    lesson_id:    lessonId,
    lesson_title: lessonTitle,
    char:         v.char     || '',
    pinyin:       v.pinyin   || '',
    meaning:      v.meaning  || '',
    example_zh:   v.example  || '',   // example = câu nguyên văn từ bài
    example_vi:   v.exMeaning || '',  // exMeaning = nghĩa câu ví dụ
    sort_order:   i,
    published:    true,
  }));

  const { error } = await _adminDb.bulkInsertFlashcardTemplates(rows);
  if (error) { alert('Lỗi: ' + error.message); return; }
  alert(`✓ Đã lưu ${rows.length} thẻ flashcard!`);
  fcSelectLesson(lessonId, groupTitle);
}

async function fcSaveCard(cardId, groupTitle) {
  const char  = document.getElementById('fce-char-' + cardId)?.value.trim();
  const py    = document.getElementById('fce-py-'   + cardId)?.value.trim();
  const mg    = document.getElementById('fce-mg-'   + cardId)?.value.trim();
  const ezh   = document.getElementById('fce-ezh-'  + cardId)?.value.trim();
  const evi   = document.getElementById('fce-evi-'  + cardId)?.value.trim();
  if (!char) { alert('Vui lòng nhập chữ Hán.'); return; }
  const { error } = await _adminDb.saveFlashcardTemplate({
    id: cardId, char, pinyin: py, meaning: mg, example_zh: ezh, example_vi: evi,
  });
  if (error) alert('Lỗi: ' + error.message);
  else { const b = event.target; b.textContent = '✓'; setTimeout(() => b.textContent = '💾', 1200); }
}

async function fcDeleteCard(cardId) {
  if (!confirm('Xóa thẻ này?')) return;
  const { error } = await _adminDb.deleteFlashcardTemplate(cardId);
  if (error) { alert('Lỗi: ' + error.message); return; }
  document.getElementById('fce-card-' + cardId)?.remove();
}

async function fcAddManual(groupTitle) {
  const char = document.getElementById('fc-new-char').value.trim();
  const mg   = document.getElementById('fc-new-mg').value.trim();
  if (!char || !mg) { alert('Cần nhập Hán tự và nghĩa.'); return; }

  // Find first lesson in group for lesson_id
  const lesson = fcAllLessons.find(l => {
    const sep = l.title.indexOf(' · ');
    const key = sep > -1 ? l.title.slice(0, sep).trim() : l.title.trim();
    return key === groupTitle && l.book === fcSelectedBook;
  });

  const { error } = await _adminDb.saveFlashcardTemplate({
    book_name: fcSelectedBook,
    lesson_id: lesson?.id || null,
    lesson_title: groupTitle,
    char,
    pinyin:     document.getElementById('fc-new-py').value.trim(),
    meaning:    mg,
    example_zh: document.getElementById('fc-new-ezh').value.trim(),
    example_vi: document.getElementById('fc-new-evi').value.trim(),
    sort_order: 0, published: true,
  });
  if (error) { alert('Lỗi: ' + error.message); return; }
  ['fc-new-char','fc-new-py','fc-new-mg','fc-new-ezh','fc-new-evi'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  fcSelectLesson(lesson?.id || fcAllLessons.find(l=>l.book===fcSelectedBook)?.id, groupTitle);
}

function fcShowSQLNote() {
  alert(`Chạy SQL này trong Supabase để tạo bảng flashcard_templates:\n\nCREATE TABLE flashcard_templates (\n  id BIGSERIAL PRIMARY KEY,\n  book_name TEXT NOT NULL,\n  lesson_id BIGINT,\n  lesson_title TEXT DEFAULT '',\n  char TEXT NOT NULL,\n  pinyin TEXT DEFAULT '',\n  meaning TEXT DEFAULT '',\n  example_zh TEXT DEFAULT '',\n  example_vi TEXT DEFAULT '',\n  sort_order INT DEFAULT 0,\n  published BOOLEAN DEFAULT true,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\nALTER TABLE flashcard_templates DISABLE ROW LEVEL SECURITY;`);
}
