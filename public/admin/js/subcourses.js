// ── Sub-course (book) management ─────────────────
let _subCurrentBook = null;
let _subCreateMode  = false;
let _subSkillType   = 'reading';  // 'reading' | 'listening'

// ── Inline audio state (per lesson) ──────────────
const _subAudio = {};
// _subAudio[lessonId] = { url, file, pending, lessonNum, audioNum }
function _saGet(lid)  { if (!_subAudio[lid]) _subAudio[lid] = { url: null, file: null, pending: [], lessonNum: 1, audioNum: 1 }; return _subAudio[lid]; }

// ── Book list ────────────────────────────────────
async function loadSubCourses() {
  // Warn if skill_type column missing (PostgREST schema cache not refreshed)
  const probe = await _adminDb.getBooksMeta();
  if (probe.length > 0 && !('skill_type' in probe[0])) {
    const listEl = document.getElementById('sub-book-list');
    if (listEl) listEl.innerHTML = `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 14px;font-size:12px;color:#c0392b;line-height:1.7">
      <b>⚠ Cột <code>skill_type</code> chưa tồn tại trong DB.</b><br>
      Chạy SQL trong Supabase:<br>
      <code style="display:block;background:#fff;padding:6px 10px;border-radius:5px;margin-top:6px;font-size:11px">ALTER TABLE books ADD COLUMN IF NOT EXISTS skill_type TEXT DEFAULT 'reading';</code>
      Sau đó vào <b>Project Settings → API → Reload schema</b>.
    </div>`;
    return;
  }
  const books = probe;
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
  document.getElementById('sub-lesson-header-actions').innerHTML = `
    <button class="s-btn" onclick="subToggleAddLesson()" style="font-size:12px;padding:7px 14px">+ Thêm bài học</button>`;

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
    <div style="font-size:11px;color:#9ca3af;margin-top:6px">Ví dụ: Bài 1 — Giới thiệu bản thân</div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="s-btn" onclick="subSaveNewListeningLesson()" style="flex:1">💾 Tạo bài học</button>
      <button class="s-btn" onclick="subToggleAddLesson()" style="background:#6b7280">Hủy</button>
    </div>`;

  const el = document.getElementById('sub-lesson-list');
  el.innerHTML = '<p style="color:#9ca3af;padding:1rem;font-size:13px">Đang tải…</p>';

  const [{ data: lessons }, { data: segs }] = await Promise.all([
    _adminDb.client.from('lessons').select('id,title,book').eq('book', bookName).order('id'),
    _adminDb.client.from('audio_segments').select('*').eq('book_name', bookName).order('sort_order').order('id'),
  ]);

  if (!lessons?.length) {
    el.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:2rem;font-size:13px">Chưa có bài học nào. Bấm "+ Thêm bài học" để tạo.</p>';
    return;
  }

  const segsByLesson = {};
  (segs || []).forEach(s => {
    if (!segsByLesson[s.lesson_id]) segsByLesson[s.lesson_id] = {};
    const lbl = s.item_label || 'Audio';
    if (!segsByLesson[s.lesson_id][lbl]) segsByLesson[s.lesson_id][lbl] = [];
    segsByLesson[s.lesson_id][lbl].push(s);
  });

  el.innerHTML = lessons.map((l, i) =>
    subListeningLessonRow(l, i + 1, segsByLesson[l.id] || {})
  ).join('');
}

function subListeningLessonRow(lesson, lessonNum, segsByLabel) {
  const totalSegs = Object.values(segsByLabel).flat().length;
  const labels    = Object.keys(segsByLabel).sort();
  const labelPills = labels.map(lbl => {
    const cnt = segsByLabel[lbl].length;
    return `<span style="font-size:10px;font-weight:600;color:#0d1b4b;background:#dbeafe;padding:2px 9px;border-radius:6px;cursor:pointer"
      onclick="subToggleAudioLabel(${lesson.id},'${lbl.replace(/'/g,"\\'")}')">
      ${escHtml(lbl)} (${cnt})</span>`;
  }).join('');
  const nextAudioNum = labels.length + 1;

  return `<div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:10px" id="sub-ls-lesson-${lesson.id}">
    <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:#f9fafb">
      <div style="width:28px;height:28px;border-radius:7px;background:#0d1b4b;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${lessonNum}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:#1f2937">${escHtml(lesson.title || '(chưa có tiêu đề)')}</div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:3px">
          ${totalSegs > 0
            ? `<span style="font-size:11px;color:#15803d;font-weight:600">${totalSegs} đoạn · ${labels.length} audio</span>`
            : `<span style="font-size:11px;color:#9ca3af">Chưa có audio</span>`}
          ${labelPills}
        </div>
      </div>
      <div style="display:flex;gap:5px;flex-shrink:0">
        <button class="s-btn" onclick="subToggleAudioPanel(${lesson.id},${lessonNum},${nextAudioNum})"
          style="font-size:11px;padding:5px 12px;background:#0d1b4b">+ Thêm audio</button>
        <button class="table-btn" onclick="subDeleteLesson(${lesson.id})" title="Xóa bài học">
          <i class="fa-solid fa-trash" style="color:#c0392b"></i>
        </button>
      </div>
    </div>
    <div id="sub-ls-labels-${lesson.id}" style="display:none"></div>
    <div id="sub-ls-panel-${lesson.id}" style="display:none;padding:14px;border-top:1px solid #e5e7eb;background:#fff"></div>
  </div>`;
}

async function subToggleAudioLabel(lessonId, label) {
  const el = document.getElementById(`sub-ls-labels-${lessonId}`);
  if (!el) return;
  if (el.style.display !== 'none') { el.style.display = 'none'; return; }
  const { data: segs } = await _adminDb.client.from('audio_segments')
    .select('*').eq('lesson_id', lessonId).eq('item_label', label).order('sort_order').order('id');
  el.style.display = '';
  el.innerHTML = `<div style="padding:10px 14px;border-top:1px solid #f3f4f6">
    <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">${escHtml(label)}</div>
    ${(segs||[]).map(s => subSavedSegRow(s)).join('')}
  </div>`;
}

function subSavedSegRow(s) {
  const dur = s.end_sec > 0 ? `${s.start_sec.toFixed(1)}s–${s.end_sec.toFixed(1)}s` : '';
  return `<div id="sub-seg-${s.id}" style="display:flex;gap:8px;align-items:flex-start;padding:8px;border:1px solid #f3f4f6;border-radius:7px;background:#fafafa;margin-bottom:6px">
    <button onclick="subPlaySeg('${s.audio_url}',${s.start_sec},${s.end_sec})"
      style="width:30px;height:30px;border-radius:50%;background:#0d1b4b;color:#fff;border:none;cursor:pointer;flex-shrink:0;font-size:11px">
      <i class="fa-solid fa-play"></i>
    </button>
    <div style="flex:1;min-width:0">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:4px">
        <input id="sub-seg-tr-${s.id}" value="${escHtml(s.transcript||'')}" placeholder="Transcript"
          style="padding:5px 8px;border:1px solid #e5e7eb;border-radius:5px;font-family:'Noto Serif TC',serif;font-size:13px">
        <input id="sub-seg-py-${s.id}" value="${escHtml(s.pinyin||'')}" placeholder="Pinyin"
          style="padding:5px 8px;border:1px solid #e5e7eb;border-radius:5px;font-size:12px;font-family:inherit">
      </div>
      <input id="sub-seg-vi-${s.id}" value="${escHtml(s.meaning_vi||'')}" placeholder="Nghĩa tiếng Việt"
        style="width:100%;padding:5px 8px;border:1px solid #e5e7eb;border-radius:5px;font-size:12px;font-family:inherit;box-sizing:border-box">
      <div style="font-size:10px;color:#9ca3af;margin-top:3px">${dur}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
      <button onclick="subSaveSeg(${s.id})" style="background:#16a34a;color:#fff;border:none;padding:4px 10px;border-radius:5px;cursor:pointer;font-size:11px;font-weight:600">💾</button>
      <button onclick="subDeleteSeg(${s.id})" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;padding:4px 10px;border-radius:5px;cursor:pointer;font-size:11px">🗑</button>
    </div>
  </div>`;
}

// ── Inline Audio Upload Panel ─────────────────
function subToggleAudioPanel(lessonId, lessonNum, defaultAudioNum) {
  const panel = document.getElementById(`sub-ls-panel-${lessonId}`);
  if (!panel) return;
  if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }
  const st = _saGet(lessonId);
  st.lessonNum = lessonNum; st.audioNum = defaultAudioNum;
  panel.style.display = '';
  panel.innerHTML = subAudioPanelHTML(lessonId, lessonNum, defaultAudioNum);
}

function subAudioPanelHTML(lessonId, lessonNum, audioNum) {
  return `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="font-size:12px;font-weight:600;color:#374151">Bài</span>
        <input id="sub-la-lesson-${lessonId}" type="number" min="1" value="${lessonNum}"
          style="width:54px;padding:6px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;font-weight:700;text-align:center"
          oninput="subUpdateLabel(${lessonId})">
        <span style="font-size:12px;font-weight:600;color:#374151">Audio</span>
        <input id="sub-la-audio-${lessonId}" type="number" min="1" value="${audioNum}"
          style="width:54px;padding:6px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;font-weight:700;text-align:center"
          oninput="subUpdateLabel(${lessonId})">
      </div>
      <div style="background:#eff6ff;border:1px solid #c7d7fd;padding:5px 14px;border-radius:8px;display:flex;align-items:center;gap:6px">
        <i class="fa-solid fa-tag" style="color:#1a56db;font-size:11px"></i>
        <span id="sub-la-label-${lessonId}" style="font-size:13px;font-weight:700;color:#0d1b4b">Audio ${lessonNum}.${audioNum}</span>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
      <input type="file" accept="audio/*" id="sub-la-file-${lessonId}"
        onchange="subLaPreview(${lessonId},this)" style="font-size:12px;flex:1;min-width:160px">
      <button id="sub-la-upload-btn-${lessonId}" onclick="subLaUpload(${lessonId})"
        style="background:#1a56db;color:#fff;border:none;padding:8px 16px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">
        <i class="fa-solid fa-upload"></i> Upload
      </button>
      <button id="sub-la-stt-btn-${lessonId}" onclick="subLaTranscribe(${lessonId})" disabled
        style="background:#f3f4f6;color:#9ca3af;border:1px solid #e5e7eb;padding:8px 16px;border-radius:7px;font-size:12px;font-weight:600;cursor:not-allowed;font-family:inherit;white-space:nowrap">
        <i class="fa-solid fa-microphone"></i> Whisper STT
      </button>
    </div>
    <audio id="sub-la-audio-${lessonId}" controls style="display:none;width:100%;height:38px;margin-bottom:10px"></audio>
    <div id="sub-la-msg-${lessonId}" style="font-size:12px;min-height:18px;margin-bottom:8px"></div>
    <div id="sub-la-pending-${lessonId}"></div>`;
}

function subUpdateLabel(lessonId) {
  const ln = document.getElementById(`sub-la-lesson-${lessonId}`)?.value || 1;
  const an = document.getElementById(`sub-la-audio-${lessonId}`)?.value || 1;
  const lEl = document.getElementById(`sub-la-label-${lessonId}`);
  if (lEl) lEl.textContent = `Audio ${ln}.${an}`;
  _saGet(lessonId).lessonNum = parseInt(ln);
  _saGet(lessonId).audioNum  = parseInt(an);
}

function subLaPreview(lessonId, input) {
  const file = input.files[0]; if (!file) return;
  const audio = document.getElementById(`sub-la-audio-${lessonId}`);
  if (audio) { audio.src = URL.createObjectURL(file); audio.style.display = ''; }
  _saGet(lessonId).file = file;
}

async function subLaUpload(lessonId) {
  const st   = _saGet(lessonId);
  const file = st.file || document.getElementById(`sub-la-file-${lessonId}`)?.files[0];
  if (!file) { subLaMsg(lessonId, 'Chưa chọn file.', 'err'); return; }
  const btn = document.getElementById(`sub-la-upload-btn-${lessonId}`);
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading…';
  subLaMsg(lessonId, 'Đang upload…', 'info');
  const { url, error } = await _adminDb.uploadAudio(file, _subCurrentBook, lessonId);
  btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-upload"></i> Upload';
  if (error) { subLaMsg(lessonId, 'Lỗi upload: ' + error.message, 'err'); return; }
  st.url = url; st.file = file;
  subLaMsg(lessonId, '✓ Upload xong!', 'ok');
  const sttBtn = document.getElementById(`sub-la-stt-btn-${lessonId}`);
  if (sttBtn) { sttBtn.disabled = false; sttBtn.style.background = '#0d1b4b'; sttBtn.style.color = '#fff'; sttBtn.style.borderColor = '#0d1b4b'; sttBtn.style.cursor = 'pointer'; }
}

async function subLaTranscribe(lessonId) {
  const st   = _saGet(lessonId);
  const key  = localStorage.getItem('api_key_openai') || '';
  const file = st.file || document.getElementById(`sub-la-file-${lessonId}`)?.files[0];
  if (!file) { subLaMsg(lessonId, 'Cần file MP3.', 'err'); return; }
  if (!key)  { subLaMsg(lessonId, 'Chưa có OpenAI key.', 'err'); return; }
  const btn = document.getElementById(`sub-la-stt-btn-${lessonId}`);
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Transcribing…';
  subLaMsg(lessonId, 'Đang gửi Whisper…', 'info');
  try {
    const form = new FormData();
    form.append('file', file); form.append('model', 'whisper-1');
    form.append('language', 'zh'); form.append('response_format', 'verbose_json');
    form.append('prompt', '繁體中文，臺灣用語，請使用繁體字');
    const res  = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    st.pending = (data.segments || []).map(s => ({
      text: s.text.trim(), start_sec: parseFloat(s.start.toFixed(2)), end_sec: parseFloat(s.end.toFixed(2)),
    })).filter(s => s.text);
    subLaRenderPending(lessonId);
    subLaMsg(lessonId, `✓ ${st.pending.length} đoạn — xem lại rồi lưu.`, 'ok');
  } catch(e) {
    subLaMsg(lessonId, 'Lỗi Whisper: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-microphone"></i> Whisper STT';
  }
}

function subLaRenderPending(lessonId) {
  const st   = _saGet(lessonId);
  const area = document.getElementById(`sub-la-pending-${lessonId}`);
  if (!area) return;
  const rows = st.pending.map((s, i) => `
    <div style="display:flex;gap:8px;align-items:flex-start;padding:8px;border:1px solid #f3f4f6;border-radius:7px;background:#fafafa;margin-bottom:6px">
      <button onclick="subLaPlayLocal(${lessonId},${s.start_sec},${s.end_sec})"
        style="width:28px;height:28px;border-radius:50%;background:#0d1b4b;color:#fff;border:none;cursor:pointer;flex-shrink:0;font-size:10px">
        <i class="fa-solid fa-play"></i>
      </button>
      <div style="flex:1;min-width:0">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:4px">
          <input id="sub-pt-${lessonId}-${i}" value="${escHtml(s.text)}" placeholder="Transcript 繁體"
            style="padding:5px 8px;border:1px solid #e5e7eb;border-radius:5px;font-family:'Noto Serif TC',serif;font-size:13px">
          <input id="sub-pp-${lessonId}-${i}" placeholder="Pinyin"
            style="padding:5px 8px;border:1px solid #e5e7eb;border-radius:5px;font-size:12px;font-family:inherit">
        </div>
        <input id="sub-pv-${lessonId}-${i}" placeholder="Nghĩa tiếng Việt"
          style="width:100%;padding:5px 8px;border:1px solid #e5e7eb;border-radius:5px;font-size:12px;font-family:inherit;box-sizing:border-box">
        <div style="font-size:10px;color:#9ca3af;margin-top:2px">${s.start_sec.toFixed(1)}s–${s.end_sec.toFixed(1)}s</div>
      </div>
      <button onclick="subLaRemovePending(${lessonId},${i})"
        style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;width:26px;height:26px;border-radius:5px;cursor:pointer;font-size:11px;flex-shrink:0">✕</button>
    </div>`).join('');
  area.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:6px">
      <span style="font-size:12px;font-weight:700;color:#374151">${st.pending.length} đoạn chưa lưu</span>
      <div style="display:flex;gap:6px">
        <button id="sub-la-ai-btn-${lessonId}" onclick="subLaAIFill(${lessonId})"
          style="background:#f47b20;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">
          <i class="fa-solid fa-sparkles"></i> AI Pinyin & Nghĩa
        </button>
        <button onclick="subLaSaveAll(${lessonId})"
          style="background:#16a34a;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">
          💾 Lưu tất cả
        </button>
      </div>
    </div>
    ${rows}`;
}

