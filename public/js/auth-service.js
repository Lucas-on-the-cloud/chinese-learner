class AuthService {
  constructor(client) {
    this.client   = client;
    this._profile = null;
    this._user    = null;
    this._ready   = false;
    this._listeners = {};

    client.auth.onAuthStateChange(async (event, session) => {
      this._user = session?.user || null;
      if (this._user) {
        await this._syncProfile(this._user);
      } else {
        this._profile = null;
      }
      this._emit('change', { user: this._user, profile: this._profile, event });
    });
  }

  // Call once on page load — resolves to current user (or null)
  async init() {
    const { data: { session } } = await this.client.auth.getSession();
    this._user = session?.user || null;
    if (this._user) await this._syncProfile(this._user);
    this._ready = true;
    return this._user;
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
    return this.client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo || `${window.location.origin}/dashboard.html`,
      },
    });
  }

  async signOut() {
    await this.client.auth.signOut();
    window.location.href = '/login.html';
  }

  // Redirect to login if not authenticated; returns false if user should wait
  requireAuth(redirectAfter) {
    if (!this._user) {
      const target = redirectAfter || window.location.href;
      window.location.href = `/login.html?next=${encodeURIComponent(target)}`;
      return false;
    }
    return true;
  }

  // Redirect to login if not admin
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

  // ── Internal ────────────────────────────────────
  async _syncProfile(user) {
    const { data } = await this.client
      .from('profiles').select('*').eq('id', user.id).single();

    if (data) {
      this._profile = data;
      return;
    }

    // First login — create profile (DB trigger should handle this, but fallback here)
    const insert = {
      id:         user.id,
      email:      user.email,
      full_name:  user.user_metadata?.full_name  || user.email?.split('@')[0] || 'Học viên',
      avatar_url: user.user_metadata?.avatar_url || null,
      role:       'user',
    };
    const { data: created } = await this.client.from('profiles').insert(insert).select().single();
    this._profile = created;
  }

  _emit(event, data) {
    (this._listeners[event] || []).forEach(h => h(data));
  }
}
