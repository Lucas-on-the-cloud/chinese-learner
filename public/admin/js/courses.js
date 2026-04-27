// ── Course helpers ────────────────────────────────
function crPreviewUrl(url) { imgPreview(url, 'cr-cover-preview', 'cr-cover-preview-img'); }
function crFileChange(input) { imgFileChange(input, 'cr-cover', 'cr-cover-preview', 'cr-cover-preview-img'); }
function crClearCover() { imgClear('cr-cover', 'cr-cover-file', 'cr-cover-preview'); }
function crWrap(before, after) { mdWrap('cr-detail', before, after); }
function crInsertLine(prefix) { mdInsertLine('cr-detail', prefix); }

function crCancelEdit() {
  document.getElementById('cr-edit-id').value = '';
  document.getElementById('cr-form-title').textContent = 'Tạo khóa học mới';
  document.getElementById('cr-save-btn').textContent = '💾 Lưu khóa học';
  document.getElementById('cr-cancel-btn').style.display = 'none';
  document.getElementById('cr-books-section').style.display = 'none';
  ['cr-title','cr-desc','cr-detail'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('cr-level').value = '';
  document.getElementById('cr-price').value = 'Miễn phí';
  document.getElementById('cr-published').checked = true;
  crClearCover();
  document.getElementById('cr-msg').className = 's-msg';
}

// ── Course CRUD ───────────────────────────────────
async function loadCourses() {
  const el = document.getElementById('course-list');
  const courses = await _adminDb.getCourses();
  if (!courses.length) { el.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:2rem;font-size:13px">Chưa có khóa học nào.</p>'; return; }
  el.innerHTML = courses.map(c => `
    <div class="bl-post-item" data-id="${c.id}" draggable="true"
        ondragstart="crDragStart(event,'${c.id}')"
        ondragover="blDragOver(event)"
        ondragleave="blDragLeave(event)"
        ondrop="crDrop(event,'${c.id}')"
        ondragend="blDragEnd()">
      <span class="bl-post-drag" title="Kéo để sắp xếp">☰</span>
      <div class="bl-post-info">
        <div class="bl-post-title">${escHtml(c.title)}</div>
        <div class="bl-post-meta">
          <span class="bl-post-dot" style="background:${c.published?'#15803d':'#9ca3af'}"></span>
          ${c.published?'Đã đăng':'Nháp'}${c.level?' · '+escHtml(c.level):''}${c.price?' · '+escHtml(c.price):''}
        </div>
      </div>
      <div class="bl-post-actions">
        <a href="/course.html?id=${c.id}" target="_blank" class="table-btn" title="Xem"><i class="fa-solid fa-eye"></i></a>
        <button class="table-btn" onclick="crEditCourse(${c.id})" title="Sửa"><i class="fa-solid fa-pen-to-square"></i></button>
        <button class="table-btn" onclick="crDelete(${c.id})" title="Xóa"><i class="fa-solid fa-trash" style="color:#c0392b"></i></button>
      </div>
    </div>`).join('');
}

async function crEditCourse(id) {
  const c = await _adminDb.getCourse(id);
  if (!c) return;
  document.getElementById('cr-edit-id').value    = id;
  document.getElementById('cr-title').value       = c.title || '';
  document.getElementById('cr-desc').value        = c.description || '';
  document.getElementById('cr-detail').value      = c.detail || '';
  document.getElementById('cr-level').value       = c.level || '';
  document.getElementById('cr-price').value       = c.price || 'Miễn phí';
  document.getElementById('cr-is-free').checked  = c.is_free ?? (!c.price || c.price === 'Miễn phí');
  document.getElementById('cr-cover').value       = c.cover_url || '';
  document.getElementById('cr-published').checked = !!c.published;
  crPreviewUrl(c.cover_url || '');
  document.getElementById('cr-form-title').textContent = 'Chỉnh sửa khóa học';
  document.getElementById('cr-save-btn').textContent = '💾 Cập nhật';
  document.getElementById('cr-cancel-btn').style.display = '';
  document.getElementById('cr-books-section').style.display = '';
  document.querySelector('.content').scrollTo({ top: 0, behavior: 'smooth' });
  loadCourseBooks(id);
  loadBookSelectOptions();
}

async function adminSaveCourse() {
  const editId = document.getElementById('cr-edit-id').value;
  const title  = document.getElementById('cr-title').value.trim();
  if (!title) { adminMsg('cr-msg', 'Nhập tiêu đề khóa học.', 'err'); return; }
  const detailVal = document.getElementById('cr-detail').value.trim() || null;
  const isFree = document.getElementById('cr-is-free').checked;
  const row = {
    title,
    description: document.getElementById('cr-desc').value.trim() || null,
    level:       document.getElementById('cr-level').value || null,
    price:       isFree ? 'Miễn phí' : (document.getElementById('cr-price').value.trim() || 'Miễn phí'),
    is_free:     isFree,
    cover_url:   document.getElementById('cr-cover').value.trim() || null,
    published:   document.getElementById('cr-published').checked,
  };
  if (detailVal) row.detail = detailVal;
  if (editId) row.id = parseInt(editId);
  const btn = document.getElementById('cr-save-btn');
  btn.disabled = true; btn.textContent = 'Đang lưu…';
  const { error } = await _adminDb.saveCourse(row);
  btn.disabled = false; btn.textContent = editId ? '💾 Cập nhật' : '💾 Lưu khóa học';
  if (error) {
    if (error.message?.includes('detail')) {
      adminMsg('cr-msg', 'Cột "detail" chưa tồn tại. Chạy SQL: alter table courses add column if not exists detail text;', 'err');
    } else {
      adminMsg('cr-msg', 'Lỗi: ' + error.message, 'err');
    }
    return;
  }
  adminMsg('cr-msg', (editId ? '✓ Đã cập nhật: ' : '✓ Đã tạo: ') + title, 'ok');
  // If new course was created, we need its id to enable linked books section
  if (!editId) {
    const courses = await _adminDb.getCourses();
    const newest = courses.find(c => c.title === title);
    if (newest) {
      document.getElementById('cr-edit-id').value = newest.id;
      document.getElementById('cr-form-title').textContent = 'Chỉnh sửa khóa học';
      document.getElementById('cr-save-btn').textContent = '💾 Cập nhật';
      document.getElementById('cr-cancel-btn').style.display = '';
      document.getElementById('cr-books-section').style.display = '';
      loadCourseBooks(newest.id);
      loadBookSelectOptions();
    }
  }
  loadCourses();
}

async function crDelete(id) {
  if (!confirm('Xóa khóa học này? Tất cả liên kết sách sẽ bị xóa.')) return;
  await _adminDb.deleteCourse(id);
  crCancelEdit();
  loadCourses();
}

// Linked books management
async function loadCourseBooks(courseId) {
  const books = await _adminDb.getCourseBooks(courseId);
  const el = document.getElementById('cr-books-list');
  if (!books.length) { el.innerHTML = '<p style="font-size:12px;color:#9ca3af">Chưa có khóa học con. Thêm bên dưới.</p>'; return; }
  el.innerHTML = books.map(b => `
    <div style="display:flex;align-items:center;gap:8px;background:#f4f5f7;border-radius:7px;padding:7px 10px">
      <span style="font-size:12px;background:${b.skill_type==='reading'?'#eff6ff':'#f0fdf4'};color:${b.skill_type==='reading'?'#1a56db':'#15803d'};padding:2px 8px;border-radius:8px;font-weight:600;flex-shrink:0">${b.skill_type==='reading'?'📖 Reading':'🎧 Listening'}</span>
      <span style="flex:1;font-size:13px;font-weight:500">${escHtml(b.book_name)}</span>
      <a href="/subcourse.html?b=${encodeURIComponent(b.book_name)}" target="_blank" style="color:#9ca3af;font-size:12px" title="Xem"><i class="fa-solid fa-eye"></i></a>
      <button onclick="removeCourseBook(${b.id})" style="background:none;border:none;color:#c0392b;cursor:pointer;font-size:13px" title="Xóa"><i class="fa-solid fa-times"></i></button>
    </div>`).join('');
}

let _crBooksMeta = [];

async function loadBookSelectOptions() {
  _crBooksMeta = await _adminDb.getBooksMeta();
  const sel = document.getElementById('cr-book-select');
  sel.innerHTML = _crBooksMeta.length
    ? _crBooksMeta.map(b => {
        const icon = b.skill_type === 'listening' ? '🎧' : '📖';
        return `<option value="${escHtml(b.name)}" data-skill="${escHtml(b.skill_type||'reading')}">${icon} ${escHtml(b.display_name || b.name)}</option>`;
      }).join('')
    : '<option value="">— Chưa có sách nào —</option>';
}

async function addCourseBook() {
  const courseId = document.getElementById('cr-edit-id').value;
  if (!courseId) return;
  const bookSel  = document.getElementById('cr-book-select');
  const bookName = bookSel?.value;
  if (!bookName) return;
  // Use books.skill_type as source of truth; fallback to cr-skill-select
  const bookMeta  = _crBooksMeta.find(b => b.name === bookName);
  const skillType = bookMeta?.skill_type || document.getElementById('cr-skill-select')?.value || 'reading';
  await _adminDb.addCourseBook({ course_id: parseInt(courseId), book_name: bookName, skill_type: skillType, sort_order: 0 });
  loadCourseBooks(courseId);
}

async function removeCourseBook(id) {
  await _adminDb.removeCourseBook(id);
  const courseId = document.getElementById('cr-edit-id').value;
  if (courseId) loadCourseBooks(courseId);
}

// Course drag-and-drop
let _crDragId = null;
function crDragStart(e, id) {
  _crDragId = id;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.currentTarget.closest('.bl-post-item')?.classList.add('dragging'), 0);
}
async function crDrop(e, targetId) {
  e.preventDefault();
  blDragEnd();
  if (_crDragId == targetId) return;
  const container = document.getElementById('course-list');
  const items = [...container.querySelectorAll('.bl-post-item')];
  const src = items.find(r => r.dataset.id == _crDragId);
  const tgt = items.find(r => r.dataset.id == targetId);
  if (!src || !tgt) return;
  if (items.indexOf(src) < items.indexOf(tgt)) container.insertBefore(src, tgt.nextSibling);
  else container.insertBefore(src, tgt);
  // Save order
  const ordered = [...container.querySelectorAll('.bl-post-item')];
  const total = ordered.length;
  for (let i = 0; i < ordered.length; i++)
    await _adminDb.client.from('courses').update({ sort_order: total - i }).eq('id', parseInt(ordered[i].dataset.id));
}