function subLaPlayLocal(lessonId, startSec, endSec) {
  const el = document.getElementById(`sub-la-audio-${lessonId}`);
  if (!el?.src) return;
  el.currentTime = startSec; el.play();
  el.ontimeupdate = () => { if (el.currentTime >= endSec) { el.pause(); el.ontimeupdate = null; } };
}

function subLaRemovePending(lessonId, i) {
  _saGet(lessonId).pending.splice(i, 1);
  subLaRenderPending(lessonId);
}

async function subLaAIFill(lessonId) {
  const st  = _saGet(lessonId);
  const key = localStorage.getItem('api_key_openai') || '';
  if (!key) { subLaMsg(lessonId, 'Chưa có OpenAI key — vào Settings → AI & API.', 'err'); return; }

  const texts = st.pending.map((_, i) =>
    document.getElementById(`sub-pt-${lessonId}-${i}`)?.value.trim() || ''
  ).filter(t => t);
  if (!texts.length) return;

  const btn = document.getElementById(`sub-la-ai-btn-${lessonId}`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> AI…'; }

  // Use OpenAI directly (same key as Whisper) — batch 20/call
  const BATCH = 20;
  const results = new Array(texts.length).fill(null);
  let filled = 0;

  try {
    for (let start = 0; start < texts.length; start += BATCH) {
      const chunk = texts.slice(start, start + BATCH);
      subLaMsg(lessonId, `Đang xử lý ${start + 1}–${Math.min(start + BATCH, texts.length)} / ${texts.length}…`, 'info');

      const userMsg = chunk.map((t, i) => `${start + i + 1}. ${t}`).join('\n');
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 2000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: `Bạn là chuyên gia tiếng Trung phồn thể Đài Loan (繁體中文). Với mỗi câu được đánh số, tạo Pinyin có dấu thanh và nghĩa tiếng Việt tự nhiên ngắn gọn. Trả về JSON: {"items":[{"pinyin":"...","vi":"..."}]} — đúng số, đúng thứ tự.` },
            { role: 'user', content: userMsg },
          ],
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const content = data.choices?.[0]?.message?.content || '';
      const parsed  = JSON.parse(content);
      const items   = parsed.items || parsed;
      (Array.isArray(items) ? items : []).forEach((r, i) => { results[start + i] = r; });
      filled += (Array.isArray(items) ? items : []).length;
    }

    results.forEach((r, i) => {
      if (!r) return;
      const pyEl = document.getElementById(`sub-pp-${lessonId}-${i}`);
      const viEl = document.getElementById(`sub-pv-${lessonId}-${i}`);
      if (pyEl && r.pinyin) pyEl.value = r.pinyin;
      if (viEl && r.vi)     viEl.value = r.vi;
    });
    subLaMsg(lessonId, `✓ Đã điền ${filled}/${texts.length} đoạn.`, 'ok');
  } catch(e) {
    subLaMsg(lessonId, 'Lỗi AI: ' + e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-sparkles"></i> AI Pinyin & Nghĩa'; }
  }
}

