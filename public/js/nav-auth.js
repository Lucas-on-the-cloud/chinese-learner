// Auth-aware navbar widget. Drop-in for any page that has:
//   - a Supabase client created
//   - <script src="/js/auth-service.js"></script> loaded
//   - a <div class="nav-auth" id="nav-auth"></div> in the navbar
//
// Usage:
//   const sb = supabase.createClient(URL, KEY);
//   mountNavAuth(sb);
//
// Behavior:
//   - Shows "Đăng nhập" button when user is anonymous or signed out.
//   - Shows avatar (Google profile pic or initial) when signed in.
//   - Clicking avatar opens a dropdown: Dashboard / Đăng xuất.

(function () {
  // Inject dropdown styles once
  if (!document.getElementById('nav-auth-styles')) {
    const css = document.createElement('style');
    css.id = 'nav-auth-styles';
    css.textContent = `
      .nav-auth-wrap{position:relative}
      .nav-user-menu{position:absolute;right:0;top:calc(100% + 8px);background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.12);padding:6px;min-width:200px;display:none;z-index:300}
      .nav-user-menu.open{display:block}
      .nav-user-menu-header{padding:10px 12px;border-bottom:1px solid #f3f4f6;margin-bottom:4px}
      .nav-user-menu-name{font-size:13px;font-weight:600;color:#1f2937;line-height:1.3}
      .nav-user-menu-email{font-size:11px;color:#6b7280;line-height:1.3;margin-top:2px;word-break:break-all}
      .nav-user-menu a, .nav-user-menu button{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;font-size:13px;color:#1f2937;font-family:inherit;font-weight:500;background:none;border:none;width:100%;text-align:left;cursor:pointer;text-decoration:none}
      .nav-user-menu a:hover, .nav-user-menu button:hover{background:#f3f4f6}
      .nav-user-menu .danger{color:#dc2626}
      .nav-user-menu .danger:hover{background:#fef2f2}
      .nav-user-menu .icon{width:14px;color:#6b7280;flex-shrink:0;text-align:center}
      .nav-user-menu .danger .icon{color:#dc2626}
    `;
    document.head.appendChild(css);
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function render(authService, wrap) {
    const u = authService.user;
    const isReal = u && !u.is_anonymous;
    if (!isReal) {
      wrap.classList.remove('nav-auth-wrap');
      // Navbar login → default to /dashboard.html (no `next` param).
      // Moment-of-value banners (exam result, flashcards, dashboard banner)
      // keep their own ?next= so they return to context.
      wrap.innerHTML = `<a class="nav-btn" href="/login.html">Đăng nhập</a>`;
      return;
    }
    wrap.classList.add('nav-auth-wrap');
    const profile = authService.profile;
    const avatarUrl = profile?.avatar_url || u.user_metadata?.avatar_url;
    const initial = authService.avatarInitial();
    const inner = avatarUrl
      ? `<img src="${esc(avatarUrl)}" alt="">`
      : esc(initial);
    const name = esc(authService.displayName());
    const email = esc(u.email || '');
    wrap.innerHTML = `
      <button class="nav-user-avatar" id="navAuthAvatar" title="Tài khoản" type="button">${inner}</button>
      <div class="nav-user-menu" id="navAuthMenu">
        <div class="nav-user-menu-header">
          <div class="nav-user-menu-name">${name}</div>
          <div class="nav-user-menu-email">${email}</div>
        </div>
        <a href="/dashboard.html"><i class="fa-solid fa-chart-line icon"></i> Dashboard</a>
        <a href="/flashcards.html"><i class="fa-solid fa-clone icon"></i> Flashcard</a>
        ${authService.isAdmin ? `<a href="/admin/index.html"><i class="fa-solid fa-screwdriver-wrench icon"></i> Quản trị</a>` : ''}
        <button class="danger" id="navAuthLogout"><i class="fa-solid fa-right-from-bracket icon"></i> Đăng xuất</button>
      </div>
    `;
    const avatar = document.getElementById('navAuthAvatar');
    const menu = document.getElementById('navAuthMenu');
    avatar.addEventListener('click', e => {
      e.stopPropagation();
      menu.classList.toggle('open');
    });
    document.getElementById('navAuthLogout').addEventListener('click', () => {
      authService.signOut();
    });
    document.addEventListener('click', e => {
      if (!menu.contains(e.target) && e.target !== avatar) menu.classList.remove('open');
    });
  }

  // Accept either a Supabase client (creates own AuthService) or an existing
  // AuthService instance (reuses it — avoids duplicate profile sync).
  window.mountNavAuth = function (clientOrAuth) {
    const wrap = document.getElementById('nav-auth');
    if (!wrap) return null;
    if (typeof AuthService === 'undefined') {
      console.warn('[nav-auth] AuthService not loaded — include /js/auth-service.js first');
      return null;
    }
    const authService = (clientOrAuth instanceof AuthService)
      ? clientOrAuth
      : new AuthService(clientOrAuth);
    const initPromise = authService.isReady
      ? Promise.resolve()
      : authService.init();
    initPromise.then(() => render(authService, wrap));
    authService.on('change', () => render(authService, wrap));
    return authService;
  };
})();
