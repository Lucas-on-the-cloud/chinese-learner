// ── Sub-course (book) management ─────────────────
let _subCurrentBook = null;
let _subCreateMode  = false;
let _subSkillType   = 'reading';  // 'reading' | 'listening'

// ── Book list ────────────────────────────────────
async function loadSubCourses() {
  const books = await _adminDb.getBooksMeta();
  const listEl = document.getElementById('sub-book-list');
  const selEl  = document.getElementById('sub-book-select');

  selEl.innerHTML = '<option value="">— Chọn sách để chỉnh sửa —</option>' +
    books.map(b => {
      const icon = b.skill_type === 'listening' ? '🎧' : '📖';
      return `<option value="${escHtml(b.name)}">${icon} ${escHtml(b.display_name || b.name)}</option>`;
    }).join('');

  if (!books.length) {
    listEl.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:2rem;font-size:13px">Chưa có sách nào.</p>';
    return;
  }

  const { data: ldata } = await _adminDb.client.from('lessons').select('book');
  const counts = {};
  (ldata || []).forEach(l => { counts[l.book] = (counts[l.book] || 0) + 1; });

  listEl.innerHTML = books.map(b => {
    const isListening = b.skill_type === 'listening';
    const skillBadge  = isListening
      ? '<span style="font-size:10px;font-weight:600;color:#0d1b4b;background:#dbeafe;padding:1px 7px;border-radius:6px">🎧 Listening</span>'
      : '<span style="font-size:10px;font-weight:600;color:#15803d;background:#dcfce7;padding:1px 7px;border-radius:6px">📖 Reading</span>';
    const safeName = b.name.replace(/'/g,"\\'");
    return `<div class="bl-post-item">
      <div class="bl-post-info" style="cursor:pointer" onclick="subSelectBookFromList('${safeName}')">
        <div class="bl-post-title" style="display:flex;align-items:center;gap:6px">${escHtml(b.display_name || b.name)} ${skillBadge}</div>
        <div class="bl-post-meta">
          <span class="bl-post-dot" style="background:#1a56db"></span>
          ${escHtml(b.name)} · ${counts[b.name] || 0} bài học
        </div>
      </div>
      <div class="bl-post-actions">
        <button class="table-btn" onclick="subSelectBookFromList('${safeName}')" title="Chỉnh sửa"><i class="fa-solid fa-pen-to-square" style="color:#1a56db"></i></button>
        <button class="table-btn" onclick="subDeleteBook('${safeName}')" title="Xóa"><i class="fa-solid fa-trash" style="color:#c0392b"></i></button>
      </div>
    </div>`;
  }).join('');
}

async function subDeleteBook(bookName) {
  const meta = (await _adminDb.getBooksMeta()).find(b => b.name === bookName) || {};
  const label = meta.display_name || bookName;
  if (!confirm(`Xóa khóa học con "${label}"?\n\nTất cả bài học (lessons) và audio segments liên kết sẽ bị xóa.`)) return;

  // Delete in order: audio_segments → lessons → course_books → books
  await _adminDb.client.from('audio_segments').delete().eq('book_name', bookName);
  await _adminDb.client.from('lessons').delete().eq('book', bookName);
  await _adminDb.client.from('course_books').delete().eq('book_name', bookName);
  const { error } = await _adminDb.client.from('books').delete().eq('name', bookName);

  if (error) { alert('Lỗi xóa sách: ' + error.message); return; }

  // Reset form if this book was being edited
  if (_subCurrentBook === bookName) subCancelNew();
  loadSubCourses();
}

// ── Create new book ───────────────────────────────
function subNewBook() {
  _subCreateMode  = true;
  _subCurrentBook = null;
  _subSkillType   = 'reading';

  document.getElementById('sub-book-select').value = '';
  document.getElementById('sub-form-heading').innerHTML = '<i class="fa-solid fa-plus" style="color:#15803d"></i> Tạo khóa học con mới';
  document.getElementById('sub-code-row').style.display = '';
  document.getElementById('sub-skill-row').style.display = '';
  document.getElementById('sub-code').value    = '';
  document.getElementById('sub-name').value    = '';
  document.getElementById('sub-desc').value    = '';
  document.getElementById('sub-detail').value  = '';
  document.getElementById('sub-skill-reading').checked   = true;
  document.getElementById('sub-skill-listening').checked = false;
  subSkillChange(); // reset visual state
  subClearCover();
  document.getElementById('sub-save-btn').textContent = '💾 Tạo khóa học con';
  document.getElementById('sub-cancel-btn').style.display = '';
  document.getElementById('sub-book-form').style.display  = '';
  document.getElementById('sub-lesson-wrap').style.display = 'none';
  document.getElementById('sub-msg').className = 's-msg';
  document.getElementById('sub-code').focus();
}

function subSkillChange() {
  const val = document.querySelector('input[name="sub-skill"]:checked')?.value || 'reading';
  _subSkillType = val;
  // Update label styles
  const rLbl = document.getElementById('sub-skill-reading-lbl');
  const lLbl = document.getElementById('sub-skill-listening-lbl');
  if (!rLbl || !lLbl) return;
  if (val === 'reading') {
    rLbl.style.cssText += ';border-color:#1a56db;background:#eff6ff;color:#1a56db';
    lLbl.style.cssText += ';border-color:#e5e7eb;background:transparent;color:#6b7280';
  } else {
    lLbl.style.cssText += ';border-color:#1a56db;background:#eff6ff;color:#1a56db';
    rLbl.style.cssText += ';border-color:#e5e7eb;background:transparent;color:#6b7280';
  }
}

function subCancelNew() {
  _subCreateMode  = false;
  _subCurrentBook = null;
  document.getElementById('sub-book-select').value = '';
  document.getElementById('sub-form-heading').innerHTML = '<i class="fa-solid fa-book-bookmark" style="color:#1a56db"></i> Chỉnh sửa khóa học con';
  document.getElementById('sub-code-row').style.display  = 'none';
  document.getElementById('sub-skill-row').style.display = 'none';
  document.getElementById('sub-save-btn').textContent     = '💾 Lưu khóa học con';
  document.getElementById('sub-cancel-btn').style.display = 'none';
  document.getElementById('sub-book-form').style.display  = 'none';
  document.getElementById('sub-lesson-wrap').style.display = 'none';
  document.getElementById('sub-msg').className = 's-msg';
}

// ── Select existing book ──────────────────────────
async function subSelectBook(bookName) {
  if (!bookName) {
    document.getElementById('sub-book-form').style.display   = 'none';
    document.getElementById('sub-lesson-wrap').style.display = 'none';
    return;
  }
  _subCreateMode  = false;
  _subCurrentBook = bookName;
  document.getElementById('sub-form-heading').innerHTML    = '<i class="fa-solid fa-book-bookmark" style="color:#1a56db"></i> Chỉnh sửa khóa học con';
  document.getElementById('sub-code-row').style.display   = 'none';
  document.getElementById('sub-skill-row').style.display  = '';
  document.getElementById('sub-save-btn').textContent     = '💾 Lưu khóa học con';
  document.getElementById('sub-cancel-btn').style.display = 'none';

  const books = await _adminDb.getBooksMeta();
  const meta  = books.find(b => b.name === bookName) || {};
  _subSkillType = meta.skill_type || 'reading';

  // Pre-select skill type radio
  const rBtn = document.getElementById('sub-skill-reading');
  const lBtn = document.getElementById('sub-skill-listening');
  if (rBtn) rBtn.checked = _subSkillType === 'reading';
  if (lBtn) lBtn.checked = _subSkillType === 'listening';
  subSkillChange();

  document.getElementById('sub-name').value   = meta.display_name || '';
  document.getElementById('sub-desc').value   = meta.description  || '';
  document.getElementById('sub-detail').value = meta.detail       || '';
  document.getElementById('sub-cover').value  = meta.cover_url    || '';
  subCoverPreview(meta.cover_url || '');
  document.getElementById('sub-book-form').style.display  = '';
  document.getElementById('sub-msg').className = 's-msg';

  const skillLabel = _subSkillType === 'listening' ? '🎧 Listening' : '📖 Reading';
  document.getElementById('sub-lesson-heading').textContent  = `Bài học — ${meta.display_name || bookName}`;
  document.getElementById('sub-lesson-subhead').textContent  = `${skillLabel} · Quản lý bài học trong khóa học con này`;
  document.getElementById('sub-lesson-wrap').style.display   = '';
  subLoadLessons(bookName);
}

function subSelectBookFromList(bookName) {
  document.getElementById('sub-book-select').value = bookName;
  subSelectBook(bookName);
}

// ── Cover image helpers ───────────────────────────
function subCoverPreview(url) { imgPreview(url, 'sub-cover-preview', 'sub-cover-preview-img'); }
function subFileChange(input) { imgFileChange(input, 'sub-cover', 'sub-cover-preview', 'sub-cover-preview-img'); }
function subClearCover() { imgClear('sub-cover', 'sub-cover-file', 'sub-cover-preview'); }
function subWrap(before, after) { mdWrap('sub-detail', before, after); }
function subInsertLine(prefix) { mdInsertLine('sub-detail', prefix); }

// ── Save subcourse ────────────────────────────────
async function saveSubCourse() {
  const displayName = document.getElementById('sub-name').value.trim();
  const description = document.getElementById('sub-desc').value.trim() || null;
  const coverUrl    = document.getElementById('sub-cover').value.trim() || null;
  const detailVal   = document.getElementById('sub-detail').value.trim() || null;

  if (_subCreateMode) {
    const code = document.getElementById('sub-code').value.trim().toUpperCase();
    if (!code) { adminMsg('sub-msg', 'Nhập mã sách.', 'err'); return; }
    const skillType = document.querySelector('input[name="sub-skill"]:checked')?.value || 'reading';
    const row = { name: code, display_name: displayName || null, description, cover_url: coverUrl, skill_type: skillType };
    if (detailVal) row.detail = detailVal;

    const btn = document.getElementById('sub-save-btn');
    btn.disabled = true; btn.textContent = 'Đang tạo…';
    const { error } = await _adminDb.upsertBook(row);
    btn.disabled = false; btn.textContent = '💾 Tạo khóa học con';

    if (error) {
      if (error.message?.includes('skill_type')) {
        adminMsg('sub-msg', 'Cột "skill_type" chưa tồn tại. Chạy SQL: ALTER TABLE books ADD COLUMN IF NOT EXISTS skill_type TEXT DEFAULT \'reading\';', 'err');
      } else {
        adminMsg('sub-msg', 'Lỗi: ' + error.message, 'err');
      }
      return;
    }
    adminMsg('sub-msg', '✓ Đã tạo: ' + code, 'ok');
    _subCreateMode  = false;
    _subCurrentBook = code;
    _subSkillType   = skillType;
    document.getElementById('sub-code-row').style.display   = 'none';
    document.getElementById('sub-skill-row').style.display  = 'none';
    document.getElementById('sub-form-heading').innerHTML   = '<i class="fa-solid fa-book-bookmark" style="color:#1a56db"></i> Chỉnh sửa khóa học con';
    document.getElementById('sub-save-btn').textContent     = '💾 Lưu khóa học con';
    document.getElementById('sub-cancel-btn').style.display = 'none';
    document.getElementById('sub-lesson-heading').textContent = 'Bài học — ' + (displayName || code);
    document.getElementById('sub-lesson-wrap').style.display  = '';
    subLoadLessons(code);
    loadSubCourses();
    return;
  }

  if (!_subCurrentBook) return;
  const skillType = document.querySelector('input[name="sub-skill"]:checked')?.value || _subSkillType;
  _subSkillType = skillType;
  const row = { display_name: displayName || null, description, cover_url: coverUrl, skill_type: skillType };
  if (detailVal) row.detail = detailVal;
  const { error } = await _adminDb.client.from('books').update(row).eq('name', _subCurrentBook);
  if (error) {
    adminMsg('sub-msg', error.message?.includes('detail')
      ? 'Cột "detail" chưa tồn tại. Chạy SQL: ALTER TABLE books ADD COLUMN IF NOT EXISTS detail TEXT;'
      : 'Lỗi: ' + error.message, 'err');
    return;
  }
  adminMsg('sub-msg', '✓ Đã lưu: ' + _subCurrentBook, 'ok');
  loadSubCourses();
  // Reload lesson area to reflect possible skill_type change
  const skillLabel = _subSkillType === 'listening' ? '🎧 Listening' : '📖 Reading';
  document.getElementById('sub-lesson-subhead').textContent = `${skillLabel} · Quản lý bài học trong khóa học con này`;
  subLoadLessons(_subCurrentBook);
}

// ── Lesson management (branches by skill type) ────
async function subLoadLessons(bookName) {
  if (_subSkillType === 'listening') {
    await subLoadListeningLessons(bookName);
  } else {
    await subLoadReadingLessons(bookName);
  }
}

// ── READING: lesson list ──────────────────────────
async function subLoadReadingLessons(bookName) {
  // Set header buttons
  document.getElementById('sub-lesson-header-actions').innerHTML = `
    <button class="s-btn" onclick="subOpenImport()" style="font-size:12px;padding:7px 14px;background:#f47b20">📂 Import .txt</button>
    <button class="s-btn" onclick="subToggleAddLesson()" style="font-size:12px;padding:7px 14px">+ Thêm bài học</button>`;

  // Set add form content
  document.getElementById('sub-add-form-content').innerHTML = `
    <div class="s-label" style="margin-bottom:8px">Thêm bài học mới</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div style="grid-column:1/-1">
        <div class="s-label">Tên bài học</div>
        <input type="text" id="sub-new-title" class="s-input" placeholder="VD: Bài 1 — Giới thiệu bản thân">
      </div>
      <div>
        <div class="s-label">Tiếng Trung 繁體 <span style="color:#9ca3af;font-weight:400">(bắt buộc)</span></div>
        <textarea id="sub-new-zh" style="width:100%;min-height:100px;border:1px solid #e5e7eb;border-radius:8px;font-family:'Noto Serif TC',serif;font-size:14px;padding:9px;resize:vertical;outline:none;line-height:1.7" placeholder="我叫…"></textarea>
      </div>
      <div>
        <div class="s-label">Pinyin</div>
        <textarea id="sub-new-py" style="width:100%;min-height:100px;border:1px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:13px;padding:9px;resize:vertical;outline:none;line-height:1.7" placeholder="Wǒ jiào…"></textarea>
      </div>
      <div style="grid-column:1/-1">
        <div class="s-label">Tiếng Việt</div>
        <textarea id="sub-new-vi" style="width:100%;min-height:80px;border:1px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:13px;padding:9px;resize:vertical;outline:none;line-height:1.7" placeholder="Tôi tên là…"></textarea>
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="s-btn" onclick="subSaveNewLesson()" style="flex:1">💾 Thêm bài</button>
      <button class="s-btn" onclick="subToggleAddLesson()" style="background:#6b7280">Hủy</button>
    </div>`;

  // Load lessons
  const el = document.getElementById('sub-lesson-list');
  el.innerHTML = '<p style="color:#9ca3af;padding:1rem;font-size:13px">Đang tải…</p>';
  const { data: lessons } = await _adminDb.client.from('lessons').select('*').eq('book', bookName).order('id');
  if (!lessons?.length) {
    el.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:2rem;font-size:13px">Chưa có bài học nào.</p>';
    return;
  }
  el.innerHTML = lessons.map(l => subReadingLessonRow(l)).join('');
}

function subReadingLessonRow(l) {
  const zhText = l.chinese || l.zh || '';
  const pyText = l.pinyin  || l.py || '';
  const viText = l.vietnamese || l.vi || '';
  const zhPrev = zhText.replace(/\s+/g,' ').slice(0, 40);
  return `<div class="bl-post-item" id="sub-lesson-${l.id}" style="flex-direction:column;align-items:stretch;gap:0">
    <div style="display:flex;align-items:center;gap:8px">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;color:#1f2937">${escHtml(l.title || '(chưa có tiêu đề)')}</div>
        <div style="font-size:11px;color:#9ca3af;font-family:'Noto Serif TC',serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:400px">${escHtml(zhPrev)}${zhText.length > 40 ? '…' : ''}</div>
      </div>
      <div style="display:flex;gap:2px;flex-shrink:0">
        <button class="table-btn" onclick="subToggleEditLesson(${l.id})" title="Sửa"><i class="fa-solid fa-pen-to-square" style="color:#1a56db"></i></button>
        <button class="table-btn" onclick="subDeleteLesson(${l.id})" title="Xóa"><i class="fa-solid fa-trash" style="color:#c0392b"></i></button>
      </div>
    </div>
    <div id="sub-edit-${l.id}" style="display:none;margin-top:10px;padding:14px;background:#f4f5f7;border-radius:8px;border:1px solid #e5e7eb">
      <div class="s-label" style="margin-bottom:6px">Sửa bài học</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div style="grid-column:1/-1">
          <div class="s-label">Tên bài học</div>
          <input type="text" id="sub-edit-title-${l.id}" class="s-input" value="${escHtml(l.title || '')}">
        </div>
        <div>
          <div class="s-label">Tiếng Trung 繁體</div>
          <textarea id="sub-edit-zh-${l.id}" style="width:100%;min-height:120px;border:1px solid #e5e7eb;border-radius:8px;font-family:'Noto Serif TC',serif;font-size:14px;padding:9px;resize:vertical;outline:none;line-height:1.7">${escHtml(zhText)}</textarea>
        </div>
        <div>
          <div class="s-label">Pinyin</div>
          <textarea id="sub-edit-py-${l.id}" style="width:100%;min-height:120px;border:1px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:13px;padding:9px;resize:vertical;outline:none;line-height:1.7">${escHtml(pyText)}</textarea>
        </div>
        <div style="grid-column:1/-1">
          <div class="s-label">Tiếng Việt</div>
          <textarea id="sub-edit-vi-${l.id}" style="width:100%;min-height:80px;border:1px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:13px;padding:9px;resize:vertical;outline:none;line-height:1.7">${escHtml(viText)}</textarea>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="s-btn" onclick="subSaveLesson(${l.id})" style="flex:1;font-size:12px">💾 Lưu</button>
        <button class="s-btn" onclick="subToggleEditLesson(${l.id})" style="background:#6b7280;font-size:12px">Hủy</button>
      </div>
    </div>
  </div>`;
}

// ── LISTENING: lesson list ────────────────────────
async function subLoadListeningLessons(bookName) {
  // Set header buttons
  document.getElementById('sub-lesson-header-actions').innerHTML = `
    <button class="s-btn" onclick="subToggleAddLesson()" style="font-size:12px;padding:7px 14px">+ Thêm bài học</button>
    <button class="s-btn" onclick="subGoToListeningAdmin('${bookName.replace(/'/g,"\\'")}')" style="font-size:12px;padding:7px 14px;background:#0d1b4b">
      🎧 Quản lý Audio →
    </button>`;

  // Set add form content (listening: title + optional lesson number)
  document.getElementById('sub-add-form-content').innerHTML = `
    <div class="s-label" style="margin-bottom:8px">Thêm bài học mới (Listening)</div>
    <div style="display:grid;grid-template-columns:100px 1fr;gap:10px;align-items:end">
      <div>
        <div class="s-label">Bài số</div>
        <input type="number" id="sub-ls-new-num" class="s-input" placeholder="1" min="1" style="text-align:center">
      </div>
      <div>
        <div class="s-label">Tên / Chủ đề bài học</div>
        <input type="text" id="sub-new-title" class="s-input" placeholder="VD: Giới thiệu bản thân, Mua sắm…">
      </div>
    </div>
    <div style="font-size:11px;color:#9ca3af;margin-top:6px">Tiêu đề tạo ra: "Bài 1 — Giới thiệu bản thân". Audio sẽ được thêm trong mục <b>Listening</b>.</div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="s-btn" onclick="subSaveNewListeningLesson()" style="flex:1">💾 Tạo bài học</button>
      <button class="s-btn" onclick="subToggleAddLesson()" style="background:#6b7280">Hủy</button>
    </div>`;

  // Load lessons
  const el = document.getElementById('sub-lesson-list');
  el.innerHTML = '<p style="color:#9ca3af;padding:1rem;font-size:13px">Đang tải…</p>';

  const [{ data: lessons }, { data: segs }] = await Promise.all([
    _adminDb.client.from('lessons').select('id,title,book').eq('book', bookName).order('id'),
    _adminDb.client.from('audio_segments').select('lesson_id,item_label').eq('book_name', bookName),
  ]);

  if (!lessons?.length) {
    el.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:2rem;font-size:13px">Chưa có bài học nào. Tạo bài học rồi thêm audio trong mục Listening.</p>';
    return;
  }

  // Count audio segments + unique item_labels per lesson
  const audioCounts  = {};
  const audioLabels  = {};
  (segs || []).forEach(s => {
    audioCounts[s.lesson_id] = (audioCounts[s.lesson_id] || 0) + 1;
    if (!audioLabels[s.lesson_id]) audioLabels[s.lesson_id] = new Set();
    if (s.item_label) audioLabels[s.lesson_id].add(s.item_label);
  });

  el.innerHTML = lessons.map((l, i) => subListeningLessonRow(l, audioCounts, audioLabels)).join('');
}

function subListeningLessonRow(l, audioCounts, audioLabels) {
  const segCount   = audioCounts[l.id] || 0;
  const labels     = [...(audioLabels[l.id] || [])].sort();
  const labelPills = labels.map(lbl =>
    `<span style="font-size:10px;font-weight:600;color:#0d1b4b;background:#dbeafe;padding:2px 8px;border-radius:6px;white-space:nowrap">${escHtml(lbl)}</span>`
  ).join('');

  return `<div class="bl-post-item" id="sub-lesson-${l.id}" style="align-items:center">
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:600;color:#1f2937;margin-bottom:4px">${escHtml(l.title || '(chưa có tiêu đề)')}</div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        ${segCount > 0
          ? `<span style="font-size:11px;color:#15803d;background:#f0fdf4;border:1px solid #bbf7d0;padding:2px 8px;border-radius:6px;font-weight:600">${segCount} đoạn audio</span>`
          : `<span style="font-size:11px;color:#9ca3af">Chưa có audio</span>`}
        ${labelPills}
      </div>
    </div>
    <div style="display:flex;gap:6px;flex-shrink:0;align-items:center">
      <button class="s-btn" onclick="subGoToListeningAdmin('${_subCurrentBook.replace(/'/g,"\\'")}',${l.id})"
        style="font-size:11px;padding:5px 12px;background:#0d1b4b">
        🎧 Thêm audio
      </button>
      <button class="table-btn" onclick="subDeleteLesson(${l.id})" title="Xóa bài học"><i class="fa-solid fa-trash" style="color:#c0392b"></i></button>
    </div>
  </div>`;
}

function subGoToListeningAdmin(bookName, lessonId) {
  // Switch to Listening section and pre-select book
  const navBtn = [...document.querySelectorAll('.nav-item')].find(b => b.onclick?.toString().includes("'listening'"));
  if (navBtn) setNav(navBtn, 'listening');
  setTimeout(() => {
    lsSelectBook(bookName);
    // Scroll to lesson if given
  }, 150);
}

// ── Shared lesson add toggle ──────────────────────
function subToggleAddLesson() {
  const el = document.getElementById('sub-add-form');
  if (!el) return;
  const isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : '';
  if (!isOpen) {
    document.getElementById('sub-add-msg').className = 's-msg';
  }
}

// ── Reading: save new lesson ──────────────────────
async function subSaveNewLesson() {
  if (!_subCurrentBook) return;
  const title  = document.getElementById('sub-new-title')?.value.trim();
  const zh     = document.getElementById('sub-new-zh')?.value.trim();
  const pinyin = document.getElementById('sub-new-py')?.value.trim();
  const vi     = document.getElementById('sub-new-vi')?.value.trim();
  if (!zh) { adminMsg('sub-add-msg', 'Nhập nội dung tiếng Trung.', 'err'); return; }
  const { error } = await _adminDb.client.from('lessons').insert([{
    title: title || null, chinese: zh, pinyin: pinyin || null,
    vietnamese: vi || null, description: zh.slice(0, 60) || null,
    book: _subCurrentBook,
  }]);
  if (error) { adminMsg('sub-add-msg', 'Lỗi: ' + error.message, 'err'); return; }
  adminMsg('sub-add-msg', '✓ Đã thêm bài học.', 'ok');
  subToggleAddLesson();
  subLoadReadingLessons(_subCurrentBook);
}

// ── Listening: save new lesson (title only) ───────
async function subSaveNewListeningLesson() {
  if (!_subCurrentBook) return;
  const num   = parseInt(document.getElementById('sub-ls-new-num')?.value) || null;
  const topic = document.getElementById('sub-new-title')?.value.trim();
  if (!topic) { adminMsg('sub-add-msg', 'Nhập tên / chủ đề bài học.', 'err'); return; }
  const title = num ? `Bài ${num} — ${topic}` : topic;
  const { error } = await _adminDb.client.from('lessons').insert([{
    title, book: _subCurrentBook,
  }]);
  if (error) { adminMsg('sub-add-msg', 'Lỗi: ' + error.message, 'err'); return; }
  adminMsg('sub-add-msg', '✓ Đã tạo: ' + title, 'ok');
  subToggleAddLesson();
  subLoadListeningLessons(_subCurrentBook);
}

// ── Shared: edit / delete lesson ──────────────────
function subToggleEditLesson(id) {
  const el = document.getElementById(`sub-edit-${id}`);
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
}

async function subSaveLesson(id) {
  const row = {
    title:       document.getElementById(`sub-edit-title-${id}`)?.value.trim(),
    chinese:     document.getElementById(`sub-edit-zh-${id}`)?.value.trim(),
    pinyin:      document.getElementById(`sub-edit-py-${id}`)?.value.trim(),
    vietnamese:  document.getElementById(`sub-edit-vi-${id}`)?.value.trim(),
    description: document.getElementById(`sub-edit-zh-${id}`)?.value.trim().slice(0, 60) || null,
  };
  const { error } = await _adminDb.client.from('lessons').update(row).eq('id', id);
  if (error) { alert('Lỗi: ' + error.message); return; }
  if (_subCurrentBook) subLoadLessons(_subCurrentBook);
}

async function subDeleteLesson(id) {
  if (!confirm('Xóa bài học này?')) return;
  const { error } = await _adminDb.client.from('lessons').delete().eq('id', id);
  if (error) {
    alert('Không thể xóa: ' + error.message);
    return;
  }
  if (_subCurrentBook) subLoadLessons(_subCurrentBook);
}

// ── Reading: import .txt ──────────────────────────
function subOpenImport() {
  if (!_subCurrentBook) { adminMsg('sub-msg', 'Chọn khóa học con trước rồi mới import.', 'err'); return; }
  app.importer.book = _subCurrentBook;
  const sel = document.getElementById('import-book');
  if (sel) {
    if (![...sel.options].find(o => o.value === _subCurrentBook)) {
      sel.add(new Option(_subCurrentBook, _subCurrentBook));
    }
    sel.value = _subCurrentBook;
  }
  document.getElementById('import-file').click();
}
