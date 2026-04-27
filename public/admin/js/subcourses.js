// ── Sub-course (book) management ─────────────────
let _subCurrentBook = null;
let _subCreateMode  = false;

async function loadSubCourses() {
  const books = await _adminDb.getBooksMeta();
  const listEl = document.getElementById('sub-book-list');
  const selEl  = document.getElementById('sub-book-select');

  // Populate dropdown
  selEl.innerHTML = '<option value="">— Chọn sách để chỉnh sửa —</option>' +
    books.map(b => `<option value="${escHtml(b.name)}">${escHtml(b.display_name || b.name)}</option>`).join('');

  // Populate compact list
  if (!books.length) { listEl.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:2rem;font-size:13px">Chưa có sách nào.</p>'; return; }

  // Get lesson counts
  const { data: ldata } = await _adminDb.client.from('lessons').select('book');
  const counts = {};
  (ldata || []).forEach(l => { counts[l.book || 'B1'] = (counts[l.book || 'B1'] || 0) + 1; });

  listEl.innerHTML = books.map(b => `
    <div class="bl-post-item" style="cursor:pointer" onclick="subSelectBookFromList('${b.name.replace(/'/g,"\\'")}')">
      <div class="bl-post-info">
        <div class="bl-post-title">${escHtml(b.display_name || b.name)}</div>
        <div class="bl-post-meta">
          <span class="bl-post-dot" style="background:#1a56db"></span>
          ${escHtml(b.name)} · ${counts[b.name] || 0} bài học
        </div>
      </div>
      <button class="table-btn" title="Chọn"><i class="fa-solid fa-pen-to-square" style="color:#1a56db"></i></button>
    </div>`).join('');
}

function subNewBook() {
  _subCreateMode  = true;
  _subCurrentBook = null;
  document.getElementById('sub-book-select').value = '';
  document.getElementById('sub-form-heading').innerHTML = '<i class="fa-solid fa-plus" style="color:#15803d"></i> Tạo khóa học con mới';
  document.getElementById('sub-code-row').style.display = '';
  document.getElementById('sub-code').value = '';
  document.getElementById('sub-name').value = '';
  document.getElementById('sub-desc').value = '';
  document.getElementById('sub-detail').value = '';
  subClearCover();
  document.getElementById('sub-save-btn').textContent = '💾 Tạo khóa học con';
  document.getElementById('sub-cancel-btn').style.display = '';
  document.getElementById('sub-book-form').style.display = '';
  document.getElementById('sub-lesson-wrap').style.display = 'none';
  document.getElementById('sub-msg').className = 's-msg';
  document.getElementById('sub-code').focus();
}

function subCancelNew() {
  _subCreateMode  = false;
  _subCurrentBook = null;
  document.getElementById('sub-book-select').value = '';
  document.getElementById('sub-form-heading').innerHTML = '<i class="fa-solid fa-book-bookmark" style="color:#1a56db"></i> Chỉnh sửa khóa học con';
  document.getElementById('sub-code-row').style.display = 'none';
  document.getElementById('sub-save-btn').textContent = '💾 Lưu khóa học con';
  document.getElementById('sub-cancel-btn').style.display = 'none';
  document.getElementById('sub-book-form').style.display = 'none';
  document.getElementById('sub-lesson-wrap').style.display = 'none';
  document.getElementById('sub-msg').className = 's-msg';
}

async function subSelectBook(bookName) {
  if (!bookName) { document.getElementById('sub-book-form').style.display = 'none'; document.getElementById('sub-lesson-wrap').style.display = 'none'; return; }
  _subCreateMode  = false;
  _subCurrentBook = bookName;
  document.getElementById('sub-form-heading').innerHTML = '<i class="fa-solid fa-book-bookmark" style="color:#1a56db"></i> Chỉnh sửa khóa học con';
  document.getElementById('sub-code-row').style.display = 'none';
  document.getElementById('sub-save-btn').textContent = '💾 Lưu khóa học con';
  document.getElementById('sub-cancel-btn').style.display = 'none';
  const books = await _adminDb.getBooksMeta();
  const meta = books.find(b => b.name === bookName) || {};
  document.getElementById('sub-name').value  = meta.display_name || '';
  document.getElementById('sub-desc').value  = meta.description  || '';
  document.getElementById('sub-detail').value = meta.detail      || '';
  document.getElementById('sub-cover').value = meta.cover_url   || '';
  subCoverPreview(meta.cover_url || '');
  document.getElementById('sub-book-form').style.display = '';
  document.getElementById('sub-msg').className = 's-msg';
  document.getElementById('sub-lesson-heading').textContent = `Bài học — ${meta.display_name || bookName}`;
  document.getElementById('sub-lesson-wrap').style.display = '';
  subLoadLessons(bookName);
}

function subSelectBookFromList(bookName) {
  document.getElementById('sub-book-select').value = bookName;
  subSelectBook(bookName);
}

function subCoverPreview(url) { imgPreview(url, 'sub-cover-preview', 'sub-cover-preview-img'); }
function subFileChange(input) { imgFileChange(input, 'sub-cover', 'sub-cover-preview', 'sub-cover-preview-img'); }
function subClearCover() { imgClear('sub-cover', 'sub-cover-file', 'sub-cover-preview'); }
function subWrap(before, after) { mdWrap('sub-detail', before, after); }
function subInsertLine(prefix) { mdInsertLine('sub-detail', prefix); }

async function saveSubCourse() {
  const displayName = document.getElementById('sub-name').value.trim();
  const description = document.getElementById('sub-desc').value.trim() || null;
  const coverUrl    = document.getElementById('sub-cover').value.trim() || null;
  const detailVal   = document.getElementById('sub-detail').value.trim() || null;

  if (_subCreateMode) {
    const code = document.getElementById('sub-code').value.trim().toUpperCase();
    if (!code) { adminMsg('sub-msg', 'Nhập mã sách.', 'err'); return; }
    const row = { name: code, display_name: displayName || null, description, cover_url: coverUrl };
    if (detailVal) row.detail = detailVal;
    const btn = document.getElementById('sub-save-btn');
    btn.disabled = true; btn.textContent = 'Đang tạo…';
    const { error } = await _adminDb.upsertBook(row);
    btn.disabled = false; btn.textContent = '💾 Tạo khóa học con';
    if (error) { adminMsg('sub-msg', 'Lỗi: ' + error.message, 'err'); return; }
    adminMsg('sub-msg', '✓ Đã tạo: ' + code, 'ok');
    _subCreateMode  = false;
    _subCurrentBook = code;
    document.getElementById('sub-code-row').style.display = 'none';
    document.getElementById('sub-form-heading').innerHTML = '<i class="fa-solid fa-book-bookmark" style="color:#1a56db"></i> Chỉnh sửa khóa học con';
    document.getElementById('sub-save-btn').textContent = '💾 Lưu khóa học con';
    document.getElementById('sub-cancel-btn').style.display = 'none';
    document.getElementById('sub-lesson-heading').textContent = 'Bài học — ' + (displayName || code);
    document.getElementById('sub-lesson-wrap').style.display = '';
    subLoadLessons(code);
    loadSubCourses();
    return;
  }

  if (!_subCurrentBook) return;
  const row = { display_name: displayName || null, description, cover_url: coverUrl };
  if (detailVal) row.detail = detailVal;
  const { error } = await _adminDb.client.from('books').update(row).eq('name', _subCurrentBook);
  if (error) {
    if (error.message?.includes('detail')) {
      adminMsg('sub-msg', 'Cột "detail" chưa tồn tại. Chạy SQL: alter table books add column if not exists detail text;', 'err');
    } else {
      adminMsg('sub-msg', 'Lỗi: ' + error.message, 'err');
    }
    return;
  }
  adminMsg('sub-msg', '✓ Đã lưu: ' + _subCurrentBook, 'ok');
  loadSubCourses();
}

// ── Lesson management ─────────────────────────────
async function subLoadLessons(bookName) {
  const el = document.getElementById('sub-lesson-list');
  el.innerHTML = '<p style="color:#9ca3af;padding:1rem;font-size:13px">Đang tải…</p>';
  const { data: lessons } = await _adminDb.client.from('lessons').select('*').eq('book', bookName).order('id');
  if (!lessons?.length) { el.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:2rem;font-size:13px">Chưa có bài học nào.</p>'; return; }
  el.innerHTML = lessons.map(l => subLessonRow(l)).join('');
}

function subLessonRow(l) {
  const zhText  = l.chinese || l.zh || '';
  const pyText  = l.pinyin  || l.py || '';
  const viText  = l.vietnamese || l.vi || '';
  const zhPrev  = zhText.replace(/\s+/g,' ').slice(0, 40);
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

function subToggleEditLesson(id) {
  const el = document.getElementById(`sub-edit-${id}`);
  if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
}

async function subSaveLesson(id) {
  const row = {
    title:       document.getElementById(`sub-edit-title-${id}`).value.trim(),
    chinese:     document.getElementById(`sub-edit-zh-${id}`).value.trim(),
    pinyin:      document.getElementById(`sub-edit-py-${id}`).value.trim(),
    vietnamese:  document.getElementById(`sub-edit-vi-${id}`).value.trim(),
    description: document.getElementById(`sub-edit-zh-${id}`).value.trim().slice(0, 60) || null,
  };
  const { error } = await _adminDb.client.from('lessons').update(row).eq('id', id);
  if (error) { alert('Lỗi: ' + error.message); return; }
  if (_subCurrentBook) subLoadLessons(_subCurrentBook);
}

async function subDeleteLesson(id) {
  if (!confirm('Xóa bài học này?')) return;
  const { error } = await _adminDb.client.from('lessons').delete().eq('id', id);
  if (error) {
    alert('Không thể xóa: ' + error.message + '\n\nChạy SQL trong Supabase:\nalter table lessons disable row level security;');
    return;
  }
  if (_subCurrentBook) subLoadLessons(_subCurrentBook);
}

function subOpenImport() {
  if (!_subCurrentBook) { adminMsg('sub-msg', 'Chọn khóa học con trước rồi mới import.', 'err'); return; }
  // Pre-select book in the import overlay
  app.importer.book = _subCurrentBook;
  const sel = document.getElementById('import-book');
  if (sel) {
    // Ensure the option exists then select it
    if (![...sel.options].find(o => o.value === _subCurrentBook)) {
      sel.add(new Option(_subCurrentBook, _subCurrentBook));
    }
    sel.value = _subCurrentBook;
  }
  document.getElementById('import-file').click();
}

function subToggleAddLesson() {
  const el = document.getElementById('sub-add-form');
  const isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : '';
  if (!isOpen) {
    ['sub-new-title','sub-new-zh','sub-new-py','sub-new-vi'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
    document.getElementById('sub-add-msg').className = 's-msg';
  }
}

async function subSaveNewLesson() {
  if (!_subCurrentBook) return;
  const title  = document.getElementById('sub-new-title').value.trim();
  const zh     = document.getElementById('sub-new-zh').value.trim();
  const pinyin = document.getElementById('sub-new-py').value.trim();
  const vi     = document.getElementById('sub-new-vi').value.trim();
  if (!zh) { adminMsg('sub-add-msg', 'Nhập nội dung tiếng Trung.', 'err'); return; }
  const { error } = await _adminDb.client.from('lessons').insert([{
    title: title || null,
    chinese: zh,
    pinyin: pinyin || null,
    vietnamese: vi || null,
    description: zh.slice(0, 60) || null,
    book: _subCurrentBook,
  }]);
  if (error) { adminMsg('sub-add-msg', 'Lỗi: ' + error.message, 'err'); return; }
  adminMsg('sub-add-msg', '✓ Đã thêm bài học.', 'ok');
  subToggleAddLesson();
  subLoadLessons(_subCurrentBook);
}
