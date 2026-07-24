-- ── Vocabulary tables ─────────────────────────────────────────────────
-- Run in Supabase SQL editor BEFORE running scripts/import-vocab.mjs
-- ──────────────────────────────────────────────────────────────────────

-- 1. Book index (16 rows)
CREATE TABLE IF NOT EXISTS vocab_books (
  id           int  PRIMARY KEY,        -- book_id from vocab_full_export.json
  book_name    text NOT NULL,
  lesson_count int  DEFAULT 0,
  word_count   int  DEFAULT 0
);

-- 2. Lesson index (145 rows)
CREATE TABLE IF NOT EXISTS vocab_lessons (
  id          int  PRIMARY KEY,          -- lesson_id from vocab_full_export.json
  book_id     int  NOT NULL REFERENCES vocab_books(id) ON DELETE CASCADE,
  lesson_name text NOT NULL,
  word_count  int  DEFAULT 0
);

-- 3. Vocabulary entries (18 946 rows)
CREATE TABLE IF NOT EXISTS vocabularies (
  id             int  PRIMARY KEY,       -- vocab_id from vocab_full_export.json
  lesson_id      int  NOT NULL REFERENCES vocab_lessons(id) ON DELETE CASCADE,
  book_id        int  NOT NULL,
  card_id        int,
  dict_id        int,
  hanzi          text NOT NULL,
  pinyin         text,
  definition     text,
  part_of_speech text,
  audio_url      text,
  tocfl_band     text,
  han_viet       text,
  UNIQUE (lesson_id, card_id)
);

-- 4. Example sentences (~50 k rows)
CREATE TABLE IF NOT EXISTS vocab_examples (
  id          bigserial PRIMARY KEY,
  vocab_id    int  NOT NULL REFERENCES vocabularies(id) ON DELETE CASCADE,
  hanzi       text,
  pinyin      text,
  translation text
);

-- ── Indexes ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vocabularies_lesson   ON vocabularies(lesson_id);
CREATE INDEX IF NOT EXISTS idx_vocabularies_book     ON vocabularies(book_id);
CREATE INDEX IF NOT EXISTS idx_vocab_examples_vocab  ON vocab_examples(vocab_id);

-- ── RLS (anon read-only) ───────────────────────────────────────────────
ALTER TABLE vocab_books     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocab_lessons   ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocabularies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocab_examples  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read" ON vocab_books    FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON vocab_lessons  FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON vocabularies   FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read" ON vocab_examples FOR SELECT TO anon USING (true);
