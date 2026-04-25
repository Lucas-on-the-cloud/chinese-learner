class Database {
  constructor(url, key) {
    this.client = supabase.createClient(url, key);
  }

  async getLessons() {
    const { data } = await this.client.from('lessons').select('*').order('id');
    return data;
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

  async getVocab(lessonId) {
    const { data } = await this.client.from('vocab_cache').select('items').eq('lesson_id', lessonId).single();
    return data?.items || null;
  }

  async saveVocab(lessonId, items) {
    await this.client.from('vocab_cache').upsert({ lesson_id: lessonId, items }, { onConflict: 'lesson_id' });
  }
}
