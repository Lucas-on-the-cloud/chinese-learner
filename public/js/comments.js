// Reusable threaded comment widget. Anonymous-friendly.
//
// Usage:
//   <link rel="stylesheet" href="/css/comments.css">
//   <div id="comments-root"></div>
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   <script src="/js/comments.js"></script>
//   <script>
//     mountComments({
//       container: '#comments-root',
//       entityType: 'post',           // 'post' | 'lesson_reading' | 'lesson_listening' | 'exam_unit'
//       entityId: '42',               // string
//       supabaseUrl: '...', supabaseKey: '...',
//     });
//   </script>

(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function timeAgo(iso) {
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60) return 'vừa xong';
    if (d < 3600) return Math.floor(d/60) + ' phút trước';
    if (d < 86400) return Math.floor(d/3600) + ' giờ trước';
    if (d < 86400*7) return Math.floor(d/86400) + ' ngày trước';
    return new Date(iso).toLocaleDateString('vi-VN');
  }

  // Group comments into threaded tree (parent_id null = top-level)
  function buildTree(rows) {
    const byId = new Map(); rows.forEach(r => byId.set(r.id, { ...r, children: [] }));
    const roots = [];
    for (const r of byId.values()) {
      if (r.parent_id && byId.has(r.parent_id)) byId.get(r.parent_id).children.push(r);
      else roots.push(r);
    }
    // Sort: roots oldest-first; replies oldest-first
    roots.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    byId.forEach(n => n.children.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
    return roots;
  }

  function renderStars(rating) {
    if (!rating) return '';
    let h = '<span class="cm-stars" title="' + rating + '/5">';
    for (let i = 1; i <= 5; i++) {
      h += `<i class="fa-solid fa-star ${i <= rating ? 'on' : 'off'}"></i>`;
    }
    h += '</span>';
    return h;
  }

  function renderComment(c, depth, ctx) {
    const adminBadge = c.is_admin
      ? '<span class="cm-badge-admin">Admin</span>'
      : '';
    const replyBtn = depth < 2
      ? `<button class="cm-reply-btn" data-reply="${c.id}">Trả lời</button>`
      : '';
    const childrenHtml = (c.children || []).map(cc => renderComment(cc, depth + 1, ctx)).join('');
    return `
      <div class="cm-item ${c.is_admin ? 'cm-admin' : ''}" data-id="${c.id}">
        <div class="cm-head">
          <span class="cm-name">${escapeHtml(c.display_name || 'Ẩn danh')}</span>
          ${adminBadge}
          ${renderStars(c.rating)}
          <span class="cm-time">${timeAgo(c.created_at)}</span>
        </div>
        <div class="cm-body">${escapeHtml(c.body).replace(/\n/g, '<br>')}</div>
        <div class="cm-actions">${replyBtn}</div>
        <div class="cm-reply-form-slot" data-reply-form="${c.id}"></div>
        ${childrenHtml ? `<div class="cm-children">${childrenHtml}</div>` : ''}
      </div>`;
  }

  function renderForm(parentId) {
    const id = parentId ? `reply-${parentId}` : 'top';
    const rateBlock = parentId ? '' : `
      <div class="cm-rate-row">
        <span class="cm-rate-label">Đánh giá (tùy chọn):</span>
        <span class="cm-rate-picker" data-rating="0">
          ${[1,2,3,4,5].map(n => `<i class="fa-regular fa-star cm-rate-star" data-n="${n}"></i>`).join('')}
          <button type="button" class="cm-rate-clear" title="Xoá đánh giá">×</button>
        </span>
        <input type="hidden" name="rating" value="">
      </div>`;
    return `
      <form class="cm-form" data-form="${id}">
        <input type="text" class="cm-name-input" name="name" placeholder="Tên hiển thị (mặc định: Ẩn danh)" maxlength="50">
        ${rateBlock}
        <textarea class="cm-body-input" name="body" placeholder="${parentId ? 'Trả lời...' : 'Bình luận của bạn...'}" required maxlength="2000"></textarea>
        <input type="text" name="hp" class="cm-honeypot" tabindex="-1" autocomplete="off">
        <div class="cm-form-foot">
          <span class="cm-form-msg"></span>
          <button type="submit" class="cm-submit">${parentId ? 'Gửi trả lời' : 'Gửi bình luận'}</button>
          ${parentId ? '<button type="button" class="cm-cancel">Huỷ</button>' : ''}
        </div>
      </form>`;
  }

  async function loadComments(ctx) {
    const { data, error } = await ctx.sb
      .from('comments')
      .select('id, parent_id, display_name, body, is_admin, status, rating, created_at')
      .eq('entity_type', ctx.entityType)
      .eq('entity_id', String(ctx.entityId))
      .eq('status', 'visible')
      .order('created_at', { ascending: true });
    if (error) { console.error('comments load:', error); return []; }
    return data || [];
  }

  async function postComment(ctx, { name, body, parentId, hp, rating }) {
    if (hp) throw new Error('spam'); // honeypot — bots fill, humans don't
    const display_name = (name || '').trim().slice(0, 50) || 'Ẩn danh';
    const trimmedBody = body.trim();
    if (!trimmedBody) throw new Error('Vui lòng nhập nội dung.');
    if (trimmedBody.length > 2000) throw new Error('Tối đa 2000 ký tự.');
    const ratingNum = rating ? Math.max(1, Math.min(5, +rating)) : null;
    const { error } = await ctx.sb.from('comments').insert({
      entity_type: ctx.entityType,
      entity_id: String(ctx.entityId),
      parent_id: parentId || null,
      display_name,
      body: trimmedBody,
      rating: parentId ? null : ratingNum,
    });
    if (error) throw error;
  }

  function renderAggregate(rows) {
    const rated = rows.filter(r => r.rating && !r.parent_id);
    if (!rated.length) return '';
    const avg = rated.reduce((a,r)=>a+r.rating, 0) / rated.length;
    const counts = [0,0,0,0,0,0]; // index 1..5
    rated.forEach(r => counts[r.rating]++);
    let bars = '';
    for (let n = 5; n >= 1; n--) {
      const pct = rated.length ? Math.round(counts[n] / rated.length * 100) : 0;
      bars += `<div class="cm-rate-bar-row"><span class="cm-rate-bar-n">${n}★</span><span class="cm-rate-bar"><span class="cm-rate-bar-fill" style="width:${pct}%"></span></span><span class="cm-rate-bar-c">${counts[n]}</span></div>`;
    }
    return `
      <div class="cm-aggregate">
        <div class="cm-agg-left">
          <div class="cm-agg-num">${avg.toFixed(1)}</div>
          <div class="cm-agg-stars">${[1,2,3,4,5].map(i => `<i class="fa-solid fa-star ${i <= Math.round(avg) ? 'on' : 'off'}"></i>`).join('')}</div>
          <div class="cm-agg-count">${rated.length} đánh giá</div>
        </div>
        <div class="cm-agg-right">${bars}</div>
      </div>`;
  }

  async function render(ctx) {
    const rows = await loadComments(ctx);
    const tree = buildTree(rows);
    const total = rows.length;
    ctx.root.innerHTML = `
      <div class="cm-widget">
        <h3 class="cm-title"><i class="fa-regular fa-comments"></i> Bình luận <span class="cm-count">(${total})</span></h3>
        ${renderAggregate(rows)}
        <div class="cm-form-top">${renderForm(null)}</div>
        <div class="cm-list">
          ${tree.length ? tree.map(c => renderComment(c, 0, ctx)).join('') : '<div class="cm-empty">Chưa có bình luận. Hãy là người đầu tiên!</div>'}
        </div>
      </div>`;
    bindEvents(ctx);
  }

  function bindStarPicker(form) {
    const picker = form.querySelector('.cm-rate-picker');
    if (!picker) return;
    const stars = picker.querySelectorAll('.cm-rate-star');
    const hidden = form.querySelector('input[name="rating"]');
    const clearBtn = picker.querySelector('.cm-rate-clear');
    const setRating = (n) => {
      picker.dataset.rating = String(n);
      hidden.value = n ? String(n) : '';
      stars.forEach((s, i) => {
        const filled = i < n;
        s.classList.toggle('fa-solid', filled);
        s.classList.toggle('fa-regular', !filled);
        s.classList.toggle('on', filled);
      });
    };
    stars.forEach((s, idx) => {
      s.addEventListener('mouseenter', () => {
        stars.forEach((ss, i) => ss.classList.toggle('hover', i <= idx));
      });
      s.addEventListener('mouseleave', () => stars.forEach(ss => ss.classList.remove('hover')));
      s.addEventListener('click', () => setRating(idx + 1));
    });
    clearBtn?.addEventListener('click', () => setRating(0));
  }

  function bindEvents(ctx) {
    // Top-level form
    const topForm = ctx.root.querySelector('.cm-form[data-form="top"]');
    if (topForm) {
      bindStarPicker(topForm);
      topForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleSubmit(ctx, topForm, null);
      });
    }

    // Reply buttons
    ctx.root.querySelectorAll('.cm-reply-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = +btn.dataset.reply;
        const slot = ctx.root.querySelector(`.cm-reply-form-slot[data-reply-form="${id}"]`);
        if (slot.innerHTML) { slot.innerHTML = ''; return; }
        slot.innerHTML = renderForm(id);
        const form = slot.querySelector('.cm-form');
        form.querySelector('textarea').focus();
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          await handleSubmit(ctx, form, id);
        });
        form.querySelector('.cm-cancel').addEventListener('click', () => {
          slot.innerHTML = '';
        });
      });
    });
  }

  async function handleSubmit(ctx, form, parentId) {
    const fd = new FormData(form);
    const msgEl = form.querySelector('.cm-form-msg');
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; msgEl.textContent = 'Đang gửi…'; msgEl.className = 'cm-form-msg';
    try {
      await postComment(ctx, {
        name: fd.get('name'), body: fd.get('body'),
        parentId, hp: fd.get('hp'), rating: fd.get('rating'),
      });
      msgEl.textContent = 'Đã gửi!';
      msgEl.className = 'cm-form-msg cm-ok';
      form.reset();
      setTimeout(() => render(ctx), 400);
    } catch (e) {
      msgEl.textContent = e.message || 'Lỗi: thử lại sau.';
      msgEl.className = 'cm-form-msg cm-err';
      btn.disabled = false;
    }
  }

  window.mountComments = function ({ container, entityType, entityId, supabaseUrl, supabaseKey }) {
    const root = typeof container === 'string' ? document.querySelector(container) : container;
    if (!root) { console.error('mountComments: container not found'); return; }
    if (!entityType || entityId == null) { console.error('mountComments: missing entityType/entityId'); return; }
    const sb = (supabaseUrl && supabaseKey)
      ? window.supabase.createClient(supabaseUrl, supabaseKey)
      : (window._adminDb?.client || window.app?.db?.client);
    if (!sb) { console.error('mountComments: no Supabase client available'); return; }
    const ctx = { root, entityType, entityId: String(entityId), sb };
    render(ctx);
  };
})();
