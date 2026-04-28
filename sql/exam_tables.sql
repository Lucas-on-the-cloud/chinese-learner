-- ── Exam tables ─────────────────────────────────────────────────────
-- Run once in Supabase SQL editor, then reload schema cache.

CREATE TABLE IF NOT EXISTS exam_books (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  level       TEXT,
  total_units INT  DEFAULT 30,
  total_pages INT,
  status      TEXT DEFAULT 'draft',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_ocr_pages (
  id         BIGSERIAL PRIMARY KEY,
  book_id    BIGINT NOT NULL REFERENCES exam_books(id) ON DELETE CASCADE,
  page_num   INT    NOT NULL,
  raw_text   TEXT,
  ocr_status TEXT   DEFAULT 'done',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(book_id, page_num)
);

CREATE TABLE IF NOT EXISTS exam_units (
  id          BIGSERIAL PRIMARY KEY,
  book_id     BIGINT NOT NULL REFERENCES exam_books(id) ON DELETE CASCADE,
  unit_number INT    NOT NULL,
  title_zh    TEXT,
  status      TEXT   DEFAULT 'draft',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(book_id, unit_number)
);

CREATE TABLE IF NOT EXISTS exam_sections (
  id             BIGSERIAL PRIMARY KEY,
  unit_id        BIGINT NOT NULL REFERENCES exam_units(id) ON DELETE CASCADE,
  section_number INT    NOT NULL,
  section_type   TEXT   NOT NULL,
  title          TEXT
);

CREATE TABLE IF NOT EXISTS exam_passages (
  id                BIGSERIAL PRIMARY KEY,
  section_id        BIGINT REFERENCES exam_sections(id) ON DELETE CASCADE,
  passage_number    INT  DEFAULT 1,
  label             TEXT,
  content_text      TEXT,
  content_image_url TEXT
);

CREATE TABLE IF NOT EXISTS exam_questions (
  id              BIGSERIAL PRIMARY KEY,
  section_id      BIGINT NOT NULL REFERENCES exam_sections(id) ON DELETE CASCADE,
  passage_id      BIGINT REFERENCES exam_passages(id) ON DELETE SET NULL,
  question_number INT    NOT NULL,
  question_text   TEXT   DEFAULT '',
  correct_answer  CHAR(1),
  audio_url       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exam_choices (
  id          BIGSERIAL PRIMARY KEY,
  question_id BIGINT  NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
  label       CHAR(1) NOT NULL,
  text        TEXT    NOT NULL DEFAULT '',
  UNIQUE(question_id, label)
);

CREATE TABLE IF NOT EXISTS exam_vocab (
  id             BIGSERIAL PRIMARY KEY,
  unit_id        BIGINT NOT NULL REFERENCES exam_units(id) ON DELETE CASCADE,
  source_section TEXT,
  word_zh        TEXT,
  related_words  TEXT
);

CREATE TABLE IF NOT EXISTS exam_phrases (
  id             BIGSERIAL PRIMARY KEY,
  unit_id        BIGINT NOT NULL REFERENCES exam_units(id) ON DELETE CASCADE,
  source_section TEXT,
  phrase_zh      TEXT,
  example_zh     TEXT
);

CREATE TABLE IF NOT EXISTS exam_results (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID,
  unit_id      BIGINT REFERENCES exam_units(id) ON DELETE SET NULL,
  answers      JSONB,
  score        INT,
  total        INT,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);