async function subLaSaveAll(lessonId) {
  const st = _saGet(lessonId);
  if (!st.url) { subLaMsg(lessonId, 'Chưa upload audio.', 'err'); return; }
  const ln    = parseInt(document.getElementById(`sub-la-lesson-${lessonId}`)?.value) || st.lessonNum;
  const an    = parseInt(document.getElementById(`sub-la-audio-${lessonId}`)?.value) || st.audioNum;
  const label = `Audio ${ln}.${an}`;
  const { data: lessonData } = await _adminDb.client.from('lessons').select('title').eq('id', lessonId).single();
  const rows = st.pending.map((s, i) => ({
    book_name: _subCurrentBook, lesson_id: lessonId, lesson_title: lessonData?.title || '',
    audio_url: st.url, item_label: label, start_sec: s.start_sec, end_sec: s.end_sec,
    transcript:  document.getElementById(`sub-pt-${lessonId}-${i}`)?.value.trim() || s.text,
    pinyin:      document.getElementById(`sub-pp-${lessonId}-${i}`)?.value.trim() || '',
    meaning_vi:  document.getElementById(`sub-pv-${lessonId}-${i}`)?.value.trim() || '',
    sort_order: i, published: true,
  }));
  const { error } = await _adminDb.bulkInsertAudioSegments(rows);
  if (error) { subLaMsg(lessonId, 'Lỗi lưu: ' + error.message, 'err'); return; }
  subLaMsg(lessonId, `✓ Đã lưu ${rows.length} đoạn — ${label}.`, 'ok');
  st.pending = []; st.audioNum = an + 1;
  subLoadListeningLessons(_subCurrentBook);
}

