// ── Blog helpers ─────────────────────────────────
function renderMarkdownAdmin(text) {
  return (text || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^### (.+)$/gm,'<h3>$1</h3>')
    .replace(/^## (.+)$/gm,'<h2>$1</h2>')
    .replace(/^# (.+)$/gm,'<h1>$1</h1>')
    .replace(/^>>r (.+)$/gm,'<p style="text-align:right">$1</p>')
    .replace(/^>>c (.+)$/gm,'<p style="text-align:center">$1</p>')
    .replace(/^> (.+)$/gm,'<blockquote>$1</blockquote>')
    .replace(/^[-•] (.+)$/gm,'&bull; $1<br>')
    .replace(/^---$/gm,'<hr>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*([^*\n]+?)\*/g,'<em>$1</em>')
    .replace(/__([^_\n]+?)__/g,'<u>$1</u>')
    .replace(/~~([^~\n]+?)~~/g,'<s>$1</s>')
    .replace(/==r:([^=\n]+)==/g,'<mark style="background:#fecaca;padding:1px 3px;border-radius:3px">$1</mark>')
    .replace(/==g:([^=\n]+)==/g,'<mark style="background:#bbf7d0;padding:1px 3px;border-radius:3px">$1</mark>')
    .replace(/==b:([^=\n]+)==/g,'<mark style="background:#bfdbfe;padding:1px 3px;border-radius:3px">$1</mark>')
    .replace(/==([^=\n:][^=\n]*)==/g,'<mark style="background:#fef08a;padding:1px 3px;border-radius:3px">$1</mark>')
    .replace(/\n{2,}/g,'</p><p>')
    .replace(/\n/g,'<br>');
}

let _blPreviewActive = false;
function blSetTab(tab) {
  _blPreviewActive = (tab === 'preview');
  document.getElementById('bl-tab-edit').classList.toggle('active', !_blPreviewActive);
  document.getElementById('bl-tab-preview').classList.toggle('active', _blPreviewActive);
  document.getElementById('bl-edit-wrap').style.display = _blPreviewActive ? 'none' : '';
  document.getElementById('bl-preview-wrap').style.display = _blPreviewActive ? '' : 'none';
  if (_blPreviewActive) blUpdatePreview();
}

function blUpdatePreview() {
  if (!_blPreviewActive) return;
  const title   = document.getElementById('bl-title').value.trim();
  const cover   = document.getElementById('bl-cover').value.trim();
  const cat     = document.getElementById('bl-cat').value.trim();
  const content = document.getElementById('bl-content').value;
  const coverHtml = cover
    ? `<img src="${escHtml(cover)}" style="width:100%;max-height:280px;object-fit:cover;border-radius:10px;margin-bottom:20px;display:block">`
    : '';
  const catHtml = cat
    ? `<span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#1a56db;background:#eff6ff;padding:3px 10px;border-radius:10px;display:inline-block;margin-bottom:10px">${escHtml(cat)}</span><br>`
    : '';
  const titleHtml = title
    ? `<div style="font-family:'Noto Serif TC',serif;font-size:24px;font-weight:700;color:#0d1b4b;line-height:1.3;margin-bottom:16px">${escHtml(title)}</div>`
    : '';
  document.getElementById('bl-preview-content').innerHTML =
    `${coverHtml}${catHtml}${titleHtml}<p>${renderMarkdownAdmin(content)}</p>`;
}

function blWrap(before, after) { mdWrap('bl-content', before, after); blUpdatePreview(); }
function blInsertLine(prefix) { mdInsertLine('bl-content', prefix); blUpdatePreview(); }
function blPreviewUrl(url) { imgPreview(url, 'bl-cover-preview', 'bl-cover-preview-img'); }
function blFileChange(input) { imgFileChange(input, 'bl-cover', 'bl-cover-preview', 'bl-cover-preview-img', 900, () => blUpdatePreview()); }
function blClearCover() { imgClear('bl-cover', 'bl-cover-file', 'bl-cover-preview'); blUpdatePreview(); }

function blCancelEdit() {
  document.getElementById('bl-edit-id').value = '';
  document.getElementById('bl-form-mode-title').textContent = 'Tạo bài viết mới';
  document.getElementById('bl-save-btn').textContent = '💾 Đăng bài viết';
  document.getElementById('bl-cancel-btn').style.display = 'none';
  ['bl-title','bl-cat','bl-excerpt','bl-content'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('bl-author').value = 'Admin';
  document.getElementById('bl-published').checked = true;
  blClearCover();
  blSetTab('edit');
  document.getElementById('bl-msg').className = 's-msg';
}

// ── Blog functions ─────────────────────────────
async function loadBlogPosts() {
  const el = document.getElementById('blog-post-list');
  const { data: posts } = await _adminDb.client.from('posts')
    .select('id,title,category,published,created_at,sort_order')
    .order('sort_order', { ascending: false })
    .order('created_at', { ascending: false });

  const cats = [...new Set((posts || []).map(p => p.category).filter(Boolean))];
  document.getElementById('bl-cat-suggestions').innerHTML = cats.map(c => `<option value="${escHtml(c)}">`).join('');

  if (!posts?.length) { el.innerHTML = '<p style="color:#9ca3af;text-align:center;padding:2rem;font-size:13px">Chưa có bài viết nào.</p>'; return; }
  el.innerHTML = posts.map(p => `
    <div class="bl-post-item" data-id="${p.id}" draggable="true"
        ondragstart="blDragStart(event,'${p.id}')"
        ondragover="blDragOver(event)"
        ondragleave="blDragLeave(event)"
        ondrop="blDrop(event,'${p.id}')"
        ondragend="blDragEnd()">
      <span class="bl-post-drag" title="Kéo để sắp xếp">☰</span>
      <div class="bl-post-info">
        <div class="bl-post-title">${escHtml(p.title)}</div>
        <div class="bl-post-meta">
          <span class="bl-post-dot" style="background:${p.published?'#15803d':'#9ca3af'}"></span>
          ${p.published ? 'Đã đăng' : 'Nháp'}${p.category ? ' · ' + escHtml(p.category) : ''}
        </div>
      </div>
      <div class="bl-post-actions">
        <a href="/post.html?id=${p.id}" target="_blank" class="table-btn" title="Xem"><i class="fa-solid fa-eye"></i></a>
        <button class="table-btn" onclick="blEditPost(${p.id})" title="Sửa"><i class="fa-solid fa-pen-to-square"></i></button>
        <button class="table-btn" onclick="deletePost(${p.id})" title="Xóa"><i class="fa-solid fa-trash" style="color:#c0392b"></i></button>
      </div>
    </div>`).join('');
}

async function blEditPost(id) {
  const { data: post } = await _adminDb.client.from('posts').select('*').eq('id', id).single();
  if (!post) return;
  document.getElementById('bl-edit-id').value    = id;
  document.getElementById('bl-title').value       = post.title || '';
  document.getElementById('bl-cat').value         = post.category || '';
  document.getElementById('bl-author').value      = post.author || 'Admin';
  document.getElementById('bl-cover').value       = post.cover_url || '';
  document.getElementById('bl-excerpt').value     = post.excerpt || '';
  document.getElementById('bl-content').value     = post.content || '';
  document.getElementById('bl-published').checked = !!post.published;
  blPreviewUrl(post.cover_url || '');
  document.getElementById('bl-form-mode-title').textContent = 'Chỉnh sửa bài viết';
  document.getElementById('bl-save-btn').textContent = '💾 Cập nhật';
  document.getElementById('bl-cancel-btn').style.display = '';
  blSetTab('edit');
  document.querySelector('.content').scrollTo({ top: 0, behavior: 'smooth' });
}

async function adminSavePost() {
  const editId    = document.getElementById('bl-edit-id').value;
  const title     = document.getElementById('bl-title').value.trim();
  const category  = document.getElementById('bl-cat').value.trim();
  const author    = document.getElementById('bl-author').value.trim() || 'Admin';
  const cover_url = document.getElementById('bl-cover').value.trim() || null;
  const excerpt   = document.getElementById('bl-excerpt').value.trim() || null;
  const content   = document.getElementById('bl-content').value.trim() || null;
  const published = document.getElementById('bl-published').checked;
  if (!title) { adminMsg('bl-msg', 'Nhập tiêu đề bài viết.', 'err'); return; }
  const btn = document.getElementById('bl-save-btn');
  btn.disabled = true; btn.textContent = 'Đang lưu…';
  let error;
  if (editId) {
    ({ error } = await _adminDb.client.from('posts').update({ title, category: category||null, author, cover_url, excerpt, content, published }).eq('id', editId));
  } else {
    ({ error } = await _adminDb.client.from('posts').insert([{ title, category: category||null, author, cover_url, excerpt, content, published }]));
  }
  btn.disabled = false;
  if (error) { adminMsg('bl-msg', 'Lỗi: ' + error.message, 'err'); btn.textContent = editId ? '💾 Cập nhật' : '💾 Đăng bài viết'; return; }
  adminMsg('bl-msg', (editId ? '✓ Đã cập nhật: ' : '✓ Đã đăng: ') + title, 'ok');
  blCancelEdit();
  loadBlogPosts();
}

async function deletePost(id) {
  if (!confirm('Xóa bài viết này?')) return;
  await _adminDb.client.from('posts').delete().eq('id', id);
  loadBlogPosts();
}

// Drag-and-drop ordering (card list)
let _blDragId = null;
function blDragStart(e, id) {
  _blDragId = id;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.currentTarget.closest('.bl-post-item')?.classList.add('dragging'), 0);
}
function blDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.bl-post-item').forEach(r => r.classList.remove('drag-over'));
  e.currentTarget.closest('.bl-post-item')?.classList.add('drag-over');
}
function blDragLeave(e) {
  if (!e.currentTarget.closest('.bl-post-item')?.contains(e.relatedTarget))
    e.currentTarget.closest('.bl-post-item')?.classList.remove('drag-over');
}
function blDragEnd() {
  document.querySelectorAll('.bl-post-item').forEach(r => { r.classList.remove('drag-over'); r.classList.remove('dragging'); });
}
async function blDrop(e, targetId) {
  e.preventDefault();
  blDragEnd();
  if (_blDragId == targetId) return;
  const container = document.getElementById('blog-post-list');
  const items = [...container.querySelectorAll('.bl-post-item')];
  const src = items.find(r => r.dataset.id == _blDragId);
  const tgt = items.find(r => r.dataset.id == targetId);
  if (!src || !tgt) return;
  if (items.indexOf(src) < items.indexOf(tgt)) container.insertBefore(src, tgt.nextSibling);
  else container.insertBefore(src, tgt);
  await savePostOrder();
}
async function savePostOrder() {
  const items = [...document.querySelectorAll('#blog-post-list .bl-post-item')];
  const total = items.length;
  for (let i = 0; i < items.length; i++)
    await _adminDb.client.from('posts').update({ sort_order: total - i }).eq('id', parseInt(items[i].dataset.id));
}

