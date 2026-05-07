class AuthService {
  constructor(client) {
    this.client      = client;
    this._profile    = null;
    this._user       = null;
    this._ready      = false;
    this._listeners  = {};

    // Handles subsequent auth events AFTER init() has resolved
    client.auth.onAuthStateChange(async (event, session) => {
      if (!this._ready) return; // init() owns the first event
      this._user = session?.user || null;
      if (this._user) {
        try { await this._syncProfile(this._user); } catch(e) {}
      } else {
        this._profile = null;
      }
      this._emit('change', { user: this._user, profile: this._profile, event });
    });
  }

  // Call once on page load. Uses onAuthStateChange so it works after
  // OAuth redirects (PKCE flow: getSession() may be null before code exchange).
  init() {
    return new Promise(resolve => {
      let resolved = false;

      const finish = async (session) => {
        if (resolved) return;
        resolved = true;
        this._user = session?.user || null;
        if (this._user) {
          try { await this._syncProfile(this._user); } catch(e) {
            console.warn('[AuthService] profile sync failed:', e);
          }
        }
        this._ready = true;
        resolve(this._user);
      };

      const { data: { subscription } } = this.client.auth.onAuthStateChange((event, session) => {
        if (event === 'INITIAL_SESSION') {
          if (session) {
            subscription.unsubscribe();
            finish(session);
          } else {
            // No session — check if a PKCE code is being exchanged
            const hasCode = typeof window !== 'undefined'
              && new URLSearchParams(window.location.search).has('code');
            if (!hasCode) {
              subscription.unsubscribe();
              finish(null); // definitely not logged in
            }
            // else: wait for SIGNED_IN which fires after code exchange
          }
        } else if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          subscription.unsubscribe();
          finish(event === 'SIGNED_IN' ? session : null);
        }
      });

      // Hard timeout — should never trigger in normal flow
      setTimeout(() => finish(null), 8000);
    });
  }

  get user()    { return this._user; }
  get profile() { return this._profile; }
  get isAdmin() { return this._profile?.role === 'admin'; }
  get isReady() { return this._ready; }

  displayName() {
    return this._profile?.full_name
      || this._user?.user_metadata?.full_name
      || this._user?.email?.split('@')[0]
      || 'Học viên';
  }

  avatarInitial() {
    return this.displayName().charAt(0).toUpperCase();
  }

  async signInWithGoogle(redirectTo) {
    const opts = {
      provider: 'google',
      options: {
        redirectTo: redirectTo || `${window.location.origin}/dashboard.html`,
      },
    };
    // Anonymous user → link Google identity to keep their progress.
    // Otherwise normal OAuth (creates new user or signs in existing).
    if (this._user?.is_anonymous) {
      return this.client.auth.linkIdentity(opts);
    }
    return this.client.auth.signInWithOAuth(opts);
  }

  async signOut() {
    await this.client.auth.signOut();
    window.location.href = '/login.html';
  }

  requireAuth(redirectAfter) {
    if (!this._user) {
      const target = redirectAfter || window.location.href;
      window.location.href = `/login.html?next=${encodeURIComponent(target)}`;
      return false;
    }
    return true;
  }

  requireAdmin() {
    if (!this.isAdmin) {
      window.location.href = '/courses.html';
      return false;
    }
    return true;
  }

  on(event, handler) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
    return this;
  }

  // ── Internal ──────────────────────────────────────
  async _syncProfile(user) {
    const { data } = await this.client
      .from('profiles').select('*').eq('id', user.id).single();

    if (data) { this._profile = data; return; }

    // profiles table missing or first login — create row
    const { data: created } = await this.client.from('profiles').insert({
      id:         user.id,
      email:      user.email,
      full_name:  user.user_metadata?.full_name  || user.email?.split('@')[0] || 'Học viên',
      avatar_url: user.user_metadata?.avatar_url || null,
      role:       'user',
    }).select().single();
    this._profile = created; // may still be null if table missing — handled gracefully
  }

  _emit(event, data) {
    (this._listeners[event] || []).forEach(h => h(data));
  }
}
