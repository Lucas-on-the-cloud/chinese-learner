// Quản lý anonymous session + sync progress lên Supabase
class UserSession {
  constructor(supabaseClient) {
    this.client  = supabaseClient;
    this.userId  = null;
    this.ready   = false;
  }

  // Gọi 1 lần khi app khởi động
  async init() {
    // Thử lấy session hiện tại
    const { data: { session } } = await this.client.auth.getSession();
    if (session?.user) {
      this.userId = session.user.id;
    } else {
      // Tạo anonymous session mới
      const { data, error } = await this.client.auth.signInAnonymously();
      if (!error) this.userId = data.user?.id;
    }
    this.ready = true;
    return this.userId;
  }

  get uid() { return this.userId; }

  // ── Reading Progress ──────────────────────────
  async markLessonRead(bookName, lessonId) {
    if (!this.uid) return;
    await this.client.from('reading_progress').upsert(
      { user_id: this.uid, book_name: bookName, lesson_id: lessonId, completed: true },
      { onConflict: 'user_id,book_name,lesson_id' }
    );
  }

  async getReadLessons(bookName) {
    if (!this.uid) return new Set();
    const { data } = await this.client.from('reading_progress')
      .select('lesson_id')
      .eq('user_id', this.uid)
      .eq('book_name', bookName)
      .eq('completed', true);
    return new Set((data || []).map(r => r.lesson_id));
  }

  async getAllReadProgress() {
    if (!this.uid) return [];
    const { data } = await this.client.from('reading_progress')
      .select('book_name,lesson_id')
      .eq('user_id', this.uid)
      .eq('completed', true);
    return data || [];
  }

  // ── Listening Progress ────────────────────────
  async saveListeningResult(bookName, lessonId, segmentId, scorePct) {
    if (!this.uid) return;
    await this.client.from('listening_progress').upsert(
      {
        user_id:    this.uid,
        book_name:  bookName,
        lesson_id:  lessonId,
        segment_id: segmentId,
        score_pct:  scorePct,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,segment_id' }
    );
  }

  async getListeningProgress(bookName, lessonId) {
    if (!this.uid) return new Set();
    const { data } = await this.client.from('listening_progress')
      .select('segment_id,score_pct')
      .eq('user_id', this.uid)
      .eq('book_name', bookName)
      .eq('lesson_id', lessonId);
    return new Map((data || []).map(r => [r.segment_id, r.score_pct]));
  }

  async getAllListeningProgress() {
    if (!this.uid) return [];
    const { data } = await this.client.from('listening_progress')
      .select('book_name,lesson_id,segment_id,score_pct')
      .eq('user_id', this.uid);
    return data || [];
  }

  // ── User Flashcards ───────────────────────────
  async getUserFlashcards() {
    if (!this.uid) return [];
    const { data } = await this.client.from('user_flashcards')
      .select('*')
      .eq('user_id', this.uid)
      .order('created_at');
    return data || [];
  }

  async addUserFlashcard(card) {
    if (!this.uid) return;
    await this.client.from('user_flashcards').upsert(
      { ...card, user_id: this.uid },
      { onConflict: 'user_id,char' }
    );
  }

  async addUserFlashcardsBulk(cards) {
    if (!this.uid || !cards.length) return;
    const rows = cards.map(c => ({
      user_id:      this.uid,
      char:         c.char,
      pinyin:       c.pinyin       || null,
      meaning:      c.meaning      || null,
      example_zh:   c.example_zh   || null,
      example_vi:   c.example_vi   || null,
      book_name:    c.book_name    || c.book || null,
      lesson_title: c.lesson_title || null,
      from_reading: c.from_reading || false,
      custom:       c.custom       || false,
    }));
    await this.client.from('user_flashcards').upsert(rows, { onConflict: 'user_id,char' });
  }

  async removeUserFlashcard(char) {
    if (!this.uid) return;
    await this.client.from('user_flashcards')
      .delete()
      .eq('user_id', this.uid)
      .eq('char', char);
  }

  // ── Migration: localStorage → DB (chạy 1 lần) ─
  async migrateFromLocalStorage() {
    if (!this.uid) return;

    // Reading progress
    const migrated = localStorage.getItem('tocfl_migrated_v1');
    if (migrated) return; // đã migrate rồi

    const readingKeys = Object.keys(localStorage).filter(k => k.startsWith('tocfl_progress_'));
    for (const key of readingKeys) {
      const bookName = key.replace('tocfl_progress_', '');
      const ids = JSON.parse(localStorage.getItem(key) || '[]');
      for (const lessonId of ids) {
        await this.markLessonRead(bookName, lessonId);
      }
    }

    // User flashcards
    const localFC = JSON.parse(localStorage.getItem('tocfl_user_flashcards') || '[]');
    if (localFC.length) {
      try { await this.addUserFlashcardsBulk(localFC); } catch(e) { console.warn('[UserSession] FC migration error:', e); }
    }

    localStorage.setItem('tocfl_migrated_v1', '1');
    console.log('[UserSession] Migration từ localStorage hoàn thành.');
  }
}
