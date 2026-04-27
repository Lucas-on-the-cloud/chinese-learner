const DB = supabase.createClient(
  'https://prctmferugkxabyizslx.supabase.co',
  'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ'
);

// Mini app object for file-importer.js compatibility
const _adminDb = new Database(
  'https://prctmferugkxabyizslx.supabase.co',
  'sb_publishable_6-_0uUkFDKDCA4HBNdB0Gg_ZEL_GqJQ'
);
window.app = {
  config: new ConfigManager(),
  lessons: new LessonManager(_adminDb),
  selection: { clear() {} },
  vocab: { items: [] },
};
window.app.ai       = new AIService(window.app.config);
window.app.importer = new FileImporter();
app.lessons.load();

// ── Shared UI utilities ──────────────────────────────────────────────
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showMsg(elId, text, type) {
  const el = document.getElementById(elId); if (!el) return;
  el.textContent = text; el.className = 's-msg ' + type;
  if (type === 'ok') setTimeout(() => el.className = 's-msg', 5000);
}
function resizeImage(origImg, maxW = 900, quality = 0.85) {
  let w = origImg.width, h = origImg.height;
  if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(origImg, 0, 0, w, h);
  return c.toDataURL('image/jpeg', quality);
}
function imgPreview(url, wrapId, imgId) {
  const wrap = document.getElementById(wrapId); const img = document.getElementById(imgId);
  if (!wrap) return;
  if (url) { if (img) img.src = url; wrap.style.display = 'flex'; }
  else     { wrap.style.display = 'none'; }
}
function imgFileChange(input, urlId, wrapId, imgId, maxW = 900, onDone) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const orig = new Image();
    orig.onload = () => {
      const dataUrl = resizeImage(orig, maxW);
      const urlEl = document.getElementById(urlId); if (urlEl) urlEl.value = dataUrl;
      imgPreview(dataUrl, wrapId, imgId);
      if (onDone) onDone(dataUrl);
    };
    orig.src = e.target.result;
  };
  reader.readAsDataURL(file);
}
function imgClear(urlId, fileId, wrapId) {
  [urlId, fileId].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const wrap = document.getElementById(wrapId); if (wrap) wrap.style.display = 'none';
}
function mdWrap(taId, before, after) {
  const ta = document.getElementById(taId); if (!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd;
  ta.setRangeText(before + (ta.value.slice(s, e) || 'văn bản') + after, s, e, 'select');
  ta.focus();
}
function mdInsertLine(taId, prefix) {
  const ta = document.getElementById(taId); if (!ta) return;
  const pos = ta.selectionStart, ls = ta.value.lastIndexOf('\n', pos - 1) + 1;
  ta.value = ta.value.slice(0, ls) + prefix + ta.value.slice(ls);
  ta.setSelectionRange(ls + prefix.length, ls + prefix.length);
  ta.focus();
}

// Sidebar toggle
let collapsed = false;
function toggleSidebar() {
  collapsed = !collapsed;
  document.getElementById('sidebar').classList.toggle('collapsed', collapsed);
  document.getElementById('collapse-icon').className = collapsed
    ? 'fa-solid fa-angles-right' : 'fa-solid fa-angles-left';
}

// All sections mapping
const ALL_SECTIONS = ['dashboard','courses','subcourses','listening','flashcards','blog','ai'];
function setNav(btn, id) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const labels = {
    dashboard:     'Tổng quan / Dashboard',
    lessons:       'Bài học / Lessons',
    vocab:         'Từ vựng / Vocabulary',
    users:         'Người dùng / Users',
    courses:       'Khóa học / Courses',
    subcourses:    'Khóa học con / Sub-courses',
    listening:     'Listening / Nghe & Chép chính tả',
    flashcards:    'Flashcard / Bộ thẻ từ vựng',
    blog:          'Blog / Bài viết',
    feedback:      'Phản hồi / Feedback',
    ai:            'AI & API',
    analytics:     'Phân tích / Analytics',
  };
  document.getElementById('crumb-label').textContent = labels[id] || id;
  // show/hide sections
  ALL_SECTIONS.forEach(s => {
    const el = document.getElementById('section-' + s);
    if (el) el.style.display = 'none';
  });
  const active = document.getElementById('section-' + id);
  if (active) active.style.display = (id === 'dashboard') ? 'flex' : 'block';
  if (id === 'ai')         adminInitSettings();
  if (id === 'blog')       loadBlogPosts();
  if (id === 'courses')    loadCourses();
  if (id === 'subcourses') loadSubCourses();
  if (id === 'listening')  loadListeningAdmin();
  if (id === 'flashcards') loadFCAdmin();
}
function adminMsg(elId, text, type) { showMsg(elId, text, type); }

// Chart
const chartData = [42,48,51,46,58,72,80,65,70,75,82,88,76,84,92,98,89,94,102,108,96,103,112,118,107,114,124,131,121,128];
const max = Math.max(...chartData);
document.getElementById('chart').innerHTML = chartData.map(v =>
  `<div class="chart-col">
    <div class="chart-bar-blue" style="height:${v/max*80}%"></div>
    <div class="chart-bar-orange" style="height:${v/max*30}%"></div>
  </div>`
).join('');

// Load real data
async function loadData() {
  const [{ data: lessons }, { data: flashcards }] = await Promise.all([
    DB.from('lessons').select('id,title,book,created_at').order('created_at', { ascending: false }),
    DB.from('flashcards').select('id', { count: 'exact', head: true }),
  ]);

  // KPI
  const count = lessons?.length || 0;
  document.getElementById('kpi-lessons').textContent = count.toLocaleString();
  document.getElementById('kpi-lessons-delta').textContent = count > 0 ? `${count} bài trong thư viện` : 'Chưa có bài';
  document.getElementById('sb-lesson-count').textContent = count;

  const { count: fcCount } = await DB.from('flashcards').select('*', { count: 'exact', head: true });
  document.getElementById('kpi-vocab').textContent = (fcCount || 0).toLocaleString();
  document.getElementById('kpi-vocab-delta').textContent = `${fcCount || 0} flashcard đã lưu`;

  // Lessons table (latest 8)
  const tbody = document.getElementById('lessons-table-body');
  if (!lessons?.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="color:#9ca3af;text-align:center;padding:24px">Chưa có bài học nào</td></tr>';
    return;
  }
  tbody.innerHTML = lessons.slice(0, 8).map(l => {
    const title = l.title || '—';
    const zh = (title.match(/[一-鿿㐀-䶿]/g) || []).slice(0,2).join('') || '讀';
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="lesson-zh">${zh}</span>
          <span style="font-weight:500">${title.slice(0,32)}${title.length>32?'…':''}</span>
        </div>
      </td>
      <td><span class="lvl-badge" style="background:#dbeafe;color:#1e40af">${l.book||'B1'}</span></td>
      <td><span class="status-badge" style="background:#f0fdf4;color:#15803d">Đã xuất bản</span></td>
      <td style="text-align:right">
        <button class="table-btn" title="Chỉnh sửa"><i class="fa-solid fa-pen-to-square"></i></button>
        <button class="table-btn"><i class="fa-solid fa-ellipsis"></i></button>
      </td>
    </tr>`;
  }).join('');
}

loadData();