function subPlaySeg(url, startSec, endSec) {
  let el = document.getElementById('sub-shared-audio');
  if (!el) { el = document.createElement('audio'); el.id = 'sub-shared-audio'; document.body.appendChild(el); }
  if (el.src !== url) el.src = url;
  el.currentTime = startSec; el.play();
  el.ontimeupdate = () => { if (el.currentTime >= endSec) { el.pause(); el.ontimeupdate = null; } };
}

async function subSaveSeg(id) {
  const tr = document.getElementById(`sub-seg-tr-${id}`)?.value.trim();
  const py = document.getElementById(`sub-seg-py-${id}`)?.value.trim();
  const vi = document.getElementById(`sub-seg-vi-${id}`)?.value.trim();
  const { error } = await _adminDb.saveAudioSegment({ id, transcript: tr, pinyin: py, meaning_vi: vi });
  if (error) { alert('Lỗi: ' + error.message); return; }
  const btn = event.target; btn.textContent = '✓';
  setTimeout(() => btn.textContent = '💾', 1500);
}

async function subDeleteSeg(id) {
  if (!confirm('Xóa đoạn này?')) return;
  await _adminDb.deleteAudioSegment(id);
  document.getElementById(`sub-seg-${id}`)?.remove();
}

function subLaMsg(lessonId, text, type) {
  const el = document.getElementById(`sub-la-msg-${lessonId}`);
  if (!el) return;
  el.textContent = text;
  el.style.color = type === 'err' ? '#dc2626' : type === 'ok' ? '#16a34a' : '#1a56db';
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
    title, book: _subCurrentBook, chinese: '', pinyin: '', vietnamese: '',
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
