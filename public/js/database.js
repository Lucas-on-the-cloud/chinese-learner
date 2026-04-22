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

  async clearFlashcards() {
    return await this.client.from('flashcards').delete().neq('id', 0);
  }
}
