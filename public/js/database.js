class Database {
  constructor(url, key) {
    this.client = supabase.createClient(url, key);
  }

  async getLessons() {
    const { data } = await this.client.from('lessons').select('*').order('id');
    return (data || []).map(l => ({
      ...l,
      zh: l.chinese  ?? l.zh ?? '',
      py: l.pinyin   ?? l.py ?? '',
      vi: l.vietnamese ?? l.vi ?? '',
    }));
  }

  async getFlashcards() {
    const { data } = await this.client.from('flashcards').select('*').order('id');
    return data;
  }

  async addLesson(row) {
    return await this.client.from('lessons').insert([row]);
  }

  async addFlashcard(row) {
    return await this.client.from('flashcards').insert([row]);
  }

  async addFlashcards(rows) {
    return await this.client.from('flashcards').insert(rows);
  }

  async clearFlashcards() {
    return await this.client.from('flashcards').delete().neq('id', 0);
  }

  async getBooks() {
    const [lr, br] = await Promise.all([
      this.client.from('lessons').select('book'),
      this.client.from('books').select('name'),
    ]);
    const fromLessons = (lr.data || []).map(r => r.book || 'B1');
    const fromBooks   = (br.data || []).map(r => r.name);
    const all = [...new Set([...fromLessons, ...fromBooks])].sort();
    return all.length ? all : ['B1'];
  }

  async getBooksMeta() {
    const { data, error } = await this.client.from('books').select('*').order('name');
    if (error) return [];
    return data || [];
  }

  async upsertBook(row) {
    return await this.client.from('books').upsert([row], { onConflict: 'name' });
  }

  async getPosts({ category, limit } = {}) {
    let q = this.client.from('posts').select('id,title,slug,excerpt,cover_url,category,author,created_at,sort_order')
      .eq('published', true)
      .order('sort_order', { ascending: false })
      .order('created_at', { ascending: false });
    if (category) q = q.eq('category', category);
    if (limit)    q = q.limit(limit);
    const { data } = await q;
    return data || [];
  }

  async getPost(id) {
    const { data } = await this.client.from('posts').select('*').eq('id', id).single();
    return data;
  }

  async getAllPostsAdmin() {
    const { data } = await this.client.from('posts').select('id,title,category,author,published,created_at').order('created_at', { ascending: false });
    return data || [];
  }

  async addPost(row) { return await this.client.from('posts').insert([row]); }

  async updatePost(id, row) { return await this.client.from('posts').update(row).eq('id', id); }

  async deletePost(id) { return await this.client.from('posts').delete().eq('id', id); }

  async getVocab(lessonId) {
    const { data } = await this.client.from('vocab_cache').select('items').eq('lesson_id', lessonId).single();
    return data?.items || null;
  }

  async saveVocab(lessonId, items) {
    await this.client.from('vocab_cache').upsert({ lesson_id: lessonId, items }, { onConflict: 'lesson_id' });
  }

  // ── Courses ────────────────────────────────────
  async getCourses({ publishedOnly = false } = {}) {
    let q = this.client.from('courses').select('*')
      .order('sort_order', { ascending: false })
      .order('created_at', { ascending: false });
    if (publishedOnly) q = q.eq('published', true);
    const { data } = await q;
    return data || [];
  }

  async getCourse(id) {
    const { data } = await this.client.from('courses').select('*').eq('id', id).single();
    return data;
  }

  async saveCourse(row) {
    const id = row.id;
    const payload = { ...row };
    delete payload.id;
    if (id) return await this.client.from('courses').update(payload).eq('id', id);
    return await this.client.from('courses').insert([payload]);
  }

  async deleteCourse(id) {
    return await this.client.from('courses').delete().eq('id', id);
  }

  async getCourseBooks(courseId) {
    const { data } = await this.client.from('course_books').select('*')
      .eq('course_id', courseId).order('sort_order');
    return data || [];
  }

  async addCourseBook(row) {
    return await this.client.from('course_books').insert([row]);
  }

  async removeCourseBook(id) {
    return await this.client.from('course_books').delete().eq('id', id);
  }

  async updateCourseBookOrder(id, sort_order) {
    return await this.client.from('course_books').update({ sort_order }).eq('id', id);
  }

  // ── Flashcard Templates (admin-created) ────────
  async getFlashcardTemplates({ bookName, lessonId, publishedOnly } = {}) {
    let q = this.client.from('flashcard_templates').select('*')
      .order('sort_order').order('id');
    if (bookName)     q = q.eq('book_name', bookName);
    if (lessonId)     q = q.eq('lesson_id', lessonId);
    if (publishedOnly) q = q.eq('published', true);
    const { data, error } = await q;
    return { data: data || [], error };
  }

  async saveFlashcardTemplate(row) {
    const id = row.id;
    const payload = { ...row };
    delete payload.id;
    if (id) return await this.client.from('flashcard_templates').update(payload).eq('id', id);
    return await this.client.from('flashcard_templates').insert([payload]);
  }

  async bulkInsertFlashcardTemplates(rows) {
    return await this.client.from('flashcard_templates').insert(rows);
  }

  async deleteFlashcardTemplate(id) {
    return await this.client.from('flashcard_templates').delete().eq('id', id);
  }

  // ── Audio Segments (Listening / Dictation) ────
  async getAudioSegments({ bookName, lessonId, publishedOnly } = {}) {
    let q = this.client.from('audio_segments').select('*').order('sort_order').order('id');
    if (bookName)      q = q.eq('book_name', bookName);
    if (lessonId)      q = q.eq('lesson_id', lessonId);
    if (publishedOnly) q = q.eq('published', true);
    const { data, error } = await q;
    return { data: data || [], error };
  }

  async saveAudioSegment(row) {
    const id = row.id;
    const payload = { ...row }; delete payload.id;
    if (id) return await this.client.from('audio_segments').update(payload).eq('id', id);
    return await this.client.from('audio_segments').insert([payload]);
  }

  async bulkInsertAudioSegments(rows) {
    return await this.client.from('audio_segments').insert(rows);
  }

  async deleteAudioSegment(id) {
    return await this.client.from('audio_segments').delete().eq('id', id);
  }

  async uploadAudio(file, bookName, lessonId) {
    const ext  = file.name.split('.').pop();
    const path = `${bookName}/${lessonId}_${Date.now()}.${ext}`;
    const { data, error } = await this.client.storage
      .from('audio').upload(path, file, { contentType: file.type, upsert: true });
    if (error) return { url: null, error };
    const { data: pub } = this.client.storage.from('audio').getPublicUrl(path);
    return { url: pub.publicUrl, error: null };
  }

  async getAudioSegmentSummary() {
    const { data } = await this.client
      .from('audio_segments').select('book_name,lesson_id').eq('published', true);
    return data || [];
  }

  async getFlashcardTemplateSummary() {
    const { data } = await this.client
      .from('flashcard_templates').select('book_name,lesson_id,lesson_title').eq('published', true);
    return data || [];
  }
}
